

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

function getLimaDateParts(date: Date) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value || '2000';
    const month = parts.find((part) => part.type === 'month')?.value || '01';
    const day = parts.find((part) => part.type === 'day')?.value || '01';
    return { year, month, day };
}

function getLimaTodayString() {
    const { year, month, day } = getLimaDateParts(new Date());
    return `${year}-${month}-${day}`;
}

function getClassDayFromDate(dateString: string) {
    const date = new Date(`${dateString}T00:00:00-05:00`);
    return (date.getUTCDay() + 6) % 7;
}

function resolveNextBookingDate(targetDay: number, requestedDate?: string) {
    if (requestedDate) {
        return requestedDate;
    }

    const todayString = getLimaTodayString();
    const today = new Date(`${todayString}T00:00:00-05:00`);
    const todayClassDay = (today.getUTCDay() + 6) % 7;
    const delta = (targetDay - todayClassDay + 7) % 7;
    const nextDate = new Date(today);
    nextDate.setUTCDate(nextDate.getUTCDate() + delta);
    const { year, month, day } = getLimaDateParts(nextDate);
    return `${year}-${month}-${day}`;
}

function normalizeText(value: string) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function extractDesiredTime(text: string) {
    const normalized = normalizeText(text);

    if (
        normalized.includes('8:30') ||
        normalized.includes('8 y 30') ||
        normalized.includes('8 y media') ||
        normalized.includes('8 am') ||
        normalized.includes('8 a m') ||
        normalized.includes('8 de la manana') ||
        normalized.includes('8 de la mañana')
    ) {
        return '08:30';
    }

    if (
        normalized.includes('8 pm') ||
        normalized.includes('8 p m') ||
        normalized.includes('8 de la noche') ||
        normalized.includes('8 en la noche') ||
        normalized.includes('8 de la tarde')
    ) {
        return '20:00';
    }

    return '';
}

function findDesiredTimeFromContext(currentMessage: string, historyTexts: string[]) {
    return extractDesiredTime(currentMessage) || extractDesiredTime([...historyTexts].reverse().join(' '));
}

function formatClassTimeLabel(time: string) {
    if (time === '08:30') return '8:30 AM';
    if (time === '20:00') return '8:00 PM';
    return time || 'tu horario elegido';
}

function sanitizeAssistantReply(content: string) {
    const text = String(content || '');
    return text
        .replace(/https?:\/\/pago-megagym\.com\S*/gi, '')
        .replace(/\[([^\]]+)\]\(https?:\/\/fit-ia-megagym\.com\/[^)\s]*\)/gi, '$1')
        .replace(/\[([^\]]+)\]\(https?:\/\/fit-ia-megagym\.web\.app\/(?!pagar\?)[^)\s]*\)/gi, '$1')
        .replace(/https?:\/\/fit-ia-megagym\.com\/\S*/gi, '')
        .replace(/https?:\/\/fit-ia-megagym\.web\.app\/(?!pagar\?)\S*/gi, '')
        .replace(/https?:\/\/\S*(class-group|class-groupal|clase-grupal)\S*/gi, '')
        .replace(/\(enlace ficticio\)/gi, '')
        .trim();
}

async function resolveClassBookingTarget(db: any, args: { classId?: string; planName?: string; bookingDate?: string; desiredTime?: string }) {
    const requestedClassId = String(args.classId || '').trim();
    if (requestedClassId) {
        const classDoc = await db.collection('classes').doc(requestedClassId).get();
        if (classDoc.exists) {
            const classData = classDoc.data() || {};
            return {
                id: classDoc.id,
                data: classData,
                bookingDate: args.bookingDate || resolveNextBookingDate(Number(classData.day ?? 0)),
            };
        }
    }

    const requestedTime = String(args.desiredTime || '').trim() || extractDesiredTime(String(args.planName || ''));
    const requestedDate = String(args.bookingDate || '');
    const requestedDay = requestedDate ? getClassDayFromDate(requestedDate) : null;
    const classesSnap = await db.collection('classes').where('status', '==', 'active').get();

    let classes = classesSnap.docs.map((doc: any) => ({
        id: doc.id,
        data: doc.data() || {},
    }));

    if (requestedDay !== null) {
        classes = classes.filter((item: any) => Number(item.data.day ?? 0) === requestedDay);
    }

    if (requestedTime) {
        classes = classes.filter((item: any) => String(item.data.time || '') === requestedTime);
    }

    const selectedClass = classes[0];
    if (!selectedClass) {
        return null;
    }

    return {
        id: selectedClass.id,
        data: selectedClass.data,
        bookingDate: requestedDate || resolveNextBookingDate(Number(selectedClass.data.day ?? 0)),
    };
}

