const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const api = require('../lib/classReservations');
const now = Date.parse('2026-06-01T10:00:00-05:00');
const base = { status: 'active', capacity: 21, dayIndex: 0, time: '18:30', price: 6,
    publicBookingEnabled: true, paymentInstructions: 'Yape al número configurado' };
const rejectsCode = (fn, code) => assert.throws(fn, e => e.code === code);

test('phones normalize Peru local and international forms without accepting arbitrary identities', () => {
    for (const phone of ['987654321', '+51 987-654-321', '51987654321']) assert.equal(api.normalizeReservationPhone(phone), '+51987654321');
    for (const phone of ['', '555123456', '+1 987654321', 'hello987654321', null]) rejectsCode(() => api.normalizeReservationPhone(phone), 'invalid-argument');
});
test('calendar validation rejects rollover, malformed and out of horizon dates', () => {
    assert.equal(api.validateReservationDate('2026-06-01', now), '2026-06-01');
    assert.equal(api.validateReservationDate('2026-07-01', now), '2026-07-01');
    for (const date of ['2026-06-31', '2026-02-29', '2026-7-01', '2026-07-02', '2026-05-31']) rejectsCode(() => api.validateReservationDate(date, now), 'invalid-argument');
    assert.equal(api.validateReservationDate('2028-02-29', Date.parse('2028-02-01T10:00:00-05:00')), '2028-02-29');
});
test('Lima date is not the UTC date around midnight', () => {
    const midnightUTC = Date.parse('2026-06-02T02:00:00Z');
    assert.equal(api.validateReservationDate('2026-06-01', midnightUTC), '2026-06-01');
});
test('session validates local start, weekday representations and strict capacity', () => {
    const session = api.reservationSession(base, '2026-06-01', true, now);
    assert.equal(session.startsAt, Date.parse('2026-06-01T23:30:00Z'));
    assert.equal(session.bookingOpen, true);
    assert.equal(api.reservationSession(base, '2026-06-01', true, session.startsAt).bookingOpen, false);
    assert.equal(api.reservationSession({ ...base, dayIndex: undefined, day: 1 }, '2026-06-01', true, now).capacity, 21);
    assert.equal(api.reservationSession({ ...base, capacity: 21 }, '2026-06-01', true, now).capacity, 21);
    for (const change of [{ dayIndex: 1 }, { capacity: 22 }, { capacity: 0 }, { capacity: '21' }, { time: '24:00' }, { status: 'inactive' }]) {
        rejectsCode(() => api.reservationSession({ ...base, ...change }, '2026-06-01', true, now), 'failed-precondition');
    }
});
test('public enabling and explicit payment instructions are mandatory', () => {
    for (const change of [{ publicBookingEnabled: false }, { publicBookingEnabled: 'true' }, { paymentInstructions: '' }, { paymentInstructions: {} }, { price: NaN }]) {
        rejectsCode(() => api.reservationSession({ ...base, ...change }, '2026-06-01', true, now), 'failed-precondition');
    }
    assert.ok(api.reservationSession({ ...base, publicBookingEnabled: false }, '2026-06-01', false, now));
});
test('public seats expose all 21 positions while omitting identities and never expiring a pending review', () => {
    const fullRoom = api.reservationSeats([], '2026-06-01', 21);
    assert.equal(fullRoom.length, 21);
    assert.equal(fullRoom.filter(seat => seat.status === 'available').length, 21);
    assert.deepEqual(fullRoom[20], { spotNumber: 21, status: 'available' });
    const seats = api.reservationSeats([{ date: '2026-06-01', spotNumber: 1, status: 'pending', memberName: 'secret', expiresAt: 0 },
        { spotNumber: 2, status: 'confirmed' }, { spotNumber: 3, status: 'cancelled' },
        { spotNumber: 4, status: 'canceled' }, { date: '2026-06-08', spotNumber: 5 }], '2026-06-01', 5);
    assert.deepEqual(seats[0], { spotNumber: 1, status: 'pending' });
    assert.equal(seats[1].status, 'reserved');
    assert.equal(seats[2].status, 'available');
    assert.equal(seats[3].status, 'available');
    assert.equal(seats[4].status, 'available');
    assert.equal(seats[5].status, 'blocked');
    assert.equal(seats.length, 21);
});
test('legacy ambiguity cannot bypass occupied capacity', () => {
    for (const bookings of [[{ status: 'confirmed' }], [{ spotNumber: 1 }, { spotNumber: 1 }], [{ spotNumber: 22 }], [{ spotNumber: '1' }]]) {
        assert.equal(api.reservationSeats(bookings, '2026-06-01', 21).some(s => s.status === 'available'), false);
    }
});
test('public schedule uses Lima calendar days and exposes only safe availability totals', () => {
    assert.deepEqual(api.publicScheduleDates(Date.parse('2026-06-02T02:00:00Z')), [
        '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07'
    ]);
    const schedule = api.buildPublicClassSchedule([
        { ...base, id: 'fullbody', name: 'FULLBODY', instructor: 'LIZ PIA', duration: 60 },
        { ...base, id: 'private', name: 'Privada', publicBookingEnabled: false }
    ], [
        { classId: 'fullbody', date: '2026-06-01', spotNumber: 1, status: 'pending', phone: '+51999999999', operationCode: 'SECRET' },
        { classId: 'fullbody', date: '2026-06-01', spotNumber: 2, status: 'cancelled' },
        { classId: 'fullbody', date: '2026-06-01', spotNumber: 3, status: 'canceled' },
        { classId: 'fullbody', spotNumber: 4, status: 'confirmed', memberName: 'Legacy Secret' }
    ], now);
    assert.equal(schedule.days.length, 7);
    assert.equal(schedule.days[0].date, '2026-06-01');
    assert.equal(schedule.days[0].classes.length, 1);
    assert.deepEqual(schedule.days[0].classes[0], {
        id: 'fullbody', name: 'FULLBODY', instructor: 'LIZ PIA', time: '18:30', duration: 60,
        capacity: 21, price: 6, availableSpots: 19, bookingOpen: true
    });
    assert.equal(JSON.stringify(schedule).includes('999999999'), false);
    assert.equal(JSON.stringify(schedule).includes('SECRET'), false);
    assert.equal(JSON.stringify(schedule).includes('Legacy Secret'), false);
});
test('public schedule sorts times and closes past or full classes', () => {
    const schedule = api.buildPublicClassSchedule([
        { ...base, id: 'late', name: 'Noche', time: '20:00', capacity: 2 },
        { ...base, id: 'early', name: 'Mañana', time: '08:30', capacity: 2 }
    ], [
        { classId: 'late', date: '2026-06-01', spotNumber: 1, status: 'confirmed' },
        { classId: 'late', date: '2026-06-01', spotNumber: 2, status: 'pending' }
    ], now);
    assert.deepEqual(schedule.days[0].classes.map(item => item.id), ['early', 'late']);
    assert.equal(schedule.days[0].classes[0].availableSpots, 2);
    assert.equal(schedule.days[0].classes[0].bookingOpen, false);
    assert.equal(schedule.days[0].classes[1].availableSpots, 0);
    assert.equal(schedule.days[0].classes[1].bookingOpen, false);
    const yearEnd = api.publicScheduleDates(Date.parse('2026-12-31T23:00:00-05:00'));
    assert.deepEqual([yearEnd[0], yearEnd[6]], ['2026-12-31', '2027-01-06']);
});
test('tokens are hash-verified and generation replacement revokes prior credentials', () => {
    const token = randomBytes(32).toString('hex');
    const b = { accessTokenHash: createHash('sha256').update(token).digest('hex') };
    assert.equal(api.validReservationToken(b, token), true);
    assert.equal(api.validReservationToken(b, randomBytes(32).toString('hex')), false);
    assert.equal(api.validReservationToken({}, token), false);
    assert.equal(api.validReservationToken(b, null), false);
    assert.equal(api.validReservationToken(b, token.toUpperCase()), false);
});
test('payment settings normalize phones, enforce six digit PINs, hash, and preserve an existing PIN', () => {
    const settings = api.validateClassPaymentSettings({
        collectorName: '  María Caja  ', yapePhone: '987 654 321', whatsappPhone: '+51 912-345-678', sameNumber: false, pin: '123456'
    });
    assert.equal(settings.collectorName, 'María Caja');
    assert.equal(settings.yapePhone, '+51987654321');
    assert.equal(settings.whatsappPhone, '+51912345678');
    assert.equal(settings.pinHash.length, 64);
    assert.equal(settings.pinSalt.length, 32);
    assert.equal(Object.values(settings).includes('123456'), false);
    assert.equal(api.verifyClassPaymentPin('123456', settings.pinSalt, settings.pinHash), true);
    assert.equal(api.verifyClassPaymentPin('654321', settings.pinSalt, settings.pinHash), false);
    const preserved = api.validateClassPaymentSettings({ collectorName: 'Caja', yapePhone: '987654321', sameNumber: true }, settings);
    assert.equal(preserved.whatsappPhone, '+51987654321');
    assert.equal(preserved.pinHash, settings.pinHash);
    assert.equal(preserved.pinSalt, settings.pinSalt);
});
test('payment settings reject malformed names, flags, phones, and non-six-digit PINs', () => {
    const valid = { collectorName: 'Caja', yapePhone: '987654321', whatsappPhone: '912345678', sameNumber: false };
    for (const pin of [undefined, '', '12345', '1234567', 123456, '12a456']) {
        rejectsCode(() => api.validateClassPaymentSettings({ ...valid, pin }), 'invalid-argument');
    }
    rejectsCode(() => api.validateClassPaymentSettings({ ...valid, collectorName: 'x', pin: '123456' }), 'invalid-argument');
    rejectsCode(() => api.validateClassPaymentSettings({ ...valid, sameNumber: 'false', pin: '123456' }), 'invalid-argument');
    rejectsCode(() => api.validateClassPaymentSettings({ ...valid, yapePhone: '555123456', pin: '123456' }), 'invalid-argument');
});
test('payment verifier token is separate, hash checked, and expires strictly', () => {
    const token = randomBytes(32).toString('hex');
    const booking = { verifierTokenHash: createHash('sha256').update(token).digest('hex'), verifierTokenExpiresAt: now + 1000 };
    assert.equal(api.validClassPaymentVerifierToken(booking, token, now), true);
    assert.equal(api.validClassPaymentVerifierToken(booking, token, now + 1000), false);
    assert.equal(api.validClassPaymentVerifierToken(booking, randomBytes(32).toString('hex'), now), false);
    assert.equal(api.validClassPaymentVerifierToken({ ...booking, verifierTokenExpiresAt: { toMillis: () => now + 1000 } }, token, now), true);
});
test('immutable payment quotes bind token, class, date and spot until class-start expiry and remain single-use', () => {
    const quoteToken = randomBytes(32).toString('hex');
    const expected = { classId: 'fullbody', date: '2026-06-01', spotNumber: 7 };
    const classStartsAt = Date.parse('2026-06-01T18:30:00-05:00');
    const quote = { ...expected, quoteTokenHash: createHash('sha256').update(quoteToken).digest('hex'), expiresAt: classStartsAt,
        amount: 6, paymentInstructions: 'Yape al número anterior' };
    assert.equal(api.validClassPaymentQuote(quote, quoteToken, expected, now), true);
    assert.equal(api.classPaymentQuoteHasVerifier(quote), false);
    assert.equal(api.classPaymentQuoteHasVerifier({ ...quote, collectorName: 'Caja', yapePhone: '+51987654321',
        whatsappPhone: '+51912345678', paymentPinHash: 'a'.repeat(64), paymentPinSalt: 'b'.repeat(32),
        paymentSettingsGeneration: 'c'.repeat(32) }), true);
    assert.equal(api.validClassPaymentQuote(quote, quoteToken, { ...expected, spotNumber: 8 }, now), false);
    assert.equal(api.validClassPaymentQuote(quote, randomBytes(32).toString('hex'), expected, now), false);
    assert.equal(api.validClassPaymentQuote({ ...quote, consumedBy: 'booking-1' }, quoteToken, expected, now), false);
    assert.equal(api.validClassPaymentQuote(quote, quoteToken, expected, classStartsAt - 1), true);
    assert.equal(api.validClassPaymentQuote(quote, quoteToken, expected, classStartsAt), false);
});
test('shared PIN failure window increments, caps globally, and resets after one hour', () => {
    assert.deepEqual(api.nextClassPaymentPinFailure(undefined, now, 2), { allowed: true, windowStart: now, count: 1 });
    assert.deepEqual(api.nextClassPaymentPinFailure({ windowStart: now - 10, count: 1 }, now, 2), { allowed: true, windowStart: now - 10, count: 2 });
    assert.deepEqual(api.nextClassPaymentPinFailure({ windowStart: now - 10, count: 2 }, now, 2), { allowed: false, windowStart: now - 10, count: 2 });
    assert.deepEqual(api.nextClassPaymentPinFailure({ windowStart: now - 3600000, count: 25 }, now, 25), { allowed: true, windowStart: now, count: 1 });
    const config = { pinSalt: 'a'.repeat(32), pinHash: 'b'.repeat(64), settingsGeneration: 'c'.repeat(32) };
    assert.equal(api.classPaymentSettingsGeneration(config), 'c'.repeat(32));
    assert.match(api.classPaymentSettingsGeneration({ pinSalt: config.pinSalt, pinHash: config.pinHash }), /^[a-f0-9]{64}$/);
});

