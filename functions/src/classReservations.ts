import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

type Data = Record<string, any>;
type Context = functions.https.CallableContext;
const DAY = 86400000;
const MAX_CLASS_CAPACITY = 21;
const ADMINS = ['admin@fitia.com', 'mysterrpj@gmail.com', 'prueba@test.com'];
const messages: Record<string, string> = {
    'Use a valid Peruvian mobile phone.': 'Ingresa un celular peruano válido.',
    'Invalid calendar date.': 'La fecha no existe en el calendario.',
    'Date must be within the next 30 days.': 'Elige una fecha entre hoy y los próximos 30 días.',
    'This class session is unavailable.': 'Esta sesión no está disponible. Revisa el día y horario de la clase.',
    'Public booking is not configured.': 'Esta clase aún no tiene habilitadas las reservas públicas y sus instrucciones de pago.',
    'Verified administrator access required.': 'Se requiere una cuenta administradora con correo verificado.',
    'Too many requests. Try again later.': 'Has realizado demasiadas solicitudes. Intenta más tarde.',
    'Class history requires administrative archival.': 'El historial de esta clase requiere revisión administrativa.',
    'Schedule requires administrative review.': 'La disponibilidad de clases está en revisión. Consulta en recepción.',
    'Class not found.': 'No se encontró la clase.',
    'Select Yape or Plin.': 'Selecciona Yape o Plin.',
    'Request ID already used with another payload.': 'Esta solicitud ya fue utilizada con otros datos.',
    'This request has already been processed. Check your existing reservation.': 'Esta solicitud ya fue procesada. Consulta tu reserva existente.',
    'The class has already started.': 'La clase ya comenzó.',
    'Seat exceeds capacity.': 'La ubicación supera la capacidad de la clase.',
    'Member not found.': 'No se encontró la alumna.',
    'Phone requires administrative review.': 'Este teléfono requiere revisión administrativa.',
    'This person already has a reservation.': 'Esta persona ya tiene una reserva para esta clase y fecha.',
    'Seat unavailable.': 'La ubicación ya no está disponible. Elige otra.',
    'Payment operation already submitted.': 'Este código de operación ya fue registrado.',
    'Invalid reservation credentials.': 'El enlace o token de la reserva no es válido.',
    'Only pending reservations may be cancelled before class starts.': 'Solo puedes cancelar reservas pendientes antes del inicio de la clase.',
    'Reservation not found.': 'No se encontró la reserva.',
    'Cancelled reservations cannot be changed.': 'No se puede modificar una reserva cancelada.',
    'Attendance requires a confirmed reservation and checkedIn boolean.': 'La asistencia requiere una reserva confirmada y un estado válido.',
    'Invalid collector name.': 'Ingresa un nombre de cobrador válido (2 a 100 caracteres).',
    'sameNumber must be a boolean.': 'Indica correctamente si ambos números son iguales.',
    'A six-digit PIN is required.': 'Ingresa un PIN de exactamente 6 dígitos.',
    'Invalid verification credentials.': 'El enlace de verificación no es válido.',
    'The verification link has expired.': 'El enlace de verificación venció.',
    'This reservation cannot be confirmed.': 'Esta reserva no se puede confirmar.',
    'Incorrect payment PIN.': 'El PIN de pago es incorrecto.',
    'Too many incorrect PIN attempts.': 'Se alcanzó el máximo de 5 intentos de PIN.',
    'Payment verification is not configured.': 'La verificación de pago no está configurada para esta reserva.',
    'Public class payments require Yape.': 'Las reservas públicas solo aceptan pagos por Yape.',
    'Payment quote changed or expired.': 'Los datos de pago cambiaron o vencieron. Vuelve a elegir el lugar.',
    'Payment PIN is temporarily locked.': 'El PIN de pago está temporalmente bloqueado por demasiados intentos. Intenta más tarde.',
};
const fail = (code: functions.https.FunctionsErrorCode, message: string): never => {
    const translated = messages[message] || (message.startsWith('Invalid ') ? `Dato inválido: ${message.slice(8)}` : message);
    throw new functions.https.HttpsError(code, translated);
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const db = () => { if (!admin.apps.length) admin.initializeApp(); return admin.firestore(); };
const stamp = () => admin.firestore.FieldValue.serverTimestamp();
function text(value: unknown, field: string, min = 1, max = 120): string {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\x00-\x1f]/.test(value)) {
        return fail('invalid-argument', `Invalid ${field}.`);
    }
    return value.trim();
}
function id(value: unknown, field: string): string {
    const result = text(value, field, 1, field === 'bookingId' ? 240 : 180);
    if (!/^[a-zA-Z0-9_-]+$/.test(result)) return fail('invalid-argument', `Invalid ${field}.`);
    return result;
}
export function normalizeReservationPhone(value: unknown): string {
    const raw = text(value, 'phone', 9, 24);
    if (!/^\+?[\d ()-]+$/.test(raw)) return fail('invalid-argument', 'Invalid phone.');
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 9) digits = `51${digits}`;
    if (!/^519\d{8}$/.test(digits)) return fail('invalid-argument', 'Use a valid Peruvian mobile phone.');
    return `+${digits}`;
}
export function hashClassPaymentPin(pin: unknown, salt = randomBytes(16).toString('hex')): {pinHash: string; pinSalt: string} {
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return fail('invalid-argument', 'A six-digit PIN is required.');
    if (!/^[a-f0-9]{32,128}$/.test(salt)) return fail('invalid-argument', 'A six-digit PIN is required.');
    return { pinHash: scryptSync(pin, salt, 32).toString('hex'), pinSalt: salt };
}
export function verifyClassPaymentPin(pin: unknown, pinSalt: unknown, pinHash: unknown): boolean {
    if (typeof pin !== 'string' || !/^\d{6}$/.test(pin) || typeof pinSalt !== 'string' ||
        !/^[a-f0-9]{32,128}$/.test(pinSalt) || typeof pinHash !== 'string' || !/^[a-f0-9]{64}$/.test(pinHash)) return false;
    const candidate = scryptSync(pin, pinSalt, 32);
    return timingSafeEqual(candidate, Buffer.from(pinHash, 'hex'));
}
export function validateClassPaymentSettings(input: Data, existing: Data = {}): Data {
    let collectorName: string;
    try { collectorName = text(input?.collectorName, 'collectorName', 2, 100); }
    catch { return fail('invalid-argument', 'Invalid collector name.'); }
    const yapePhone = normalizeReservationPhone(input?.yapePhone);
    if (typeof input?.sameNumber !== 'boolean') return fail('invalid-argument', 'sameNumber must be a boolean.');
    const sameNumber = input.sameNumber;
    const whatsappPhone = sameNumber ? yapePhone : normalizeReservationPhone(input?.whatsappPhone);
    const hasExistingPin = typeof existing.pinHash === 'string' && /^[a-f0-9]{64}$/.test(existing.pinHash) &&
        typeof existing.pinSalt === 'string' && /^[a-f0-9]{32,128}$/.test(existing.pinSalt);
    let pinFields: Data;
    if (input?.pin === undefined || input?.pin === null || input?.pin === '') {
        if (!hasExistingPin) return fail('invalid-argument', 'A six-digit PIN is required.');
        pinFields = { pinHash: existing.pinHash, pinSalt: existing.pinSalt };
    } else {
        pinFields = hashClassPaymentPin(input.pin);
    }
    return { collectorName, yapePhone, whatsappPhone, sameNumber, ...pinFields };
}
export function isClassPaymentConfigured(value: Data | undefined): boolean {
    return !!value && typeof value.collectorName === 'string' && value.collectorName.trim().length >= 2 &&
        typeof value.sameNumber === 'boolean' && /^\+519\d{8}$/.test(value.yapePhone || '') && /^\+519\d{8}$/.test(value.whatsappPhone || '') &&
        typeof value.pinHash === 'string' && /^[a-f0-9]{64}$/.test(value.pinHash) &&
        typeof value.pinSalt === 'string' && /^[a-f0-9]{32,128}$/.test(value.pinSalt);
}
export function classPaymentSettingsGeneration(value: Data): string {
    return typeof value.settingsGeneration === 'string' && /^[a-f0-9]{32}$/.test(value.settingsGeneration)
        ? value.settingsGeneration : hash(`legacy:${value.pinSalt || ''}:${value.pinHash || ''}`);
}
export function nextClassPaymentPinFailure(value: Data | undefined, now = Date.now(), limit = 25) {
    const inWindow = !!value && typeof value.windowStart === 'number' && now - value.windowStart >= 0 && now - value.windowStart < 3600000;
    const count = inWindow ? Math.max(0, Number(value!.count) || 0) : 0;
    return { allowed: count < limit, windowStart: inWindow ? value!.windowStart : now, count: count < limit ? count + 1 : count };
}
function safeClassPaymentSettings(value: Data | undefined) {
    const configured = isClassPaymentConfigured(value);
    return { configured, collectorName: configured ? value!.collectorName : '', yapePhone: configured ? value!.yapePhone : '',
        whatsappPhone: configured ? value!.whatsappPhone : '', sameNumber: configured ? value!.sameNumber === true : false,
        hasPin: !!value && typeof value.pinHash === 'string' && /^[a-f0-9]{64}$/.test(value.pinHash) &&
            typeof value.pinSalt === 'string' && /^[a-f0-9]{32,128}$/.test(value.pinSalt) };
}
function paymentInstructions(value: Data) {
    return `Yape a ${value.collectorName}: ${String(value.yapePhone).slice(3)}`;
}
function storedMillis(value: any): number {
    if (value?.toMillis instanceof Function) return value.toMillis();
    if (value instanceof Date) return value.getTime();
    return typeof value === 'number' ? value : NaN;
}
export function validClassPaymentQuote(quote: Data, token: unknown, expected: {classId: string; date: string; spotNumber: number}, now = Date.now()): boolean {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || typeof quote.quoteTokenHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(quote.quoteTokenHash) || quote.classId !== expected.classId || quote.date !== expected.date ||
        quote.spotNumber !== expected.spotNumber || quote.consumedBy || storedMillis(quote.expiresAt) <= now ||
        typeof quote.amount !== 'number' || !Number.isFinite(quote.amount) || quote.amount < 0 || quote.amount > 100000 ||
        typeof quote.paymentInstructions !== 'string' || !quote.paymentInstructions.trim() || quote.paymentInstructions.length > 2000) return false;
    return timingSafeEqual(Buffer.from(hash(token), 'hex'), Buffer.from(quote.quoteTokenHash, 'hex'));
}
export function classPaymentQuoteHasVerifier(quote: Data | undefined): boolean {
    return !!quote && typeof quote.collectorName === 'string' && quote.collectorName.trim().length >= 2 &&
        /^\+519\d{8}$/.test(quote.yapePhone || '') && /^\+519\d{8}$/.test(quote.whatsappPhone || '') &&
        /^[a-f0-9]{64}$/.test(quote.paymentPinHash || '') && /^[a-f0-9]{32,128}$/.test(quote.paymentPinSalt || '') &&
        /^[a-f0-9]{32,64}$/.test(quote.paymentSettingsGeneration || '');
}
export function validateReservationDate(value: unknown, now = Date.now()): string {
    const date = text(value, 'date', 10, 10);
    const parsed = new Date(`${date}T00:00:00-05:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) ||
        new Date(parsed.getTime() - 5 * 3600000).toISOString().slice(0, 10) !== date) {
        return fail('invalid-argument', 'Invalid calendar date.');
    }
    const today = new Date(now - 5 * 3600000).toISOString().slice(0, 10);
    const distance = (parsed.getTime() - new Date(`${today}T00:00:00-05:00`).getTime()) / DAY;
    if (distance < 0 || distance > 30) return fail('invalid-argument', 'Date must be within the next 30 days.');
    return date;
}
export function reservationSession(classData: Data, date: string, publicOnly: boolean, now = Date.now()) {
    const capacity = classData.capacity;
    const day = classData.dayIndex ?? classData.weekday ?? (Number(classData.day) - 1);
    const weekday = (new Date(`${date}T12:00:00-05:00`).getUTCDay() + 6) % 7;
    if (classData.status !== 'active' || !Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CLASS_CAPACITY ||
        !Number.isInteger(day) || day !== weekday || !/^([01]\d|2[0-3]):[0-5]\d$/.test(classData.time || '')) {
        return fail('failed-precondition', 'This class session is unavailable.');
    }
    if (publicOnly && (classData.publicBookingEnabled !== true || typeof classData.paymentInstructions !== 'string' ||
        !classData.paymentInstructions.trim() || classData.paymentInstructions.length > 2000 ||
        typeof classData.price !== 'number' || !Number.isFinite(classData.price) || classData.price < 0)) {
        return fail('failed-precondition', 'Public booking is not configured.');
    }
    const startsAt = new Date(`${date}T${classData.time}:00-05:00`).getTime();
    return { capacity, startsAt, bookingOpen: startsAt > now };
}
export function reservationSeats(bookings: Data[], date: string, capacity: number) {
    const active = bookings.filter(b => !['cancelled', 'canceled'].includes(b.status) && (!b.date || b.date === date));
    const seats: Array<{spotNumber: number; status: 'available' | 'pending' | 'reserved' | 'blocked'}> =
        Array.from({ length: MAX_CLASS_CAPACITY }, (_, i) => ({ spotNumber: i + 1, status: i < capacity ? 'available' : 'blocked' }));
    let ambiguous = false;
    for (const b of active) {
        // Legacy unassigned, invalid, or colliding seats cannot safely be guessed.
        if (!Number.isInteger(b.spotNumber) || b.spotNumber < 1 || b.spotNumber > capacity || seats[b.spotNumber - 1].status !== 'available') {
            ambiguous = true;
        } else {
            seats[b.spotNumber - 1].status = b.status === 'pending' ? 'pending' : 'reserved';
        }
    }
    if (ambiguous || active.length >= capacity) seats.forEach(s => { if (s.status === 'available') s.status = 'blocked'; });
    return seats;
}
export function publicScheduleDates(now = Date.now()) {
    const limaToday = new Date(now - 5 * 3600000).toISOString().slice(0, 10);
    const [year, month, day] = limaToday.split('-').map(Number);
    return Array.from({ length: 7 }, (_, offset) =>
        new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10));
}
export function buildPublicClassSchedule(classes: Data[], bookings: Data[], now = Date.now()) {
    const dates = publicScheduleDates(now);
    const days = dates.map(date => ({ date, classes: [] as Data[] }));

    for (const classData of classes) {
        for (const day of days) {
            try {
                const session = reservationSession(classData, day.date, true, now);
                const classBookingsForDate = bookings.filter(booking => booking.classId === classData.id && (!booking.date || booking.date === day.date));
                const seats = reservationSeats(classBookingsForDate, day.date, session.capacity);
                const availableSpots = seats.filter(seat => seat.status === 'available').length;
                day.classes.push({
                    id: String(classData.id || ''),
                    name: String(classData.name || 'Clase grupal'),
                    instructor: String(classData.instructor || 'Por definir'),
                    time: String(classData.time || ''),
                    duration: Number(classData.duration) || 60,
                    capacity: session.capacity,
                    price: Number(classData.price),
                    availableSpots,
                    bookingOpen: session.bookingOpen && availableSpots > 0
                });
            } catch {
                // Invalid, inactive or non-public class configurations never reach the public schedule.
            }
        }
    }

    days.forEach(day => day.classes.sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name)));
    return { days };
}
function requireAdmin(context: Context) {
    // Mirrors isAdmin() in firestore.rules: same allowlist, same trust model, so the panel
    // and the backend never disagree about who is an administrator. Do not require
    // email_verified here without first verifying these accounts in Firebase Auth,
    // otherwise the whole admin map stops working.
    if (!context.auth || !ADMINS.includes(String(context.auth.token.email || '').toLowerCase())) {
        fail('permission-denied', 'Verified administrator access required.');
    }
}
export const getClassPaymentSettingsHandler = async (_input: Data, context: Context) => {
    requireAdmin(context);
    const snapshot = await db().collection('classBookingSettings').doc('payment').get();
    return safeClassPaymentSettings(snapshot.data());
};
export const updateClassPaymentSettingsHandler = async (input: Data, context: Context) => {
    requireAdmin(context);
    const store = db();
    const ref = store.collection('classBookingSettings').doc('payment');
    const result = await store.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        const settings = { ...validateClassPaymentSettings(input, snapshot.data() || {}), settingsGeneration: randomBytes(16).toString('hex') };
        tx.set(ref, { ...settings, updatedAt: stamp(), updatedBy: context.auth!.uid });
        return settings;
    });
    return safeClassPaymentSettings(result);
};
function rateSpec(context: Context, scope: string, limit: number, phone?: string) {
    // Express resolves the platform's trusted proxy chain; never trust a caller-provided IP field.
    const ip = context.rawRequest.ip || context.rawRequest.socket?.remoteAddress || 'unknown';
    return [{ key: hash(`${scope}:ip:${ip}`), limit }, ...(phone ? [{ key: hash(`${scope}:phone:${phone}`), limit: 5 }] : [])];
}
async function readRates(tx: FirebaseFirestore.Transaction, store: FirebaseFirestore.Firestore, specs: Array<{key: string; limit: number}>) {
    const now = Date.now();
    const results = [];
    for (const spec of specs) {
        const ref = store.collection('classReservationRateLimits').doc(spec.key);
        const snap = await tx.get(ref);
        const old = snap.data();
        const current = old && now - old.windowStart < 3600000;
        const count = current ? Number(old.count) : 0;
        if (count >= spec.limit) fail('resource-exhausted', 'Too many requests. Try again later.');
        results.push({ ref, value: { windowStart: current ? old!.windowStart : now, count: count + 1 } });
    }
    return results;
}
async function throttle(context: Context, scope: string, limit: number, phone?: string) {
    const store = db();
    await store.runTransaction(async tx => {
        const rates = await readRates(tx, store, rateSpec(context, scope, limit, phone));
        rates.forEach(r => tx.set(r.ref, r.value));
    });
}
async function classBookings(tx: FirebaseFirestore.Transaction, store: FirebaseFirestore.Firestore, classId: string) {
    const snapshot = await tx.get(store.collection('bookings').where('classId', '==', classId).limit(2001));
    if (snapshot.size > 2000) fail('failed-precondition', 'Class history requires administrative archival.');
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Data));
}
// Handlers are plain async functions so index.ts can declare them with the
// `export const x = functions.https.onCall(...)` shape that firebase-tools discovers
// during deploy. Re-exporting wrappers directly is not detected by the CLI.
export const getPublicClassScheduleHandler = async (_input: Data, context: Context) => {
    await throttle(context, 'schedule', 7200);
    const store = db();
    const now = Date.now();
    const [classesSnapshot, paymentSnapshot] = await Promise.all([
        store.collection('classes').select(
            'name', 'instructor', 'time', 'duration', 'capacity', 'price', 'status',
            'publicBookingEnabled', 'paymentInstructions', 'dayIndex', 'weekday', 'day'
        ).get(),
        store.collection('classBookingSettings').doc('payment').get()
    ]);
    const payment = paymentSnapshot.data();
    const configured = isClassPaymentConfigured(payment);
    const classes = classesSnapshot.docs
        .map(classDoc => ({ ...classDoc.data(), ...(configured ? { paymentInstructions: paymentInstructions(payment!) } : {}), id: classDoc.id } as Data))
        .filter(classData => classData.status === 'active' && classData.publicBookingEnabled === true);
    const bookingSnapshots = await Promise.all(classes.map(classData =>
        store.collection('bookings')
            .where('classId', '==', classData.id)
            .select('classId', 'date', 'spotNumber', 'status')
            .limit(2001)
            .get()
    ));
    if (bookingSnapshots.some(snapshot => snapshot.size > 2000)) {
        return fail('failed-precondition', 'Schedule requires administrative review.');
    }
    const bookings = bookingSnapshots.flatMap(snapshot =>
        snapshot.docs.map(bookingDoc => ({ ...bookingDoc.data(), id: bookingDoc.id } as Data)));
    return buildPublicClassSchedule(classes, bookings, now);
};
export const getPublicClassSessionHandler = async (input: Data, context: Context) => {
    // The public page refreshes availability every 30s, and every alumna in the gym can share a
    // single NAT address, so this IP-keyed budget stays generous and only exists to stop abuse.
    await throttle(context, 'read', 7200);
    const classId = id(input?.classId, 'classId');
    const date = validateReservationDate(input?.date);
    const store = db();
    return store.runTransaction(async tx => {
        const snapshot = await tx.get(store.collection('classes').doc(classId));
        if (!snapshot.exists) return fail('not-found', 'Class not found.');
        const paymentSnapshot = await tx.get(store.collection('classBookingSettings').doc('payment'));
        const payment = paymentSnapshot.data();
        const configured = isClassPaymentConfigured(payment);
        const c: Data = { ...snapshot.data()!, ...(configured ? { paymentInstructions: paymentInstructions(payment!) } : {}) };
        const session = reservationSession(c, date, true);
        const bookings = await classBookings(tx, store, classId);
        const seats = reservationSeats(bookings, date, session.capacity);
        return { classItem: { id: classId, name: String(c.name || ''), instructor: String(c.instructor || ''), time: c.time,
            duration: Number(c.duration) || 60, capacity: session.capacity, price: c.price, paymentInstructions: c.paymentInstructions,
            ...(configured ? { paymentCollector: { name: payment!.collectorName, yapePhone: payment!.yapePhone } } : {}) },
        date, seats, bookingOpen: session.bookingOpen && seats.some(s => s.status === 'available') };
    });
};
export const createClassPaymentQuoteHandler = async (input: Data, context: Context) => {
    await throttle(context, 'payment-quote', 120);
    const classId = id(input?.classId, 'classId');
    const date = validateReservationDate(input?.date);
    const spotNumber = input?.spotNumber;
    if (!Number.isInteger(spotNumber) || spotNumber < 1 || spotNumber > MAX_CLASS_CAPACITY) {
        return fail('invalid-argument', 'Invalid spotNumber.');
    }
    const quoteId = randomBytes(24).toString('hex');
    const quoteToken = randomBytes(32).toString('hex');
    const now = Date.now();
    const store = db();
    return store.runTransaction(async tx => {
        const classSnapshot = await tx.get(store.collection('classes').doc(classId));
        if (!classSnapshot.exists) return fail('not-found', 'Class not found.');
        const paymentSnapshot = await tx.get(store.collection('classBookingSettings').doc('payment'));
        const payment = paymentSnapshot.data();
        const configured = isClassPaymentConfigured(payment);
        const classData: Data = { ...classSnapshot.data()!, ...(configured ? { paymentInstructions: paymentInstructions(payment!) } : {}) };
        const session = reservationSession(classData, date, true, now);
        if (!session.bookingOpen) return fail('failed-precondition', 'The class has already started.');
        if (spotNumber > session.capacity) return fail('invalid-argument', 'Seat exceeds capacity.');
        const bookings = await classBookings(tx, store, classId);
        if (reservationSeats(bookings, date, session.capacity)[spotNumber - 1].status !== 'available') {
            return fail('already-exists', 'Seat unavailable.');
        }
        // Payment may already be irreversible when create is retried, so its immutable destination remains valid until class start.
        const expiresAt = session.startsAt;
        const quote: Data = { classId, date, spotNumber, amount: classData.price,
            paymentInstructions: classData.paymentInstructions, quoteTokenHash: hash(quoteToken),
            expiresAt: admin.firestore.Timestamp.fromMillis(expiresAt), createdAt: stamp() };
        if (configured) Object.assign(quote, { collectorName: payment!.collectorName, yapePhone: payment!.yapePhone,
            whatsappPhone: payment!.whatsappPhone, paymentPinHash: payment!.pinHash, paymentPinSalt: payment!.pinSalt,
            paymentSettingsGeneration: classPaymentSettingsGeneration(payment!) });
        tx.create(store.collection('classPaymentQuotes').doc(quoteId), quote);
        return { quoteId, quoteToken, amount: quote.amount, paymentInstructions: quote.paymentInstructions,
            ...(configured ? { paymentCollector: { name: payment!.collectorName, yapePhone: payment!.yapePhone } } : {}) };
    });
};
function publicPayload(input: Data) {
    const paymentMethod = input?.paymentMethod;
    if (paymentMethod !== 'Yape') return fail('invalid-argument', 'Public class payments require Yape.');
    const operationCode = text(input?.operationCode, 'operationCode', 4, 40).toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(operationCode)) return fail('invalid-argument', 'Invalid operation code.');
    return { classId: id(input?.classId, 'classId'), date: validateReservationDate(input?.date), spotNumber: input?.spotNumber,
        name: text(input?.name, 'name', 2, 100), phone: normalizeReservationPhone(input?.phone), paymentMethod, operationCode,
        quoteId: typeof input?.quoteId === 'string' ? input.quoteId : '', quoteToken: typeof input?.quoteToken === 'string' ? input.quoteToken : '' };
}
function bookingNotification(b: Data) {
    return { memberName: b.memberName || '', className: b.className || '', date: b.date, time: b.time || '',
        spotNumber: b.spotNumber, amount: b.amount, paymentMethod: b.paymentMethod || '', operationCode: b.operationCode || '',
        collectorName: b.collectorName || '' };
}
async function createReservation(input: Data, context: Context, isPublic: boolean) {
    const p: Data = isPublic ? publicPayload(input) : { classId: id(input?.classId, 'classId'), date: validateReservationDate(input?.date),
        spotNumber: input?.spotNumber, memberId: input?.memberId ? id(input.memberId, 'memberId') : '',
        name: input?.name, phone: input?.phone };
    if (!Number.isInteger(p.spotNumber) || p.spotNumber < 1 || p.spotNumber > MAX_CLASS_CAPACITY) fail('invalid-argument', 'Invalid spotNumber.');
    const requestId = isPublic ? text(input?.requestId, 'requestId', 16, 128) : '';
    if (isPublic && !/^[A-Za-z0-9_-]+$/.test(requestId)) fail('invalid-argument', 'Invalid requestId.');
    // Failed seat/code/duplicate attempts count too. This transaction commits independently of allocation.
    if (isPublic) await throttle(context, 'create', 20, p.phone);
    const fingerprint = hash(JSON.stringify(p));
    const token = randomBytes(32).toString('hex');
    const verifierToken = randomBytes(32).toString('hex');
    const createdMillis = Date.now();
    const generation = randomBytes(16).toString('hex');
    const store = db();
    return store.runTransaction(async tx => {
        const requestRef = store.collection('classReservationRequests').doc(hash(requestId || generation));
        const request = isPublic ? await tx.get(requestRef) : null;
        if (request?.exists) {
            const prior = request.data()!;
            if (prior.fingerprint !== fingerprint) return fail('already-exists', 'Request ID already used with another payload.');
            const booking = await tx.get(store.collection('bookings').doc(prior.bookingId));
            if (!booking.exists || booking.data()!.generation !== prior.generation || booking.data()!.status !== 'pending') {
                return fail('failed-precondition', 'This request has already been processed. Check your existing reservation.');
            }
            return { bookingId: prior.bookingId, accessToken: prior.accessToken, status: 'pending', spotNumber: p.spotNumber,
                notification: prior.notification || bookingNotification(booking.data()!),
                ...(prior.verifierToken ? { verifierToken: prior.verifierToken, whatsappPhone: prior.whatsappPhone,
                    collectorName: prior.collectorName } : {}) };
        }
        const paymentDoc = isPublic ? await tx.get(store.collection('classBookingSettings').doc('payment')) : null;
        const payment = paymentDoc?.data();
        const currentPaymentConfigured = isPublic && isClassPaymentConfigured(payment);
        const quoteSupplied = isPublic && (!!p.quoteId || !!p.quoteToken);
        let quoteRef: FirebaseFirestore.DocumentReference | null = null;
        let quote: Data | undefined;
        if (currentPaymentConfigured || quoteSupplied) {
            let quoteId: string;
            try { quoteId = id(p.quoteId, 'quoteId'); }
            catch { return fail('failed-precondition', 'Payment quote changed or expired.'); }
            quoteRef = store.collection('classPaymentQuotes').doc(quoteId);
            const quoteSnapshot = await tx.get(quoteRef);
            quote = quoteSnapshot.data();
            if (!quote || !validClassPaymentQuote(quote, p.quoteToken,
                { classId: p.classId, date: p.date, spotNumber: p.spotNumber }, createdMillis)) {
                return fail('failed-precondition', 'Payment quote changed or expired.');
            }
        }
        const quoteHasVerifier = classPaymentQuoteHasVerifier(quote);
        const classRef = store.collection('classes').doc(p.classId);
        const classDoc = await tx.get(classRef);
        if (!classDoc.exists) return fail('not-found', 'Class not found.');
        const classData = classDoc.data()!;
        const c: Data = { ...classData, ...(currentPaymentConfigured ? { paymentInstructions: paymentInstructions(payment!) } : {}) };
        const session = reservationSession(c, p.date, isPublic);
        if (!session.bookingOpen) return fail('failed-precondition', 'The class has already started.');
        if (p.spotNumber > session.capacity) return fail('invalid-argument', 'Seat exceeds capacity.');
        if (!isPublic && p.memberId) {
            const member = await tx.get(store.collection('members').doc(p.memberId));
            if (!member.exists) return fail('not-found', 'Member not found.');
            p.name = member.data()!.name;
            p.phone = member.data()!.phone;
        }
        p.name = text(p.name, 'name', 2, 100);
        p.phone = normalizeReservationPhone(p.phone);
        // Resolve member identities on the server, never accept public member claims.
        const memberIds = new Set<string>(p.memberId ? [p.memberId] : []);
        for (const variant of [p.phone, p.phone.slice(1), p.phone.slice(3)]) {
            const members = await tx.get(store.collection('members').where('phone', '==', variant).limit(25));
            if (members.size === 25) return fail('failed-precondition', 'Phone requires administrative review.');
            members.docs.forEach(m => memberIds.add(m.id));
        }
        const bookings = await classBookings(tx, store, p.classId);
        const active = bookings.filter(b => b.status !== 'cancelled' && (!b.date || b.date === p.date));
        for (const b of active) {
            let legacyPhone = b.phone;
            if (!legacyPhone && b.memberId && !String(b.memberId).startsWith('external-')) {
                const member = await tx.get(store.collection('members').doc(id(b.memberId, 'legacy memberId')));
                legacyPhone = member.data()?.phone;
            }
            let normalized = '';
            try { normalized = normalizeReservationPhone(legacyPhone); } catch { /* unknown legacy identity remains occupied */ }
            if (normalized === p.phone || memberIds.has(b.memberId)) return fail('already-exists', 'This person already has a reservation.');
        }
        if (reservationSeats(bookings, p.date, session.capacity)[p.spotNumber - 1].status !== 'available') {
            return fail('already-exists', 'Seat unavailable.');
        }
        const bookingId = `reservation_${p.classId}_${p.date}_${p.spotNumber}`;
        const bookingRef = store.collection('bookings').doc(bookingId);
        const existing = await tx.get(bookingRef);
        if (existing.exists && existing.data()!.status !== 'cancelled') return fail('already-exists', 'Seat unavailable.');
        const claimIds = [hash(`${p.classId}:${p.date}:phone:${p.phone}`), ...Array.from(memberIds).map(m => hash(`${p.classId}:${p.date}:member:${m}`))];
        for (const claimId of claimIds) {
            const claim = await tx.get(store.collection('classBookingClaims').doc(claimId));
            if (claim.exists) return fail('already-exists', 'This person already has a reservation.');
        }
        const operationRef = isPublic ? store.collection('classReservationOperations').doc(hash(`${p.paymentMethod}:${p.operationCode}`)) : null;
        if (operationRef && (await tx.get(operationRef)).exists) return fail('already-exists', 'Payment operation already submitted.');
        const paymentStatus = isPublic ? 'pending' : (input.paymentStatus || 'pending');
        if (!['pending', 'paid', 'membership'].includes(paymentStatus)) return fail('invalid-argument', 'Invalid paymentStatus.');
        const amount = isPublic ? (quote ? quote.amount : c.price) : (input.amount ?? c.price ?? 0);
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 100000) return fail('invalid-argument', 'Invalid amount.');
        const booking: Data = { classId: p.classId, date: p.date, spotNumber: p.spotNumber, memberName: p.name, phone: p.phone,
            normalizedPhone: p.phone, memberId: p.memberId || Array.from(memberIds)[0] || `external-${p.phone.slice(1)}`,
            className: String(c.name || ''), time: c.time, startsAt: admin.firestore.Timestamp.fromMillis(session.startsAt),
            status: isPublic ? 'pending' : 'confirmed', paymentStatus, paymentMethod: isPublic ? p.paymentMethod : text(input.paymentMethod || 'Manual', 'paymentMethod', 1, 50),
            amount, checkedIn: false, generation, claimIds, source: isPublic ? 'public' : 'admin',
            createdAt: stamp(), updatedAt: stamp(), createdBy: isPublic ? 'public' : context.auth!.uid };
        if (isPublic) {
            booking.accessTokenHash = hash(token);
            booking.operationCode = p.operationCode;
            if (quote) {
                booking.quoteId = quoteRef!.id;
                booking.paymentInstructions = quote.paymentInstructions;
            }
            if (quoteHasVerifier) {
                booking.collectorName = quote!.collectorName;
                booking.yapePhone = quote!.yapePhone;
                booking.whatsappPhone = quote!.whatsappPhone;
                booking.paymentPinHash = quote!.paymentPinHash;
                booking.paymentPinSalt = quote!.paymentPinSalt;
                booking.paymentSettingsGeneration = quote!.paymentSettingsGeneration;
                booking.verifierTokenHash = hash(verifierToken);
                booking.verifierTokenExpiresAt = admin.firestore.Timestamp.fromMillis(Math.min(session.startsAt, createdMillis + (2 * DAY)));
                booking.verificationAttempts = 0;
            }
        }
        const notification = bookingNotification(booking);
        // Archive the complete prior generation before replacing a deterministic seat document.
        if (existing.exists) tx.set(store.collection('classReservationArchive').doc(`${bookingId}_${generation}`), { ...existing.data(), bookingId, archivedAt: stamp() });
        tx.set(bookingRef, booking);
        if (quote) tx.update(quoteRef!, { consumedBy: bookingId, consumedAt: stamp() });
        tx.update(classRef, { reservationVersion: admin.firestore.FieldValue.increment(1) });
        claimIds.forEach(claimId => tx.set(store.collection('classBookingClaims').doc(claimId), { bookingId, generation, classId: p.classId, date: p.date }));
        if (operationRef) tx.set(operationRef, { bookingId, generation, createdAt: stamp() });
        if (isPublic) tx.set(requestRef, { fingerprint, bookingId, generation, accessToken: token, notification, createdAt: stamp(),
            ...(quoteHasVerifier ? { verifierToken, whatsappPhone: quote!.whatsappPhone, collectorName: quote!.collectorName } : {}) });
        tx.set(store.collection('classReservationAudit').doc(), { bookingId, generation, action: 'create', actor: booking.createdBy, at: stamp() });
        return isPublic ? { bookingId, accessToken: token, status: 'pending', spotNumber: p.spotNumber, notification,
            ...(quoteHasVerifier ? { verifierToken, whatsappPhone: quote!.whatsappPhone, collectorName: quote!.collectorName } : {}) } : { bookingId };
    });
}
export const createPublicClassReservationHandler = (input: Data, context: Context) => createReservation(input, context, true);
function safeBooking(bookingId: string, b: Data) {
    return { bookingId, status: b.status, paymentStatus: b.paymentStatus || 'pending', spotNumber: b.spotNumber,
        date: b.date, className: b.className || '', time: b.time || '' };
}
export function validReservationToken(b: Data, token: unknown): boolean {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || typeof b.accessTokenHash !== 'string' || !/^[a-f0-9]{64}$/.test(b.accessTokenHash)) return false;
    return timingSafeEqual(Buffer.from(hash(token), 'hex'), Buffer.from(b.accessTokenHash, 'hex'));
}
function verifierExpiryMillis(b: Data): number {
    return storedMillis(b.verifierTokenExpiresAt);
}
function validVerifierTokenHash(b: Data, token: unknown): boolean {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || typeof b.verifierTokenHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(b.verifierTokenHash)) return false;
    return timingSafeEqual(Buffer.from(hash(token), 'hex'), Buffer.from(b.verifierTokenHash, 'hex'));
}
export function validClassPaymentVerifierToken(b: Data, token: unknown, now = Date.now()): boolean {
    return validVerifierTokenHash(b, token) && verifierExpiryMillis(b) > now;
}
function safePaymentVerification(bookingId: string, b: Data) {
    return { bookingId, status: b.status, paymentStatus: b.paymentStatus || 'pending', spotNumber: b.spotNumber,
        date: b.date, className: b.className || '', time: b.time || '', memberName: b.memberName || '', amount: b.amount,
        paymentMethod: b.paymentMethod || '', operationCode: b.operationCode || '', collectorName: b.collectorName || '' };
}
export const getClassPaymentVerificationHandler = async (input: Data, context: Context) => {
    await throttle(context, 'payment-verification-read', 3600);
    const bookingId = id(input?.bookingId, 'bookingId');
    const snapshot = await db().collection('bookings').doc(bookingId).get();
    const booking = snapshot.data();
    if (!booking || !validVerifierTokenHash(booking, input?.verifierToken)) return fail('permission-denied', 'Invalid verification credentials.');
    if (verifierExpiryMillis(booking) <= Date.now()) return fail('deadline-exceeded', 'The verification link has expired.');
    return safePaymentVerification(bookingId, booking);
};
export const confirmClassPaymentByPinHandler = async (input: Data, context: Context) => {
    await throttle(context, 'payment-verification-confirm', 20);
    const bookingId = id(input?.bookingId, 'bookingId');
    if (typeof input?.pin !== 'string' || !/^\d{6}$/.test(input.pin)) return fail('invalid-argument', 'A six-digit PIN is required.');
    const store = db();
    const outcome = await store.runTransaction(async tx => {
        const ref = store.collection('bookings').doc(bookingId);
        const snapshot = await tx.get(ref);
        const booking = snapshot.data();
        if (!booking || !validVerifierTokenHash(booking, input?.verifierToken)) return fail('permission-denied', 'Invalid verification credentials.');
        if (verifierExpiryMillis(booking) <= Date.now()) return fail('deadline-exceeded', 'The verification link has expired.');
        if (booking.status === 'cancelled' || booking.status === 'canceled') return fail('failed-precondition', 'This reservation cannot be confirmed.');
        if (booking.status === 'confirmed' && booking.paymentStatus === 'paid') return { success: true, alreadyConfirmed: true };
        if (booking.status !== 'pending') return fail('failed-precondition', 'This reservation cannot be confirmed.');
        if (typeof booking.paymentPinHash !== 'string' || typeof booking.paymentPinSalt !== 'string') {
            return fail('failed-precondition', 'Payment verification is not configured.');
        }
        const attempts = Math.max(0, Number(booking.verificationAttempts) || 0);
        if (attempts >= 5) return { success: false, locked: true, globalLocked: false };
        const settingsGeneration = typeof booking.paymentSettingsGeneration === 'string' && /^[a-f0-9]{32,64}$/.test(booking.paymentSettingsGeneration)
            ? booking.paymentSettingsGeneration : hash(`legacy:${booking.paymentPinSalt}:${booking.paymentPinHash}`);
        const globalRef = store.collection('classPaymentPinRateLimits').doc(settingsGeneration);
        const globalSnapshot = await tx.get(globalRef);
        const globalData = globalSnapshot.data();
        const now = Date.now();
        const globalInWindow = !!globalData && typeof globalData.windowStart === 'number' && now - globalData.windowStart >= 0 && now - globalData.windowStart < 3600000;
        const globalFailures = globalInWindow ? Math.max(0, Number(globalData!.count) || 0) : 0;
        if (globalFailures >= 25) return { success: false, locked: false, globalLocked: true };
        if (!verifyClassPaymentPin(input.pin, booking.paymentPinSalt, booking.paymentPinHash)) {
            const nextGlobal = nextClassPaymentPinFailure(globalData, now, 25);
            tx.update(ref, { verificationAttempts: attempts + 1, updatedAt: stamp() });
            tx.set(globalRef, { windowStart: nextGlobal.windowStart, count: nextGlobal.count, updatedAt: stamp() });
            return { success: false, locked: attempts + 1 >= 5, globalLocked: nextGlobal.count >= 25 };
        }
        const classRef = store.collection('classes').doc(id(booking.classId, 'classId'));
        const classSnapshot = await tx.get(classRef);
        tx.update(ref, { status: 'confirmed', paymentStatus: 'paid', confirmedBy: 'collector-link',
            confirmedAt: stamp(), updatedAt: stamp() });
        if (classSnapshot.exists) tx.update(classRef, { reservationVersion: admin.firestore.FieldValue.increment(1) });
        tx.set(store.collection('classReservationAudit').doc(), { bookingId, generation: booking.generation || 'legacy',
            action: 'confirm-by-pin', actor: 'collector-link', at: stamp() });
        return { success: true, alreadyConfirmed: false };
    });
    if (!outcome.success) {
        if (outcome.globalLocked) return fail('resource-exhausted', 'Payment PIN is temporarily locked.');
        if (outcome.locked) return fail('resource-exhausted', 'Too many incorrect PIN attempts.');
        return fail('permission-denied', 'Incorrect payment PIN.');
    }
    return { bookingId, status: 'confirmed', paymentStatus: 'paid' };
};
async function ownReservation(input: Data, context: Context, cancel: boolean) {
    await throttle(context, 'own', 3600);
    const bookingId = id(input?.bookingId, 'bookingId');
    const store = db();
    return store.runTransaction(async tx => {
        const ref = store.collection('bookings').doc(bookingId);
        const snap = await tx.get(ref);
        const b = snap.data();
        if (!b || !validReservationToken(b, input?.accessToken)) return fail('permission-denied', 'Invalid reservation credentials.');
        if (cancel && b.status !== 'cancelled') {
            if (b.status !== 'pending' || !b.startsAt?.toMillis || b.startsAt.toMillis() <= Date.now()) {
                return fail('failed-precondition', 'Only pending reservations may be cancelled before class starts.');
            }
            await cancelBooking(tx, store, ref, b, 'public');
            b.status = 'cancelled';
        }
        return safeBooking(bookingId, b);
    });
}
async function cancelBooking(tx: FirebaseFirestore.Transaction, store: FirebaseFirestore.Firestore, ref: FirebaseFirestore.DocumentReference, b: Data, actor: string) {
    const classRef = store.collection('classes').doc(id(b.classId, 'classId'));
    const classDoc = await tx.get(classRef);
    const claims = [];
    for (const claimId of b.claimIds || []) claims.push(await tx.get(store.collection('classBookingClaims').doc(claimId)));
    // Legacy UI claims also need release, but never delete a claim owned by another generation.
    if (b.classId && b.date && b.memberId) claims.push(await tx.get(store.collection('classBookingClaims').doc(`${b.classId}_${b.date}_${b.memberId}`)));
    claims.forEach(c => { if (c.exists && c.data()!.bookingId === ref.id && (!c.data()!.generation || c.data()!.generation === b.generation)) tx.delete(c.ref); });
    if (classDoc.exists) tx.update(classRef, { reservationVersion: admin.firestore.FieldValue.increment(1) });
    tx.update(ref, { status: 'cancelled', cancelledAt: stamp(), updatedAt: stamp(), cancelledBy: actor });
    tx.set(store.collection('classReservationAudit').doc(), { bookingId: ref.id, generation: b.generation || 'legacy', action: 'cancel', actor, at: stamp() });
}
export const getPublicClassReservationHandler = (input: Data, context: Context) => ownReservation(input, context, false);
export const cancelPublicClassReservationHandler = (input: Data, context: Context) => ownReservation(input, context, true);
export const adminClassReservationHandler = async (input: Data, context: Context) => {
    requireAdmin(context);
    if (input?.action === 'create') return createReservation(input, context, false);
    if (!['confirm', 'cancel', 'attendance', 'reset-payment-pin-attempts'].includes(input?.action)) return fail('invalid-argument', 'Invalid action.');
    const bookingId = id(input.bookingId, 'bookingId');
    const store = db();
    return store.runTransaction(async tx => {
        const ref = store.collection('bookings').doc(bookingId);
        const snap = await tx.get(ref);
        if (!snap.exists) return fail('not-found', 'Reservation not found.');
        const b = snap.data()!;
        if (input.action === 'reset-payment-pin-attempts') {
            tx.update(ref, { verificationAttempts: 0, verificationAttemptsResetAt: stamp(),
                verificationAttemptsResetBy: context.auth!.uid, updatedAt: stamp() });
            tx.set(store.collection('classReservationAudit').doc(), { bookingId, generation: b.generation || 'legacy',
                action: 'reset-payment-pin-attempts', actor: context.auth!.uid,
                previousAttempts: Math.max(0, Number(b.verificationAttempts) || 0), at: stamp() });
        } else if (input.action === 'cancel') {
            if (b.status !== 'cancelled') await cancelBooking(tx, store, ref, b, context.auth!.uid);
        } else {
            if (b.status === 'cancelled') return fail('failed-precondition', 'Cancelled reservations cannot be changed.');
            const update: Data = { updatedAt: stamp() };
            if (input.action === 'attendance') {
                if (b.status !== 'confirmed' || typeof input.checkedIn !== 'boolean') return fail('failed-precondition', 'Attendance requires a confirmed reservation and checkedIn boolean.');
                update.checkedIn = input.checkedIn;
            } else {
                const paymentStatus = input.paymentStatus || 'paid';
                if (!['paid', 'membership', 'pending'].includes(paymentStatus)) return fail('invalid-argument', 'Invalid paymentStatus.');
                update.status = 'confirmed'; update.paymentStatus = paymentStatus; update.confirmedBy = context.auth!.uid;
                if (input.paymentMethod !== undefined) update.paymentMethod = text(input.paymentMethod, 'paymentMethod', 1, 50);
                if (input.amount !== undefined) {
                    if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount < 0 || input.amount > 100000) return fail('invalid-argument', 'Invalid amount.');
                    update.amount = input.amount;
                }
            }
            const classRef = store.collection('classes').doc(id(b.classId, 'classId'));
            const classDoc = await tx.get(classRef);
            if (classDoc.exists) tx.update(classRef, { reservationVersion: admin.firestore.FieldValue.increment(1) });
            tx.update(ref, update);
            tx.set(store.collection('classReservationAudit').doc(), { bookingId, generation: b.generation || 'legacy', action: input.action, actor: context.auth!.uid, changes: update, at: stamp() });
        }
        return { bookingId };
    });
};
