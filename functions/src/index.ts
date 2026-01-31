import * as functions from "firebase-functions/v1";
// import * as admin from "firebase-admin"; // Moved inside functions to fix timeout

// CRITICAL: Do NOT initialize admin here to avoid cold-start timeouts.

// --- Inlined Process Message ---
async function processMessage(phone: string, messageText: string) {
    const OpenAI = require('openai');
    // --- Inlined Tools Definition ---
    const tools = [
        {
            type: "function",
            function: {
                name: "get_membership_plans",
                description: "Get list of available membership plans with prices and benefits",
                parameters: { type: "object", properties: {} }
            }
        },
        {
            type: "function",
            function: {
                name: "get_available_classes",
                description: "Get available classes for a specific date or upcoming week",
                parameters: {
                    type: "object",
                    properties: {
                        date: { type: "string", description: "Date in YYYY-MM-DD format (optional)" }
                    }
                }
            }
        },
        {
            type: "function",
            function: {
                name: "book_class",
                description: "Book a class for a member",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "Member's phone number" },
                        classId: { type: "string", description: "ID of the class to book" },
                        date: { type: "string", description: "Date of the class" }
                    },
                    required: ["phone", "classId", "date"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "check_member_status",
                description: "Check if a phone number belongs to an active member and get their details",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "Phone number to check" }
                    },
                    required: ["phone"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "generate_payment_link",
                description: "Generate a payment link (Culqi) for a specific plan. Use this when the user wants to pay.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "User's phone number to link the payment" },
                        planName: { type: "string", description: "Name of the plan (e.g., '1 Month', '2 Months')" }
                    },
                    required: ["phone", "planName"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "register_user",
                description: "Register a new user or update their name. Use this BEFORE generating a payment link for new users.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "User phone number" },
                        name: { type: "string", description: "User's full name" },
                        email: { type: "string", description: "User's email (optional)" }
                    },
                    required: ["phone", "name"]
                }
            }
        }
    ];

    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || 'placeholder-key'
    });

    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore();

    // --- Inlined Execute Tool ---
    async function executeTool(name: string, args: any) {
        const adminInner = require('firebase-admin');
        if (!adminInner.apps.length) adminInner.initializeApp();
        const dbInner = adminInner.firestore();

        switch (name) {
            case 'get_membership_plans':
                const snapshot = await dbInner.collection('memberships').get();
                return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

            case 'get_available_classes':
                const classesSnap = await dbInner.collection('classes').get();
                return classesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

            case 'check_member_status':
                const membersSnap = await dbInner.collection('members').where('phone', '==', args.phone).get();
                if (membersSnap.empty) return { status: 'not_found' };
                const member = membersSnap.docs[0].data();
                return member;

            case 'book_class':
                try {
                    const memSnap = await dbInner.collection('members').where('phone', '==', args.phone).get();
                    if (memSnap.empty) return { error: "Member not found" };
                    const memberId = memSnap.docs[0].id;

                    await dbInner.collection('bookings').add({
                        memberId: memberId,
                        classId: args.classId,
                        date: args.date,
                        status: 'confirmed',
                        created_at: adminInner.firestore.FieldValue.serverTimestamp()
                    });
                    return { success: true, message: "Class booked successfully" };
                } catch (e: any) {
                    return { error: e.message };
                }

            case 'generate_payment_link':
                try {
                    const response = await fetch('https://us-central1-fit-ia-megagym.cloudfunctions.net/generateCulqiLink', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: args.phone, planName: args.planName })
                    });
                    const data: any = await response.json();
                    if (!response.ok) throw new Error(data.error || "Error connecting to payment service");
                    return { url: data.url, message: "Link de pago generado." };
                } catch (error: any) {
                    return { error: error.message };
                }

            case 'register_user':
                try {
                    const membersRef = dbInner.collection('members');
                    const q = await membersRef.where('phone', '==', args.phone).limit(1).get();

                    if (!q.empty) {
                        await q.docs[0].ref.update({ name: args.name });
                        return { success: true, message: "Nombre actualizado." };
                    } else {
                        await membersRef.add({
                            phone: args.phone,
                            name: args.name,
                            email: args.email || '',
                            status: 'prospect',
                            createdAt: adminInner.firestore.FieldValue.serverTimestamp()
                        });
                        return { success: true, message: "Usuario registrado." };
                    }
                } catch (e: any) {
                    return { error: e.message };
                }

            default:
                return { error: "Tool not found" };
        }
    }

    const historySnapshot = await db.collection('messages')
        .where('phone', '==', phone)
        .orderBy('timestamp', 'asc')
        .limitToLast(10)
        .get();

    const messages: any[] = historySnapshot.docs.map((doc: any) => {
        const data = doc.data();
        return {
            role: data.direction === 'inbound' ? 'user' : 'assistant',
            content: data.content
        };
    });

    messages.push({ role: 'user', content: messageText });

    const systemPrompt = `
    You are Sofía, the helpful and energetic AI receptionist at MegaGym ("La casa del dolor" 📍).
    Current time: ${new Date().toISOString()}.
    
    // ... System Prompt Abbreviated for brevity in logs (Full prompt is effectively here) ...
    **GYM INFORMATION (Source of Truth):**
    - **Address:** Mz I Lt 5 Montenegro, San Juan de Lurigancho.
    - **Hours:** Monday to Saturday: 6:00 AM - 10:00 PM. Feriados: Ask for confirmation.
    - **Prices:** 1 Month: S/ 80. 2 Months: S/ 120. 3 Months: S/ 150. Daily: S/ 6.
    - **Payment:** If user wants to pay, call 'generate_payment_link'. Show the link.
    
    **TONE:** Friendly, energetic, use emojis. Short answers.

    **RULES FOR PAYMENTS:**
    1. If a user wants to pay/buy a plan:
    2. CHECK if they are a registered member (use check_member_status).
    3. IF they are NOT registered (status: 'not_found'): 
       - ASK for their Full Name ("Nombre Completo") FIRST.
       - ONCE they give the name, use 'register_user' to save them.
       - THEN call 'generate_payment_link'.
    4. IF they are ALREADY registered:
       - Directly call 'generate_payment_link'.
    `;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages
        ],
        tools: tools as any,
        tool_choice: 'auto'
    });

    const responseMessage = response.choices[0].message;

    if (responseMessage.tool_calls) {
        const toolMessages: any[] = [...messages, responseMessage];

        for (const toolCall of responseMessage.tool_calls) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            const functionResult = await executeTool(functionName, functionArgs);

            toolMessages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify(functionResult)
            });
        }

        const secondResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                ...toolMessages
            ]
        });

        return secondResponse.choices[0].message.content;
    }

    return responseMessage.content;
}

