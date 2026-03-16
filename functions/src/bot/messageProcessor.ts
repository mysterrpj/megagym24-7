

// Busca un miembro probando múltiples formatos de teléfono
async function findMember(db: any, phone: string) {
    const formats = new Set([
        phone,
        phone.startsWith('+') ? phone.slice(1) : '+' + phone,
        phone.replace(/^\+?51/, ''),
        '+51' + phone.replace(/^\+?51/, '')
    ]);
    for (const fmt of formats) {
        const snap = await db.collection('members').where('phone', '==', fmt).limit(1).get();
        if (!snap.empty) return snap;
    }
    return null;
}

export async function executeTool(name: string, args: any) {
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
            const membersSnap = await findMember(dbInner, args.phone);
            if (!membersSnap) return { status: 'not_found' };
            const member = membersSnap.docs[0].data();
            return member;

        case 'book_class':
            try {
                const memSnap = await findMember(dbInner, args.phone);
                if (!memSnap) return { error: "Member not found" };
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
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "Error connecting to payment service");
                return { url: data.url, message: "Link de pago generado." };
            } catch (error: any) {
                return { error: error.message };
            }

        case 'register_user':
            try {
                const membersRef = dbInner.collection('members');
                const q = await findMember(dbInner, args.phone);

                if (q && !q.empty) {
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

        case 'send_payment_voucher':
            try {
                const snap = await findMember(dbInner, args.phone);
                if (!snap) return { error: "No se encontró al miembro con ese número." };
                const member = snap.docs[0].data();

                const lastPayment = member.payments?.[member.payments.length - 1];
                if (!lastPayment && !member.culqiOrderId) return { error: "No se encontró un pago registrado para este miembro." };

                const voucher = [
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    `🏋️ *MEGAGYM* 🏋️`,
                    `   COMPROBANTE DE PAGO`,
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    `👤 Cliente: ${(member.name || 'Cliente').toUpperCase()}`,
                    `📋 Plan: ${member.plan || 'N/A'}`,
                    `💳 Método: Culqi`,
                    `💰 Monto: S/ ${(lastPayment?.amount ?? 0).toFixed(2)}`,
                    `📅 Vigencia hasta: ${member.endDate || 'N/A'}`,
                    `🔖 Orden: ${(member.culqiOrderId || lastPayment?.orderId || 'N/A').toString().slice(-10).toUpperCase()}`,
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    `¡Gracias por entrenar con nosotros! 💪`
                ].join('\n');

                return { success: true, voucher };
            } catch (e: any) {
                return { error: e.message };
            }

        default:
            return { error: "Tool not found" };
    }
}

export async function processMessage(db: any, phone: string, messageText: string) {
    const OpenAI = require('openai');
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || 'placeholder-key'
    });

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
                name: "generate_payment_link",
                description: "Generate a payment link (Culqi) for a specific plan. IMPORTANT: You MUST have the user's full name, DNI, and email BEFORE calling this function.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "User's phone number" },
                        planName: { type: "string", description: "Name of the plan" },
                        customerName: { type: "string", description: "User's FULL NAME" },
                        dni: { type: "string", description: "User's DNI" },
                        email: { type: "string", description: "User's email" }
                    },
                    required: ["phone", "planName", "customerName", "dni", "email"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "register_user",
                description: "Register a new user or update their info.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "User phone number" },
                        name: { type: "string", description: "User's full name" },
                        dni: { type: "string" },
                        email: { type: "string" }
                    },
                    required: ["phone", "name", "dni"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "send_payment_voucher",
                description: "Generar y enviar el voucher en formato de IMAGEN (Ticket). Usa esto cuando el cliente lo pida.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string" }
                    },
                    required: ["phone"]
                }
            }
        }
    ];

    const memberDoc = await findMember(db, phone);
    let customerContext = "Prospecto o cliente no registrado.";

    if (memberDoc && !memberDoc.empty) {
        const data = memberDoc.docs[0].data();
        customerContext = `CLIENTE REGISTRADO: ${data.name}. Plan: ${data.plan || 'sin plan'}. Estado: ${data.status || 'prospecto'}. Vence: ${data.endDate || 'N/A'}.`;
    }

    const historySnapshot = await db.collection('messages')
        .where('phone', '==', phone)
        .orderBy('timestamp', 'asc')
        .limitToLast(12)
        .get();

    const messages = historySnapshot.docs.map((doc: any) => ({
        role: doc.data().direction === 'inbound' ? 'user' : 'assistant',
        content: doc.data().content
    }));

    messages.push({ role: 'user', content: messageText });

    const systemPrompt = `Eres Sofía de MegaGym. Teléfono: ${phone}. Contexto: ${customerContext}
    REGLA: Si un tool devuelve éxito, CONFÍRMALO y no digas que hay fallos.`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        tools: tools as any
    });

    const responseMessage = response.choices[0].message;

    if (responseMessage.tool_calls) {
        const toolMessages: any[] = [...messages, responseMessage];
        for (const toolCall of responseMessage.tool_calls) {
            const functionResult = await executeTool(toolCall.function.name, JSON.parse(toolCall.function.arguments));
            console.log(`🛠️ Tool [${toolCall.function.name}] result:`, JSON.stringify(functionResult));
            toolMessages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify(functionResult)
            });
        }

        const secondResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt + "\nIMPORTANT: TRUST tool success results." },
                ...toolMessages
            ]
        });

        return secondResponse.choices[0].message.content;
    }

    return responseMessage.content;
}
