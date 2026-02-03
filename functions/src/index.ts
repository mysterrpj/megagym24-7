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
                description: "Generate a payment link (Culqi) for a specific plan. IMPORTANT: You MUST have the user's full name, DNI, and email BEFORE calling this function. If you don't have these, ASK THE USER FIRST.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "User's phone number" },
                        planName: { type: "string", description: "Name of the plan (e.g., 'Plan 1 Mes', 'Plan 2 Meses')" },
                        customerName: { type: "string", description: "User's FULL NAME (required - ask if not provided)" },
                        dni: { type: "string", description: "User's DNI document number (required - ask if not provided)" },
                        email: { type: "string", description: "User's email address (required - ask if not provided)" }
                    },
                    required: ["phone", "planName", "customerName", "dni", "email"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "register_user",
                description: "Register a new user or update their info. Use this BEFORE generating a payment link for new users.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "User phone number" },
                        name: { type: "string", description: "User's full name" },
                        dni: { type: "string", description: "User's DNI (documento nacional de identidad)" },
                        email: { type: "string", description: "User's email (optional)" }
                    },
                    required: ["phone", "name", "dni"]
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
                    // Validate required fields
                    if (!args.customerName || !args.dni || !args.email) {
                        return { error: "Faltan datos obligatorios. Necesito: nombre completo, DNI y email del cliente." };
                    }
                    const response = await fetch('https://us-central1-fit-ia-megagym.cloudfunctions.net/generateCulqiLink', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            phone: args.phone,
                            planName: args.planName,
                            customerName: args.customerName,
                            dni: args.dni,
                            email: args.email
                        })
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
                        await q.docs[0].ref.update({
                            name: args.name,
                            dni: args.dni || '',
                            email: args.email || ''
                        });
                        return { success: true, message: "Información actualizada." };
                    } else {
                        await membersRef.add({
                            phone: args.phone,
                            name: args.name,
                            dni: args.dni || '',
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
    You are Sofía, the helpful and energetic AI receptionist at MegaGym ("La casa del dolor" 💪).
    Current time: ${new Date().toISOString()}.

    **IMPORTANT:** The user is messaging from WhatsApp. Their phone number is: ${phone}
    USE THIS NUMBER for all operations. NEVER ask for their phone number.

    **GYM INFORMATION:**
    - **Address:** Mz I Lt 5 Montenegro, San Juan de Lurigancho.
    - **Hours:** Monday to Saturday: 6:00 AM - 10:00 PM.
    - **Prices:** Plan 1 Mes: S/ 80. Plan 2 Meses: S/ 120. Plan 3 Meses: S/ 150.

    **TONE:** Friendly, energetic, use emojis. Short answers in Spanish.

    **MANDATORY PAYMENT FLOW - YOU MUST FOLLOW THIS EXACTLY:**

    When the user wants to pay, register, or get a membership, you MUST collect ALL of the following information BEFORE generating any payment link:

    STEP 1: Ask "¿Cuál es tu nombre completo?" - WAIT for response
    STEP 2: Ask "¿Cuál es tu DNI?" - WAIT for response
    STEP 3: Ask "¿Cuál es tu correo electrónico?" - WAIT for response

    ONLY after you have ALL THREE pieces of information (name, DNI, email), then:

    STEP 4: Call register_user with: phone="${phone}", name, dni, email
    STEP 5: Call generate_payment_link with: phone="${phone}", planName, customerName, dni, email
    STEP 6: Send the payment link to the user

    **CRITICAL RULES:**
    - NEVER generate a payment link without first having: nombre completo, DNI, and email
    - NEVER skip asking for ANY of these 3 pieces of information
    - NEVER use placeholder data like "Usuario", "Nuevo Miembro", or "cliente@whatsapp.com"
    - Ask ONE question at a time and WAIT for the user's response
    - If the user tries to skip a question, politely insist that you need the information
    - The phone number is: ${phone} - use this, NEVER ask for it
    - ALWAYS respond in Spanish
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
        let paymentLink: string | null = null;

        for (const toolCall of responseMessage.tool_calls) {
            const functionName = toolCall.function.name;
            const functionArgs = JSON.parse(toolCall.function.arguments);
            const functionResult = await executeTool(functionName, functionArgs);

            // Capture payment link
            if (functionName === 'generate_payment_link' && functionResult.url) {
                paymentLink = functionResult.url;
                console.log("✓ Payment link captured:", paymentLink);
            }

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

        let aiResponse = secondResponse.choices[0].message.content || '';

        // FORCE payment link inclusion
        if (paymentLink) {
            if (!aiResponse.includes(paymentLink)) {
                console.log("⚠️ AI forgot to include link, adding it now");
                aiResponse += `\n\n${paymentLink}`;
            }
        }

        return aiResponse;
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
    .runWith({ memory: '512MB', timeoutSeconds: 120 })
    .https.onRequest(async (req, res) => {
        const admin = require('firebase-admin');
        if (!admin.apps.length) admin.initializeApp();
        const db = admin.firestore();
        const twilio = require('twilio');

        const incomingMsg = req.body.Body;
        const from = req.body.From; // formato: whatsapp:+51951296572
        const phone = from ? from.replace('whatsapp:', '') : 'unknown';

        console.log(`📩 Msg from ${phone}: ${incomingMsg}`);

        try {
            // Guardar mensaje entrante
            await db.collection('messages').add({
                phone: phone,
                content: incomingMsg || '',
                direction: 'inbound',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log("💾 Mensaje entrante guardado");

            // Procesar mensaje con IA
            console.log("🤖 Procesando con IA...");
            const replyText = await processMessage(phone, incomingMsg || '');
            console.log("🤖 Respuesta:", (replyText || "").substring(0, 100));

            // Guardar respuesta
            await db.collection('messages').add({
                phone: phone,
                content: replyText || "Lo siento, tuve un error.",
                direction: 'outbound',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Enviar mensaje usando la API de Twilio
            console.log("📤 Enviando via Twilio...");
            const twilioClient = twilio(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN
            );

            const message = await twilioClient.messages.create({
                from: 'whatsapp:+14155238886',
                to: from,
                body: replyText || "Lo siento, tuve un error."
            });

            console.log("✅ Enviado! SID:", message.sid);

            // Responder OK a Twilio DESPUÉS de enviar el mensaje
            res.status(200).send('OK');

        } catch (error: any) {
            console.error('❌ Error:', error.message || error);
            res.status(500).send('Error');
        }
    });

// Culqi Webhook: Auto-Enrollment
// Helper function to normalize phone numbers for consistent matching
function normalizePhone(phone: string): string {
    if (!phone) return '';
    // Remove all non-digit characters
    let digits = phone.replace(/\D/g, '');
    // Remove country code if present (51 for Peru)
    if (digits.startsWith('51') && digits.length > 9) {
        digits = digits.substring(2);
    }
    return digits;
}

// Generate phone variants for searching
function getPhoneVariants(phone: string): string[] {
    const normalized = normalizePhone(phone);
    if (!normalized) return [];
    return [
        normalized,                    // 951296472
        `51${normalized}`,             // 51951296472
        `+51${normalized}`,            // +51951296472
        `+51 ${normalized}`,           // +51 951296472
        phone                          // original format
    ];
}

// Helper function to generate and send payment voucher
async function generateAndSendVoucher(data: {
    customerName: string;
    phone: string;
    planName: string;
    amount: number;
    chargeId: string;
    startDate: string;
    endDate: string;
    paymentMethod: string;
}) {
    const twilio = require('twilio');

    // Create compact voucher
    const voucherText = `✅ *PAGO CONFIRMADO - MEGAGYM*

👤 ${data.customerName}
📋 ${data.planName}
💰 S/ ${data.amount.toFixed(2)}
📅 Válido: ${data.startDate} al ${data.endDate}

¡Gracias por tu preferencia! 💪`.trim();

    console.log("📄 Generando comprobante de pago...");

    // Send via WhatsApp with Twilio
    const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );

    await twilioClient.messages.create({
        from: 'whatsapp:+14155238886',
        to: `whatsapp:${data.phone}`,
        body: voucherText
    });

    console.log("📱 Comprobante enviado por WhatsApp a:", data.phone);
}

export const culqiWebhook = functions.https.onRequest(async (req, res) => {
    console.log("=== CULQI WEBHOOK CALLED ===");
    console.log("Method:", req.method);
    console.log("Headers:", JSON.stringify(req.headers));

    try {
        const event = req.body;
        console.log("Culqi Event Received:", JSON.stringify(event));

        let shouldProcess = false;
        let order;
        let isOrderPayment = false; // true = PagoEfectivo, false = Tarjeta

        if (event.type === 'order.status.changed' && event.data && event.data.state === 'paid') {
            shouldProcess = true;
            order = event.data;
            isOrderPayment = true; // Es PagoEfectivo - SÍ enviar voucher desde aquí
            console.log("Order status changed to PAID (PagoEfectivo) - Processing...");
        } else if (event.type === 'charge.creation.succeeded') {
            console.log("Charge event received:", event.id);
            // Parse event.data if it's a string
            const parsedData = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            shouldProcess = true;
            order = parsedData;
            isOrderPayment = false; // Es Tarjeta - NO enviar voucher (ya lo hace createCulqiCharge)
            console.log("Parsed charge data (voucher ya enviado por createCulqiCharge):", JSON.stringify(parsedData).substring(0, 200));
        } else {
            console.log("Event type not processed:", event.type, "state:", event.data?.state);
        }

        if (shouldProcess && order) {
            const metadata = order.metadata || {};
            const { phone: metadataPhone, planName } = metadata;
            const clientDetails = order.client_details || {};
            const customerEmail = clientDetails.email;
            const customerName = `${clientDetails.first_name || ''} ${clientDetails.last_name || ''}`.trim();

            console.log("=== PAYMENT DATA ===");
            console.log("Metadata phone:", metadataPhone);
            console.log("Client details phone:", clientDetails.phone_number);
            console.log("Plan name:", planName);
            console.log("Customer:", customerName, customerEmail);

            const admin = require('firebase-admin');
            if (!admin.apps.length) admin.initializeApp();
            const db = admin.firestore();

            let monthsToAdd = 1;
            if (planName?.includes('2') || planName?.toLowerCase().includes('dos')) monthsToAdd = 2;
            else if (planName?.includes('3') || planName?.toLowerCase().includes('tres')) monthsToAdd = 3;

            const startDate = new Date();
            const endDate = new Date();
            endDate.setMonth(startDate.getMonth() + monthsToAdd);

            const targetPhone = metadataPhone || clientDetails.phone_number;
            console.log("Target phone for search:", targetPhone);

            // Try to find member with multiple phone variants
            let memberRef = null;
            let foundPhone = null;

            if (targetPhone) {
                const phoneVariants = getPhoneVariants(targetPhone);
                console.log("Searching with phone variants:", phoneVariants);

                for (const variant of phoneVariants) {
                    const q = await db.collection('members').where('phone', '==', variant).limit(1).get();
                    if (!q.empty) {
                        memberRef = q.docs[0].ref;
                        foundPhone = variant;
                        console.log("Found member with phone variant:", variant, "Doc ID:", q.docs[0].id);
                        break;
                    }
                }

                if (!memberRef) {
                    console.log("No member found with any phone variant, will create new");
                }
            }

            // Datos de membresía (siempre se actualizan)
            const membershipData: any = {
                plan: planName || 'Plan 1 Mes',
                status: 'active',
                joinDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                lastPaymentDate: startDate.toISOString(),
                culqiOrderId: order.id,
                paymentApprovedAt: new Date().toISOString()
            };

            if (memberRef) {
                // Update existing member - preserve name/email if already set
                const existingDoc = await memberRef.get();
                const existingData = existingDoc.data() || {};

                const updateData: any = { ...membershipData };

                // Solo actualizar name si el existente está vacío o es genérico
                const genericNames = ['nuevo miembro', 'nuevo miembro (culqi)', 'usuario', 'cliente'];
                const existingNameIsGeneric = !existingData.name ||
                    genericNames.includes(existingData.name.toLowerCase().trim());

                if (existingNameIsGeneric && customerName) {
                    updateData.name = customerName;
                    console.log(`Updating name from "${existingData.name}" to "${customerName}"`);
                } else {
                    console.log(`Preserving existing name: "${existingData.name}"`);
                }

                // Solo actualizar email si el existente está vacío
                if (!existingData.email && customerEmail) {
                    updateData.email = customerEmail;
                    console.log(`Updating email to "${customerEmail}"`);
                } else {
                    console.log(`Preserving existing email: "${existingData.email}"`);
                }

                await memberRef.update({
                    ...updateData,
                    payments: admin.firestore.FieldValue.arrayUnion({
                        amount: order.amount ? order.amount / 100 : 0,
                        date: new Date().toISOString(),
                        method: 'culqi',
                        orderId: order.id,
                        status: 'paid'
                    })
                });
                console.log(`SUCCESS: Updated member to ACTIVE: ${memberRef.id}`);
            } else {
                // Create new member - usar datos del webhook ya que no existe registro previo
                const newRef = await db.collection('members').add({
                    name: customerName || 'Nuevo Miembro (Culqi)',
                    dni: '',
                    email: customerEmail || '',
                    phone: foundPhone || targetPhone || '',
                    ...membershipData,
                    payments: [{
                        amount: order.amount ? order.amount / 100 : 0,
                        date: new Date().toISOString(),
                        method: 'culqi',
                        orderId: order.id,
                        status: 'paid'
                    }],
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`SUCCESS: Created new ACTIVE member: ${newRef.id}`);
            }

            // Obtener el nombre final del miembro para el comprobante
            let finalCustomerName = customerName || 'Cliente';
            if (memberRef) {
                const updatedDoc = await memberRef.get();
                const updatedData = updatedDoc.data();
                if (updatedData?.name) {
                    finalCustomerName = updatedData.name;
                }
            }

            // Generar y enviar comprobante de pago por WhatsApp
            // SOLO para PagoEfectivo (isOrderPayment=true)
            // Para tarjeta, el voucher ya se envía desde createCulqiCharge
            if (isOrderPayment && targetPhone && finalCustomerName) {
                try {
                    console.log("📄 Generando comprobante de pago (PagoEfectivo)...");
                    await generateAndSendVoucher({
                        customerName: finalCustomerName,
                        phone: targetPhone,
                        planName: planName || 'Plan 1 Mes',
                        amount: order.amount ? order.amount / 100 : 0,
                        chargeId: order.id,
                        startDate: startDate.toISOString().split('T')[0],
                        endDate: endDate.toISOString().split('T')[0],
                        paymentMethod: 'Culqi'
                    });
                    console.log("✅ Comprobante enviado por WhatsApp");
                } catch (voucherError: any) {
                    console.error("❌ Error enviando comprobante:", voucherError);
                    // No lanzar error para no bloquear el flujo principal
                }
            } else if (!isOrderPayment) {
                console.log("ℹ️ Voucher no enviado desde webhook (tarjeta) - ya fue enviado por createCulqiCharge");
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
        const { phone, planName, customerName, dni, email } = req.body;

        if (!phone || !planName) {
            res.status(400).json({ error: "Missing 'phone' or 'planName'." });
            return;
        }

        if (!customerName || !dni || !email) {
            res.status(400).json({ error: "Missing required customer data: 'customerName', 'dni', or 'email'." });
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
                        'Content-Length': Buffer.byteLength(payload, 'utf8')
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

        // Use client data passed directly from the bot
        const nameParts = customerName.trim().split(' ');
        const client = {
            first_name: nameParts[0] || customerName,
            last_name: nameParts.slice(1).join(' ') || customerName,
            email: email,
            phone: phone
        };

        // Also save/update the member in Firestore with the collected data
        const admin = require('firebase-admin');
        if (!admin.apps.length) admin.initializeApp();
        const db = admin.firestore();

        try {
            const membersSnap = await db.collection('members').where('phone', '==', phone).limit(1).get();
            if (!membersSnap.empty) {
                // Update existing member
                await membersSnap.docs[0].ref.update({
                    name: customerName,
                    dni: dni,
                    email: email
                });
                console.log("Updated existing member with new data");
            } else {
                // Create new member
                await db.collection('members').add({
                    phone: phone,
                    name: customerName,
                    dni: dni,
                    email: email,
                    status: 'prospect',
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log("Created new member with provided data");
            }
        } catch (dbError) {
            console.error("Firestore save error:", dbError);
            // Continue anyway - payment link generation should not fail due to DB error
        }

        const order: any = await createCulqiOrder(
            amount,
            `Plan ${planName} - Fit IA`,
            client,
            { phone, planName, customerName, dni, email, source: 'whatsapp_ai' }
        );

        if (!order.id) throw new Error("Culqi did not return an order ID");

        // Include phone, plan and amount in URL for the payment page
        const paymentUrl = `https://fit-ia-megagym.web.app/pagar?orderId=${order.id}&phone=${encodeURIComponent(phone)}&plan=${encodeURIComponent(planName)}&amount=${amount}`;

        res.status(200).json({ url: paymentUrl });

    } catch (error: any) {
        console.error("Generate Link Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Manual endpoint to activate a member after payment verification
// Usage: POST /activateMember { phone: "951296472", plan: "Plan 1 Mes" }
export const activateMember = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    try {
        const { phone, plan } = req.body;

        if (!phone) {
            res.status(400).json({ error: "Missing 'phone' parameter" });
            return;
        }

        const admin = require('firebase-admin');
        if (!admin.apps.length) admin.initializeApp();
        const db = admin.firestore();

        // Use the same phone normalization as webhook
        const phoneVariants = getPhoneVariants(phone);
        console.log("Activating member with phone variants:", phoneVariants);

        let memberRef = null;
        let memberData = null;

        for (const variant of phoneVariants) {
            const q = await db.collection('members').where('phone', '==', variant).limit(1).get();
            if (!q.empty) {
                memberRef = q.docs[0].ref;
                memberData = q.docs[0].data();
                console.log("Found member:", q.docs[0].id, "with phone:", variant);
                break;
            }
        }

        if (!memberRef) {
            res.status(404).json({ error: "Member not found with phone: " + phone });
            return;
        }

        const startDate = new Date();
        const endDate = new Date();
        let monthsToAdd = 1;
        if (plan?.includes('2') || plan?.toLowerCase().includes('dos')) monthsToAdd = 2;
        else if (plan?.includes('3') || plan?.toLowerCase().includes('tres')) monthsToAdd = 3;
        endDate.setMonth(startDate.getMonth() + monthsToAdd);

        await memberRef.update({
            status: 'active',
            plan: plan || 'Plan 1 Mes',
            joinDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            lastPaymentDate: startDate.toISOString(),
            manuallyActivatedAt: new Date().toISOString()
        });

        res.status(200).json({
            success: true,
            message: `Member ${memberData?.name || phone} activated successfully`,
            plan: plan || 'Plan 1 Mes',
            endDate: endDate.toISOString().split('T')[0]
        });

    } catch (error: any) {
        console.error("Activate Member Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// Create Culqi Charge from Token
// This is called when the frontend receives a token instead of processing an order directly
export const createCulqiCharge = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    try {
        const { token, email, amount, orderId, phone, planName } = req.body;

        console.log("=== CREATE CULQI CHARGE ===");
        console.log("Token:", token);
        console.log("Email:", email);
        console.log("Amount:", amount);
        console.log("OrderId:", orderId);
        console.log("Phone:", phone);
        console.log("Plan:", planName);

        if (!token || !email || !amount) {
            res.status(400).json({ error: "Missing required fields: token, email, amount" });
            return;
        }

        const https = require('https');
        const CULQI_PRIVATE_KEY = process.env.CULQI_PRIVATE_KEY;

        if (!CULQI_PRIVATE_KEY) {
            throw new Error("Server Misconfiguration: Missing CULQI_PRIVATE_KEY");
        }

        // Create charge with Culqi API
        const chargePayload = JSON.stringify({
            amount: amount,
            currency_code: 'PEN',
            email: email,
            source_id: token,
            description: `Membresía ${planName || 'Plan 1 Mes'} - MegaGym`,
            metadata: {
                phone: phone || '',
                planName: planName || 'Plan 1 Mes',
                orderId: orderId || '',
                source: 'web_payment'
            }
        });

        const chargeResult: any = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.culqi.com',
                path: '/v2/charges',
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CULQI_PRIVATE_KEY}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(chargePayload, 'utf8')
                }
            };

            const reqCulqi = https.request(options, (resCulqi: any) => {
                let data = '';
                resCulqi.on('data', (chunk: any) => { data += chunk; });
                resCulqi.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (resCulqi.statusCode >= 200 && resCulqi.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            reject(new Error(parsed.merchant_message || parsed.user_message || `Culqi Error: ${resCulqi.statusCode}`));
                        }
                    } catch (e) {
                        reject(new Error('Invalid response from Culqi'));
                    }
                });
            });

            reqCulqi.on('error', (e: any) => reject(e));
            reqCulqi.write(chargePayload);
            reqCulqi.end();
        });

        console.log("Charge created successfully:", chargeResult.id);

        // If charge is successful, update member immediately (don't wait for webhook)
        if (chargeResult.id && chargeResult.outcome?.type === 'venta_exitosa') {
            const admin = require('firebase-admin');
            if (!admin.apps.length) admin.initializeApp();
            const db = admin.firestore();

            const targetPhone = phone;
            if (targetPhone) {
                const phoneVariants = getPhoneVariants(targetPhone);
                let memberRef = null;

                for (const variant of phoneVariants) {
                    const q = await db.collection('members').where('phone', '==', variant).limit(1).get();
                    if (!q.empty) {
                        memberRef = q.docs[0].ref;
                        break;
                    }
                }

                let monthsToAdd = 1;
                if (planName?.includes('2') || planName?.toLowerCase().includes('dos')) monthsToAdd = 2;
                else if (planName?.includes('3') || planName?.toLowerCase().includes('tres')) monthsToAdd = 3;

                const startDate = new Date();
                const endDate = new Date();
                endDate.setMonth(startDate.getMonth() + monthsToAdd);

                const updateData = {
                    status: 'active',
                    plan: planName || 'Plan 1 Mes',
                    joinDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0],
                    lastPaymentDate: startDate.toISOString(),
                    culqiChargeId: chargeResult.id
                };

                if (memberRef) {
                    await memberRef.update({
                        ...updateData,
                        payments: admin.firestore.FieldValue.arrayUnion({
                            amount: amount / 100,
                            date: new Date().toISOString(),
                            method: 'culqi',
                            chargeId: chargeResult.id,
                            status: 'paid'
                        })
                    });
                    console.log("Member updated to active");

                    // Get member name for voucher
                    const memberData = (await memberRef.get()).data();
                    const customerName = memberData?.name || 'Cliente';

                    // Generate and send voucher
                    try {
                        await generateAndSendVoucher({
                            customerName: customerName,
                            phone: targetPhone,
                            planName: planName || 'Plan 1 Mes',
                            amount: amount / 100,
                            chargeId: chargeResult.id,
                            startDate: startDate.toISOString().split('T')[0],
                            endDate: endDate.toISOString().split('T')[0],
                            paymentMethod: 'Culqi'
                        });
                        console.log("✅ Comprobante enviado");
                    } catch (voucherError: any) {
                        console.error("❌ Error enviando comprobante:", voucherError);
                    }
                } else {
                    await db.collection('members').add({
                        ...updateData,
                        phone: targetPhone,
                        email: email,
                        name: 'Nuevo Miembro',
                        payments: [{
                            amount: amount / 100,
                            date: new Date().toISOString(),
                            method: 'culqi',
                            chargeId: chargeResult.id,
                            status: 'paid'
                        }],
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log("New member created as active");

                    // Generate and send voucher for new member
                    try {
                        await generateAndSendVoucher({
                            customerName: 'Nuevo Miembro',
                            phone: targetPhone,
                            planName: planName || 'Plan 1 Mes',
                            amount: amount / 100,
                            chargeId: chargeResult.id,
                            startDate: startDate.toISOString().split('T')[0],
                            endDate: endDate.toISOString().split('T')[0],
                            paymentMethod: 'Culqi'
                        });
                        console.log("✅ Comprobante enviado");
                    } catch (voucherError: any) {
                        console.error("❌ Error enviando comprobante:", voucherError);
                    }
                }
            }
        }

        res.status(200).json({
            success: true,
            chargeId: chargeResult.id,
            message: "Pago procesado exitosamente"
        });

    } catch (error: any) {
        console.error("Create Charge Error:", error);
        res.status(500).json({ error: error.message });
    }
});
