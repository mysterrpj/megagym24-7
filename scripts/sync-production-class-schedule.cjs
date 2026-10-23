const admin = require('../functions/node_modules/firebase-admin');

const PROJECT_ID = 'fit-ia-megagym';
const APPLY = process.argv.includes('--apply');
const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'];
const PAYMENT_INSTRUCTIONS = 'Yape: 927038012';

if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

function classRecord(id, name, instructor, dayIndex, time) {
    return {
        id,
        data: {
            name,
            instructor,
            dayIndex,
            day: dayIndex + 1,
            time,
            duration: 60,
            capacity: 21,
            price: 6,
            status: 'active',
            color: 'border-l-green-500',
            publicBookingEnabled: true,
            paymentInstructions: PAYMENT_INSTRUCTIONS,
            reservationVersion: 0
        }
    };
}

const desired = [
    ...DAYS.map((day, index) => classRecord(`${day}-fullbody-0830`, 'FULL BODY', 'LIZ PIA', index, '08:30')),
    ...DAYS.map((day, index) => classRecord(`${day}-fullbody-2000`, 'FULL BODY', 'LIZ PIA', index, '20:00')),
    classRecord('lunes-fullbody-2100', 'FULL BODY', 'LIZ PIA', 0, '21:00'),
    classRecord('miercoles-fullbody-2100', 'FULL BODY', 'LIZ PIA', 2, '21:00'),
    classRecord('jueves-fullbody-2100', 'FULL BODY', 'LIZ PIA', 3, '21:00'),
    classRecord('martes-xbox-2100', 'XBOX', 'ARTURO', 1, '21:00'),
    classRecord('viernes-total-power-2100', 'TOTAL POWER', 'RICHARD', 4, '21:00')
];

async function main() {
    const [classesSnapshot, bookingsSnapshot] = await Promise.all([
        db.collection('classes').get(),
        db.collection('bookings').get()
    ]);
    const currentIds = new Set(classesSnapshot.docs.map(doc => doc.id));
    const activeLinkedBookings = bookingsSnapshot.docs.filter(doc => {
        const booking = doc.data();
        return currentIds.has(booking.classId) && !['cancelled', 'canceled'].includes(booking.status);
    });

    console.log(`Proyecto: ${PROJECT_ID}`);
    console.log(`Clases actuales: ${classesSnapshot.size}`);
    console.log(`Clases requeridas: ${desired.length}`);
    console.log(`Reservas activas vinculadas: ${activeLinkedBookings.length}`);
    console.table(desired.map(item => ({
        id: item.id,
        dia: DAYS[item.data.dayIndex],
        hora: item.data.time,
        clase: item.data.name,
        profesor: item.data.instructor
    })));

    if (!APPLY) {
        console.log('Vista previa terminada. Ejecuta con --apply para aplicar el cambio.');
        return;
    }
    if (activeLinkedBookings.length > 0) {
        throw new Error('No se modificó el horario porque existen reservas activas vinculadas. Requiere revisión manual.');
    }

    const backupId = new Date().toISOString().replace(/[.:]/g, '-');
    const batch = db.batch();
    const backupRef = db.collection('classScheduleBackups').doc(backupId);
    batch.set(backupRef, {
        projectId: PROJECT_ID,
        reason: 'Corrección autorizada del horario fijo de clases grupales',
        classCount: classesSnapshot.size,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    for (const current of classesSnapshot.docs) {
        batch.set(backupRef.collection('classes').doc(current.id), current.data());
        batch.delete(current.ref);
    }
    for (const item of desired) {
        batch.set(db.collection('classes').doc(item.id), {
            ...item.data,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
    await batch.commit();

    const verification = await db.collection('classes').get();
    const actual = verification.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const expectedIds = new Set(desired.map(item => item.id));
    const exact = actual.length === desired.length && actual.every(item => expectedIds.has(item.id));
    if (!exact) throw new Error(`Verificación fallida: se encontraron ${actual.length} clases después del cambio.`);

    console.log(`Horario aplicado correctamente. Respaldo: classScheduleBackups/${backupId}`);
    console.log(`Clases verificadas: ${actual.length}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
