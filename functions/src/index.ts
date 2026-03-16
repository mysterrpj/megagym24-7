
import * as functions from "firebase-functions/v1";

export const twilioWebhookWhatsapp = functions
    .runWith({ memory: '1GB', timeoutSeconds: 120 })
    .https.onRequest(async (req, res) => {
        const admin = require('firebase-admin');
        if (!admin.apps.length) admin.initializeApp();
        const db = admin.firestore();

        const incomingMsg = req.body.Body;
        const from = req.body.From;
        const phone = from.replace('whatsapp:', '');

        console.log(`Msg from ${phone}: ${incomingMsg}`);

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

            const twiml = `
        <Response>
            <Message>${replyText}</Message>
        </Response>
        `;
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

                        // Generar voucher como imagen
                        const { generateVoucherImage } = require('./tools/voucherGenerator');
                        const imageUrl = await generateVoucherImage({
                            customerName: membersSnap.docs[0].data().name || 'Cliente',
                            date: today.toLocaleDateString('es-PE'),
                            time: today.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
                            orderId: order.id,
                            planName: planName || 'Plan 1 Mes',
                            amount: (order.amount / 100).toFixed(2),
                            paymentMethod: 'Culqi'
                        });

                        const twilioClientObj = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
                        await twilioClientObj.messages.create({
                            from: 'whatsapp:+51907935299',
                            to: `whatsapp:${phone}`,
                            body: '¡Pago confirmado! 💪 Aquí tu comprobante de MegaGym:',
                            mediaUrl: [imageUrl]
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

export const generateCulqiLink = functions.https.onRequest(async (req, res) => {
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
export const serveVoucher = functions.https.onRequest(async (req, res) => {
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