function mentionsGroupClassContext(text: string) {
    const normalized = normalizeText(text);
    return ['aerobico', 'aerobicos', 'clase grupal', 'fullbody', 'liz pia', 'profesora liz', 'prof liz']
        .some((token) => normalized.includes(token));
}

function mentionsMachineDayPass(text: string) {
    const normalized = normalizeText(text);
    return ['clase libre', 'maquina', 'maquinas', 'gym por dia', 'gimnasio por dia', 'pase por dia', 'pase diario']
        .some((token) => normalized.includes(token));
}

function mentionsPaymentIntent(text: string) {
    const normalized = normalizeText(text);
    return ['quiero pagar', 'pasame el link', 'pagar por yape', 'pagar por tarjeta', 'mandame el link', 'manda el link', 'enviame el link', 'quiero el link', 'link de pago', 'por yape', 'por tarjeta']
        .some((token) => normalized.includes(token));
}

function mentionsReservationIntent(text: string) {
    const normalized = normalizeText(text);
    return ['quiero reservar', 'reservar', 'reserva', 'separar', 'quiero separar']
        .some((token) => normalized.includes(token));
}

function mentionsFollowupForPendingLink(text: string) {
    const normalized = normalizeText(text);
    return ['ok', 'okei', 'dale', 'si', 'que paso', 'qué pasó', 'y el link', 'pasamelo', 'pasamelo', 'envialo', 'envíalo', 'mandalo', 'mándalo']
        .some((token) => normalized.includes(token));
}

function assistantPromisedPaymentLink(text: string) {
    const normalized = normalizeText(text);
    return ['generare el enlace', 'te lo paso', 'enlace de pago', 'link de pago', 'ahora generare', 'un par de segunditos']
        .some((token) => normalized.includes(token));
}

