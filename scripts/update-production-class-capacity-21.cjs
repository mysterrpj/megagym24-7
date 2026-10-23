const admin = require('../functions/node_modules/firebase-admin');

const PROJECT_ID = 'fit-ia-megagym';
const TARGET_CAPACITY = 21;
const APPLY = process.argv.includes('--apply');
const ALL_ACTIVE_PUBLIC = process.argv.includes('--all-active-public');
const allowedArgs = new Set(['--apply', '--all-active-public']);
const unknownArgs = process.argv.slice(2).filter((arg) => !allowedArgs.has(arg));

const KNOWN_CLASS_IDS = [
    'lunes-fullbody-0830',
    'martes-fullbody-0830',
    'miercoles-fullbody-0830',
    'jueves-fullbody-0830',
    'viernes-fullbody-0830',
    'lunes-fullbody-2000',
    'martes-fullbody-2000',
    'miercoles-fullbody-2000',
    'jueves-fullbody-2000',
    'viernes-fullbody-2000',
    'lunes-fullbody-2100',
    'miercoles-fullbody-2100',
    'jueves-fullbody-2100',
    'martes-xbox-2100',
    'viernes-total-power-2100',
];

if (unknownArgs.length) {
    throw new Error(`Argumentos no reconocidos: ${unknownArgs.join(', ')}`);
}
if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();

function capacityAction(snapshot) {
    if (!snapshot.exists) return { action: 'missing', capacity: null };
    const capacity = snapshot.data().capacity;
    if (!Number.isInteger(capacity) || capacity < 1) return { action: 'invalid', capacity };
    if (capacity < TARGET_CAPACITY) return { action: 'increase', capacity };
    if (capacity === TARGET_CAPACITY) return { action: 'unchanged', capacity };
    return { action: 'above-target', capacity };
}

async function loadTargets() {
    if (ALL_ACTIVE_PUBLIC) {
        const snapshot = await db.collection('classes')
            .where('status', '==', 'active')
            .where('publicBookingEnabled', '==', true)
            .get();
        return snapshot.docs.sort((a, b) => a.id.localeCompare(b.id));
    }
    const refs = KNOWN_CLASS_IDS.map((id) => db.collection('classes').doc(id));
    return db.getAll(...refs);
}

async function main() {
    const initialSnapshots = await loadTargets();
    const mode = ALL_ACTIVE_PUBLIC ? 'all-active-public' : 'known-15';
    const preview = initialSnapshots.map((snapshot) => ({
        id: snapshot.id,
        ...capacityAction(snapshot),
    }));

    console.log(`Proyecto: ${PROJECT_ID}`);
    console.log(`Modo: ${mode}`);
    console.log(`Ejecución: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
    console.table(preview);
    console.log(`Seleccionadas: ${preview.length}; aumentar: ${preview.filter((item) => item.action === 'increase').length}; ya en 21: ${preview.filter((item) => item.action === 'unchanged').length}; omitidas: ${preview.filter((item) => !['increase', 'unchanged'].includes(item.action)).length}`);

    if (!APPLY) {
        console.log('Vista previa terminada sin escrituras. Usa --apply para respaldar, actualizar y verificar.');
        return;
    }
    if (initialSnapshots.length > 249) {
        throw new Error('Se rechazó la operación: más de 249 clases excederían el límite seguro de una transacción con respaldo.');
    }

    const backupId = new Date().toISOString().replace(/[.:]/g, '-');
    const backupRef = db.collection('classCapacity21Backups').doc(backupId);
    const targetRefs = initialSnapshots.map((snapshot) => db.collection('classes').doc(snapshot.id));
    const transactionResult = await db.runTransaction(async (transaction) => {
        // Firestore requires all reads before writes. Re-read every target so each backup and
        // capacity decision uses the same atomic snapshot as the update.
        const currentSnapshots = [];
        for (const reference of targetRefs) currentSnapshots.push(await transaction.get(reference));

        const eligibleSnapshots = currentSnapshots.filter((snapshot) => {
            if (!snapshot.exists) return false;
            if (ALL_ACTIVE_PUBLIC) {
                const data = snapshot.data();
                if (data.status !== 'active' || data.publicBookingEnabled !== true) return false;
            }
            return capacityAction(snapshot).action === 'increase';
        });
        const existingSnapshots = currentSnapshots.filter((snapshot) => snapshot.exists);

        transaction.set(backupRef, {
            projectId: PROJECT_ID,
            mode,
            targetCapacity: TARGET_CAPACITY,
            selectedIds: currentSnapshots.map((snapshot) => snapshot.id),
            existingCount: existingSnapshots.length,
            changedIds: eligibleSnapshots.map((snapshot) => snapshot.id),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        for (const snapshot of existingSnapshots) {
            transaction.set(backupRef.collection('classes').doc(snapshot.id), snapshot.data());
        }
        for (const snapshot of eligibleSnapshots) {
            // Deliberately update only capacity. This script never deletes or rewrites classes/bookings.
            transaction.update(snapshot.ref, { capacity: TARGET_CAPACITY });
        }
        return {
            changedIds: eligibleSnapshots.map((snapshot) => snapshot.id),
            backedUpIds: existingSnapshots.map((snapshot) => snapshot.id),
        };
    });

    const { changedIds, backedUpIds } = transactionResult;
    const [backupMetadata, verificationSnapshots, backupSnapshots] = await Promise.all([
        backupRef.get(),
        changedIds.length
            ? db.getAll(...changedIds.map((id) => db.collection('classes').doc(id)))
            : Promise.resolve([]),
        backedUpIds.length
            ? db.getAll(...backedUpIds.map((id) => backupRef.collection('classes').doc(id)))
            : Promise.resolve([]),
    ]);
    const capacityFailures = verificationSnapshots.filter((snapshot) =>
        !snapshot.exists || snapshot.data().capacity !== TARGET_CAPACITY
    );
    const missingBackups = backupSnapshots.filter((snapshot) => !snapshot.exists);
    if (!backupMetadata.exists || backupMetadata.data().existingCount !== backedUpIds.length || missingBackups.length) {
        throw new Error(`Verificación del respaldo fallida. Faltantes: ${missingBackups.map((snapshot) => snapshot.id).join(', ') || 'metadatos/conteo'}`);
    }
    if (capacityFailures.length) {
        throw new Error(`Verificación de capacidad fallida para: ${capacityFailures.map((snapshot) => snapshot.id).join(', ')}`);
    }

    console.log(`Respaldo verificado: classCapacity21Backups/${backupId} (${backedUpIds.length} documentos)`);
    console.log(`Clases aumentadas y verificadas en capacidad ${TARGET_CAPACITY}: ${changedIds.length}`);
    if (changedIds.length) console.log(changedIds.join('\n'));
    console.log('No se eliminaron ni modificaron reservas; no se eliminó ninguna clase.');
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
