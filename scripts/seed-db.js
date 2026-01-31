const admin = require('firebase-admin');

// Initialize Firebase Admin
// Make sure GOOGLE_APPLICATION_CREDENTIALS is set or you are running in a cloud environment
admin.initializeApp({
    projectId: 'megagym-app' // Replace with your project ID
});

const db = admin.firestore();

async function seed() {
    console.log('Seeding database...');

    try {
        // 1. Gym Configuration
        await db.collection('config').doc('gym').set({
            name: "MegaGym 24/7",
            address: "Av. Principal 123, Lima",
            openingTime: "06:00",
            closingTime: "23:00",
            webhookUrl: "", // Url for Stripe/Twilio
        });

        // 2. Memberships
        const plans = [
            { name: "Plan Mensual", price: 80, duration_days: 30, benefits: ["Acceso total", "Duchas"] },
            { name: "Plan Bimestral", price: 150, duration_days: 60, benefits: ["Acceso total", "Duchas", "1 Invitado"] },
            { name: "Plan Trimestral", price: 210, duration_days: 90, benefits: ["Acceso total", "Duchas", "2 Invitados"] }
        ];

        for (const plan of plans) {
            await db.collection('memberships').add(plan);
        }

        // 3. Classes (Example)
        const classData = {
            name: "Crossfit",
            instructor: "Coach Alex",
            capacity: 20,
            schedule: { "Mon": "08:00", "Wed": "08:00", "Fri": "08:00" },
            duration_minutes: 60
        };
        await db.collection('classes').add(classData);

        console.log('Seeding completed successfully.');
    } catch (error) {
        console.error('Error seeding database:', error);
    }
}

seed();
