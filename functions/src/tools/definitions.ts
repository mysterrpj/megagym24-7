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
            description: "Generate a Stripe payment link for a specific plan",
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
                // Initialize Stripe lazily
                const Stripe = require('stripe');
                const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
                    apiVersion: '2024-12-18.acacia',
                });

                // Fuzzy match or default
                let amount = 8000; // Default 80
                const normalizedPlan = args.planName?.toLowerCase() || '';

                if (normalizedPlan.includes('2') || normalizedPlan.includes('dos')) amount = 12000;
                else if (normalizedPlan.includes('3') || normalizedPlan.includes('tres')) amount = 15000;
                else if (normalizedPlan.includes('clase')) amount = 600;

                const session = await stripe.checkout.sessions.create({
                    payment_method_types: ['card'],
                    mode: 'payment',
                    line_items: [
                        {
                            price_data: {
                                currency: 'pen',
                                product_data: {
                                    name: args.planName || 'Plan Mensual Fit IA',
                                },
                                unit_amount: amount,
                            },
                            quantity: 1,
                        },
                    ],
                    success_url: 'https://fit-ia-megagym.web.app/success', // Generic success page
                    cancel_url: 'https://fit-ia-megagym.web.app/cancel',
                    metadata: {
                        phone: args.phone,
                        planName: args.planName,
                        source: 'whatsapp_ai'
                    }
                });

                return {
                    url: session.url,
                    message: "Payment link generated successfully. Share this URL with the user."
                };

            } catch (error: any) {
                console.error("Stripe Link Error:", error);
                return { error: "Could not generate payment link." };
            }

        default:
            return { error: "Tool not found" };
    }
}