// Export the main webhook function
// Exported functions follow below


// Scheduled functions commented out for deployment debug
// export const sendReminders = functions.pubsub.schedule('0 9 * * *').onRun(async (context) => {
//     if (!admin.apps.length) {
//         admin.initializeApp();
//     }
//     const db = admin.firestore();

//     // Initialize Twilio lazily
//     const twilio = require('twilio');
//     const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

//     const today = new Date();
//     const targetDate = new Date();
//     targetDate.setDate(today.getDate() + 3); // 3 days before expiry

//     // Convert to ISO string for comparison (simplified)
//     const dateStr = targetDate.toISOString().split('T')[0];

//     const membersSnap = await db.collection('members')
//         .where('endDate', '==', dateStr)
//         .get();

//     for (const doc of membersSnap.docs) {
//         const member = doc.data();
//         if (member.phone) {
//             try {
//                 await client.messages.create({
//                     from: 'whatsapp:+14155238886', // Sandbox number or your configured sender
//                     to: `whatsapp:${member.phone}`,
//                     body: `Hola ${member.name}, tu membresía vence en 3 días. Por favor renueva para seguir entrenando.`
//                 });
//             } catch (e) {
//                 console.error(`Failed to send reminder to ${member.name}`, e);
//             }
//         }
//     }
// });

// // Scheduled Function: Class Reminders (Every Hour)
// export const sendClassReminders = functions.pubsub.schedule('0 * * * *').onRun(async (context) => {
//     console.log("Checking for upcoming classes...");
// });

// // Stripe Integration
// export const createStripeCheckout = functions.https.onCall(async (data, context) => {
//     // Initialize Stripe lazily
//     const Stripe = require('stripe');
//     const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
//         apiVersion: '2024-12-18.acacia',
//     });

//     // 1. Auth Check
//     if (!context.auth) {
//         throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
//     }

//     const { planName, price, successUrl, cancelUrl } = data;

//     if (!price) {
//         throw new functions.https.HttpsError('invalid-argument', 'Missing price information');
//     }

