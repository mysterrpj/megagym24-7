

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

const CRITICAL_CHAT_MODEL = process.env.OPENAI_CRITICAL_CHAT_MODEL || 'gpt-4o';
const DEFAULT_CHAT_MODEL = process.env.OPENAI_DEFAULT_CHAT_MODEL || 'gpt-4o-mini';

function selectChatModel(messageText: string) {
    const normalized = normalizeText(messageText);
    const criticalTokens = [
        'pagar',
        'pago',
        'pagos',
        'link',
        'deuda',
        'debo',
        'saldo',
        'voucher',
        'comprobante',
        'recibo',
        'boleta',
        'membresia',
        'mensualidad',
        'renovar',
        'renovacion',
        'vence',
        'vencimiento',
        'clase grupal',
        'fullbody',
        'aerobico',
        'aerobicos',
        'reserva',
        'reservar',
        'culqi',
        'yape',
        'tarjeta'
    ];

    return criticalTokens.some((token) => normalized.includes(token))
        ? CRITICAL_CHAT_MODEL
        : DEFAULT_CHAT_MODEL;
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

function mentionsGymHoursIntent(text: string) {
    const normalized = normalizeText(text);
    return [
        'horario',
        'hora abren',
        'a que hora abren',
        'a que hora abre',
        'estan abierto',
        'esta abierto',
        'esta abierta',
        'abren en la manana',
        'abren en la mañana',
        'hora cierran',
        'a que hora cierran',
        'atencion'
    ].some((token) => normalized.includes(token));
}

function mentionsMembershipStatusIntent(text: string) {
    const normalized = normalizeText(text);
    const asksMembership = ['membresia', 'mensualidad', 'mi plan'].some((token) => normalized.includes(token));
    const asksStatus = ['activa', 'activo', 'vigente', 'vencida', 'vencido', 'vence', 'estado'].some((token) => normalized.includes(token));
    return asksMembership && asksStatus;
}

function mentionsWrongLinkComplaint(text: string) {
    const normalized = normalizeText(text);
    return [
        'no quiero eso',
        'no pedi eso',
        'no te pedi',
        'por que me mandas ese link',
        'por que me envias ese link',
        'no quiero link',
        'no quiero reservar'
    ].some((token) => normalized.includes(token));
}

function mentionsVoucherIntent(text: string) {
    const normalized = normalizeText(text);
    return ['voucher', 'comprobante', 'recibo', 'boleta', 'constancia de pago']
        .some((token) => normalized.includes(token));
}

function mentionsDebtPaymentIntent(text: string) {
    const normalized = normalizeText(text);
    const mentionsDebt = ['deuda', 'debo', 'saldo pendiente', 'saldo', 'pendiente']
        .some((token) => normalized.includes(token));
    const wantsToPayDebt = mentionsPaymentIntent(text) || ['pagar', 'cancelar', 'regularizar', 'abonar', 'link']
        .some((token) => normalized.includes(token));
    return mentionsDebt && wantsToPayDebt;
}

function getPaymentDateString(payment: any) {
    const rawDate = payment?.date || payment?.createdAt;
    if (!rawDate) return '';
    const date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
    if (isNaN(date.getTime())) return String(rawDate).slice(0, 10);
    return date.toLocaleDateString('es-PE', {
        timeZone: 'America/Lima',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function getPaymentTimeString(payment: any) {
    const rawDate = payment?.date || payment?.createdAt;
    if (!rawDate) return '';
    const date = rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('es-PE', {
        timeZone: 'America/Lima',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function getPaymentLabel(payment: any, hasFutureAdvanceInGroup: boolean) {
    if (payment?.type === 'future_renewal_advance') return 'Adelanto renovacion futura';
    if (payment?.type === 'renewal_payment') return 'Pago de renovacion';
    if (payment?.type === 'debt_payment') return 'Pago de deuda';
    if (hasFutureAdvanceInGroup) return 'Pago de deuda';
    return 'Pago registrado';
}

function mentionsDeferredRenewalIntent(text: string) {
    const normalized = normalizeText(text);
    const wantsToContinue = [
        'si continuo',
        'si voy a continuar',
        'voy a continuar',
        'voy a seguir',
        'sigo entrenando',
        'seguire entrenando',
        'quiero continuar',
        'quiero seguir',
        'continuo',
        'sigo'
    ].some((token) => normalized.includes(token));

    const willPayLater = [
        'pago luego',
        'pagare luego',
        'pago despues',
        'pagare despues',
        'te pago luego',
        'te pago despues',
        'te alcanzo',
        'te voy a alcanzar',
        'en estos dias',
        'mas tarde',
        'cuando vaya',
        'cuando vaya al gym',
        'cuando llegue',
        'manana pago',
        'mañana pago'
    ].some((token) => normalized.includes(token));

    return wantsToContinue && willPayLater;
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

function extractDaysPerWeek(text: string) {
    const normalized = normalizeText(text);
    const digitMatch = normalized.match(/\b([1-7])\b/);
    if (digitMatch) return Number(digitMatch[1]);

    const numberWords: Record<string, number> = {
        'uno': 1,
        'una': 1,
        'dos': 2,
        'tres': 3,
        'cuatro': 4,
        'cinco': 5,
        'seis': 6,
        'siete': 7
    };

    for (const [word, value] of Object.entries(numberWords)) {
        if (normalized.includes(`${word} dias`) || normalized.includes(`${word} veces`)) {
            return value;
        }
    }

    return undefined;
}

function extractTrainingProfileSignals(text: string) {
    const normalized = normalizeText(text);
    const fields: any = {};

    if (normalized.includes('bajar de peso') || normalized.includes('bajar peso') || normalized.includes('perder grasa') || normalized.includes('bajar grasa') || normalized.includes('adelgazar')) {
        fields.objetivo = 'bajar grasa';
    } else if (normalized.includes('ganar masa') || normalized.includes('masa muscular') || normalized.includes('ganar musculo') || normalized.includes('subir masa')) {
        fields.objetivo = 'ganar masa muscular';
    } else if (normalized.includes('tonificar') || normalized.includes('definir')) {
        fields.objetivo = 'tonificar';
    } else if (normalized.includes('retomar') || normalized.includes('volver a entrenar') || normalized.includes('volver al gym')) {
        fields.objetivo = 'retomar entrenamiento';
    }

    if (normalized.includes('principiante')) fields.nivel = 'principiante';
    else if (normalized.includes('intermedio')) fields.nivel = 'intermedio';
    else if (normalized.includes('avanzado')) fields.nivel = 'avanzado';

    const diasSemana = extractDaysPerWeek(text);
    if (diasSemana) fields.diasSemana = diasSemana;

    if (normalized.includes('rodilla') || normalized.includes('hombro') || normalized.includes('espalda') || normalized.includes('cuello') || normalized.includes('lesion') || normalized.includes('dolor') || normalized.includes('molestia')) {
        fields.limitaciones = text.trim();
    }

    if (normalized.includes('en la manana') || normalized.includes('por la manana') || normalized.includes('mañana me queda mejor') || normalized.includes('en la mañana')) {
        fields.horarioHabitual = 'mañana';
    } else if (normalized.includes('en la noche') || normalized.includes('por la noche') || normalized.includes('en la tarde') || normalized.includes('solo puedo en la noche') || normalized.includes('salgo tarde del trabajo')) {
        fields.horarioHabitual = 'noche';
    }

    if (normalized.includes('clase grupal') || normalized.includes('aerobico') || normalized.includes('aerobicos') || normalized.includes('fullbody')) {
        fields.preferenciaClases = 'clases grupales';
    } else if (normalized.includes('maquina') || normalized.includes('maquinas')) {
        fields.preferenciaClases = 'máquinas';
    }

    if (normalized.includes('me cuesta ser constante') || normalized.includes('me desordeno') || normalized.includes('a veces dejo de venir') || normalized.includes('me falta constancia')) {
        fields.constancia = 'intermitente';
    } else if (normalized.includes('soy constante') || normalized.includes('vengo seguido') || normalized.includes('entreno siempre')) {
        fields.constancia = 'constante';
    }

    if (normalized.includes('motivad') || normalized.includes('con ganas') || normalized.includes('a meterle')) {
        fields.estadoMotivacional = 'motivado';
    } else if (normalized.includes('desanim') || normalized.includes('frustrad') || normalized.includes('me cuesta volver') || normalized.includes('he subido de peso')) {
        fields.estadoMotivacional = 'retomando';
    }

    if (normalized.includes('entrene pierna') || normalized.includes('hice pierna') || normalized.includes('rutina de pierna')) {
        fields.ultimaRutinaReportada = 'pierna';
        fields.adherenciaEntrenamiento = 'reporto entrenamiento';
    } else if (normalized.includes('entrene pecho') || normalized.includes('hice pecho') || normalized.includes('rutina de pecho')) {
        fields.ultimaRutinaReportada = 'pecho';
        fields.adherenciaEntrenamiento = 'reporto entrenamiento';
    } else if (normalized.includes('entrene espalda') || normalized.includes('hice espalda') || normalized.includes('rutina de espalda')) {
        fields.ultimaRutinaReportada = 'espalda';
        fields.adherenciaEntrenamiento = 'reporto entrenamiento';
    } else if (normalized.includes('entrene brazos') || normalized.includes('hice brazos') || normalized.includes('rutina de brazos')) {
        fields.ultimaRutinaReportada = 'brazos';
        fields.adherenciaEntrenamiento = 'reporto entrenamiento';
    } else if (normalized.includes('entrene hoy') || normalized.includes('hice mi rutina') || normalized.includes('termine mi rutina') || normalized.includes('complete mi rutina')) {
        fields.adherenciaEntrenamiento = 'buena';
    }

    if (normalized.includes('no fui esta semana') || normalized.includes('solo fui un dia') || normalized.includes('solo fui 1 dia') || normalized.includes('no pude ir al gym') || normalized.includes('falte al gym')) {
        fields.adherenciaEntrenamiento = 'baja';
        fields.riesgoAbandono = 'medio';
    } else if (normalized.includes('estoy yendo seguido') || normalized.includes('estoy constante') || normalized.includes('fui tres veces') || normalized.includes('fui 3 veces') || normalized.includes('entrene toda la semana')) {
        fields.adherenciaEntrenamiento = 'buena';
        fields.riesgoAbandono = 'bajo';
    }

    if (normalized.includes('no pude terminar') || normalized.includes('no termine la rutina') || normalized.includes('me cuesta la rutina') || normalized.includes('me cuesta terminar')) {
        fields.adherenciaEntrenamiento = 'parcial';
        fields.ejercicioDificil = text.trim();
    }

    if (normalized.includes('me cuesta sentadilla') || normalized.includes('sentadilla me cuesta') || normalized.includes('me cuesta press') || normalized.includes('me cuesta banca') || normalized.includes('me cuesta peso muerto') || normalized.includes('me cuesta remo') || normalized.includes('me cuesta dominada')) {
        fields.ejercicioDificil = text.trim();
    }

    if (normalized.includes('subi peso') || normalized.includes('subi de peso en') || normalized.includes('aumente peso') || normalized.includes('levante mas') || normalized.includes('hice mas repeticiones') || normalized.includes('mejoré') || normalized.includes('mejore')) {
        fields.progresoReportado = text.trim();
        fields.adherenciaEntrenamiento = 'progresando';
    }

    if (normalized.includes('dolor entrenando') || normalized.includes('me dolio entrenando') || normalized.includes('me duele cuando entreno') || normalized.includes('me molesta cuando hago') || normalized.includes('me dolio la rodilla') || normalized.includes('me dolio el hombro') || normalized.includes('me dolio la espalda')) {
        fields.molestiaEntrenando = text.trim();
    }

    if (normalized.includes('me cuesta la dieta') || normalized.includes('no puedo hacer la dieta') || normalized.includes('se me complica la dieta') || normalized.includes('me desordeno con la comida') || normalized.includes('como mal')) {
        fields.adherenciaNutricional = 'intermitente';
        fields.dificultadNutricional = text.trim();
    } else if (normalized.includes('estoy cumpliendo la dieta') || normalized.includes('voy bien con la dieta') || normalized.includes('sigo mi dieta') || normalized.includes('estoy comiendo bien')) {
        fields.adherenciaNutricional = 'buena';
    }

    if (normalized.includes('me salto el desayuno') || normalized.includes('no desayuno')) {
        fields.comidaProblematica = 'desayuno';
    } else if (normalized.includes('me salto el almuerzo') || normalized.includes('no almuerzo')) {
        fields.comidaProblematica = 'almuerzo';
    } else if (normalized.includes('me salto la cena') || normalized.includes('no ceno') || normalized.includes('ceno mal')) {
        fields.comidaProblematica = 'cena';
    } else if (normalized.includes('me cuesta la cena') || normalized.includes('en la noche como mal') || normalized.includes('de noche me da hambre')) {
        fields.comidaProblematica = 'noche';
    }

    if (normalized.includes('ansiedad') || normalized.includes('antojo') || normalized.includes('dulce') || normalized.includes('gaseosa') || normalized.includes('pan') || normalized.includes('comida chatarra')) {
        fields.patronRecaida = text.trim();
    }

    if (normalized.includes('como fuera') || normalized.includes('almuerzo en la calle') || normalized.includes('trabajo todo el dia') || normalized.includes('no tengo tiempo para cocinar')) {
        fields.dificultadNutricional = text.trim();
    }

    if (normalized.includes('no como pollo') || normalized.includes('no me gusta el pollo') || normalized.includes('no como pescado') || normalized.includes('no me gusta el pescado') || normalized.includes('soy vegetariano') || normalized.includes('soy vegetariana') || normalized.includes('intolerante') || normalized.includes('alergia')) {
        fields.preferenciasAlimentarias = text.trim();
    }

    return fields;
}

function classifyImportantInteraction(text: string) {
    const normalized = normalizeText(text);
    if (mentionsGroupClassContext(text) && mentionsPaymentIntent(text)) return 'Pidió pagar una clase grupal';
    if (mentionsGroupClassContext(text) && mentionsReservationIntent(text)) return 'Pidió reservar una clase grupal';
    if (normalized.includes('rutina')) return 'Pidió su rutina';
    if (normalized.includes('dieta')) return 'Pidió su dieta';
    if (normalized.includes('pagar') || normalized.includes('renovar')) return 'Mostró intención de pago o renovación';
    if (normalized.includes('no puedo ir') || normalized.includes('no podre ir')) return 'Avisó que no podrá asistir';
    return '';
}

async function saveClientMemory(db: any, adminInner: any, phone: string, messageText: string) {
    const snap = await findMember(db, phone);
    if (!snap || snap.empty) return null;

    const doc = snap.docs[0];
    const currentData = doc.data() || {};
    const currentProfile = currentData.trainingProfile || {};
    const extractedFields = extractTrainingProfileSignals(messageText);
    const importantInteraction = classifyImportantInteraction(messageText);
    const updatePayload: any = {};

    if (Object.keys(extractedFields).length > 0) {
        updatePayload.trainingProfile = {
            ...currentProfile,
            ...extractedFields,
            lastProfileUpdateAt: adminInner.firestore.FieldValue.serverTimestamp()
        };
    }

    if (importantInteraction) {
        updatePayload.assistantMemory = {
            ...(currentData.assistantMemory || {}),
            ultimaInteraccionClave: importantInteraction,
            ultimaInteraccionTexto: String(messageText || '').trim().slice(0, 220),
            updatedAt: adminInner.firestore.FieldValue.serverTimestamp()
        };
    }

    if (Object.keys(updatePayload).length > 0) {
        await doc.ref.set(updatePayload, { merge: true });
    }

    return {
        profile: {
            ...currentProfile,
            ...extractedFields
        },
        memory: {
            ...(currentData.assistantMemory || {}),
            ...(importantInteraction ? {
                ultimaInteraccionClave: importantInteraction,
                ultimaInteraccionTexto: String(messageText || '').trim().slice(0, 220)
            } : {})
        }
    };
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
                let amount = Number(args.amount) || 0;
                let resolvedPaymentType = args.paymentType || 'membership';

                if (resolvedPaymentType === 'class_booking') {
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
                const memSnap = await findMember(dbInner, args.phone);
                if (memSnap && !memSnap.empty) {
                    const memData = memSnap.docs[0].data();
                    const pendingDebt = Math.max(0, Number(memData.debt) || 0);
                    customerName = customerName || memData.name || 'Usuario';
                    dni = dni || memData.dni || '';
                    email = email || memData.email || 'cliente@megagym.pe';

                    // Settle the current membership before creating another period.
                    if (resolvedPaymentType === 'membership' && pendingDebt > 0) {
                        resolvedPaymentType = 'debt_payment';
                        planName = 'Pago de deuda';
                        amount = pendingDebt;
                    } else if (resolvedPaymentType === 'debt_payment') {
                        amount = pendingDebt;
                    }
                }

                if (resolvedPaymentType === 'debt_payment' && amount <= 0) {
                    return { error: 'El cliente no tiene deuda pendiente para pagar.' };
                }

                const response = await fetch('https://us-central1-fit-ia-megagym.cloudfunctions.net/generateCulqiLink', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: args.phone,
                        planName,
                        paymentType: resolvedPaymentType,
                        amount,
                        classId,
                        bookingDate,
                        customerName,
                        dni,
                        email
                    })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "Error connecting to payment service");
                return { url: data.url, paymentType: resolvedPaymentType, message: "Link de pago generado." };
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

                const allPayments = Array.isArray(member.payments) ? member.payments : [];
                const payments = allPayments.filter((payment: any) => Number(payment?.amount) > 0);
                const debt = Math.max(0, Number(member.debt) || 0);
                if (payments.length === 0) {
                    return {
                        error: debt > 0
                            ? `Aun no tienes voucher de pago porque todavia no se registro ningun pago. Tienes una deuda pendiente de S/ ${debt.toFixed(2)}.`
                            : "Aun no tienes voucher de pago porque todavia no se registro ningun pago."
                    };
                }
                const lastPayment = payments[payments.length - 1];
                const lastPaymentDate = getPaymentDateString(lastPayment);
                const recentPayments = payments.filter((payment: any) => getPaymentDateString(payment) === lastPaymentDate);
                const hasFutureAdvanceInGroup = recentPayments.some((payment: any) => payment?.type === 'future_renewal_advance');
                const totalReceived = recentPayments.reduce((sum: number, payment: any) => sum + (Number(payment.amount) || 0), 0);
                const futureDebt = Math.max(0, Number(member.futureDebt) || 0);

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
                    `   COMPROBANTE DE PAGO`,
                    `━━━━━━━━━━━━━━━━━━━━━`,
                    `👤 Cliente: ${(member.name || 'Cliente').toUpperCase()}`,
                    `📅 Fecha: ${lastPaymentDate || 'N/A'}${getPaymentTimeString(lastPayment) ? ` ${getPaymentTimeString(lastPayment)}` : ''}`,
                ];

                recentPayments.forEach((payment: any) => {
                    const label = getPaymentLabel(payment, hasFutureAdvanceInGroup);
                    const amount = Number(payment.amount) || 0;
                    const method = payment.method || (payment.orderId || payment.chargeId ? 'Culqi' : 'Efectivo');
                    lines.push(`💰 ${label}: S/ ${amount.toFixed(2)} (${method})`);
                });

                lines.push(`✅ Total recibido: S/ ${totalReceived.toFixed(2)}`);
                lines.push(`📋 Plan: ${member.plan || 'N/A'}`);
                lines.push(`📅 Inicio: ${startDateStr || 'N/A'}`);
                lines.push(`📅 Vigencia hasta: ${endDateStr || 'N/A'}`);
                lines.push(`✅ Deuda actual: S/ ${debt.toFixed(2)}`);

                if (debt > 0) {
                    lines.push(`⚠️ Saldo pendiente: S/ ${debt.toFixed(2)}`);
                }
                if (futureDebt > 0) {
                    lines.push(`🕒 Saldo futuro: S/ ${futureDebt.toFixed(2)} desde ${member.futureDebtStartDate || startDateStr || 'N/A'}`);
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
                const payments = (Array.isArray(member.payments) ? member.payments : [])
                    .filter((payment: any) => Number(payment?.amount) > 0);
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

        case 'generar_link_voz':
            try {
                const { signVoiceToken } = require('../tools/voiceLink');
                const secret = process.env.VOICE_LINK_SECRET;
                if (!secret) {
                    console.error('❌ generar_link_voz: VOICE_LINK_SECRET no está configurado.');
                    return { eligible: false, reason: 'not_configured', message: 'La asesoría por voz aún no está disponible.' };
                }

                const memSnap = await findMember(dbInner, args.phone);
                if (!memSnap || memSnap.empty) {
                    return { eligible: false, reason: 'no_member', message: 'No encontré tu membresía con este número.' };
                }
                const memberData = memSnap.docs[0].data();

                // Reutiliza la misma lógica de estado del bot: vencido >= 15 días o inactivo
                // bloquea el acceso personalizado (misma frontera que las rutinas/dieta).
                let daysOverdueLocal: number | null = null;
                if (memberData.endDate) {
                    const end = new Date(memberData.endDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (diff < 0) daysOverdueLocal = Math.abs(diff);
                }
                const eligible = memberData.status !== 'inactive'
                    && (daysOverdueLocal === null || daysOverdueLocal < 15);
                if (!eligible) {
                    return {
                        eligible: false,
                        reason: 'inactive_or_overdue',
                        message: 'Tu membresía no está activa ahora. Te ayudo a renovar y en cuanto se active podrás usar la asesoría por voz.'
                    };
                }

                // El teléfono guardado en members (formato +51XXXXXXXXX) es la fuente de verdad
                // para que getVoiceContext lo vuelva a encontrar en la Fase 2.
                const normalizedPhone = memberData.phone || String(args.phone || '').replace(/^whatsapp:/, '').replace(/\s/g, '');
                const token = signVoiceToken({ phone: normalizedPhone }, secret, 15 * 60);
                const base = (process.env.VOICE_PAGE_URL || 'https://REEMPLAZAR-DOMINIO-VOZ').replace(/\/+$/, '');
                const link = `${base}/?token=${token}`;

                return { eligible: true, link, expiresInMinutes: 15 };
            } catch (e: any) {
                console.error('❌ Error en generar_link_voz:', e);
                return { error: e.message };
            }

        default:
            return { error: "Tool not found" };
    }
}

export async function processMessage(db: any, phone: string, messageText: string) {
    const OpenAI = require('openai');
    const adminInner = require('firebase-admin');
    if (!adminInner.apps.length) adminInner.initializeApp();
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
                description: "Generate a payment link (Culqi) for a membership, a pending debt, or a paid group class. Use paymentType='debt_payment' when the customer wants to pay their debt or pending balance. Use paymentType='membership' for renewals and paymentType='class_booking' only for paid group classes after the user has chosen the schedule. Do NOT use this for gym machine day passes.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "Customer's phone number exactly as provided in the context." },
                        planName: { type: "string", description: "Name of the plan (e.g. '1 mes', '2 meses', '3 meses')" },
                        paymentType: { type: "string", description: "Use 'membership', 'debt_payment', or 'class_booking'." },
                        amount: { type: "number", description: "Amount in soles. Optional; for debt_payment the system will use the registered pending debt." },
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
                description: "Guardar en el perfil del cliente la información que él mismo te proporcionó sobre entrenamiento, horarios, constancia o nutrición. Úsalo cuando el cliente comparta datos útiles para personalizar el acompañamiento.",
                parameters: {
                    type: "object",
                    properties: {
                        phone: { type: "string", description: "El número de teléfono del usuario." },
                        fields: {
                            type: "object",
                            description: "Campos a guardar. Puede incluir: objetivo, nivel, diasSemana, limitaciones, horarioHabitual, preferenciaClases, constancia, estadoMotivacional, ultimaRutinaReportada, adherenciaEntrenamiento, ejercicioDificil, progresoReportado, molestiaEntrenando, riesgoAbandono, adherenciaNutricional, dificultadNutricional, comidaProblematica, patronRecaida, preferenciasAlimentarias",
                            properties: {
                                objetivo: { type: "string" },
                                nivel: { type: "string" },
                                diasSemana: { type: "number" },
                                limitaciones: { type: "string" },
                                horarioHabitual: { type: "string" },
                                preferenciaClases: { type: "string" },
                                constancia: { type: "string" },
                                estadoMotivacional: { type: "string" },
                                ultimaRutinaReportada: { type: "string" },
                                adherenciaEntrenamiento: { type: "string" },
                                ejercicioDificil: { type: "string" },
                                progresoReportado: { type: "string" },
                                molestiaEntrenando: { type: "string" },
                                riesgoAbandono: { type: "string" },
                                adherenciaNutricional: { type: "string" },
                                dificultadNutricional: { type: "string" },
                                comidaProblematica: { type: "string" },
                                patronRecaida: { type: "string" },
                                preferenciasAlimentarias: { type: "string" }
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
        },
        {
            type: "function",
            function: {
                name: "generar_link_voz",
                description: "Generar un enlace para que el cliente hable por VOZ con Sofía (asesoría hablada, entrenar conversando por voz). Úsalo cuando un miembro pida hablar por voz, una asesoría por voz o conversar por voz contigo. Devuelve un enlace personalizado que debes enviarle. Si el resultado indica que no es elegible, ofrécele renovar con calidez.",
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
    let memoryContext = "Sin memoria conversacional relevante todavía.";
    let profileQuestion: string | null = null;
    let daysUntilExpiry: number | null = null;
    let daysOverdue: number | null = null;  // días transcurridos desde el vencimiento (positivo = vencido)
    let clientFirstName = '';
    const savedMemory = await saveClientMemory(db, adminInner, phone, messageText);
    if (savedMemory?.memory?.ultimaInteraccionClave) {
        memoryContext = `Ultima interaccion clave: ${savedMemory.memory.ultimaInteraccionClave}. Ultimo detalle relevante: ${savedMemory.memory.ultimaInteraccionTexto || 'N/A'}.`;
    }

    if (memberDoc && !memberDoc.empty) {
        const data = memberDoc.docs[0].data();
        clientFirstName = (data.name || '').split(' ')[0];
        const persistedMemory = data.assistantMemory || {};
        const voiceSummary = persistedMemory.ultimaSesionVozResumen || persistedMemory.resumenConversacional || '';
        if (voiceSummary) {
            const summaryText = String(voiceSummary).slice(0, 700);
            const voiceContext = `Ultima interaccion clave: ${persistedMemory.ultimaInteraccionClave || 'Conversación reciente por voz'}. Ultimo canal: ${persistedMemory.ultimoCanal || 'voz'}. Resumen de lo hablado: ${summaryText}.`;
            memoryContext = memoryContext.startsWith('Sin memoria') ? voiceContext : `${memoryContext} ${voiceContext}`;
        }

        // Perfil de entrenamiento
        const profile = savedMemory?.profile || data.trainingProfile || {};
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
        const trainingFollowupStr = `Última rutina reportada: ${profile.ultimaRutinaReportada || 'N/A'}. Adherencia entrenamiento: ${profile.adherenciaEntrenamiento || 'N/A'}. Ejercicio difícil: ${profile.ejercicioDificil || 'N/A'}. Progreso reportado: ${profile.progresoReportado || 'N/A'}. Molestia entrenando: ${profile.molestiaEntrenando || 'N/A'}. Riesgo abandono: ${profile.riesgoAbandono || 'N/A'}.`;
        const nutritionProfileStr = `Adherencia: ${profile.adherenciaNutricional || 'N/A'}. Dificultad: ${profile.dificultadNutricional || 'N/A'}. Comida problemática: ${profile.comidaProblematica || 'N/A'}. Patrón de recaída: ${profile.patronRecaida || 'N/A'}. Preferencias alimentarias: ${profile.preferenciasAlimentarias || 'N/A'}.`;

        // Determinar qué pregunta de perfil hacer (solo miembros activos, no vencidos)
        if (data.status === 'active' && profileStep < 3 && !daysOverdue) {
            if (!profile.objetivo) profileQuestion = `Por cierto${clientFirstName ? ` ${clientFirstName}` : ''}, ¿cuál es tu objetivo principal en el gym? (bajar de peso, ganar músculo, tonificar...) Eso me ayudará a darte recomendaciones más precisas. 😉`;
            else if (!profile.nivel) profileQuestion = `¿Te consideras principiante, intermedio o avanzado en el entrenamiento? 💪`;
            else if (!profile.diasSemana) profileQuestion = `¿Cuántos días a la semana puedes venir a entrenar para armar algo realista? 🔥`;
            else if (!profile.horarioHabitual) profileQuestion = `¿Sueles entrenar más en la mañana o en la noche? Así te acompaño mejor según tu ritmo. 😉`;
            else if (!profile.limitaciones) profileQuestion = `¿Tienes alguna molestia o lesión que deba considerar para cuidarte mejor al recomendarte cosas?`;
        }

        const hasDiet = data.diet ? 'Sí (asignada)' : 'No (sin asignar)';
        const currentDebt = Math.max(0, Number(data.debt) || 0);
        customerContext = `CLIENTE REGISTRADO: Nombre: ${data.name || 'N/A'}. DNI: ${data.dni || 'N/A'}. Email: ${data.email || 'N/A'}. Plan: ${data.plan || 'sin plan'}. Estado: ${data.status || 'prospect'}. Vence: ${data.endDate || 'N/A'}. Deuda pendiente: S/ ${currentDebt.toFixed(2)}. Días vencido: ${daysOverdue !== null ? daysOverdue : 'N/A (activo)'}. Dieta Asignada: ${hasDiet}. Perfil Entrenamiento: ${profileStr}. Horario habitual: ${profile.horarioHabitual || 'N/A'}. Preferencia: ${profile.preferenciaClases || 'N/A'}. Constancia: ${profile.constancia || 'N/A'}. Estado motivacional: ${profile.estadoMotivacional || 'N/A'}. Seguimiento entrenamiento: ${trainingFollowupStr}. Perfil nutricional: ${nutritionProfileStr}`;
    }

    if (memberDoc && !memberDoc.empty && daysOverdue !== null && mentionsDeferredRenewalIntent(messageText)) {
        await memberDoc.docs[0].ref.set({
            assistantMemory: {
                ...(memberDoc.docs[0].data().assistantMemory || {}),
                renewalIntent: 'continue_pay_later',
                renewalIntentText: String(messageText || '').trim().slice(0, 220),
                renewalIntentAt: adminInner.firestore.FieldValue.serverTimestamp(),
                updatedAt: adminInner.firestore.FieldValue.serverTimestamp()
            }
        }, { merge: true });

        return `Perfecto${clientFirstName ? ` ${clientFirstName}` : ''} 😊 Lo tomo en cuenta. Te recuerdo en unos días para que puedas regularizar tu membresía con calma.`;
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
    const recentClassContext = [messageText, ...historyTexts.slice(-4)].some((text) => mentionsGroupClassContext(text));
    const allowsClassBookingFromCurrentMessage = mentionsGroupClassContext(messageText)
        || ((mentionsFollowupForPendingLink(messageText) || !!extractDesiredTime(messageText)) && recentClassContext);

    if (mentionsWrongLinkComplaint(messageText)) {
        return `Tienes razon${clientFirstName ? ` ${clientFirstName}` : ''}, disculpa. Me quedé con el tema anterior de la clase y no debí enviarte ese link. Dime qué necesitas ahora y te respondo directo.`;
    }

    if (mentionsMembershipStatusIntent(messageText)) {
        if (!memberDoc || memberDoc.empty) {
            return 'No encuentro tu membresia con este numero. Escribeme desde el WhatsApp registrado o consulta en recepcion para revisarlo.';
        }

        const memberData = memberDoc.docs[0].data();
        const currentDebt = Math.max(0, Number(memberData.debt) || 0);
        if (daysOverdue !== null && daysOverdue > 0) {
            return `No${clientFirstName ? ` ${clientFirstName}` : ''}, tu membresia no esta activa. Vencio el ${memberData.endDate || 'fecha no registrada'}${daysOverdue ? `, hace ${daysOverdue} dia(s)` : ''}.${currentDebt > 0 ? ` Ademas tienes una deuda pendiente de S/ ${currentDebt.toFixed(2)}.` : ''}`;
        }

        return `Si${clientFirstName ? ` ${clientFirstName}` : ''}, tu membresia esta activa. Vence el ${memberData.endDate || 'fecha no registrada'}.${currentDebt > 0 ? ` Tienes una deuda pendiente de S/ ${currentDebt.toFixed(2)}.` : ''}`;
    }

    if (mentionsGymHoursIntent(messageText) && !mentionsGroupClassContext(messageText)) {
        return `El gimnasio abre de lunes a viernes de 6:00 AM a 10:00 PM, sabados de 6:00 AM a 6:00 PM y domingos de 6:00 AM a 12:00 PM${clientFirstName ? `, ${clientFirstName}` : ''}.`;
    }

    if (mentionsVoucherIntent(messageText)) {
        const voucherResult = await executeTool('send_payment_voucher', { phone });
        if (voucherResult?.voucher) {
            return voucherResult.voucher;
        }
        if (voucherResult?.error) {
            return voucherResult.error;
        }
        return 'No pude generar tu voucher en este momento. Si acabas de pagar, espera un instante y vuelve a pedirmelo, por favor.';
    }

    if (!mentionsMachineDayPass(messageText) && mentionsDebtPaymentIntent(messageText)) {
        if (!memberDoc || memberDoc.empty) {
            return 'Para generarte un link de deuda necesito ubicar tu registro primero. Escríbeme con el número que usaste al inscribirte o consulta en recepción, por favor.';
        }

        const memberData = memberDoc.docs[0].data();
        const debt = Math.max(0, Number(memberData.debt) || 0);
        if (debt <= 0) {
            return `No tienes deuda pendiente${clientFirstName ? ` ${clientFirstName}` : ''}. Estás al día en MegaGym 😊`;
        }

        const paymentLink = await executeTool('generate_payment_link', {
            phone,
            planName: 'Pago de deuda',
            paymentType: 'debt_payment'
        });

        if (paymentLink?.url) {
            return `Listo${clientFirstName ? ` ${clientFirstName}` : ''}. Aqui tienes tu link para pagar tu deuda de S/ ${debt.toFixed(2)} por Culqi: ${paymentLink.url}`;
        }

        return 'Estoy teniendo un problema para generar el link de tu deuda en este momento. Intenta nuevamente en un instante, por favor.';
    }

    if (!mentionsMachineDayPass(messageText) && allowsClassBookingFromCurrentMessage && (mentionsPaymentIntent(messageText) || (assistantPendingLink && mentionsFollowupForPendingLink(messageText)) || mentionsReservationIntent(messageText) || !!extractDesiredTime(messageText))) {
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
        * 1 Mes: S/ 70
        * 2 Meses: S/ 120
        * 3 Meses: S/ 150 (promocion)
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
    - Memoria Ãºtil del cliente: ${memoryContext}

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
       - Si el cliente quiere pagar su deuda, saldo pendiente o monto que debe, usa generate_payment_link con paymentType='debt_payment'. No lo renueves con ese link; ese link solo cancela o reduce deuda.
       - Si el cliente quiere pagar o renovar su membresía, usa generate_payment_link con paymentType='membership'.
       - Si el cliente quiere reservar o pagar una clase grupal (aeróbicos, clase grupal, FULLBODY), usa get_available_classes para ofrecer solo los horarios reales. Primero haz que elija uno. Luego usa generate_payment_link con paymentType='class_booking', classId y bookingDate. Explica que la reserva queda confirmada cuando Culqi apruebe el pago de S/ 6.
       - NO uses book_class directamente para una clase grupal pagada. La reserva se confirma después del pago.
       - Si el cliente pide clase libre, pase diario, usar máquinas por un día o gimnasio por día, NO generes link. Indica que ese pago se realiza personalmente en recepción.
       - Cuando generes link de membresía, responde con entusiasmo como antes. Cuando generes link de clase grupal, deja claro que es sólo para clases grupales y no para clase libre de máquinas.
       - Si el cliente todavía no te dijo día u hora de la clase grupal, NO generes el link todavía. Primero aclara si quiere 8:30 AM u 8:00 PM.
    6. Si pide su rutina, usa 'get_student_routine' (solo si daysOverdue < 20). Si pide su dieta, usa 'get_student_diet' (solo si daysOverdue < 20).
    7. Si responde a tus preguntas de perfil (objetivo, nivel, horario, limitaciones, etc.), comparte datos sobre su rutina (si entrenó, qué le cuesta, progreso, dolor, faltas) o comparte datos de nutrición útiles (comida que le cuesta, ansiedad, antojos, adherencia, preferencias), usa 'update_member_profile' inmediatamente.
    8. Usa la memoria del cliente para responder de forma personal, pero natural. No enumeres su perfil como expediente ni digas "recuerdo que...". Úsala con tacto.
    9. Completa el perfil poco a poco, nunca como interrogatorio. Solo pregunta un dato faltante cuando ayude de verdad a acompañarlo mejor.
    10. SEGUIMIENTO DE ENTRENAMIENTO LIGERO: Cuando el cliente hable de su rutina, cumplimiento, ejercicio difícil, progreso, dolor o faltas, guarda esa señal y úsala para explicar mejor la rutina. Ayuda a entender ejercicios con indicaciones simples, pero deriva a entrenador presencial si menciona dolor fuerte, lesión o algo que requiera corrección técnica en persona.
    11. SEGUIMIENTO NUTRICIONAL LIGERO: Cuando el cliente hable de dieta, antojos, ansiedad, comidas que se salta o dificultades para cumplir, guarda esa señal y responde con una recomendación corta y aplicable. Si ya tiene una dificultad nutricional registrada, adapta la respuesta a ese patrón.
    12. ENTREGA DE DIETA (NIVEL EXPERTO): Cuando uses 'get_student_diet', NUNCA envíes todo el plan de golpe. Sigue esta lógica exacta:
       a) Usa el día actual (${currentDay}) para identificar qué grupo de días del plan corresponde HOY. Regla general para planes semanales de 3 grupos: Lunes/Martes/Miércoles → Días 1-3, Jueves/Viernes → Días 4-5, Sábado/Domingo → Días 6-7.
       b) Menciona proactivamente a qué fase/grupo pertenece hoy y su nombre de la dieta (ej. "Alta Rendimiento", "Variación Metabólica", "Bajo en Carbs").
       c) Pregúntale qué comida quiere ver ahora (Desayuno, Almuerzo o Cena) o si prefiere ver también la suplementación.
       d) EJEMPLO de respuesta ideal: "¡Hola Robert! 💪 Hoy es ${currentDay}, que corresponde a tu fase de *Variación Metabólica* (Días 4-5). ¿Quieres ver tu almuerzo de hoy o la suplementación pre-entreno? 🍗"
       e) Entrega las porciones de forma interactiva y con emojis de alimentos (🍗🥑🍳🥩).
    14. ASESORÍA POR VOZ: Cuando un miembro te pida hablar por voz, una asesoría hablada o conversar/entrenar por voz contigo, usa 'generar_link_voz' con su teléfono y envíale con entusiasmo el enlace que devuelve para que hable por voz conmigo. Al enviar el enlace, dile con naturalidad que para que el micrófono funcione bien lo abra en su navegador (Chrome o Safari). Si el resultado indica que no es elegible (membresía vencida o inactiva), acompáñalo con calidez e invítalo a renovar, contándole que en cuanto active su membresía podrá usar la asesoría por voz.
    13. ESTILO DE RESPUESTA - REGLAS DE ORO:
       - SIEMPRE responde como si fueras una amiga mandando un WhatsApp, no como un blog ni un manual.
       - NUNCA uses negritas (*texto*) para subtítulos ni títulos dentro de la respuesta. Las negritas solo están permitidas para resaltar UNA palabra clave importante, no para crear estructura tipo artículo.
       - NUNCA uses listas numeradas. Si necesitas listar cosas, usa máximo 3 ítems con emojis como viñetas.
       - Para preguntas técnicas de entrenamiento (técnica, ejercicios, conceptos de fitness, nutrición): responde en máximo 2-3 oraciones con lo esencial. Siempre termina ofreciendo profundizar: "¿Quieres saber [opción A] o [opción B]? 🔥" en lugar de soltar todo de golpe.
       - Para el resto de mensajes: máx 3 oraciones, emojis (💪, 😊, 🔥) y termina con una pregunta motivadora.${profileQuestionInstruction}`;

    const chatModel = selectChatModel(messageText);
    console.log(`Sofia chat model selected: ${chatModel}`);

    const response = await openai.chat.completions.create({
        model: chatModel,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        tools: tools as any
    });

    const responseMessage = response.choices[0].message;

    if (responseMessage.tool_calls) {
        const toolMessages: any[] = [...messages, responseMessage];
        let directToolReply = '';
        for (const toolCall of responseMessage.tool_calls) {
            const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
            if (toolCall.function.name === 'generate_payment_link' && toolArgs.paymentType === 'class_booking' && !allowsClassBookingFromCurrentMessage) {
                toolMessages.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    content: JSON.stringify({
                        error: 'No generar link de clase: el mensaje actual no pidio reservar o pagar clase grupal.'
                    })
                });
                continue;
            }
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
                const resolvedPaymentType = functionResult.paymentType || toolArgs.paymentType;
                if (resolvedPaymentType === 'class_booking') {
                    const scheduleLabel = formatClassTimeLabel(String(toolArgs.desiredTime || extractDesiredTime(String(toolArgs.planName || ''))));
                    directToolReply = `Listo${clientFirstName ? ` ${clientFirstName}` : ''}. Aqui tienes tu link real para reservar tu clase grupal${scheduleLabel ? ` a las ${scheduleLabel}` : ''}. Son S/ 6 y puedes pagar por Yape o tarjeta en Culqi: ${functionResult.url}`;
                } else if (resolvedPaymentType === 'debt_payment') {
                    const debt = memberDoc && !memberDoc.empty ? Math.max(0, Number(memberDoc.docs[0].data().debt) || 0) : 0;
                    directToolReply = `Listo${clientFirstName ? ` ${clientFirstName}` : ''}. Aqui tienes tu link real para pagar tu deuda${debt > 0 ? ` de S/ ${debt.toFixed(2)}` : ''}: ${functionResult.url}`;
                } else {
                    directToolReply = `Listo${clientFirstName ? ` ${clientFirstName}` : ''}. Aqui tienes tu link real de pago para la membresia: ${functionResult.url}`;
                }
            } else if (toolCall.function.name === 'send_payment_voucher' && functionResult?.voucher) {
                directToolReply = functionResult.voucher;
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
            model: chatModel,
            messages: [
                { role: 'system', content: systemPrompt },
                ...toolMessages
            ]
        });

        return sanitizeAssistantReply(secondResponse.choices[0].message.content);
    }

    return sanitizeAssistantReply(responseMessage.content);
}
