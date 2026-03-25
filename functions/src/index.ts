
import * as functions from "firebase-functions/v1";

export const twilioWebhookWhatsapp = functions
    .runWith({ memory: '1GB', timeoutSeconds: 120 })
    .https.onRequest(async (req, res) => {
        const admin = require('firebase-admin');
        if (!admin.apps.length) admin.initializeApp();
        const db = admin.firestore();

        let incomingMsg = req.body.Body || '';
        const from = req.body.From;
        const phone = from.replace('whatsapp:', '');

        // 1. Detect and transcribe audio if present
        const mediaUrl = req.body.MediaUrl0;
        const mediaType = req.body.MediaContentType0;

        if (mediaUrl && (mediaType === null || mediaType === void 0 ? void 0 : mediaType.startsWith('audio/'))) {
            try {
                const { transcribeAudio } = require('./bot/transcription');
                const transcription = await transcribeAudio(mediaUrl, process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                if (transcription) {
                    incomingMsg = transcription;
                }
            }
            catch (err) {
                console.error("Transcription Error:", err);
                // Fall back to empty or any existing Body
            }
        }

        console.log(`Msg from ${phone}: ${incomingMsg || '[Sin texto/Media]'}`);

        try {
            await db.collection('messages').add({
                phone: phone,
                content: incomingMsg,
                direction: 'inbound',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            const bot = require('./bot/messageProcessor');
            const replyText = await bot.processMessage(db, phone, incomingMsg);

            await db.collection('messages').add({
                phone: phone,
                content: replyText,
                direction: 'outbound',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
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
        const admin = require('firebase-admin');
        if (!admin.apps.length) admin.initializeApp();
        const db = admin.firestore();

        try {
            const event = req.body;
            console.log("Culqi Webhook Event:", event.type);

            if (event.type === 'checkout.order.paid') {
                const order = event.data;
                const phone = order.metadata?.phone;
                const planName = order.metadata?.planName;

                if (phone) {
                    const membersSnap = await db.collection('members').where('phone', '==', phone).limit(1).get();
                    if (!membersSnap.empty) {
                        const memberRef = membersSnap.docs[0].ref;
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
                            payments: admin.firestore.FieldValue.arrayUnion({
                                amount: order.amount / 100,
                                date: new Date().toISOString(),
                                orderId: order.id
                            })
                        });

                        const memberData = membersSnap.docs[0].data();
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
                const { token, email, amount, orderId, phone, planName } = req.body;
                const CULQI_PRIVATE_KEY = process.env.CULQI_PRIVATE_KEY;
                if (!CULQI_PRIVATE_KEY) throw new Error('CULQI_PRIVATE_KEY not set');

                const axios = require('axios');
                const chargePayload: any = {
                    amount,
                    currency_code: 'PEN',
                    email,
                    source_id: token,
                    metadata: { phone: phone || '', planName: planName || '', orderId: orderId || '' }
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

                // Si el cobro fue exitoso (no hay error), activar membresía
                console.log('Charge result:', JSON.stringify({ id: charge.id, object: charge.object, outcome: charge.outcome, paid: charge.paid }));
                if (charge.object !== 'error') {
                    const admin = require('firebase-admin');
                    if (!admin.apps.length) admin.initializeApp();
                    const db = admin.firestore();

                    if (phone) {
                        // Buscar con múltiples formatos de teléfono
                        const phoneFormats = new Set([
                            phone,
                            phone.startsWith('+') ? phone.slice(1) : '+' + phone,
                            phone.replace(/^\+?51/, ''),
                            '+51' + phone.replace(/^\+?51/, '')
                        ]);
                        let snap: any = null;
                        for (const fmt of phoneFormats) {
                            const s = await db.collection('members').where('phone', '==', fmt).limit(1).get();
                            if (!s.empty) { snap = s; break; }
                        }
                        if (snap && !snap.empty) {
                            const today = new Date();
                            const memberData = snap.docs[0].data();
                            // Extender desde la fecha de vencimiento actual si aún no venció, si no desde hoy
                            const currentEnd = memberData.endDate ? new Date(memberData.endDate) : today;
                            const baseDate = currentEnd > today ? currentEnd : today;
                            const endDate = new Date(baseDate);
                            endDate.setMonth(endDate.getMonth() + 1);
                            const prevPaid = Number(memberData.amountPaid) || 0;
                            await snap.docs[0].ref.update({
                                status: 'active',
                                plan: planName || 'Plan 1 Mes',
                                startDate: baseDate.toISOString().split('T')[0],
                                endDate: endDate.toISOString().split('T')[0],
                                expirationDate: admin.firestore.Timestamp.fromDate(endDate),
                                amountPaid: prevPaid + (amount / 100),
                                planPrice: amount / 100,
                                culqiChargeId: charge.id,
                                paymentApprovedAt: new Date().toISOString(),
                                payments: admin.firestore.FieldValue.arrayUnion({
                                    amount: amount / 100,
                                    method: 'Culqi',
                                    date: new Date().toISOString(),
                                    chargeId: charge.id
                                })
                            });
                            console.log(`✅ Member updated: ${snap.docs[0].id}`);
                        } else {
                            console.warn(`⚠️ No member found for phone: ${phone}`);
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
        const { phone, planName } = req.body;
        const { generatePaymentLink } = require('./tools/paymentHandler');
        try {
            const url = await generatePaymentLink(phone, planName);
            res.status(200).json({ url });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

// Sirve imágenes de vouchers desde Storage sin necesitar permisos públicos
export const serveVoucher = functions
    .runWith({ memory: '512MB' })
    .https.onRequest(async (req, res) => {
        const fileName = req.query.file as string;
        if (!fileName || !fileName.startsWith('vouchers/')) {
            res.status(400).send('Bad request');
            return;
        }

        const admin = require('firebase-admin');
        if (!admin.apps.length) admin.initializeApp();

        const bucket = admin.storage().bucket();
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