async function reserveClass(db: any, adminInner: any, args: any) {
    const memSnap = await findMember(db, args.phone);
    if (!memSnap) return { error: "Member not found" };

    const memberId = memSnap.docs[0].id;
    const classRef = db.collection('classes').doc(String(args.classId));

    return db.runTransaction(async (transaction: any) => {
        const classDoc = await transaction.get(classRef);
        if (!classDoc.exists) {
            return { error: "Class not found" };
        }

        const classData = classDoc.data() || {};
        if (classData.status === 'inactive') {
            return { error: "Class is inactive" };
        }

        const bookingQuery = db.collection('bookings').where('classId', '==', String(args.classId));
        const bookingSnap = await transaction.get(bookingQuery);
        const activeBookings = bookingSnap.docs.filter((doc: any) => (doc.data().status || 'confirmed') !== 'cancelled');

        const alreadyBooked = activeBookings.some((doc: any) => doc.data().memberId === memberId);
        if (alreadyBooked) {
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
            created_at: adminInner.firestore.FieldValue.serverTimestamp()
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

export async function executeTool(name: string, args: any) {
    const adminInner = require('firebase-admin');
    if (!adminInner.apps.length) adminInner.initializeApp();
    const dbInner = adminInner.firestore();

    switch (name) {
        case 'get_membership_plans':
            const snapshot = await dbInner.collection('memberships').get();
            return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));

        case 'get_available_classes':
            try {
                const requestedDate = args.date || '';
                const requestedDay = requestedDate ? getClassDayFromDate(requestedDate) : null;
                const classesSnap = await dbInner.collection('classes').where('status', '==', 'active').get();

                let classes = classesSnap.docs.map((doc: any) => {
                    const data = doc.data() || {};
                    const day = Number(data.day ?? 0);
                    return {
                        id: doc.id,
                        ...data,
                        day,
                        bookingDate: resolveNextBookingDate(day, requestedDate),
                    };
                });

                if (requestedDay !== null) {
                    classes = classes.filter((item: any) => item.day === requestedDay);
                }

                classes.sort((a: any, b: any) => {
                    if (a.day !== b.day) return a.day - b.day;
                    return String(a.time || '').localeCompare(String(b.time || ''));
                });

                return {
                    date: requestedDate || null,
                    classes,
                };
            } catch (e: any) {
                return { error: e.message };
            }

        case 'check_member_status':
            const membersSnap = await findMember(dbInner, args.phone);
            if (!membersSnap) return { status: 'not_found' };
            const member = membersSnap.docs[0].data();
            return member;

        case 'book_class':
            try {
                return await reserveClass(dbInner, adminInner, args);
            } catch (e: any) {
                return { error: e.message };
            }

        case 'generate_payment_link':
            try {
                let planName = args.planName;
                let bookingDate = args.bookingDate || '';
                let classId = String(args.classId || '').trim();

                if (args.paymentType === 'class_booking') {
                    const resolvedClass = await resolveClassBookingTarget(dbInner, {
                        classId,
                        planName,
                        bookingDate,
                        desiredTime: args.desiredTime || '',
                    });

                    if (!resolvedClass) {
                        return { error: 'Class not found.' };
                    }

                    classId = resolvedClass.id;
                    const classData = resolvedClass.data || {};
                    bookingDate = resolvedClass.bookingDate || bookingDate || resolveNextBookingDate(Number(classData.day ?? 0));
                    planName = planName || `${classData.name || 'Clase grupal'} ${classData.time || ''}`.trim();
                }

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
                        planName,
                        paymentType: args.paymentType || 'membership',
                        classId,
                        bookingDate,
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
                description: "Get active group classes and their next reservable date. Use this when the customer asks for aerobics, group classes, or FULLBODY schedules.",
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
                description: "Generate a payment link (Culqi) for a membership or a paid group class. Use paymentType='membership' for renewals and paymentType='class_booking' only for paid group classes after the user has chosen the schedule. Do NOT use this for gym machine day passes.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "Customer's phone number exactly as provided in the context." },
                        planName: { type: "string", description: "Name of the plan (e.g. '1 mes', '2 meses', '3 meses')" },
                        paymentType: { type: "string", description: "Use 'membership' or 'class_booking'." },
                        classId: { type: "string", description: "Required when paymentType is 'class_booking'." },
                        bookingDate: { type: "string", description: "Required when paymentType is 'class_booking'. Date in YYYY-MM-DD." },
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
    let daysOverdue: number | null = null;  // días transcurridos desde el vencimiento (positivo = vencido)
    let clientFirstName = '';

    if (memberDoc && !memberDoc.empty) {
        const data = memberDoc.docs[0].data();
        clientFirstName = (data.name || '').split(' ')[0];

        // Perfil de entrenamiento
        const profile = data.trainingProfile || {};
        const profileStep = data.profileStep || 0;

        // Calcular días hasta vencimiento (negativo = ya venció)
        if (data.endDate) {
            const end = new Date(data.endDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            daysUntilExpiry = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry < 0) {
                daysOverdue = Math.abs(daysUntilExpiry); // cuántos días lleva vencido
            }
        }

        const profileStr = profile.objetivo
            ? `Objetivo: ${profile.objetivo}. Nivel: ${profile.nivel || 'N/A'}. Días/semana: ${profile.diasSemana || 'N/A'}. Limitaciones: ${profile.limitaciones || 'ninguna'}. Notas trainer: ${profile.notasTrainer || 'N/A'}.`
            : 'Sin perfil de entrenamiento aún.';

        // Determinar qué pregunta de perfil hacer (solo miembros activos, no vencidos)
        if (data.status === 'active' && profileStep < 3 && !daysOverdue) {
            if (!profile.objetivo) profileQuestion = `Por cierto${clientFirstName ? ` ${clientFirstName}` : ''}, ¿cuál es tu objetivo principal en el gym? (bajar de peso, ganar músculo, tonificar...) Eso me ayudará a darte recomendaciones más precisas. 😉`;
            else if (!profile.nivel) profileQuestion = `¿Te consideras principiante, intermedio o avanzado en el entrenamiento? 💪`;
            else if (!profile.diasSemana) profileQuestion = `¿Cuántos días a la semana puedes venir a entrenar para armar algo realista? 🔥`;
        }

        const hasDiet = data.diet ? 'Sí (asignada)' : 'No (sin asignar)';
        customerContext = `CLIENTE REGISTRADO: Nombre: ${data.name || 'N/A'}. DNI: ${data.dni || 'N/A'}. Email: ${data.email || 'N/A'}. Plan: ${data.plan || 'sin plan'}. Estado: ${data.status || 'prospect'}. Vence: ${data.endDate || 'N/A'}. Días vencido: ${daysOverdue !== null ? daysOverdue : 'N/A (activo)'}. Dieta Asignada: ${hasDiet}. Perfil Entrenamiento: ${profileStr}`;
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

    const historyTexts = historySnapshot.docs.map((doc: any) => String(doc.data().content || ''));
    const normalizedCurrent = normalizeText(messageText);

    const assistantPendingLink = historyTexts.some((text: string) => assistantPromisedPaymentLink(text));

    if (!mentionsMachineDayPass(messageText) && (mentionsPaymentIntent(messageText) || (assistantPendingLink && mentionsFollowupForPendingLink(messageText)) || (mentionsReservationIntent(messageText) && !!extractDesiredTime(messageText)))) {
        const recentClassContext = [messageText, ...historyTexts].some((text) => mentionsGroupClassContext(text));
        if (recentClassContext) {
            const desiredTime = findDesiredTimeFromContext(messageText, historyTexts);
            if (!desiredTime) {
                return 'Tengo FULLBODY con LIZ PIA a las 8:30 AM y 8:00 PM 😊 ¿Cuál de esos horarios deseas para enviarte el link de S/ 6?';
            }

            const requestedDate = normalizedCurrent.includes('hoy') ? getLimaTodayString() : '';
            const availableClasses = await executeTool('get_available_classes', { date: requestedDate || undefined });
            const classes = Array.isArray(availableClasses?.classes) ? availableClasses.classes : [];
            const selectedClass = classes.find((item: any) => String(item.time || '') === desiredTime);

            if (!selectedClass) {
                return 'No encontré ese horario disponible ahora mismo. Tengo FULLBODY con LIZ PIA a las 8:30 AM y 8:00 PM 💪 ¿Cuál deseas reservar?';
            }

            const paymentLink = await executeTool('generate_payment_link', {
                phone,
                planName: `${selectedClass.name} ${selectedClass.time}`,
                paymentType: 'class_booking',
                classId: selectedClass.id,
                bookingDate: selectedClass.bookingDate
            });

            if (paymentLink?.url) {
                const scheduleLabel = formatClassTimeLabel(String(selectedClass.time || ''));
                return `Listo${clientFirstName ? ` ${clientFirstName}` : ''}. Aqui tienes tu link para reservar ${selectedClass.name} con LIZ PIA a las ${scheduleLabel}. Son S/ 6 y puedes pagar por Yape o tarjeta en Culqi: ${paymentLink.url}`;
                return `¡Perfecto${clientFirstName ? ` ${clientFirstName}` : ''}! 🙌 Aquí tienes tu link para reservar ${selectedClass.name} con LIZ PIA a las ${selectedClass.time}. Son S/ 6 y puedes pagar por Yape o tarjeta en Culqi 👇 ${paymentLink.url}`;
            }

            return 'Estoy teniendo un problema para generar el link de pago en este momento. Intenta nuevamente en un instante, por favor.';
        }
    }

    messages.push({ role: 'user', content: messageText });

    // Detect first-time user (no previous messages in history)
    const isFirstContact = historySnapshot.empty;

    const profileQuestionInstruction = profileQuestion
        ? `\n    PREGUNTA DE PERFIL PENDIENTE: Al final de tu respuesta (después de responder lo que el cliente pidió), añade esta pregunta de forma natural: "${profileQuestion}". Si el cliente responde, guarda con update_member_profile.`
        : '';

    const now = new Date();
    const currentDay = now.toLocaleDateString('es-PE', { weekday: 'long', timeZone: 'America/Lima' });
    const currentDate = now.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' });
    const currentTime = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });

    const systemPrompt = `Eres Sofía, la asistente personal y trainer virtual de MegaGym ("La casa del dolor" 📍). Tienes una personalidad vibrante, cálida y auténtica — hablas como una amiga peruana de confianza que además sabe mucho de fitness. No eres un robot ni un asistente frío, eres alguien cercana que se alegra genuinamente por los logros del cliente y que también sabe cuándo ser seria.

    TU PERSONALIDAD:
    - Usas expresiones peruanas naturales cuando encajan: "¡De una!", "¡Qué crack!", "¡Así se hace!", "¡No te rajes!", "¡Eso es!", "¡Jalaaa!", "bacán", "al toque".
    - Reaccionas emocionalmente según el contexto: si el cliente dice que entrenó duro, te emocionas y lo celebras. Si dice que está cansado, lo animas con energía. Si hace una pregunta curiosa, respondes con entusiasmo.
    - Varía tus emojis según la situación — no uses siempre los mismos. Ejemplos: logro → 🏆🙌🎉, esfuerzo → 💪🔥😤, comida → 🍗🥑🍳, motivación → ⚡🚀😎, cariño → 😊❤️, urgencia → 🚨⚠️.
    - A veces puedes hacer una broma corta o comentario gracioso si el momento lo permite, pero sin exagerar.
    - Si el cliente comparte algo personal (logro, problema, meta), reconócelo antes de responder la pregunta. Ejemplo: si dice "bajé 3 kilos", primero celebra eso con energía antes de dar cualquier consejo.

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
    - Clases Grupales:
        * FULLBODY con LIZ PIA
        * Lunes a Viernes: 8:30 AM y 8:00 PM
        * Precio: S/ 6 por clase grupal
        * Estas clases sí se pueden reservar y pagar por link
    - Clase libre de máquinas / pase por día:
        * Se paga presencialmente en recepción
        * NO generar link de pago para esto
    - Métodos de Pago: Yape, Plin, Efectivo, Tarjeta de Crédito/Débito (vía link Culqi).

    CONTEXTO ACTUAL:
    - Fecha/Hora actual: ${currentDay} ${currentDate}, ${currentTime} (hora de Lima, Perú).
    - Teléfono del cliente: ${phone}. 
    - Info del cliente: ${customerContext}

    TU MISIÓN:
    1. Si te preguntan "¿Está abierto?" o sobre el horario, usa la hora actual (${currentTime}) y el día (${currentDay}) para responder con precisión.
    2. REGLAS DE SALUDO (Solo si el cliente inicia la charla con un saludo):
        - PRIMER CONTACTO (nunca ha hablado antes con el bot): Si es el primer mensaje del cliente, IGNORA todas las alertas de vencimiento y preséntate como Sofía de forma cálida y natural, como una amiga. NO ofrezcas un menú de opciones ni listes lo que puedes hacer. Simplemente saluda con energía y pregunta en qué le puedes ayudar. Ejemplo: "¡Hola${clientFirstName ? ` ${clientFirstName}` : ''}! 😊 Soy Sofía, tu asistente personal de MegaGym 💪 ¿En qué te puedo ayudar hoy?" El campo isFirstContact = ${isFirstContact}.
        - Miembro ACTIVO con vencimiento en <= 3 días: Saluda y avisa: "Tu membresía vence el ${memberDoc && !memberDoc.empty ? memberDoc.docs[0].data().endDate : ''} (en ${daysUntilExpiry} días). ¿Te ayudo a renovar?"
        - Miembro VENCIDO (días vencido: ${daysOverdue}): Saluda de forma cálida y motivadora, reconoce que sigue presente y ofrece ayuda para renovar. Ejemplo: "¡Hola ${clientFirstName}! Qué bueno saber de ti 😊 Tu membresía venció hace ${daysOverdue} día(s), pero eso se arregla en un momento. ¿Te genero el link para renovar y seguir sin parar? 💪🔥"
    3. Si el cliente está REGISTRADO, usa su nombre (${clientFirstName}) y NO le pidas datos que ya tienes (DNI, email).
    4. COMPORTAMIENTO SEGÚN DÍAS VENCIDO (daysOverdue = ${daysOverdue}):
       - daysOverdue es null o 0: Membresía activa. Comportamiento normal, acceso completo.
       - daysOverdue entre 1 y 14: Acceso completo. Responde con normalidad sin ningún aviso de vencimiento ni links de pago. Solo si el cliente PIDE renovar o preguntar por su membresía, entonces ayúdalo.
       - daysOverdue >= 15: MODO ACCESO RESTRINGIDO. NO uses get_student_routine, get_student_diet, send_payment_voucher, get_payment_history ni check_member_status. Responde preguntas generales (horarios, precios generales, fitness, cualquier tema) con total normalidad. NO menciones que está bloqueado, NO generes links de pago, NO menciones el vencimiento a menos que el cliente lo pregunte directamente.
    5. REGLAS DE COBRO:
       - Si el cliente quiere pagar o renovar su membresía, usa generate_payment_link con paymentType='membership'.
       - Si el cliente quiere reservar o pagar una clase grupal (aeróbicos, clase grupal, FULLBODY), usa get_available_classes para ofrecer solo los horarios reales. Primero haz que elija uno. Luego usa generate_payment_link con paymentType='class_booking', classId y bookingDate. Explica que la reserva queda confirmada cuando Culqi apruebe el pago de S/ 6.
       - NO uses book_class directamente para una clase grupal pagada. La reserva se confirma después del pago.
       - Si el cliente pide clase libre, pase diario, usar máquinas por un día o gimnasio por día, NO generes link. Indica que ese pago se realiza personalmente en recepción.
       - Cuando generes link de membresía, responde con entusiasmo como antes. Cuando generes link de clase grupal, deja claro que es sólo para clases grupales y no para clase libre de máquinas.
       - Si el cliente todavía no te dijo día u hora de la clase grupal, NO generes el link todavía. Primero aclara si quiere 8:30 AM u 8:00 PM.
    6. Si pide su rutina, usa 'get_student_routine' (solo si daysOverdue < 20). Si pide su dieta, usa 'get_student_diet' (solo si daysOverdue < 20).
    7. Si responde a tus preguntas de perfil (objetivo, nivel, etc.), usa 'update_member_profile' inmediatamente.
    8. ENTREGA DE DIETA (NIVEL EXPERTO): Cuando uses 'get_student_diet', NUNCA envíes todo el plan de golpe. Sigue esta lógica exacta:
       a) Usa el día actual (${currentDay}) para identificar qué grupo de días del plan corresponde HOY. Regla general para planes semanales de 3 grupos: Lunes/Martes/Miércoles → Días 1-3, Jueves/Viernes → Días 4-5, Sábado/Domingo → Días 6-7.
       b) Menciona proactivamente a qué fase/grupo pertenece hoy y su nombre de la dieta (ej. "Alta Rendimiento", "Variación Metabólica", "Bajo en Carbs").
       c) Pregúntale qué comida quiere ver ahora (Desayuno, Almuerzo o Cena) o si prefiere ver también la suplementación.
       d) EJEMPLO de respuesta ideal: "¡Hola Robert! 💪 Hoy es ${currentDay}, que corresponde a tu fase de *Variación Metabólica* (Días 4-5). ¿Quieres ver tu almuerzo de hoy o la suplementación pre-entreno? 🍗"
       e) Entrega las porciones de forma interactiva y con emojis de alimentos (🍗🥑🍳🥩).
    9. ESTILO DE RESPUESTA - REGLAS DE ORO:
       - SIEMPRE responde como si fueras una amiga mandando un WhatsApp, no como un blog ni un manual.
       - NUNCA uses negritas (*texto*) para subtítulos ni títulos dentro de la respuesta. Las negritas solo están permitidas para resaltar UNA palabra clave importante, no para crear estructura tipo artículo.
       - NUNCA uses listas numeradas. Si necesitas listar cosas, usa máximo 3 ítems con emojis como viñetas.
       - Para preguntas técnicas de entrenamiento (técnica, ejercicios, conceptos de fitness, nutrición): responde en máximo 2-3 oraciones con lo esencial. Siempre termina ofreciendo profundizar: "¿Quieres saber [opción A] o [opción B]? 🔥" en lugar de soltar todo de golpe.
       - Para el resto de mensajes: máx 3 oraciones, emojis (💪, 😊, 🔥) y termina con una pregunta motivadora.${profileQuestionInstruction}`;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        tools: tools as any
    });

    const responseMessage = response.choices[0].message;

    if (responseMessage.tool_calls) {
        const toolMessages: any[] = [...messages, responseMessage];
        let directToolReply = '';
        for (const toolCall of responseMessage.tool_calls) {
            const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            if (toolCall.function.name === 'generate_payment_link' && toolArgs.paymentType === 'class_booking') {
                const desiredTimeFromContext = findDesiredTimeFromContext(messageText, historyTexts);
                if (desiredTimeFromContext) {
                    const requestedDate = normalizedCurrent.includes('hoy') ? getLimaTodayString() : '';
                    const availableClasses = await executeTool('get_available_classes', { date: requestedDate || undefined });
                    const classes = Array.isArray(availableClasses?.classes) ? availableClasses.classes : [];
                    const selectedClass = classes.find((item: any) => String(item.time || '') === desiredTimeFromContext);
                    if (selectedClass) {
                        toolArgs.classId = selectedClass.id;
                        toolArgs.bookingDate = selectedClass.bookingDate;
                        toolArgs.planName = `${selectedClass.name} ${selectedClass.time}`;
                        toolArgs.desiredTime = desiredTimeFromContext;
                    }
                }
            }
            const functionResult = await executeTool(toolCall.function.name, toolArgs);
            console.log(`🛠️ Tool [${toolCall.function.name}] result:`, JSON.stringify(functionResult));
            if (toolCall.function.name === 'generate_payment_link' && functionResult?.url) {
                if (toolArgs.paymentType === 'class_booking') {
                    const scheduleLabel = formatClassTimeLabel(String(toolArgs.desiredTime || extractDesiredTime(String(toolArgs.planName || ''))));
                    directToolReply = `Listo${clientFirstName ? ` ${clientFirstName}` : ''}. Aqui tienes tu link real para reservar tu clase grupal${scheduleLabel ? ` a las ${scheduleLabel}` : ''}. Son S/ 6 y puedes pagar por Yape o tarjeta en Culqi: ${functionResult.url}`;
                } else {
                    directToolReply = `Listo${clientFirstName ? ` ${clientFirstName}` : ''}. Aqui tienes tu link real de pago para la membresia: ${functionResult.url}`;
                }
            }
            toolMessages.push({
                tool_call_id: toolCall.id,
                role: 'tool',
                content: JSON.stringify(functionResult)
            });
        }

        if (directToolReply) {
            return directToolReply;
        }

        const secondResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: systemPrompt },
                ...toolMessages
            ]
        });

        return sanitizeAssistantReply(secondResponse.choices[0].message.content);
    }

    return sanitizeAssistantReply(responseMessage.content);
}
