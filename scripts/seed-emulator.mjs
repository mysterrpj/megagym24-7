/**
 * Arranca la prueba local completa contra el Firebase Emulator Suite.
 *
 * Crea una cuenta administradora, una clase pública y un par de alumnas para que la
 * reserva se pueda probar de inmediato sin tocar el proyecto real de producción.
 *
 * Uso (con los emuladores ya encendidos):
 *   node scripts/seed-emulator.mjs
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.env.GCLOUD_PROJECT || 'demo-megagym';
process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const ADMIN_EMAIL = 'admin@fitia.com';
const ADMIN_PASSWORD = 'prueba123';

function limaDate(offsetDays) {
    const base = new Date(Date.now() + offsetDays * 86400000 - 5 * 3600000);
    return base.toISOString().slice(0, 10);
}

function weekdayIndex(dateKey) {
    return (new Date(`${dateKey}T12:00:00-05:00`).getUTCDay() + 6) % 7;
}

const app = initializeApp({ projectId });
const db = getFirestore(app);
const auth = getAuth(app);

// Cuenta administradora: coincide con la lista autorizada de firestore.rules y del backend.
try {
    await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, emailVerified: true, displayName: 'Administradora de prueba' });
    console.log(`✔ Cuenta administradora creada: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
} catch (error) {
    if (error?.code === 'auth/email-already-exists') console.log(`• La cuenta ${ADMIN_EMAIL} ya existía (la contraseña sigue siendo ${ADMIN_PASSWORD}).`);
    else throw error;
}

const dateKey = limaDate(1);
const classId = 'clase-prueba-aerobicos';

await db.collection('classes').doc(classId).set({
    name: 'Aeróbicos',
    instructor: 'Liz Pia',
    day: weekdayIndex(dateKey) + 1, // legado: 1 = lunes
    dayIndex: weekdayIndex(dateKey), // explícito: 0 = lunes
    time: '08:00',
    duration: 60,
    capacity: 20,
    price: 6,
    status: 'active',
    color: 'border-l-green-600',
    publicBookingEnabled: true,
    paymentInstructions: 'Yape o Plin al 987 654 321 (Gimnasio MegaGym).\nEnvía el código de operación en esta página.',
    reservationVersion: 0,
    createdAt: Timestamp.now(),
});

// Una segunda clase con cupo reducido para comprobar que las ubicaciones 11..20 se bloquean.
const smallDate = limaDate(2);
await db.collection('classes').doc('clase-prueba-pilates').set({
    name: 'Pilates', instructor: 'Ana Lucia', day: weekdayIndex(smallDate) + 1, dayIndex: weekdayIndex(smallDate),
    time: '18:00', duration: 45, capacity: 10, price: 0, status: 'active', color: 'border-l-green-600',
    publicBookingEnabled: true, paymentInstructions: 'Clase incluida en tu membresía. No realices ningún pago.',
    reservationVersion: 0, createdAt: Timestamp.now(),
});

const members = [
    { id: 'miembro-demo-1', name: 'Damaris Calderon', phone: '+51962869142' },
    { id: 'miembro-demo-2', name: 'Ruth Adalia', phone: '+51968595396' },
    { id: 'miembro-demo-3', name: 'Fiorela Espinoza', phone: '+51930156003' },
];
for (const member of members) {
    await db.collection('members').doc(member.id).set({ ...member, role: 'user', status: 'active', createdAt: Timestamp.now() });
}

console.log(`✔ Clase pública "Aeróbicos" para el ${dateKey} (20 ubicaciones).`);
console.log(`✔ Clase pública "Pilates" para el ${smallDate} (solo 10 ubicaciones).`);
console.log(`✔ ${members.length} miembros de ejemplo.`);
console.log('\nEnlaces públicos para probar como alumna:');
console.log(`  http://127.0.0.1:5173/reservar/clase/${classId}?fecha=${dateKey}`);
console.log('  http://127.0.0.1:5173/reservar/clase/clase-prueba-pilates?fecha=' + smallDate);
console.log('\nPanel administrativo: http://127.0.0.1:5173/login');
console.log('\nPara reiniciar los datos: detén los emuladores y bórralos, o vuelve a ejecutar este script.');
process.exit(0);