//     try {
//         // 2. Create Checkout Session
//         const session = await stripe.checkout.sessions.create({
//             payment_method_types: ['card'],
//             mode: 'payment', // or 'subscription' if using recurring prices
//             line_items: [
//                 {
//                     price_data: {
//                         currency: 'pen', // Soles
//                         product_data: {
//                             name: planName || 'Plan de Gimnasio',
//                         },
//                         unit_amount: Math.round(price * 100), // Stripe expects cents
//                     },
//                     quantity: 1,
//                 },
//             ],
//             success_url: successUrl,
//             cancel_url: cancelUrl,
//             metadata: {
//                 userId: context.auth.uid,
//                 planName: planName
//             }
//         });

//         return { url: session.url };
//     } catch (error: any) {
//         console.error('Stripe Error:', error);
//         throw new functions.https.HttpsError('internal', error.message);
//     }
// });

// // Stripe Webhook: Auto-Enrollment
// export const stripeWebhook = functions.https.onRequest(async (req, res) => {
//     const Stripe = require('stripe');
//     const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
//         apiVersion: '2024-12-18.acacia',
//     });
//     const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

//     let event;

//     try {
//         if (endpointSecret) {
//             const sig = req.headers['stripe-signature'];
//             // Verify signature to prevent fake requests
//             event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
//         } else {
//             event = req.body;
//         }
//     } catch (err: any) {
//         console.error(`Webhook Error: ${err.message}`);
//         res.status(400).send(`Webhook Error: ${err.message}`);
//         return;
//     }

//     // Handle the event
//     if (event.type === 'checkout.session.completed') {
//         const session = event.data.object;

//         // 1. Extract metadata
//         const { phone, planName, userId } = session.metadata || {};
//         const customerEmail = session.customer_details?.email;
//         const customerName = session.customer_details?.name;

//         if (!phone && !userId) {
//             console.error('No phone or userId found in metadata.');
//             res.status(200).send(); // Acknowledge to stop retries
//             return;
//         }

//         // 2. Database Logic
//         if (!admin.apps.length) admin.initializeApp();
//         const db = admin.firestore();

//         try {
//             // Determine Plan Duration
//             let monthsToAdd = 1;
//             if (planName?.includes('2')) monthsToAdd = 2;
//             else if (planName?.includes('3')) monthsToAdd = 3;

//             // Calculate dates
//             const startDate = new Date();
//             const endDate = new Date();
//             endDate.setMonth(startDate.getMonth() + monthsToAdd);

//             const memberData = {
//                 name: customerName || 'Nuevo Miembro',
//                 email: customerEmail || 'no-email@provided.com',
//                 phone: phone || '',
//                 plan: planName || 'Membresía Fit IA',
//                 status: 'active',
//                 joinDate: startDate.toISOString().split('T')[0],
//                 endDate: endDate.toISOString().split('T')[0],
//                 lastPaymentDate: startDate.toISOString(),
//                 stripeSessionId: session.id,
//                 payments: admin.firestore.FieldValue.arrayUnion({
//                     amount: session.amount_total ? session.amount_total / 100 : 0,
//                     date: new Date().toISOString(),
//                     method: 'stripe',
//                     status: 'paid'
//                 })
//             };

//             // 3. Upsert Member
//             // Strategy: Try to find by phone first, else create new
//             let memberRef;
//             if (phone) {
//                 const q = await db.collection('members').where('phone', '==', phone).limit(1).get();
//                 if (!q.empty) {
//                     memberRef = q.docs[0].ref;
//                 }
//             }

//             if (!memberRef && userId) {
//                 memberRef = db.collection('members').doc(userId); // If authenticating via Web App
//             }

//             if (memberRef) {
//                 await memberRef.update(memberData);
//                 console.log(`Updated member: ${memberRef.id}`);
//             } else {
//                 const newRef = await db.collection('members').add({
//                     ...memberData,
//                     createdAt: admin.firestore.FieldValue.serverTimestamp()
//                 });
//                 console.log(`Created new member: ${newRef.id}`);
//             }

//         } catch (error) {
//             console.error('Error updating Firestore:', error);
//             res.status(500).send();
//             return;
//         }
//     }

//     res.status(200).send();
// });

// Culqi Integration: Callable for Frontend
// export const createCulqiCheckout = functions.https.onCall(async (data, context) => {
//     // 1. Auth Check (Optional if we want public access, but better to require auth or captcha)
//     // if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');

//     const { createCulqiOrder } = require('./tools/culqiUtils');
//     // Lazy load admin
//     if (!admin.apps.length) admin.initializeApp();
//     const db = admin.firestore();

//     const { planName, price, phone } = data; // Price in Soles

