import * as functions from "firebase-functions/v1";

const admin = require('firebase-admin');
if (!admin.apps.length) {
    admin.initializeApp();
}

function buildPhoneFormats(phone: string) {
    const cleanPhone = String(phone || '').replace(/\s/g, '');
    const base = cleanPhone.replace(/^\+?51/, '');
    return Array.from(new Set([
        cleanPhone,
        cleanPhone.startsWith('+') ? cleanPhone.slice(1) : '+' + cleanPhone,
        base,
        '+51' + base,
        '51' + base
    ]));
}

async function findMemberByPhone(db: any, phone: string) {
    for (const fmt of buildPhoneFormats(phone)) {
        const snap = await db.collection('members').where('phone', '==', fmt).limit(1).get();
        if (!snap.empty) return snap.docs[0];
    }
    return null;
}

function getLimaDateString(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    return formatter.format(date);
}

function parseLimaDate(dateString: string) {
    return new Date(`${dateString}T00:00:00-05:00`);
}

function addDaysToLimaDate(dateString: string, days: number) {
    const date = parseLimaDate(dateString);
    date.setUTCDate(date.getUTCDate() + days);
    return getLimaDateString(date);
}

function getMembershipPlanDetails(planName: string, paidAmount: number) {
    const normalized = String(planName || '').toLowerCase();
    if (normalized.includes('interdiario')) return { name: 'Plan Interdiario', price: 50, days: 30 };
    if (normalized.includes('trimestral') || normalized.includes('3') || normalized.includes('tres')) {
        return { name: 'Plan Trimestral', price: 150, days: 90 };
    }
    if (normalized.includes('bimestral') || normalized.includes('2') || normalized.includes('dos')) {
        return { name: 'Plan Bimestral', price: 120, days: 60 };
    }
    return { name: 'Plan Mensual', price: paidAmount > 0 ? paidAmount : 70, days: 30 };
}

function buildMembershipRenewalData(
    adminInner: any,
    memberId: string,
    memberData: any,
    planName: string,
    paidAmount: number
) {
    const plan = getMembershipPlanDetails(planName, paidAmount);
    const today = getLimaDateString();
    const currentEnd = String(memberData.endDate || '');
    const startDate = currentEnd >= today ? addDaysToLimaDate(currentEnd, 1) : today;
    const endDate = addDaysToLimaDate(startDate, plan.days - 1);
    const nowIso = new Date().toISOString();
    const debt = Math.max(0, plan.price - paidAmount);
    const history = Array.isArray(memberData.membershipHistory)
        ? memberData.membershipHistory.map((period: any) =>
            period?.status === 'active' ? { ...period, status: 'closed' } : period
        )
        : [];
    history.push({
        id: `membership_${memberId}_${startDate}_${Date.now()}`,
        plan: plan.name, startDate, endDate, planPrice: plan.price,
        amountPaid: paidAmount, debt,
        status: startDate > today ? 'future' : 'active',
        payments: [{ amount: paidAmount, method: 'Culqi', date: nowIso, type: 'renewal_payment' }],
        createdAt: nowIso
    });
    return {
        status: 'active', plan: plan.name, startDate, endDate,
        expirationDate: adminInner.firestore.Timestamp.fromDate(parseLimaDate(endDate)),
        amountPaid: paidAmount, planPrice: plan.price, debt,
        membershipHistory: history, paymentApprovedAt: nowIso
    };
}

function diffLimaDays(fromDateString: string, toDateString: string) {
    const from = parseLimaDate(fromDateString);
    const to = parseLimaDate(toDateString);
    return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function getLimaMinutesSinceMidnight(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    const [hours, minutes] = formatter.format(date).split(':').map(Number);
    return (hours * 60) + minutes;
}

function parseClassTimeToMinutes(time: string) {
    const [hours, minutes] = String(time || '').split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return null;
    }
    return (hours * 60) + minutes;
}

function formatClassTimeLabel(time: string) {
    if (time === '08:30') return '8:30 AM';
    if (time === '20:00') return '8:00 PM';
    return String(time || '');
}