test('emulator: concurrent seats, duplicate phone/code, idempotency, ownership, review, reuse and admin auth', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
    const admin = require('firebase-admin');
    if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-class-reservations' });
    const store = admin.firestore();
    const suffix = randomBytes(8).toString('hex');
    const classId = `test_${suffix}`;
    const date = new Date(Date.now() + 2 * 86400000 - 5 * 3600000).toISOString().slice(0, 10);
    const dayIndex = (new Date(`${date}T12:00:00-05:00`).getUTCDay() + 6) % 7;
    const ctx = n => ({ rawRequest: { ip: `test-${suffix}-${n}`, socket: {} } });
    const adminContext = { ...ctx('admin'), auth: { uid: 'test-admin', token: { email: 'admin@fitia.com', email_verified: true } } };
    await store.collection('classes').doc(classId).set({ ...base, dayIndex, name: 'Test', instructor: 'Test', duration: 60 });
    const phoneBase = 10000000 + (parseInt(suffix.slice(0, 6), 16) % 80000000);
    const payload = n => ({ classId, date, spotNumber: 1, name: 'Test Person', phone: `9${String(phoneBase + n)}`,
        paymentMethod: 'Yape', operationCode: `${suffix}${n}`, requestId: `${suffix}-request-${n}` });
    const all = await Promise.allSettled([1, 2].map(n => api.createPublicClassReservationHandler(payload(n), ctx(n))));
    assert.equal(all.filter(r => r.status === 'fulfilled').length, 1);
    const winnerIndex = all.findIndex(r => r.status === 'fulfilled') + 1;
    const winner = all[winnerIndex - 1].value;
    assert.deepEqual(await api.createPublicClassReservationHandler(payload(winnerIndex), ctx('retry')), winner);
    await assert.rejects(api.createPublicClassReservationHandler({ ...payload(winnerIndex), name: 'Changed' }, ctx('mismatch')), e => e.code === 'already-exists');
    await assert.rejects(api.createPublicClassReservationHandler({ ...payload(winnerIndex), spotNumber: 2, requestId: `${suffix}-duplicate-phone` }, ctx('dup')), e => e.code === 'already-exists');
    await assert.rejects(api.getPublicClassReservationHandler({ ...winner, accessToken: 'a'.repeat(64) }, ctx('bad')), e => e.code === 'permission-denied');
    const own = await api.getPublicClassReservationHandler(winner, ctx('own'));
    assert.deepEqual(Object.keys(own).sort(), ['bookingId', 'status', 'paymentStatus', 'spotNumber', 'date', 'className', 'time'].sort());
    await assert.rejects(api.adminClassReservationHandler({ action: 'confirm', bookingId: winner.bookingId }, ctx('anon')), e => e.code === 'permission-denied');
    await assert.rejects(api.adminClassReservationHandler({ action: 'confirm', bookingId: winner.bookingId }, { ...adminContext, auth: { ...adminContext.auth, token: { email: 'intruso@example.com' } } }), e => e.code === 'permission-denied');
    await api.cancelPublicClassReservationHandler(winner, ctx('cancel'));
    await api.cancelPublicClassReservationHandler(winner, ctx('cancel-again'));
    await assert.rejects(api.createPublicClassReservationHandler({ ...payload(3), operationCode: payload(winnerIndex).operationCode }, ctx('code')), e => e.code === 'already-exists');
    const replacement = await api.createPublicClassReservationHandler(payload(4), ctx('replace'));
    assert.equal(replacement.bookingId, winner.bookingId);
    assert.notEqual(replacement.accessToken, winner.accessToken);
    await assert.rejects(api.cancelPublicClassReservationHandler(winner, ctx('old-token')), e => e.code === 'permission-denied');
    await api.adminClassReservationHandler({ action: 'confirm', bookingId: replacement.bookingId }, adminContext);
    await assert.rejects(api.cancelPublicClassReservationHandler(replacement, ctx('confirmed')), e => e.code === 'failed-precondition');
    const archives = await store.collection('classReservationArchive').where('bookingId', '==', winner.bookingId).get();
    assert.equal(archives.size, 1);
    assert.equal((await store.collection('classes').doc(classId).get()).data().reservationVersion, 4);
});
