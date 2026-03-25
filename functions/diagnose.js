const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function findMember(phone) {
    console.log("Searching member with phone:", phone);
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
        console.log("  Testing format:", fmt);
        const snap = await db.collection('members').where('phone', '==', fmt).limit(1).get();
        if (!snap.empty) {
            console.log("  => FOUND with format:", fmt);
            console.log("  => Data:", snap.docs[0].data());
            return snap.docs[0];
        }
    }
    console.log("  => NOT FOUND");
    return null;
}

async function searchRoutines(phone) {
    console.log("Searching routines for phone:", phone);
    const snap = await db.collection('studentRoutineAssignments')
        .where('studentPhone', '==', phone)
        .get();

    console.log("  Docs found:", snap.size);
    snap.forEach(doc => {
        console.log("  => Routine:", doc.id, JSON.stringify(doc.data()));
    });
}

(async () => {
    try {
        await findMember("whatsapp:+51951296572");
        await findMember("+51951296572");
        await findMember("951296572");
        await searchRoutines("+51951296572");
        await searchRoutines("whatsapp:+51951296572");
        await searchRoutines("951296572");
        console.log("DONE");
    } catch (e) {
        console.error("ERROR", e);
    }
    process.exit(0);
})();
