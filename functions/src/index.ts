import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

// CRITICAL: Do NOT initialize admin here to avoid cold-start timeouts.

export const twilioWebhookWhatsapp = functions.https.onRequest(async (req, res) => {
    // 1. Lazy Initialization
    if (!admin.apps.length) {
        admin.initializeApp();
    }
    const db = admin.firestore();

    // Lazy load agent to prevent top-level import costs
    const { processMessage } = require("./ai/agent");

    // Twilio sends form-urlencoded
    const incomingMsg = req.body.Body;
    const from = req.body.From; // whatsapp:+1234567890

    // Extract pure phone number
    const phone = from ? from.replace('whatsapp:', '') : 'unknown';

    console.log(`Msg from ${phone}: ${incomingMsg}`);

    try {
        // 2. Save Inbound Message
        await db.collection('messages').add({
            phone: phone,
            content: incomingMsg || '',
            direction: 'inbound',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // 3. Process with AI
        const aiResponse = await processMessage(phone, incomingMsg || '');
        const replyText = aiResponse || "Lo siento, tuve un error.";

        // 4. Save Outbound Message
        await db.collection('messages').add({
            phone: phone,
            content: replyText,
            direction: 'outbound',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // 5. Send Response to Twilio (TwiML)
        const twiml = `
    <Response>
        <Message>${replyText}</Message>
    </Response>
    `;

        res.type('text/xml');
        res.send(twiml);

    } catch (error) {
        console.error("Error processing message:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Scheduled Function: Membership Reminders (Daily 9 AM)
export const sendReminders = functions.pubsub.schedule('0 9 * * *').onRun(async (context) => {
    if (!admin.apps.length) {
        admin.initializeApp();
    }
    const db = admin.firestore();

    // Initialize Twilio lazily
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const today = new Date();
    const targetDate = new Date();
    targetDate.setDate(today.getDate() + 3); // 3 days before expiry

    // Convert to ISO string for comparison (simplified)
    const dateStr = targetDate.toISOString().split('T')[0];

    const membersSnap = await db.collection('members')
        .where('endDate', '==', dateStr)
        .get();

    for (const doc of membersSnap.docs) {
        const member = doc.data();
        if (member.phone) {
            try {
                await client.messages.create({
                    from: 'whatsapp:+14155238886', // Sandbox number or your configured sender
                    to: `whatsapp:${member.phone}`,
                    body: `Hola ${member.name}, tu membresía vence en 3 días. Por favor renueva para seguir entrenando.`
                });
            } catch (e) {
                console.error(`Failed to send reminder to ${member.name}`, e);
            }
        }
    }
});

// Scheduled Function: Class Reminders (Every Hour)
export const sendClassReminders = functions.pubsub.schedule('0 * * * *').onRun(async (context) => {
    console.log("Checking for upcoming classes...");
});

// Stripe Integration
export const createStripeCheckout = functions.https.onCall(async (data, context) => {
    // Initialize Stripe lazily
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2024-12-18.acacia',
    });

    // 1. Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
    }

    const { planName, price, successUrl, cancelUrl } = data;

    if (!price) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing price information');
    }

    try {
        // 2. Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment', // or 'subscription' if using recurring prices
            line_items: [
                {
                    price_data: {
                        currency: 'pen', // Soles
                        product_data: {
                            name: planName || 'Plan de Gimnasio',
                        },
                        unit_amount: Math.round(price * 100), // Stripe expects cents
                    },
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                userId: context.auth.uid,
                planName: planName
            }
        });

        return { url: session.url };
    } catch (error: any) {
        console.error('Stripe Error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// Stripe Webhook: Auto-Enrollment
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: '2024-12-18.acacia',
    });
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        if (endpointSecret) {
            const sig = req.headers['stripe-signature'];
            // Verify signature to prevent fake requests
            event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
        } else {
            event = req.body;
        }
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        // 1. Extract metadata
        const { phone, planName, userId } = session.metadata || {};
        const customerEmail = session.customer_details?.email;
        const customerName = session.customer_details?.name;

        if (!phone && !userId) {
            console.error('No phone or userId found in metadata.');
            res.status(200).send(); // Acknowledge to stop retries
            return;
        }

        // 2. Database Logic
        if (!admin.apps.length) admin.initializeApp();
        const db = admin.firestore();

        try {
            // Determine Plan Duration
            let monthsToAdd = 1;
            if (planName?.includes('2')) monthsToAdd = 2;
            else if (planName?.includes('3')) monthsToAdd = 3;

            // Calculate dates
            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(startDate.getMonth() + monthsToAdd);

            const memberData = {
                name: customerName || 'Nuevo Miembro',
                email: customerEmail || 'no-email@provided.com',
                phone: phone || '',
                plan: planName || 'Membresía Fit IA',
                status: 'active',
                joinDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                lastPaymentDate: startDate.toISOString(),
                stripeSessionId: session.id,
                payments: admin.firestore.FieldValue.arrayUnion({
                    amount: session.amount_total ? session.amount_total / 100 : 0,
                    date: new Date().toISOString(),
                    method: 'stripe',
                    status: 'paid'
                })
            };

            // 3. Upsert Member
            // Strategy: Try to find by phone first, else create new
            let memberRef;
            if (phone) {
                const q = await db.collection('members').where('phone', '==', phone).limit(1).get();
                if (!q.empty) {
                    memberRef = q.docs[0].ref;
                }
            }

            if (!memberRef && userId) {
                memberRef = db.collection('members').doc(userId); // If authenticating via Web App
            }

            if (memberRef) {
                await memberRef.update(memberData);
                console.log(`Updated member: ${memberRef.id}`);
            } else {
                const newRef = await db.collection('members').add({
                    ...memberData,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`Created new member: ${newRef.id}`);
            }

        } catch (error) {
            console.error('Error updating Firestore:', error);
            res.status(500).send();
            return;
        }
    }

    res.status(200).send();
});