async function createPaidClassBooking(db: any, phone: string, classId: string, bookingDate: string, paymentInfo: any) {
    if (!phone || !classId || !bookingDate) {
        throw new Error('Missing class booking payment data.');
    }

    const memberDoc = await findMemberByPhone(db, phone);
    if (!memberDoc) {
        throw new Error(`No member found for phone: ${phone}`);
    }

    const classRef = db.collection('classes').doc(String(classId));

    return db.runTransaction(async (transaction: any) => {
        const classDoc = await transaction.get(classRef);
        if (!classDoc.exists) {
            throw new Error('Class not found.');
        }

        const classData = classDoc.data() || {};
        if (classData.status === 'inactive') {
            throw new Error('Class is inactive.');
        }

        const bookingQuery = db.collection('bookings').where('classId', '==', String(classId));
        const bookingSnap = await transaction.get(bookingQuery);
        const activeBookings = bookingSnap.docs.filter((doc: any) => {
            const data = doc.data() || {};
            return (data.status || 'confirmed') !== 'cancelled';
        });

        const alreadyBooked = activeBookings.some((doc: any) => {
            const data = doc.data() || {};
            return data.memberId === memberDoc.id && data.date === bookingDate;
        });

        if (alreadyBooked) {
            throw new Error('Member already booked in this class for that date.');
        }

        const capacity = Math.max(1, Number(classData.capacity) || 0);
        if (activeBookings.length >= capacity) {
            throw new Error('Class is full.');
        }

        const bookingRef = db.collection('bookings').doc();
        transaction.set(bookingRef, {
            memberId: memberDoc.id,
            classId: String(classId),
            date: bookingDate,
            status: 'confirmed',
            paymentType: 'class_booking',
            paymentAmount: paymentInfo.amount,
            paymentMethod: paymentInfo.method || 'Culqi',
            culqiChargeId: paymentInfo.chargeId || '',
            culqiOrderId: paymentInfo.orderId || '',
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        const memberData = memberDoc.data() || {};
        return {
            bookingId: bookingRef.id,
            memberName: memberData.name || 'Cliente',
            phone: memberData.phone || phone,
            className: classData.name || 'Clase grupal',
            classTime: classData.time || classData.hour || '',
            instructor: classData.instructor || ''
        };
    });
}

async function applyDebtPayment(db: any, adminInner: any, phone: string, paymentInfo: any) {
    const memberDoc = await findMemberByPhone(db, phone);
    if (!memberDoc) {
        throw new Error(`No member found for phone: ${phone}`);
    }

    const paidAmount = Math.max(0, Number(paymentInfo.amount) || 0);
    if (paidAmount <= 0) {
        throw new Error('Invalid debt payment amount.');
    }

    const memberRef = memberDoc.ref;
    const memberData = memberDoc.data() || {};
    const currentDebt = Math.max(0, Number(memberData.debt) || 0);
    const newDebt = Math.max(0, currentDebt - paidAmount);
    const prevPaid = Number(memberData.amountPaid) || 0;
    const nowIso = new Date().toISOString();

    await memberRef.update({
        debt: newDebt,
        amountPaid: prevPaid + paidAmount,
        paymentApprovedAt: nowIso,
        culqiChargeId: paymentInfo.chargeId || memberData.culqiChargeId || '',
        culqiOrderId: paymentInfo.orderId || memberData.culqiOrderId || '',
        payments: adminInner.firestore.FieldValue.arrayUnion({
            amount: paidAmount,
            method: paymentInfo.method || 'Culqi',
            type: 'debt_payment',
            date: nowIso,
            chargeId: paymentInfo.chargeId || '',
            orderId: paymentInfo.orderId || ''
        }),
        updatedAt: adminInner.firestore.FieldValue.serverTimestamp()
    });

    await db.collection('payments').add({
        memberName: memberData.name || 'Cliente',
        memberId: memberDoc.id,
        concept: 'Pago de deuda',
        amount: paidAmount,
        method: paymentInfo.method || 'Culqi',
        invoiceType: 'Boleta',
        date: new Date(),
        createdAt: adminInner.firestore.FieldValue.serverTimestamp()
    });

    return {
        memberName: memberData.name || 'Cliente',
        phone: memberData.phone || phone,
        paidAmount,
        previousDebt: currentDebt,
        newDebt
    };
}

export const twilioWebhookWhatsapp = functions
    .runWith({ memory: '1GB', timeoutSeconds: 120 })
    .https.onRequest(async (req, res) => {
        const adminInner = require('firebase-admin');
        if (!adminInner.apps.length) adminInner.initializeApp();
        const db = adminInner.firestore();

        let incomingMsg = req.body.Body || '';
        const from = req.body.From;
        const phone = from.replace('whatsapp:', '');

        const mediaUrl = req.body.MediaUrl0;
        const mediaType = req.body.MediaContentType0;

        if (mediaUrl && mediaType?.startsWith('audio/')) {
            try {
                const { transcribeAudio } = require('./bot/transcription');
                const transcription = await transcribeAudio(mediaUrl, process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                if (transcription) {
                    incomingMsg = transcription;
                }
            } catch (err) {
                console.error("Transcription Error:", err);
            }
        }

        console.log(`Msg from ${phone}: ${incomingMsg || '[Sin texto/Media]'}`);

        try {
            await db.collection('messages').add({
                phone,
                content: incomingMsg,
                direction: 'inbound',
                timestamp: adminInner.firestore.FieldValue.serverTimestamp()
            });

            const bot = require('./bot/messageProcessor');
            const replyText = await bot.processMessage(db, phone, incomingMsg);

            await db.collection('messages').add({
                phone,
                content: replyText,
                direction: 'outbound',
                timestamp: adminInner.firestore.FieldValue.serverTimestamp()
            });

            const safeReply = (replyText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safeReply}</Message></Response>`;
            res.type('text/xml').send(twiml);
        } catch (error: any) {
            console.error("Error processing message:", error);
            res.status(500).send("AI Error");
        }
    });

export const culqiWebhook = functions
    .runWith({ memory: '512MB' })
    .https.onRequest(async (req, res) => {
        const adminInner = require('firebase-admin');
        if (!adminInner.apps.length) adminInner.initializeApp();
        const db = adminInner.firestore();

        try {
            const event = req.body;
            console.log("Culqi Webhook Event:", event.type);

            if (event.type === 'checkout.order.paid') {
                const order = event.data;
                const phone = order.metadata?.phone;
                const planName = order.metadata?.planName;
                const paymentType = order.metadata?.paymentType || 'membership';
                const classId = order.metadata?.classId || '';
                const bookingDate = order.metadata?.bookingDate || '';

                if (phone) {
                    if (paymentType === 'class_booking') {
                        const booking = await createPaidClassBooking(db, phone, classId, bookingDate, {
                            amount: order.amount / 100,
                            method: 'Culqi',
                            orderId: order.id
                        });

                        const twilioClientObj = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                        const firstName = booking.memberName.split(' ')[0];
                        const classTimeLabel = booking.classTime ? ` a las ${formatClassTimeLabel(booking.classTime)}` : '';
                        await twilioClientObj.messages.create({
                            from: 'whatsapp:+51907935299',
                            to: `whatsapp:${booking.phone}`,
                            body: `¡Listo ${firstName}! 😊 Tu reserva para ${booking.className} con ${booking.instructor} quedó confirmada para el ${bookingDate}${classTimeLabel}. Pago recibido: S/ ${(order.amount / 100).toFixed(2)} 💪`
                        });
                    } else if (paymentType === 'debt_payment') {
                        const debtPayment = await applyDebtPayment(db, adminInner, phone, {
                            amount: order.amount / 100,
                            method: 'Culqi',
                            orderId: order.id
                        });

                        const twilioClientObj = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                        const firstName = debtPayment.memberName.split(' ')[0];
                        const remainingText = debtPayment.newDebt > 0
                            ? `Te queda un saldo pendiente de S/ ${debtPayment.newDebt.toFixed(2)}.`
                            : 'Tu deuda quedo cancelada.';
                        await twilioClientObj.messages.create({
                            from: 'whatsapp:+51907935299',
                            to: `whatsapp:${debtPayment.phone}`,
                            body: `Listo ${firstName}. Recibimos tu pago de deuda por S/ ${debtPayment.paidAmount.toFixed(2)}. ${remainingText}`
                        });
                    } else {
                        const memberDoc = await findMemberByPhone(db, phone);
                        if (memberDoc) {
                            const memberRef = memberDoc.ref;
                            const memberData = memberDoc.data();
                            const paidAmount = order.amount / 100;
                            const renewal = buildMembershipRenewalData(adminInner, memberDoc.id, memberData, planName, paidAmount);
                            const endDate = parseLimaDate(renewal.endDate);

                            await memberRef.update({
                                ...renewal,
                                culqiOrderId: order.id,
                                payments: adminInner.firestore.FieldValue.arrayUnion({
                                    amount: paidAmount, method: 'Culqi', date: new Date().toISOString(),
                                    orderId: order.id, type: 'renewal_payment'
                                })
                            });

                            const voucher = [
                                `━━━━━━━━━━━━━━━━━━━━━`,
                                `🏋️ *MEGAGYM* 🏋️`,
                                `   COMPROBANTE DE PAGO`,
                                `━━━━━━━━━━━━━━━━━━━━━`,
                                `👤 Cliente: ${(memberData.name || 'Cliente').toUpperCase()}`,
                                `📋 Plan: ${planName || 'Plan 1 Mes'}`,
                                `💳 Método: Culqi`,
                                `💰 Monto: S/ ${(order.amount / 100).toFixed(2)}`,
                                `📅 Vigencia hasta: ${endDate.toISOString().split('T')[0]}`,
                                `🔖 Orden: ${order.id.toString().slice(-10).toUpperCase()}`,
                                `━━━━━━━━━━━━━━━━━━━━━`,
                                `¡Gracias por entrenar con nosotros! 💪`
                            ].join('\n');

                            const twilioClientObj = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                            await twilioClientObj.messages.create({
                                from: 'whatsapp:+51907935299',
                                to: `whatsapp:${phone}`,
                                body: voucher
                            });
                        }
                    }
                }
            }
            res.status(200).send("OK");
        } catch (error: any) {
            console.error("Culqi Webhook Error:", error);
            res.status(500).send(error.message);
        }
    });

export const createCulqiCharge = functions
    .runWith({ memory: '512MB' })
    .https.onRequest(async (req, res) => {
        const cors = require('cors')({ origin: true });
        cors(req, res, async () => {
            try {
                const { token, email, amount, orderId, phone, planName, paymentType, classId, bookingDate } = req.body;
                const CULQI_PRIVATE_KEY = process.env.CULQI_PRIVATE_KEY;
                if (!CULQI_PRIVATE_KEY) throw new Error('CULQI_PRIVATE_KEY not set');

                const axios = require('axios');
                const chargePayload: any = {
                    amount,
                    currency_code: 'PEN',
                    email,
                    source_id: token,
                    metadata: {
                        phone: phone || '',
                        planName: planName || '',
                        orderId: orderId || '',
                        paymentType: paymentType || 'membership',
                        classId: classId || '',
                        bookingDate: bookingDate || ''
                    }
                };

                const chargeRes = await axios.post('https://api.culqi.com/v2/charges', chargePayload, {
                    headers: {
                        'Authorization': `Bearer ${CULQI_PRIVATE_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                const charge = chargeRes.data;
                if (charge.object === 'error') {
                    res.status(400).json({ success: false, error: charge.user_message || 'Error al cobrar' });
                    return;
                }

                console.log('Charge result:', JSON.stringify({ id: charge.id, object: charge.object, outcome: charge.outcome, paid: charge.paid }));
                if (charge.object !== 'error' && phone) {
                    const adminInner = require('firebase-admin');
                    if (!adminInner.apps.length) adminInner.initializeApp();
                    const db = adminInner.firestore();

                    if (paymentType === 'debt_payment') {
                        const debtPayment = await applyDebtPayment(db, adminInner, phone, {
                            amount: amount / 100,
                            method: 'Culqi',
                            chargeId: charge.id,
                            orderId: orderId || ''
                        });

                        const twilioClientObj = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                        const firstName = debtPayment.memberName.split(' ')[0];
                        const remainingText = debtPayment.newDebt > 0
                            ? `Te queda un saldo pendiente de S/ ${debtPayment.newDebt.toFixed(2)}.`
                            : 'Tu deuda quedo cancelada.';
                        await twilioClientObj.messages.create({
                            from: 'whatsapp:+51907935299',
                            to: `whatsapp:${debtPayment.phone}`,
                            body: `Listo ${firstName}. Recibimos tu pago de deuda por S/ ${debtPayment.paidAmount.toFixed(2)}. ${remainingText}`
                        });
                    } else if (paymentType === 'class_booking') {
                        const booking = await createPaidClassBooking(db, phone, String(classId || ''), String(bookingDate || ''), {
                            amount: amount / 100,
                            method: 'Culqi',
                            chargeId: charge.id,
                            orderId: orderId || ''
                        });

                        const twilioClientObj = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                        const firstName = booking.memberName.split(' ')[0];
                        const classTimeLabel = booking.classTime ? ` a las ${formatClassTimeLabel(booking.classTime)}` : '';
                        await twilioClientObj.messages.create({
                            from: 'whatsapp:+51907935299',
                            to: `whatsapp:${booking.phone}`,
                            body: `¡Listo ${firstName}! 😊 Tu reserva para ${booking.className} con ${booking.instructor} quedó confirmada para el ${bookingDate}${classTimeLabel}. Pago recibido: S/ ${(amount / 100).toFixed(2)} 💪`
                        });
                    } else {
                        const memberDoc = await findMemberByPhone(db, phone);
                        if (memberDoc) {
                            const memberData = memberDoc.data();
                            const paidAmount = amount / 100;
                            const renewal = buildMembershipRenewalData(adminInner, memberDoc.id, memberData, planName, paidAmount);

                            await memberDoc.ref.update({
                                ...renewal,
                                culqiChargeId: charge.id,
                                payments: adminInner.firestore.FieldValue.arrayUnion({
                                    amount: paidAmount, method: 'Culqi', date: new Date().toISOString(),
                                    chargeId: charge.id, orderId: orderId || '', type: 'renewal_payment'
                                })
                            });
                            console.log(`Member updated: ${memberDoc.id}`);
                        } else {
                            console.warn(`No member found for phone: ${phone}`);
                        }
                    }
                }

                res.status(200).json({ success: true, chargeId: charge.id });
            } catch (error: any) {
                const culqiErr = error.response?.data;
                console.error('createCulqiCharge error:', JSON.stringify(culqiErr) || error.message);
                const userMsg = culqiErr?.user_message || culqiErr?.merchant_message || error.message;
                res.status(500).json({ success: false, error: userMsg, code: culqiErr?.code });
            }
        });
    });

export const generateCulqiLink = functions
    .runWith({ memory: '512MB' })
    .https.onRequest(async (req, res) => {
        const { phone, planName, paymentType, classId, bookingDate, amount } = req.body;
        const { generatePaymentLink } = require('./tools/paymentHandler');
        try {
            const url = await generatePaymentLink(phone, planName, { paymentType, classId, bookingDate, amount });
            res.status(200).json({ url });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

export const sendManualWhatsAppMessage = functions
    .runWith({ memory: '512MB', timeoutSeconds: 120 })
    .https.onCall(async (data: any) => {
        const adminInner = require('firebase-admin');
        if (!adminInner.apps.length) adminInner.initializeApp();
        const db = adminInner.firestore();

        const phone = String(data?.phone || '').trim();
        const content = String(data?.content || '').trim();

        if (!phone) {
            throw new functions.https.HttpsError('invalid-argument', 'Phone is required.');
        }

        if (!content) {
            throw new functions.https.HttpsError('invalid-argument', 'Message content is required.');
        }

        const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await twilioClient.messages.create({
            from: 'whatsapp:+51907935299',
            to: `whatsapp:${phone}`,
            body: content
        });

        await db.collection('messages').add({
            phone,
            content,
            direction: 'outbound',
            timestamp: adminInner.firestore.FieldValue.serverTimestamp(),
            source: 'manual_dashboard'
        });

        return { success: true };
    });

export const membershipReminder = functions
    .runWith({ memory: '512MB', timeoutSeconds: 300 })
    .pubsub.schedule('0 19 * * *')
    .timeZone('America/Lima')
    .onRun(async () => {
        const adminInner = require('firebase-admin');
        if (!adminInner.apps.length) adminInner.initializeApp();
        const db = adminInner.firestore();

        const todayStr = getLimaDateString();
        const in3daysStr = addDaysToLimaDate(todayStr, 3);

        const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const FROM = 'whatsapp:+51907935299';

        const snap = await db.collection('members').where('endDate', '==', in3daysStr).get();
        for (const doc of snap.docs) {
            const member = doc.data();
            const name = (member.name || 'amigo').split(' ')[0];
            const phone = member.phone;
            if (!phone) continue;
            if ((member.status || '') === 'inactive') continue;

            const msg = `¡Hola ${name}! 😊 Te aviso que tu membresía en MegaGym vence en 3 días. ¡Renueva a tiempo y no pierdas el ritmo! 💪🔥`;
            try {
                await twilioClient.messages.create({ from: FROM, to: `whatsapp:${phone}`, body: msg });
                await db.collection('messages').add({
                    phone,
                    content: msg,
                    direction: 'outbound',
                    timestamp: adminInner.firestore.FieldValue.serverTimestamp(),
                    source: 'scheduled_membership_reminder'
                });
                console.log(`Reminder sent to ${phone}`);
            } catch (e) {
                console.error(`Error sending reminder to ${phone}:`, e);
            }
        }

        const membersSnap = await db.collection('members').get();
        for (const doc of membersSnap.docs) {
            const member = doc.data();
            const phone = member.phone;
            const endDate = String(member.endDate || '');
            if (!phone || !endDate) continue;
            if (['inactive', 'prospect'].includes(member.status || '')) continue;
            if (Number(member.debt) > 0) continue;

            const name = (member.name || 'amigo').split(' ')[0];
            const renewalIntent = member.assistantMemory || {};
            const renewalIntentAt = renewalIntent.renewalIntentAt?.toDate?.();
            if (renewalIntent.renewalIntent === 'continue_pay_later' && renewalIntentAt && !renewalIntent.renewalFollowupSentAt) {
                const daysSinceIntent = diffLimaDays(getLimaDateString(renewalIntentAt), todayStr);
                if (daysSinceIntent >= 5) {
                    const msg = `¡Hola ${name}! 😊 Te recuerdo con calma que tu renovación de MegaGym quedó pendiente. Cuando puedas, regularízala para seguir entrenando normal 💪`;
                    try {
                        await twilioClient.messages.create({ from: FROM, to: `whatsapp:${phone}`, body: msg });
                        await db.collection('messages').add({
                            phone,
                            content: msg,
                            direction: 'outbound',
                            timestamp: adminInner.firestore.FieldValue.serverTimestamp(),
                            source: 'scheduled_deferred_renewal_followup'
                        });
                        await doc.ref.set({
                            assistantMemory: {
                                ...renewalIntent,
                                renewalFollowupSentAt: adminInner.firestore.FieldValue.serverTimestamp(),
                                updatedAt: adminInner.firestore.FieldValue.serverTimestamp()
                            }
                        }, { merge: true });
                        console.log(`Deferred renewal follow-up sent to ${phone}`);
                    } catch (e) {
                        console.error(`Error sending deferred renewal follow-up to ${phone}:`, e);
                    }
                    continue;
                }
            }

            const daysOverdue = diffLimaDays(endDate, todayStr);
            if (![1, 7].includes(daysOverdue)) continue;
            if (Number(member.lastOverdueReminderDay) === daysOverdue) continue;

            const msg = daysOverdue === 1
                ? `¡Hola ${name}! 😊 Te recordamos que tu membresía venció ayer. ¿Deseas renovarla para seguir entrenando en MegaGym?`
                : `¡Hola ${name}! 😊 Te escribo para confirmar si deseas renovar tu membresía de MegaGym. Si quieres continuar, puedo ayudarte por aquí 💪`;

            try {
                await twilioClient.messages.create({ from: FROM, to: `whatsapp:${phone}`, body: msg });
                await db.collection('messages').add({
                    phone,
                    content: msg,
                    direction: 'outbound',
                    timestamp: adminInner.firestore.FieldValue.serverTimestamp(),
                    source: 'scheduled_overdue_membership_reminder'
                });
                await doc.ref.set({
                    lastOverdueReminderDay: daysOverdue,
                    lastOverdueReminderAt: adminInner.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
                console.log(`Overdue reminder sent to ${phone} (day ${daysOverdue})`);
            } catch (e) {
                console.error(`Error sending overdue reminder to ${phone}:`, e);
            }
        }

        const debtSnap = await db.collection('members').where('debt', '>', 0).get();

        for (const doc of debtSnap.docs) {
            const member = doc.data();
            const phone = member.phone;
            if (!phone || !member.startDate) continue;
            if ((member.status || '') === 'inactive') continue;

            const diffDays = diffLimaDays(member.startDate, todayStr);

            if (diffDays <= 0 || diffDays % 7 !== 0) continue;

            const name = (member.name || 'amigo').split(' ')[0];
            const debt = Number(member.debt).toFixed(2);
            const msg = `¡Hola ${name}! 😊 Te recuerdo que tienes un saldo pendiente de S/ ${debt} en MegaGym. Cuando puedas lo coordinas con nosotros 💪`;

            try {
                await twilioClient.messages.create({ from: FROM, to: `whatsapp:${phone}`, body: msg });
                await db.collection('messages').add({
                    phone,
                    content: msg,
                    direction: 'outbound',
                    timestamp: adminInner.firestore.FieldValue.serverTimestamp(),
                    source: 'scheduled_debt_reminder'
                });
                console.log(`Debt reminder sent to ${phone} (day ${diffDays})`);
            } catch (e) {
                console.error(`Error sending debt reminder to ${phone}:`, e);
            }
        }

        return null;
    });

export const classBookingReminder = functions
    .runWith({ memory: '512MB', timeoutSeconds: 300 })
    .pubsub.schedule('*/30 * * * *')
    .timeZone('America/Lima')
    .onRun(async () => {
        const adminInner = require('firebase-admin');
        if (!adminInner.apps.length) adminInner.initializeApp();
        const db = adminInner.firestore();

        const todayStr = getLimaDateString();
        const nowMinutes = getLimaMinutesSinceMidnight();
        const reminderWindowStart = nowMinutes + 90;
        const reminderWindowEnd = nowMinutes + 150;

        const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const FROM = 'whatsapp:+51907935299';

        const bookingsSnap = await db.collection('bookings')
            .where('date', '==', todayStr)
            .where('status', '==', 'confirmed')
            .get();

        for (const bookingDoc of bookingsSnap.docs) {
            const booking = bookingDoc.data() || {};
            if (booking.classReminderSentAt) {
                continue;
            }

            const classDoc = await db.collection('classes').doc(String(booking.classId || '')).get();
            if (!classDoc.exists) {
                continue;
            }

            const classData = classDoc.data() || {};
            const classTime = String(classData.time || classData.hour || '');
            const classTimeMinutes = parseClassTimeToMinutes(classTime);
            if (classTimeMinutes === null) {
                continue;
            }

            const bookingCreatedAt = booking.created_at?.toDate?.();
            if (bookingCreatedAt) {
                const bookingCreatedDate = getLimaDateString(bookingCreatedAt);
                const bookingCreatedMinutes = getLimaMinutesSinceMidnight(bookingCreatedAt);
                const minutesBetweenBookingAndClass = classTimeMinutes - bookingCreatedMinutes;

                // Skip reminders for late same-day bookings made within the previous 2 hours.
                if (bookingCreatedDate === todayStr && minutesBetweenBookingAndClass <= 120) {
                    continue;
                }
            }

            if (classTimeMinutes < reminderWindowStart || classTimeMinutes > reminderWindowEnd) {
                continue;
            }

            const memberDoc = booking.memberId
                ? await db.collection('members').doc(String(booking.memberId)).get()
                : null;

            if (!memberDoc?.exists) {
                continue;
            }

            const member = memberDoc.data() || {};
            const phone = member.phone;
            if (!phone) {
                continue;
            }

            const firstName = String(member.name || 'amigo').split(' ')[0];
            const className = classData.name || 'FULLBODY';
            const instructor = classData.instructor || 'LIZ PIA';
            const msg = `¡Hola ${firstName}! 😊 Te recordamos tu clase de ${className} con ${instructor} hoy a las ${formatClassTimeLabel(classTime)}. Te esperamos en MegaGym 💪`;

            try {
                await twilioClient.messages.create({
                    from: FROM,
                    to: `whatsapp:${phone}`,
                    body: msg
                });

                await db.collection('messages').add({
                    phone,
                    content: msg,
                    direction: 'outbound',
                    timestamp: adminInner.firestore.FieldValue.serverTimestamp(),
                    source: 'scheduled_class_booking_reminder'
                });

                await bookingDoc.ref.update({
                    classReminderSentAt: adminInner.firestore.FieldValue.serverTimestamp()
                });

                console.log(`Class reminder sent to ${phone} for booking ${bookingDoc.id}`);
            } catch (e) {
                console.error(`Error sending class reminder for booking ${bookingDoc.id}:`, e);
            }
        }

        return null;
    });

export const serveVoucher = functions
    .runWith({ memory: '512MB' })
    .https.onRequest(async (req, res) => {
        const fileName = req.query.file as string;
        if (!fileName || !fileName.startsWith('vouchers/')) {
            res.status(400).send('Bad request');
            return;
        }

        const adminInner = require('firebase-admin');
        if (!adminInner.apps.length) adminInner.initializeApp();

        const bucket = adminInner.storage().bucket();
        const file = bucket.file(fileName);

        const [exists] = await file.exists();
        if (!exists) {
            res.status(404).send('Not found');
            return;
        }

        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        file.createReadStream().pipe(res);
    });

// Valida el token de identidad del link de voz y devuelve SOLO los datos mínimos para
// personalizar a la Sofía de voz (agoravoz). No expone DNI, notas internas ni historial.
// El token lo firma la tool generar_link_voz con VOICE_LINK_SECRET; aquí se verifica.
export const getVoiceContext = functions
    .runWith({ memory: '256MB', timeoutSeconds: 30 })
    .https.onRequest(async (req, res) => {
        // CORS restringido al dominio de la página de voz (+ localhost para desarrollo).
        const configuredOrigin = (process.env.VOICE_PAGE_URL || '').replace(/\/+$/, '');
        const allowedOrigins = new Set([
            configuredOrigin,
            'http://localhost:3000',
            'http://127.0.0.1:3000'
        ].filter(Boolean));
        const requestOrigin = String(req.headers.origin || '');
        if (allowedOrigins.has(requestOrigin)) {
            res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        }
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'method_not_allowed' });
            return;
        }

        try {
            const secret = process.env.VOICE_LINK_SECRET;
            if (!secret) {
                console.error('❌ getVoiceContext: VOICE_LINK_SECRET no está configurado.');
                res.status(500).json({ error: 'not_configured' });
                return;
            }

            const token = String(req.body?.token || '').trim();
            if (!token) {
                res.status(400).json({ error: 'missing_token' });
                return;
            }

            const { verifyVoiceToken } = require('./tools/voiceLink');
            const result = verifyVoiceToken(token, secret);
            if (!result.valid) {
                // Firma inválida o token vencido → 401 (el frontend muestra "pide uno nuevo").
                res.status(401).json({ error: 'invalid_token', reason: result.reason });
                return;
            }

            const phone = String(result.payload?.phone || '').trim();
            if (!phone) {
                res.status(401).json({ error: 'invalid_token', reason: 'no_phone' });
                return;
            }

            const adminInner = require('firebase-admin');
            if (!adminInner.apps.length) adminInner.initializeApp();
            const db = adminInner.firestore();

            const memberDoc = await findMemberByPhone(db, phone);
            if (!memberDoc) {
                res.status(404).json({ error: 'member_not_found' });
                return;
            }
            const member = memberDoc.data() || {};

            // Defensa en profundidad: re-verifica que siga elegible (misma política que la tool).
            let daysUntilExpiry: number | null = null;
            let daysOverdue: number | null = null;
            if (member.endDate) {
                const end = new Date(member.endDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                daysUntilExpiry = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                if (daysUntilExpiry < 0) daysOverdue = Math.abs(daysUntilExpiry);
            }
            const eligible = member.status !== 'inactive'
                && (daysOverdue === null || daysOverdue < 15);
            if (!eligible) {
                res.status(403).json({ error: 'not_eligible' });
                return;
            }

            // Token de un solo uso (opcional, activable con VOICE_TOKEN_SINGLE_USE=true):
            // registra el jti en Firestore para invalidar reusos del mismo enlace.
            // El token ya es corto (15 min); esto es una capa extra. Se hace en transacción
            // para que dos peticiones simultáneas no puedan consumir el mismo jti.
            if (String(process.env.VOICE_TOKEN_SINGLE_USE || '').toLowerCase() === 'true') {
                const jti = String(result.payload?.jti || '');
                if (!jti) {
                    res.status(401).json({ error: 'invalid_token', reason: 'no_jti' });
                    return;
                }
                const tokenRef = db.collection('usedVoiceTokens').doc(jti);
                const firstUse = await db.runTransaction(async (tx: any) => {
                    const doc = await tx.get(tokenRef);
                    if (doc.exists) return false;
                    tx.set(tokenRef, {
                        usedAt: adminInner.firestore.FieldValue.serverTimestamp(),
                        // expireAt permite una política TTL de Firestore que limpie estos docs.
                        expireAt: typeof result.payload?.exp === 'number'
                            ? adminInner.firestore.Timestamp.fromMillis(result.payload.exp * 1000)
                            : null,
                    });
                    return true;
                });
                if (!firstUse) {
                    res.status(401).json({ error: 'invalid_token', reason: 'reused' });
                    return;
                }
            }

            // Rutina: misma fuente que la tool get_student_routine (studentRoutineAssignments).
            let rutinaResumen: string | null = null;
            let routineUrl: string | null = null;
            try {
                const bot = require('./bot/messageProcessor');
                const routineRes = await bot.executeTool('get_student_routine', { phone });
                if (routineRes?.found && Array.isArray(routineRes.routines) && routineRes.routines.length > 0) {
                    rutinaResumen = routineRes.routines[0].title || null;
                    routineUrl = routineRes.routines[0].url || null;
                }
            } catch (e: any) {
                console.error('getVoiceContext: error obteniendo rutina', e?.message);
            }

            // Detalle completo de la rutina para que Sofía-voz explique los ejercicios.
            let rutinaDetalle: string | null = null;
            try {
                const cleanPhone = String(phone).replace(/\s/g, '');
                const base = cleanPhone.replace(/^\+?51/, '');
                const formats = Array.from(new Set([
                    cleanPhone,
                    cleanPhone.startsWith('+') ? cleanPhone.slice(1) : '+' + cleanPhone,
                    base,
                    '+51' + base,
                    '51' + base,
                    'whatsapp:' + cleanPhone,
                    'whatsapp:+' + base,
                    'whatsapp:51' + base,
                    'whatsapp:' + base
                ]));
                let detailData: any = null;
                for (const fmt of formats) {
                    const snap = await db.collection('studentRoutineAssignments')
                        .where('studentPhone', '==', fmt)
                        .limit(5)
                        .get();
                    if (!snap.empty) {
                        detailData = snap.docs
                            .map((d: any) => d.data())
                            .filter((d: any) => d?.payload)
                            .sort((a: any, b: any) => {
                                const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                                const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                                return bDate.getTime() - aDate.getTime();
                            })[0] || null;
                        if (detailData) break;
                    }
                }
                if (detailData) {
                    rutinaDetalle = routineToText(detailData);
                }
            } catch (e: any) {
                console.error('getVoiceContext: error obteniendo detalle de rutina', e?.message);
            }

            const profile = member.trainingProfile || {};
            // Payload mínimo y seguro: solo lo necesario para personalizar la voz.
            res.status(200).json({
                name: (member.name || '').split(' ')[0] || null,
                status: member.status || null,
                diasParaVencer: daysUntilExpiry,
                plan: member.plan || null,
                objetivo: profile.objetivo || null,
                rutinaResumen,
                rutinaDetalle,
                routineUrl
            });
        } catch (e: any) {
            console.error('❌ Error en getVoiceContext:', e);
            res.status(500).json({ error: e.message });
        }
    });
// ============ ASESORÍA POR VOZ — COACH PRO (entrenador) ============

const COACH_METHODS: Record<number, string> = {
    1: 'Triseries',
    2: 'Biseries + Tempo',
    3: 'Rest-Pause',
    4: 'Preagotamiento',
    5: 'FST-7',
    6: 'Series Gigantes',
    7: 'Myo-Reps',
    8: 'Cluster Sets',
    9: 'Dropsets Avanzados',
    10: 'Contrastes',
    11: 'BFR / Oclusión',
    12: 'Combinación Inteligente',
};

function normalizeRoutinePayload(payload: any): any {
    if (payload && payload.t) {
        return {
            title: payload.t,
            slides: (payload.s || []).map((sl: any) => ({
                dia: sl.d,
                title: sl.t,
                exercises: (sl.e || []).map((ex: any) => ({
                    name: ex.n,
                    sets: ex.s,
                    reps: ex.r,
                    rounds: ex.rd,
                    tempo: ex.tp,
                    rir: ex.ri,
                    rest: ex.rs,
                })),
            })),
        };
    }
    return payload;
}

function routineToText(data: any): string | null {
    const payload = data?.payload;
    if (!payload) return null;
    const routine = normalizeRoutinePayload(payload);
    const lines: string[] = [`TÍTULO: ${String(data?.title || routine?.title || 'Rutina')}`];
    if (Array.isArray(routine?.slides)) {
        for (const slide of routine.slides) {
            lines.push('');
            lines.push(`${slide?.dia ? slide.dia + ' · ' : ''}${slide?.title || ''}`);
            if (Array.isArray(slide?.exercises)) {
                for (const ex of slide.exercises) {
                    let line = `- ${ex?.name || ''}: ${ex?.sets ?? ''} series x ${ex?.reps ?? ''} reps`;
                    const extras: string[] = [];
                    if (ex?.rounds && ex.rounds > 1) extras.push(`${ex.rounds} vueltas`);
                    if (ex?.tempo) extras.push(`tempo ${ex.tempo}`);
                    if (ex?.rir) extras.push(ex.rir);
                    if (ex?.rest) extras.push(`descanso ${ex.rest}`);
                    if (extras.length) line += ` (${extras.join(', ')})`;
                    lines.push(line);
                }
            }
        }
    }
    return lines.join('\n');
}

// Crea el link de voz del entrenador (Coach Pro) firmando un JWT con role=coach.
export const createCoachVoiceLink = functions
    .runWith({ memory: '256MB', timeoutSeconds: 30 })
    .https.onRequest(async (req, res) => {
        const appOrigins = [
            process.env.RUTINAS_APP_URL || 'https://rutinas-robert.web.app',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ].filter(Boolean);
        const requestOrigin = String(req.headers.origin || '');
        if (appOrigins.includes(requestOrigin)) {
            res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        }
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
        if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

        try {
            const secret = process.env.VOICE_LINK_SECRET;
            if (!secret) { res.status(500).json({ error: 'not_configured' }); return; }

            const mes = Number(req.body?.mes);
            if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
                res.status(400).json({ error: 'invalid_mes' });
                return;
            }

            const { signVoiceToken } = require('./tools/voiceLink');
            const token = signVoiceToken({ role: 'coach', mes }, secret, 15 * 60);

            const base = (process.env.VOICE_PAGE_URL || '').replace(/\/+$/, '');
            if (!base) { res.status(500).json({ error: 'not_configured' }); return; }

            res.status(200).json({ link: `${base}/?token=${token}&role=coach`, expiresInMinutes: 15 });
        } catch (e: any) {
            console.error('❌ Error en createCoachVoiceLink:', e);
            res.status(500).json({ error: e.message });
        }
    });

// Entrega el contexto del entrenador para el agente de voz Coach Pro.
export const getCoachVoiceContext = functions
    .runWith({ memory: '256MB', timeoutSeconds: 30 })
    .https.onRequest(async (req, res) => {
        const configuredOrigin = (process.env.VOICE_PAGE_URL || '').replace(/\/+$/, '');
        const allowedOrigins = new Set([
            configuredOrigin,
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ].filter(Boolean));
        const requestOrigin = String(req.headers.origin || '');
        if (allowedOrigins.has(requestOrigin)) {
            res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        }
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
        if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

        try {
            const secret = process.env.VOICE_LINK_SECRET;
            if (!secret) { res.status(500).json({ error: 'not_configured' }); return; }

            const token = String(req.body?.token || '').trim();
            if (!token) { res.status(400).json({ error: 'missing_token' }); return; }

            const { verifyVoiceToken } = require('./tools/voiceLink');
            const result = verifyVoiceToken(token, secret);
            if (!result.valid) {
                res.status(401).json({ error: 'invalid_token', reason: result.reason });
                return;
            }
            if (result.payload?.role !== 'coach') {
                res.status(401).json({ error: 'invalid_token', reason: 'not_coach' });
                return;
            }

            const mes = Number(result.payload?.mes);
            const mesValido = Number.isInteger(mes) && mes >= 1 && mes <= 12;

            const db = admin.firestore();

            // Últimas rutinas compartidas (la más reciente y la anterior).
            let ultimaRutina: string | null = null;
            let rutinaAnterior: string | null = null;
            try {
                const snap = await db.collection('sharedRoutines')
                    .orderBy('createdAt', 'desc')
                    .limit(2)
                    .get();
                if (snap.docs[0]) ultimaRutina = routineToText(snap.docs[0].data());
                if (snap.docs[1]) rutinaAnterior = routineToText(snap.docs[1].data());
            } catch (e: any) {
                console.error('getCoachVoiceContext: sin índice para ordenar, uso fallback', e?.message);
                try {
                    const snap = await db.collection('sharedRoutines').limit(2).get();
                    if (snap.docs[0]) ultimaRutina = routineToText(snap.docs[0].data());
                    if (snap.docs[1]) rutinaAnterior = routineToText(snap.docs[1].data());
                } catch (e2: any) {
                    console.error('getCoachVoiceContext: error leyendo rutinas', e2?.message);
                }
            }

            // Alumnas activas (resumen, sin datos sensibles).
            let alumnasActivas: Array<{ name: string | null; objetivo: string | null; plan: string | null }> = [];
            try {
                const membersSnap = await db.collection('members')
                    .where('status', '==', 'active')
                    .limit(10)
                    .get();
                alumnasActivas = membersSnap.docs.map((d: any) => {
                    const m = d.data() || {};
                    const profile = m.trainingProfile || {};
                    return {
                        name: String(m.name || '').split(' ')[0] || null,
                        objetivo: profile.objetivo || null,
                        plan: m.plan || null,
                    };
                }).filter((a: any) => a.name);
            } catch (e: any) {
                console.error('getCoachVoiceContext: error leyendo alumnas', e?.message);
            }

            res.status(200).json({
                role: 'coach',
                mes: mesValido ? mes : null,
                metodo: mesValido ? (COACH_METHODS[mes] || null) : null,
                ultimaRutina,
                rutinaAnterior,
                alumnasActivas,
                gymData: {
                    direccion: 'Mz I Lt 5, Montenegro, San Juan de Lurigancho',
                    horarios: 'Lun-Vie 6am-10pm · Sáb 6am-6pm · Dom 6am-12pm',
                    planes: '1 mes S/70 · 2 meses S/120 · 3 meses S/150 · Interdiario S/50 · Clase grupal S/6',
                    whatsapp: '907 935 299',
                },
            });
        } catch (e: any) {
            console.error('❌ Error en getCoachVoiceContext:', e);
            res.status(500).json({ error: e.message });
        }
    });
