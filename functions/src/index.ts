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
                    } else {
                        const memberDoc = await findMemberByPhone(db, phone);
                        if (memberDoc) {
                            const memberRef = memberDoc.ref;
                            const today = new Date();
                            const endDate = new Date();
                            endDate.setMonth(today.getMonth() + 1);

                            await memberRef.update({
                                status: 'active',
                                plan: planName || 'Plan 1 Mes',
                                startDate: today.toISOString().split('T')[0],
                                endDate: endDate.toISOString().split('T')[0],
                                culqiOrderId: order.id,
                                paymentApprovedAt: new Date().toISOString(),
                                payments: adminInner.firestore.FieldValue.arrayUnion({
                                    amount: order.amount / 100,
                                    date: new Date().toISOString(),
                                    orderId: order.id
                                })
                            });

                            const memberData = memberDoc.data();
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

                    if (paymentType === 'class_booking') {
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
                            const today = new Date();
                            const memberData = memberDoc.data();
                            const currentEnd = memberData.endDate ? new Date(memberData.endDate) : today;
                            const baseDate = currentEnd > today ? currentEnd : today;
                            const endDate = new Date(baseDate);
                            endDate.setMonth(endDate.getMonth() + 1);
                            const prevPaid = Number(memberData.amountPaid) || 0;

                            await memberDoc.ref.update({
                                status: 'active',
                                plan: planName || 'Plan 1 Mes',
                                startDate: baseDate.toISOString().split('T')[0],
                                endDate: endDate.toISOString().split('T')[0],
                                expirationDate: adminInner.firestore.Timestamp.fromDate(endDate),
                                amountPaid: prevPaid + (amount / 100),
                                planPrice: amount / 100,
                                culqiChargeId: charge.id,
                                paymentApprovedAt: new Date().toISOString(),
                                payments: adminInner.firestore.FieldValue.arrayUnion({
                                    amount: amount / 100,
                                    method: 'Culqi',
                                    date: new Date().toISOString(),
                                    chargeId: charge.id
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
        const { phone, planName, paymentType, classId, bookingDate } = req.body;
        const { generatePaymentLink } = require('./tools/paymentHandler');
        try {
            const url = await generatePaymentLink(phone, planName, { paymentType, classId, bookingDate });
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
            if ((member.status || '') === 'prospect') continue;
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