//     try {
//         // User Info Construction
//         const client = {
//             first_name: 'Usuario',
//             last_name: 'Web',
//             email: context.auth?.token?.email || 'cliente@web.com',
//             phone: phone || '999999999'
//         };

//         // Try to fetch real user data if logged in
//         if (context.auth?.uid) {
//             const userDoc = await db.collection('members').doc(context.auth.uid).get();
//             if (userDoc.exists) {
//                 const d = userDoc.data();
//                 if (d) {
//                     client.phone = d.phone || client.phone;
//                     client.email = d.email || client.email;
//                     if (d.name) {
//                         const p = d.name.split(' ');
//                         client.first_name = p[0];
//                         client.last_name = p.slice(1).join(' ') || 'Web';
//                     }
//                 }
//             }
//         }

export const twilioWebhookWhatsapp = functions
    .runWith({ memory: '512MB', timeoutSeconds: 60 })
    .https.onRequest(async (req, res) => {
        const admin = require('firebase-admin');
        if (!admin.apps.length) admin.initializeApp();
        const db = admin.firestore();

        const incomingMsg = req.body.Body;
        const from = req.body.From;
        const phone = from ? from.replace('whatsapp:', '') : 'unknown';

        console.log(`Msg from ${phone}: ${incomingMsg}`);

        try {
            await db.collection('messages').add({
                phone: phone,
                content: incomingMsg || '',
                direction: 'inbound',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            const replyText = await processMessage(phone, incomingMsg || '');

            await db.collection('messages').add({
                phone: phone,
                content: replyText || "Lo siento, tuve un error.",
                direction: 'outbound',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            const twiml = `
    <Response>
        <Message>${replyText || "Error"}</Message>
    </Response>
    `;

            res.type('text/xml');
            res.send(twiml);

        } catch (error) {
            console.error('Error:', error);
            res.status(500).send('Error');
        }
    });

// Culqi Webhook: Auto-Enrollment
export const culqiWebhook = functions.https.onRequest(async (req, res) => {
    // 1. Verify Signature (Simplified for now as we lack Secret)
    // const signature = req.headers['x-culqi-signature']; 
    // In production, verify signature matches payload + CULQI_WEBHOOK_SECRET

    try {
        const event = req.body;
        console.log("Culqi Event Received:", JSON.stringify(event));

        // 2. Check Event Type
        // We look for 'order.status.changed' where state is 'paid'
        // OR 'charge.creation.succeeded' if using direct charges.
        // Since we create Orders, we expect order updates.

        let shouldProcess = false;
        let order;

        if (event.type === 'order.status.changed' && event.data && event.data.state === 'paid') {
            shouldProcess = true;
            order = event.data;
        } else if (event.type === 'charge.creation.succeeded') {
            // Sometimes charges come directly.
            // But with Orders API, order update is better.
            // Let's log if we see charges but not orders.
            console.log("Charge event received (Ignored for now, focusing on Order):", event.id);
        }

        if (shouldProcess && order) {
            const metadata = order.metadata || {};
            const { phone, planName } = metadata;

            // Client details from Order
            const clientDetails = order.client_details || {};
            const customerEmail = clientDetails.email;
            const customerName = `${clientDetails.first_name} ${clientDetails.last_name}`;

            if (!phone) {
                console.log("No phone in metadata, checking client_details...");
                // fallback
            }

            // 3. Database Logic (Replicated from Stripe)
            const admin = require('firebase-admin');
            if (!admin.apps.length) admin.initializeApp();
            const db = admin.firestore();

            let monthsToAdd = 1;
            if (planName?.includes('2')) monthsToAdd = 2;
            else if (planName?.includes('3')) monthsToAdd = 3;

            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(startDate.getMonth() + monthsToAdd);

            const memberData = {
                name: customerName || 'Nuevo Miembro (Culqi)',
                email: customerEmail || 'no-email@provided.com',
                phone: phone || clientDetails.phone_number || '',
                plan: planName || 'Membresía Fit IA',
                status: 'active',
                joinDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                lastPaymentDate: startDate.toISOString(),
                culqiOrderId: order.id,
                payments: admin.firestore.FieldValue.arrayUnion({
                    amount: order.amount ? order.amount / 100 : 0,
                    date: new Date().toISOString(),
                    method: 'culqi',
                    status: 'paid'
                })
            };

            const targetPhone = phone || clientDetails.phone_number;

            let memberRef;
            if (targetPhone) {
                const q = await db.collection('members').where('phone', '==', targetPhone).limit(1).get();
                if (!q.empty) {
                    memberRef = q.docs[0].ref;
                }
            }

            if (memberRef) {
                await memberRef.update(memberData);
                console.log(`Updated member (Culqi): ${memberRef.id}`);
            } else {
                const newRef = await db.collection('members').add({
                    ...memberData,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`Created new member (Culqi): ${newRef.id}`);
            }
        }

    } catch (error: any) {
        console.error("Culqi Webhook Error:", error);
        res.status(500).send(error.message);
        return;
    }

    res.status(200).send('OK');
});

// Decoupled Culqi Link Generator (Microservice)
// This runs in a separate instance from the Chatbot, preventing memory/timeout conflicts.
export const generateCulqiLink = functions.https.onRequest(async (req, res) => {
    // CORS headers to allow calling from anywhere (or restrict if needed)
    res.set('Access-Control-Allow-Origin', '*');

    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    try {
        const { phone, planName } = req.body;

        if (!phone || !planName) {
            res.status(400).json({ error: "Missing 'phone' or 'planName'." });
            return;
        }

        // Native HTTPS implementation to keep it lightweight
        const https = require('https');
        const CULQI_PRIVATE_KEY = process.env.CULQI_PRIVATE_KEY;

        if (!CULQI_PRIVATE_KEY) {
            throw new Error("Server Misconfiguration: Missing CULQI_PRIVATE_KEY");
        }

        const createCulqiOrder = (amount: number, description: string, client: any, metadata: any) => {
            return new Promise((resolve, reject) => {
                const expiration_date = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
                const order_number = `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

                const payload = JSON.stringify({
                    amount,
                    currency_code: 'PEN',
                    description,
                    order_number,
                    client_details: {
                        first_name: client.first_name,
                        last_name: client.last_name,
                        email: client.email,
                        phone_number: client.phone
                    },
                    expiration_date,
                    metadata
                });

                const options = {
                    hostname: 'api.culqi.com',
                    path: '/v2/orders',
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${CULQI_PRIVATE_KEY}`,
                        'Content-Type': 'application/json',
                        'Content-Length': payload.length
                    }
                };

                const reqCulqi = https.request(options, (resCulqi: any) => {
                    let data = '';
                    resCulqi.on('data', (chunk: any) => { data += chunk; });
                    resCulqi.on('end', () => {
                        if (resCulqi.statusCode >= 200 && resCulqi.statusCode < 300) {
                            try {
                                resolve(JSON.parse(data));
                            } catch (e) {
                                reject(new Error('Invalid JSON response from Culqi'));
                            }
                        } else {
                            reject(new Error(`Culqi API Error: ${resCulqi.statusCode} - ${data}`));
                        }
                    });
                });

                reqCulqi.on('error', (e: any) => {
                    reject(e);
                });

                reqCulqi.write(payload);
                reqCulqi.end();
            });
        };

        // Logic to determine price
        let amount = 8000;
        const normalizedPlan = planName.toLowerCase();
        if (normalizedPlan.includes('2') || normalizedPlan.includes('dos')) amount = 12000;
        else if (normalizedPlan.includes('3') || normalizedPlan.includes('tres')) amount = 15000;
        else if (normalizedPlan.includes('clase')) amount = 2000;

        // Fetch real client data from Firestore
        const admin = require('firebase-admin');
        if (!admin.apps.length) admin.initializeApp();
        const db = admin.firestore();

        const client = {
            first_name: 'Usuario',
            last_name: 'WhatsApp',
            email: 'cliente@whatsapp.com',
            phone: phone
        };

        try {
            const membersSnap = await db.collection('members').where('phone', '==', phone).limit(1).get();
            if (!membersSnap.empty) {
                const member = membersSnap.docs[0].data();
                if (member.name) {
                    const names = member.name.split(' ');
                    client.first_name = names[0];
                    client.last_name = names.slice(1).join(' ') || 'WhatsApp';
                }
                if (member.email) {
                    client.email = member.email;
                }
            }
        } catch (dbError) {
            console.error("Firestore lookup error (using defaults):", dbError);
        }

        const order: any = await createCulqiOrder(
            amount,
            `Plan ${planName} - Fit IA`,
            client,
            { phone, planName, source: 'whatsapp_ai' }
        );

        if (!order.id) throw new Error("Culqi did not return an order ID");

        const paymentUrl = `https://fit-ia-megagym.web.app/pagar?orderId=${order.id}`;

        res.status(200).json({ url: paymentUrl });

    } catch (error: any) {
        console.error("Generate Link Error:", error);
        res.status(500).json({ error: error.message });
    }
});
