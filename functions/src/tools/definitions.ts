


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
            description: "Generate a payment link (Culqi) for a membership, a pending debt, or a paid group class. Do not use this for gym machine day passes.",
            parameters: {
                type: "object",
                properties: {
                    phone: { type: "string", description: "User's phone number to link the payment" },
                    planName: { type: "string", description: "Name of the plan or class payment label" },
                    paymentType: { type: "string", description: "Use 'membership', 'debt_payment', or 'class_booking'." },
                    amount: { type: "number", description: "Amount in soles. Required only for paymentType='debt_payment'." },
                    classId: { type: "string", description: "Required when paymentType is 'class_booking'." },
                    bookingDate: { type: "string", description: "Required when paymentType is 'class_booking'. Format YYYY-MM-DD." }
                },
                required: ["phone", "planName"]
            }
        }
    }
];

async function reserveClass(db: any, admin: any, args: any) {
    const memSnap = await db.collection('members').where('phone', '==', args.phone).get();
    if (memSnap.empty) return { error: "Member not found" };

    const memberId = memSnap.docs[0].id;
    const classRef = db.collection('classes').doc(String(args.classId));

    return db.runTransaction(async (transaction: any) => {
        const classDoc = await transaction.get(classRef);
        if (!classDoc.exists) return { error: "Class not found" };

        const classData = classDoc.data() || {};
        if (classData.status === 'inactive') return { error: "Class is inactive" };

        const bookingQuery = db.collection('bookings').where('classId', '==', String(args.classId));
        const bookingSnap = await transaction.get(bookingQuery);
        const activeBookings = bookingSnap.docs.filter((doc: any) => (doc.data().status || 'confirmed') !== 'cancelled');

        if (activeBookings.some((doc: any) => doc.data().memberId === memberId)) {
            return { error: "Member already booked in this class" };
        }

        const capacity = Math.max(1, Number(classData.capacity) || 0);
        if (activeBookings.length >= capacity) {
            return { error: "Class is full" };
        }

        const bookingRef = db.collection('bookings').doc();
        transaction.set(bookingRef, {
            memberId,
            classId: String(args.classId),
            date: args.date || null,
            status: 'confirmed',
            created_at: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            success: true,
            message: "Class booked successfully",
            className: classData.name || null,
            classTime: classData.time || classData.hour || null,
            instructor: classData.instructor || null,
            spotsLeft: Math.max(capacity - activeBookings.length - 1, 0)
        };
    });
}

// Implementation of tool execution
export async function executeTool(name: string, args: any) {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp();
    const db = admin.firestore(); // Initialize lazily
    switch (name) {
        case 'get_membership_plans':
            const snapshot = await db.collection('memberships').get();
            return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

        case 'get_available_classes':
            // Logic to fetch classes
            const classesSnap = await db.collection('classes').get();
            return classesSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

        case 'check_member_status':
            const membersSnap = await db.collection('members').where('phone', '==', args.phone).get();
            if (membersSnap.empty) return { status: 'not_found' };
            const member = membersSnap.docs[0].data();
            return member;

        case 'book_class':
            try {
                return await reserveClass(db, admin, args);
            } catch (e: any) {
                return { error: e.message };
            }

        case 'generate_payment_link':
            try {
                const { generatePaymentLink } = require('./paymentHandler');
                const paymentUrl = await generatePaymentLink(args.phone, args.planName, {
                    paymentType: args.paymentType,
                    amount: args.amount,
                    classId: args.classId,
                    bookingDate: args.bookingDate
                });
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
