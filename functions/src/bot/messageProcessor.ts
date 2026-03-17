

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
                // Buscar datos del miembro si no vienen como argumento
                let customerName = args.customerName;
                let dni = args.dni;
                let email = args.email;

                if (!customerName || !dni || !email) {
                    const memSnap = await findMember(dbInner, args.phone);
                    if (memSnap && !memSnap.empty) {
                        const memData = memSnap.docs[0].data();
                        customerName = customerName || memData.name || 'Usuario';
                        dni = dni || memData.dni || '';
                        email = email || memData.email || 'cliente@megagym.pe';
                    }
                }

                const response = await fetch('https://us-central1-fit-ia-megagym.cloudfunctions.net/generateCulqiLink', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: args.phone,
                        planName: args.planName,
                        customerName,
                        dni,
                        email
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

                // Usar el monto del último pago, no el acumulado
                const lastPayment = member.payments?.[member.payments.length - 1];
                const amountPaid = Number(lastPayment?.amount) || Number(member.planPrice) || Number(member.amountPaid) || 0;
                const planPrice = Number(member.planPrice) || 0;
                const debt = Math.max(0, planPrice - amountPaid);
                const lastMethod = lastPayment?.method || (member.culqiOrderId ? 'Culqi' : 'Efectivo');

                // Resolver fecha de inicio
                let startDateStr = member.startDate || '';
                if (!startDateStr && member.createdAt) {
                    const d = member.createdAt.toDate ? member.createdAt.toDate() : new Date(member.createdAt);
                    startDateStr = d.toISOString().split('T')[0];
                }

                // Resolver fecha de fin
                let endDateStr = member.endDate || '';
                if (!endDateStr && member.expirationDate) {
                    const d = member.expirationDate.toDate ? member.expirationDate.toDate() : new Date(member.expirationDate);
                    endDateStr = d.toISOString().split('T')[0];
                }

                const lines = [
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    `🏋️ *MEGAGYM* 🏋️`,
                    `   COMPROBANTE DE MEMBRESÍA`,
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    `👤 Cliente: ${(member.name || 'Cliente').toUpperCase()}`,
                    `📋 Plan: ${member.plan || 'N/A'}`,
                    `📅 Inicio: ${startDateStr || 'N/A'}`,
                    `📅 Vigencia hasta: ${endDateStr || 'N/A'}`,
                    `✅ Estado: ACTIVO`,
                ];

                if (amountPaid > 0) {
                    lines.push(`💰 Pagado: S/ ${amountPaid.toFixed(2)}`);
                    lines.push(`💳 Método: ${lastMethod}`);
                }
                if (debt > 0) {
                    lines.push(`⚠️ Saldo pendiente: S/ ${debt.toFixed(2)}`);
                }
                if (member.culqiOrderId || lastPayment?.orderId) {
                    const orderId = (member.culqiOrderId || lastPayment?.orderId).toString().slice(-10).toUpperCase();
                    lines.push(`🔖 Orden: ${orderId}`);
                }

                lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
                lines.push(`¡Gracias por entrenar con nosotros! 💪`);

                return { success: true, voucher: lines.join('\n') };
            } catch (e: any) {
                return { error: e.message };
            }

        case 'update_member_profile':
            try {
                const snap = await findMember(dbInner, args.phone);
                if (!snap) return { error: 'Miembro no encontrado.' };
                const ref = snap.docs[0].ref;
                const current = snap.docs[0].data().trainingProfile || {};
                await ref.update({
                    trainingProfile: { ...current, ...args.fields },
                    profileStep: (snap.docs[0].data().profileStep || 0) + 1
                });
                return { success: true };
            } catch (e: any) {
                return { error: e.message };
            }

        case 'get_payment_history':
            try {
                const snap = await findMember(dbInner, args.phone);
                if (!snap) return { found: false, message: 'No se encontró al miembro.' };
                const member = snap.docs[0].data();
                const payments = member.payments || [];
                if (payments.length === 0) return { found: false, message: 'No hay pagos registrados.' };
                const total = payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
                const list = payments.map((p: any, i: number) => {
                    const date = p.date || p.createdAt || 'N/A';
                    const amount = Number(p.amount) || 0;
                    const method = p.method || 'N/A';
                    return `${i + 1}. ${date} — S/ ${amount.toFixed(2)} (${method})`;
                });
                return { found: true, payments: list, total: total.toFixed(2), count: payments.length };
            } catch (e: any) {
                return { error: e.message };
            }

        case 'get_student_routine':
            try {
                const routineSnap = await dbInner.collection('studentRoutineAssignments')
                    .where('studentPhone', '==', args.phone)
                    .where('status', '==', 'active')
                    .limit(1)
                    .get();

                if (routineSnap.empty) {
                    // Probar formatos alternativos de teléfono
                    const formats = new Set([
                        args.phone,
                        args.phone.startsWith('+') ? args.phone.slice(1) : '+' + args.phone,
                        args.phone.replace(/^\+?51/, ''),
                        '+51' + args.phone.replace(/^\+?51/, '')
                    ]);
                    let found: any = null;
                    for (const fmt of formats) {
                        const s = await dbInner.collection('studentRoutineAssignments')
                            .where('studentPhone', '==', fmt)
                            .where('status', '==', 'active')
                            .limit(1)
                            .get();
                        if (!s.empty) { found = s; break; }
                    }
                    if (!found) return { found: false, message: 'No tienes una rutina asignada aún.' };
                    const r = found.docs[0].data();
                    return { found: true, title: r.routineTitle, url: r.routineUrl };
                }

                const r = routineSnap.docs[0].data();
                return { found: true, title: r.routineTitle, url: r.routineUrl };
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
                description: "Generate a payment link (Culqi) for a specific plan. Call this immediately when the user wants to pay or renew. If the customer is registered, their data is already available — do NOT ask the user for it.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "User's phone number" },
                        planName: { type: "string", description: "Name of the plan (e.g. '1 mes', '2 meses', '3 meses')" },
                        customerName: { type: "string", description: "User's full name (optional if already registered)" },
                        dni: { type: "string", description: "User's DNI (optional if already registered)" },
                        email: { type: "string", description: "User's email (optional if already registered)" }
                    },
                    required: ["phone", "planName"]
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
                name: "get_student_routine",
                description: "Obtener la rutina de entrenamiento asignada al cliente. Úsalo cuando el cliente pida su rutina, ejercicios, o plan de entrenamiento.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "Teléfono del cliente" }
                    },
                    required: ["phone"]
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
        },
        {
            type: "function",
            function: {
                name: "update_member_profile",
                description: "Guardar en el perfil del cliente la información que él mismo te proporcionó (objetivo, nivel, días disponibles, limitaciones). Úsalo cuando el cliente responda preguntas sobre su entrenamiento.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string" },
                        fields: {
                            type: "object",
                            description: "Campos a guardar. Puede incluir: objetivo, nivel, diasSemana, limitaciones",
                            properties: {
                                objetivo: { type: "string" },
                                nivel: { type: "string" },
                                diasSemana: { type: "number" },
                                limitaciones: { type: "string" }
                            }
                        }
                    },
                    required: ["phone", "fields"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "get_payment_history",
                description: "Obtener el historial de pagos del cliente: fechas, montos y métodos. Úsalo cuando el cliente pregunte cuánto ha pagado, cuándo fue su último pago, o pida su historial de pagos.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "Teléfono del cliente" }
                    },
                    required: ["phone"]
                }
            }
        }
    ];

    const memberDoc = await findMember(db, phone);
    let customerContext = "Prospecto o cliente no registrado.";
    let clientFirstName = '';

    let memberStatus = 'unknown';
    let daysUntilExpiry = null;
    let profileQuestion: string | null = null;

    if (memberDoc && !memberDoc.empty) {
        const data = memberDoc.docs[0].data();
        clientFirstName = (data.name || '').split(' ')[0];
        memberStatus = data.status || 'prospect';

        // Calcular días hasta vencimiento
        if (data.endDate) {
            const end = new Date(data.endDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            daysUntilExpiry = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        // Perfil de entrenamiento
        const profile = data.trainingProfile || {};
        const profileStep = data.profileStep || 0;
        const profileStr = profile.objetivo
            ? `Objetivo: ${profile.objetivo}. Nivel: ${profile.nivel || 'N/A'}. Días/semana: ${profile.diasSemana || 'N/A'}. Limitaciones: ${profile.limitaciones || 'ninguna'}. Notas trainer: ${profile.notasTrainer || 'N/A'}.`
            : 'Sin perfil de entrenamiento aún.';

        // Determinar qué pregunta de perfil hacer (solo miembros activos)
        if (memberStatus === 'active' && profileStep < 3) {
            if (!profile.objetivo) profileQuestion = `Por cierto ${clientFirstName}, ¿cuál es tu objetivo principal en el gym? (bajar de peso, ganar músculo, tonificar...) 💪`;
            else if (!profile.nivel) profileQuestion = `¿Te consideras principiante, intermedio o avanzado en el entrenamiento?`;
            else if (!profile.diasSemana) profileQuestion = `¿Cuántos días a la semana puedes venir a entrenar?`;
        }

        customerContext = `CLIENTE REGISTRADO: Nombre: ${data.name || 'N/A'}. DNI: ${data.dni || 'N/A'}. Email: ${data.email || 'N/A'}. Plan: ${data.plan || 'sin plan'}. Estado: ${memberStatus}. Vence: ${data.endDate || 'N/A'}. Días hasta vencimiento: ${daysUntilExpiry !== null ? daysUntilExpiry : 'N/A'}. Perfil: ${profileStr}`;
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

    const greetingName = clientFirstName ? ` ${clientFirstName}` : '';
    const profileQuestionInstruction = profileQuestion
        ? `\n    PREGUNTA DE PERFIL PENDIENTE: Al final de tu respuesta (después de responder lo que el cliente pidió), añade esta pregunta de forma natural: "${profileQuestion}". Si el cliente responde, guarda con update_member_profile.`
        : '';

    const systemPrompt = `Eres Sofía, asistente personal y trainer virtual de MegaGym. Eres cercana, motivadora y hablas como amiga — no como robot. Usas el nombre del cliente siempre que puedas.
    Teléfono del cliente: ${phone}. Contexto: ${customerContext}

    PERSONALIDAD: Eres el trainer personal del cliente. Si tienes su perfil (objetivo, nivel), úsalo para dar consejos específicos. Si pregunta sobre ejercicios, nutrición o entrenamiento, responde como un trainer real con conocimiento — no solo como recepcionista.

    REGLAS DE SALUDO (aplica cuando el cliente diga Hola, Buenos días, etc.):
    - Si estado es "active" y días hasta vencimiento <= 7: "¡Hola${greetingName}! 😊 Te aviso que tu membresía vence el ${memberDoc && !memberDoc.empty ? memberDoc.docs[0].data().endDate : ''} (en ${daysUntilExpiry} días). ¿Quieres renovar?"
    - Si estado es "active" y días > 7: "¡Hola${greetingName}! 😊 ¿En qué puedo ayudarte hoy?"
    - Si estado es "overdue" o días < 0: "¡Hola${greetingName}! Tu membresía venció el ${memberDoc && !memberDoc.empty ? memberDoc.docs[0].data().endDate : ''}. ¿Te ayudo a renovar? 💪"
    - Si es prospecto o no registrado: saluda normal y ofrece planes (1 mes S/80, 2 meses S/120, 3 meses S/150).

    REGLA CRÍTICA: Si el cliente está REGISTRADO, YA TIENES su nombre, DNI y email en el contexto. NO los pidas. Úsalos directamente para generar el link de pago.
    REGLA RUTINA: Si el cliente pide su rutina o ejercicios, usa get_student_routine y envíale el link.
    REGLA HISTORIAL: Si el cliente pregunta sobre sus pagos o historial, usa get_payment_history.
    REGLA PERFIL: Si el cliente responde preguntas sobre su objetivo, nivel o días disponibles, guarda con update_member_profile inmediatamente.
    REGLA: Si un tool devuelve éxito, CONFÍRMALO y no digas que hay fallos.${profileQuestionInstruction}`;

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
