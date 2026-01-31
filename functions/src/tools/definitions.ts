import * as admin from 'firebase-admin';



export const tools = [
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
    }
];

// Implementation of tool execution
export async function executeTool(name: string, args: any) {
    const db = admin.firestore(); // Initialize lazily
    switch (name) {
        case 'get_membership_plans':
            const snapshot = await db.collection('memberships').get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        case 'get_available_classes':
            // Logic to fetch classes
            const classesSnap = await db.collection('classes').get();
            return classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        case 'check_member_status':
            const membersSnap = await db.collection('members').where('phone', '==', args.phone).get();
            if (membersSnap.empty) return { status: 'not_found' };
            const member = membersSnap.docs[0].data();
            return member;

        case 'book_class':
            // Implementation of booking
            // 1. Find member by phone
            try {
                const memSnap = await db.collection('members').where('phone', '==', args.phone).get();
                if (memSnap.empty) return { error: "Member not found" };
                const memberId = memSnap.docs[0].id;

                await db.collection('bookings').add({
                    memberId: memberId,
                    classId: args.classId,
                    date: args.date,
                    status: 'confirmed',
                    created_at: admin.firestore.FieldValue.serverTimestamp()
                });
                return { success: true, message: "Class booked successfully" };
            } catch (e: any) {
                return { error: e.message };
            }

        case 'generate_payment_link':
            try {
                // --- STRIPE IMPLEMENTATION (DORMANT) ---
                /*
                const Stripe = require('stripe');
                const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
                    apiVersion: '2024-12-18.acacia',
                });
                // ... (Original Stripe logic can be restored here)
                */

                // --- CULQI IMPLEMENTATION (ACTIVE) ---
                const { createCulqiOrder } = require('./culqiUtils');

                let amount = 8000; // Default 8000 (S/ 80.00)
                const normalizedPlan = args.planName?.toLowerCase() || '';

                if (normalizedPlan.includes('2') || normalizedPlan.includes('dos')) amount = 12000; // S/ 120.00
                else if (normalizedPlan.includes('3') || normalizedPlan.includes('tres')) amount = 15000; // S/ 150.00
                else if (normalizedPlan.includes('clase')) amount = 2000; // S/ 20.00 (Example)

                // Client details (required for Culqi Anti-Fraud/Compliance)
                const client = {
                    first_name: 'Usuario',
                    last_name: 'WhatsApp',
                    email: 'cliente@whatsapp.com', // Placeholder required by Culqi
                    phone: args.phone
                };

                // Try to populate real name/email from DB if member exists
                try {
                    const memSnap = await db.collection('members').where('phone', '==', args.phone).limit(1).get();
                    if (!memSnap.empty) {
                        const data = memSnap.docs[0].data();
                        if (data.name) {
                            const p = data.name.split(' ');
                            client.first_name = p[0];
                            client.last_name = p.slice(1).join(' ') || 'gym';
                        }
                        if (data.email) client.email = data.email;
                    }
                } catch (e) { }

                const order = await createCulqiOrder(
                    amount,
                    `Plan ${args.planName || 'Mensual'} - Fit IA`,
                    client,
                    { phone: args.phone, planName: args.planName, source: 'whatsapp_ai' }
                );

                // IMPORTANT: Since Culqi doesn't return a "Payment Page Link" directly via this API,
                // we redirect the user to our own frontend page which will load the Culqi Checkout form for this Order ID.
                // Format: https://[YOUR_DOMAIN]/pagar?orderId=[CULQI_ORDER_ID]

                // Assuming "id" is the field Culqi returns (e.g., "ord_live_...")
                const orderId = order.id;
                if (!orderId) {
                    throw new Error("Culqi did not return an order ID");
                }

                // Use the Firebase Hosting URL
                const paymentUrl = `https://fit-ia-megagym.web.app/pagar?orderId=${orderId}`;

                return {
                    url: paymentUrl,
                    message: "Link de pago (Culqi) generado. Comparte este link con el cliente."
                };

            } catch (error: any) {
                console.error("Payment Link Error (Culqi):", error);
                return { error: "No se pudo generar el link de pago." };
            }

        default:
            return { error: "Tool not found" };
    }
}
