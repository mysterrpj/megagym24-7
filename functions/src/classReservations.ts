import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

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
    const classesSnapshot = await store.collection('classes').select(
        'name', 'instructor', 'time', 'duration', 'capacity', 'price', 'status',
        'publicBookingEnabled', 'paymentInstructions', 'dayIndex', 'weekday', 'day'
    ).get();
    const classes = classesSnapshot.docs
        .map(classDoc => ({ ...classDoc.data(), id: classDoc.id } as Data))
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
        const c = snapshot.data()!;
        const session = reservationSession(c, date, true);
        const bookings = await classBookings(tx, store, classId);
        const seats = reservationSeats(bookings, date, session.capacity);
        return { classItem: { id: classId, name: String(c.name || ''), instructor: String(c.instructor || ''), time: c.time,
            duration: Number(c.duration) || 60, capacity: session.capacity, price: c.price, paymentInstructions: c.paymentInstructions },
        date, seats, bookingOpen: session.bookingOpen && seats.some(s => s.status === 'available') };
    });
};
function publicPayload(input: Data) {
    const paymentMethod = input?.paymentMethod;
    if (paymentMethod !== 'Yape' && paymentMethod !== 'Plin') return fail('invalid-argument', 'Select Yape or Plin.');
    const operationCode = text(input?.operationCode, 'operationCode', 4, 40).toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(operationCode)) return fail('invalid-argument', 'Invalid operation code.');
    return { classId: id(input?.classId, 'classId'), date: validateReservationDate(input?.date), spotNumber: input?.spotNumber,
        name: text(input?.name, 'name', 2, 100), phone: normalizeReservationPhone(input?.phone), paymentMethod, operationCode };
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
            return { bookingId: prior.bookingId, accessToken: prior.accessToken, status: 'pending', spotNumber: p.spotNumber };
        }
        const classRef = store.collection('classes').doc(p.classId);
        const classDoc = await tx.get(classRef);
        if (!classDoc.exists) return fail('not-found', 'Class not found.');
        const c = classDoc.data()!;
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
        const amount = isPublic ? c.price : (input.amount ?? c.price ?? 0);
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 100000) return fail('invalid-argument', 'Invalid amount.');
        const booking: Data = { classId: p.classId, date: p.date, spotNumber: p.spotNumber, memberName: p.name, phone: p.phone,
            normalizedPhone: p.phone, memberId: p.memberId || Array.from(memberIds)[0] || `external-${p.phone.slice(1)}`,
            className: String(c.name || ''), time: c.time, startsAt: admin.firestore.Timestamp.fromMillis(session.startsAt),
            status: isPublic ? 'pending' : 'confirmed', paymentStatus, paymentMethod: isPublic ? p.paymentMethod : text(input.paymentMethod || 'Manual', 'paymentMethod', 1, 50),
            amount, checkedIn: false, generation, claimIds, source: isPublic ? 'public' : 'admin',
            createdAt: stamp(), updatedAt: stamp(), createdBy: isPublic ? 'public' : context.auth!.uid };
        if (isPublic) { booking.accessTokenHash = hash(token); booking.operationCode = p.operationCode; }
        // Archive the complete prior generation before replacing a deterministic seat document.
        if (existing.exists) tx.set(store.collection('classReservationArchive').doc(`${bookingId}_${generation}`), { ...existing.data(), bookingId, archivedAt: stamp() });
        tx.set(bookingRef, booking);
        tx.update(classRef, { reservationVersion: admin.firestore.FieldValue.increment(1) });
        claimIds.forEach(claimId => tx.set(store.collection('classBookingClaims').doc(claimId), { bookingId, generation, classId: p.classId, date: p.date }));
        if (operationRef) tx.set(operationRef, { bookingId, generation, createdAt: stamp() });
        if (isPublic) tx.set(requestRef, { fingerprint, bookingId, generation, accessToken: token, createdAt: stamp() });
        tx.set(store.collection('classReservationAudit').doc(), { bookingId, generation, action: 'create', actor: booking.createdBy, at: stamp() });
        return isPublic ? { bookingId, accessToken: token, status: 'pending', spotNumber: p.spotNumber } : { bookingId };
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
    if (!['confirm', 'cancel', 'attendance'].includes(input?.action)) return fail('invalid-argument', 'Invalid action.');
    const bookingId = id(input.bookingId, 'bookingId');
    const store = db();
    return store.runTransaction(async tx => {
        const ref = store.collection('bookings').doc(bookingId);
        const snap = await tx.get(ref);
        if (!snap.exists) return fail('not-found', 'Reservation not found.');
        const b = snap.data()!;
        if (input.action === 'cancel') {
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
