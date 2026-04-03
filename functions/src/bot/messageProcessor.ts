

// Busca un miembro probando múltiples formatos de teléfono
async function findMember(db: any, phone: string) {
    const cleanPhone = phone.replace(/\s/g, '');
    const base = cleanPhone.replace(/^\+?51/, '');
    const formats = new Set([
        cleanPhone,
        cleanPhone.startsWith('+') ? cleanPhone.slice(1) : '+' + cleanPhone,
        base,
        '+51' + base,
        '51' + base,
        'whatsapp:' + cleanPhone,
        'whatsapp:+' + base,
        'whatsapp:51' + base,
        'whatsapp:' + base
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
                const planPrice = Number(member.planPrice) || 0;
                const debt = member.debt !== undefined ? Math.max(0, Number(member.debt)) : Math.max(0, planPrice - (Number(lastPayment?.amount) || 0));
                const amountPaid = Math.max(0, planPrice - debt);
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
                const searchRoutines = async (db: any, phone: string) => {
                    const snap = await db.collection('studentRoutineAssignments')
                        .where('studentPhone', '==', phone)
                        .get(); // Retirado el filtro de active para probar si es un problema de datos

                    let routines = snap.docs.map((doc: any) => ({
                        title: doc.data().routineTitle,
                        url: doc.data().routineUrl,
                        createdAt: doc.data().createdAt,
                        status: doc.data().status
                    }));

                    // Solo devolver aquellas que tengan url
                    routines = routines.filter((r: any) => r.url);

                    // Ordenar por fecha descendente en memoria para evitar requisito de índice compuesto
                    return routines.sort((a: any, b: any) => {
                        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                        return dateB.getTime() - dateA.getTime();
                    });
                };

                const cleanPhone = args.phone.replace(/\s/g, '');
                let routines = await searchRoutines(dbInner, cleanPhone);

                if (routines.length === 0) {
                    // Probar formatos alternativos de teléfono
                    const base = cleanPhone.replace(/^\+?51/, '');
                    const formats = new Set([
                        cleanPhone,
                        cleanPhone.startsWith('+') ? cleanPhone.slice(1) : '+' + cleanPhone,
                        base,
                        '+51' + base,
                        '51' + base,
                        'whatsapp:' + cleanPhone,
                        'whatsapp:+' + base,
                        'whatsapp:51' + base,
                        'whatsapp:' + base
                    ]);
                    for (const fmt of formats) {
                        const altRoutines = await searchRoutines(dbInner, fmt);
                        if (altRoutines.length > 0) {
                            routines = altRoutines;
                            break;
                        }
                    }
                }

                if (routines.length === 0) {
                    return { found: false, message: 'No tienes una rutina asignada aún.' };
                }

                return {
                    found: true,
                    count: routines.length,
                    routines: routines,
                    message: `Se encontraron ${routines.length} rutinas activas.`
                };
            } catch (e: any) {
                console.error("❌ Error en get_student_routine:", e);
                return { error: e.message };
            }

        case 'get_student_diet':
            try {
                const snap = await findMember(dbInner, args.phone);
                if (!snap) return { found: false, message: 'No se encontró tu perfil de alumno.' };
                const memberData = snap.docs[0].data();
                if (!memberData.diet) {
                    return { found: false, message: 'Aún no tienes una dieta asignada en tu perfil.' };
                }
                return { found: true, diet: memberData.diet };
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
                        phone: { type: "string", description: "Phone number of the member" },
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
                description: "Generate a payment link (Culqi) for a specific plan. If the customer is registered, their data is already available — do NOT ask the user for it.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "Customer's phone number exactly as provided in the context." },
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
                        phone: { type: "string", description: "Customer's phone number exactly as provided in the context." },
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
                description: "Obtener las rutinas de entrenamiento asignadas al cliente. Úsalo cuando el cliente pida su rutina, ejercicios, o plan de entrenamiento. Puede devolver una o varias rutinas activas.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "El número de teléfono del usuario para buscar su rutina. USA SIEMPRE el que recibes en el contexto." },
                    },
                    required: ["phone"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "get_student_diet",
                description: "Obtener la dieta personalizada asignada al cliente. Úsalo cuando el cliente pida su dieta, plan nutricional o pregunte qué comer.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "El número de teléfono del usuario para buscar su dieta. USA SIEMPRE el que recibes en el contexto." },
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
                        phone: { type: "string", description: "El número de teléfono del usuario." }
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
                        phone: { type: "string", description: "El número de teléfono del usuario." },
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
                        phone: { type: "string", description: "El número de teléfono del usuario." }
                    },
                    required: ["phone"]
                }
            }
        },
        {
            type: "function",
            function: {
                name: "check_member_status",
                description: "Consultar el estado de la membresía del cliente: fecha de inicio, vencimiento, plan actual y si está activo. Úsalo SOLO cuando el cliente pregunte específicamente por su estado o vencimiento.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "El número de teléfono del usuario." }
                    },
                    required: ["phone"]
                }
            }
        }
    ];

    const memberDoc = await findMember(db, phone);
    let customerContext = "Prospecto o cliente no registrado.";
    let profileQuestion: string | null = null;
    let daysUntilExpiry: number | null = null;
    let clientFirstName = '';

    if (memberDoc && !memberDoc.empty) {
        const data = memberDoc.docs[0].data();
        clientFirstName = (data.name || '').split(' ')[0];

        // Perfil de entrenamiento
        const profile = data.trainingProfile || {};
        const profileStep = data.profileStep || 0;

        // Calcular días hasta vencimiento
        if (data.endDate) {
            const end = new Date(data.endDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            daysUntilExpiry = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        const profileStr = profile.objetivo
            ? `Objetivo: ${profile.objetivo}. Nivel: ${profile.nivel || 'N/A'}. Días/semana: ${profile.diasSemana || 'N/A'}. Limitaciones: ${profile.limitaciones || 'ninguna'}. Notas trainer: ${profile.notasTrainer || 'N/A'}.`
            : 'Sin perfil de entrenamiento aún.';

        // Determinar qué pregunta de perfil hacer (solo miembros activos)
        if (data.status === 'active' && profileStep < 3) {
            if (!profile.objetivo) profileQuestion = `Por cierto${clientFirstName ? ` ${clientFirstName}` : ''}, ¿cuál es tu objetivo principal en el gym? (bajar de peso, ganar músculo, tonificar...) Eso me ayudará a darte recomendaciones más precisas. 😉`;
            else if (!profile.nivel) profileQuestion = `¿Te consideras principiante, intermedio o avanzado en el entrenamiento? 💪`;
            else if (!profile.diasSemana) profileQuestion = `¿Cuántos días a la semana puedes venir a entrenar para armar algo realista? 🔥`;
        }

        const hasDiet = data.diet ? 'Sí (asignada)' : 'No (sin asignar)';
        customerContext = `CLIENTE REGISTRADO: Nombre: ${data.name || 'N/A'}. DNI: ${data.dni || 'N/A'}. Email: ${data.email || 'N/A'}. Plan: ${data.plan || 'sin plan'}. Estado: ${data.status || 'prospect'}. Vence: ${data.endDate || 'N/A'}. Dieta Asignada: ${hasDiet}. Perfil Entrenamiento: ${profileStr}`;
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

    // Detect first-time user (no previous messages in history)
    const isFirstContact = historySnapshot.empty;

    const profileQuestionInstruction = profileQuestion
        ? `\n    PREGUNTA DE PERFIL PENDIENTE: Al final de tu respuesta (después de responder lo que el cliente pidió), añade esta pregunta de forma natural: "${profileQuestion}". Si el cliente responde, guarda con update_member_profile.`
        : '';

    const now = new Date();
    const currentDay = now.toLocaleDateString('es-PE', { weekday: 'long', timeZone: 'America/Lima' });
    const currentTime = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });

    const systemPrompt = `Eres Sofía, la asistente personal y trainer virtual de MegaGym ("La casa del dolor" 📍). Eres cercana, motivadora y hablas como una amiga experta en fitness. 

    INFORMACIÓN CRÍTICA DEL GIMNASIO (Tu Biblia):
    - Dirección: Mz I Lt 5 Montenegro, San Juan de Lurigancho.
    - Horarios de Atención:
        * Lunes a Viernes: 6:00 AM - 10:00 PM
        * Sábados: 6:00 AM - 6:00 PM
        * Domingos: 6:00 AM - 12:00 PM (Mediodía)
        * Feriados: Consultar disponibilidad.
    - Precios de Membresía (Sin costo de matrícula):
        * 1 Mes: S/ 80
        * 2 Meses: S/ 120 (Se puede pagar en 2 partes)
        * 3 Meses: S/ 150 (Se puede pagar en 2 partes)
        * Clase diaria: S/ 6
    - Clases Grupales (Aeróbicos/Localizado): Lunes a Sábado a las 8:00 AM y 8:00 PM.
    - Métodos de Pago: Yape, Plin, Efectivo, Tarjeta de Crédito/Débito (vía link Culqi).

    CONTEXTO ACTUAL:
    - Fecha/Hora actual: ${currentDay}, ${currentTime}.
    - Teléfono del cliente: ${phone}. 
    - Info del cliente: ${customerContext}

    TU MISIÓN:
    1. Si te preguntan "¿Está abierto?" o sobre el horario, usa la hora actual (${currentTime}) y el día (${currentDay}) para responder con precisión.
    2. REGLAS DE SALUDO (Solo si el cliente inicia la charla con un saludo):
        - PRIMER CONTACTO (nunca ha hablado antes con el bot): Si es el primer mensaje del cliente, IGNORA todas las alertas de vencimiento y preséntate como Sofía de forma cálida. Dile que eres su asistente personal de MegaGym y menciona brevemente qué puedes hacer (rutinas, dieta, horarios, pagos). Ejemplo: "¡Hola ${clientFirstName || ''}! 😊 Soy Sofía, tu asistente personal de MegaGym 💪 Puedo ayudarte con tu rutina, tu dieta, horarios y pagos. ¿En qué te puedo ayudar hoy?" El campo isFirstContact = ${isFirstContact}.
        - Miembro ACTIVO con vencimiento en <= 3 días: Saluda y avisa: "Tu membresía vence el ${memberDoc && !memberDoc.empty ? memberDoc.docs[0].data().endDate : ''} (en ${daysUntilExpiry} días). ¿Te ayudo a renovar?"
        - Miembro VENCIDO: "Tu membresía venció el ${memberDoc && !memberDoc.empty ? memberDoc.docs[0].data().endDate : ''}. ¡Te esperamos de vuelta para seguir dándole duro! 💪"
    3. Si el cliente está REGISTRADO, usa su nombre (${clientFirstName}) y NO le pidas datos que ya tienes (DNI, email).
    4. Si pide su rutina, usa 'get_student_routine'. Si pide su dieta, usa 'get_student_diet'.
    5. Si responde a tus preguntas de perfil (objetivo, nivel, etc.), usa 'update_member_profile' inmediatamente.
    6. ENTREGA DE DIETA (NIVEL EXPERTO): Cuando uses 'get_student_diet', NUNCA envíes todo el plan de golpe. Sigue esta lógica exacta:
       a) Usa el día actual (${currentDay}) para identificar qué grupo de días del plan corresponde HOY. Regla general para planes semanales de 3 grupos: Lunes/Martes/Miércoles → Días 1-3, Jueves/Viernes → Días 4-5, Sábado/Domingo → Días 6-7.
       b) Menciona proactivamente a qué fase/grupo pertenece hoy y su nombre de la dieta (ej. "Alta Rendimiento", "Variación Metabólica", "Bajo en Carbs").
       c) Pregúntale qué comida quiere ver ahora (Desayuno, Almuerzo o Cena) o si prefiere ver también la suplementación.
       d) EJEMPLO de respuesta ideal: "¡Hola Robert! 💪 Hoy es ${currentDay}, que corresponde a tu fase de *Variación Metabólica* (Días 4-5). ¿Quieres ver tu almuerzo de hoy o la suplementación pre-entreno? 🍗"
       e) Entrega las porciones de forma interactiva y con emojis de alimentos (🍗🥑🍳🥩).
    7. Resto de Mensajes: CORTOS (máx 3 oraciones), usa emojis (💪, 😊, 🔥) y termina con una pregunta motivadora.${profileQuestionInstruction}`;

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
                { role: 'system', content: systemPrompt },
                ...toolMessages
            ]
        });

        return secondResponse.choices[0].message.content;
    }

    return responseMessage.content;
}
