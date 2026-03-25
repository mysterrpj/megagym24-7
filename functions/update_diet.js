const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function run() {
    const cleanPhone = '51951296572';
    const phone = '+51951296572';

    let snapshot = await db.collection('members').where('phone', '==', cleanPhone).get();
    if (snapshot.empty) {
        snapshot = await db.collection('members').where('phone', '==', phone).get();
    }
    if (snapshot.empty) {
        snapshot = await db.collection('members').where('phone', '==', 'whatsapp:' + cleanPhone).get();
    }

    if (snapshot.empty) {
        console.log("User not found in DB");
        return;
    }

    const diet = `🗓️ 1. PLAN SEMANAL DE DIETA (2700–2800 kcal)

👉 Mantendremos estructura simple (3 comidas) pero con variaciones para adherencia.

🔵 DÍA 1–3 (Base alta en rendimiento)
🍳 Desayuno
4 huevos enteros
120 g avena
1 plátano
15 g mantequilla de maní
🍗 Almuerzo (pre o post entrenamiento)
180–200 g pollo
180 g arroz
Verduras
10 g aceite de oliva
🥩 Cena
200 g carne roja o pescado
250 g papa o camote
Verduras
20 g frutos secos

🟢 DÍA 4–5 (Variación metabólica)
🍳 Desayuno
3 huevos + 150 g claras
80 g avena
1 fruta
1 puñado de nueces
🍗 Almuerzo
200 g pavo o carne
150 g quinoa o arroz
Verduras
10 g aceite de oliva
🥩 Cena
200 g pescado (salmón o atún)
200 g papa
Verduras

🟡 DÍA 6–7 (ligeramente más bajo en carbs)
👉 Para controlar grasa sin afectar músculo

🍳 Desayuno
4 huevos
60 g avena
1 fruta
🍗 Almuerzo
200 g pollo
120 g arroz
Verduras
15 g aceite de oliva
🥩 Cena
200 g carne
Verduras grandes (fibra alta)
20 g frutos secos

⚡ 2. TIMING INTELIGENTE (CLAVE PARA AVANZADOS)
👉 Aquí es donde ganas ventaja real:

🏋️ Antes de entrenar (2–3h antes)
Carbs + proteína
Ej: arroz + pollo
🧠 Después de entrenar
Carbs rápidos + proteína
Ej: papa + carne o arroz

👉 Esto mejora:
Rendimiento
Recuperación
Sensibilidad a la insulina

🔥 3. ESTRATEGIA PARA MINIMIZAR GRASA
📈 Regla de oro:
Si subes >0.5 kg/semana → baja 150–200 kcal
Si no subes → sube 150–200 kcal
🧠 Control semanal:
Peso (3–4 veces por semana)
Fotos
Rendimiento en gym

🧬 Truco avanzado:
👉 Mantén pasos diarios altos (8–10k)
→ mejora partición de nutrientes (más músculo, menos grasa)

💊 4. SUPLEMENTACIÓN (ALTAMENTE RECOMENDADO)
Como eres avanzado, esto sí vale la pena:
Creatina → 5 g/día
Omega 3 → 1–2 g EPA/DHA
Proteína vegetal (opcional)

🚨 5. ERRORES QUE TE FRENARÍAN (IMPORTANTE)
Evita esto:
❌ Comer igual todos los días sin ajustar
❌ No medir progreso
❌ Demasiado “clean” → bajas calorías sin darte cuenta
❌ No priorizar carbs (clave en avanzados)

🧠 6. NIVEL PRO (lo que casi nadie hace)
👉 Si quieres optimizar aún más:
Ciclar carbs según días de entrenamiento
Ajustar sodio/potasio → mejor rendimiento
Usar comidas predecibles (menos variabilidad)

🎯 7. Si quieres el siguiente nivel
Puedo llevar esto aún más lejos:
📊 Ajuste exacto por horario de entrenamiento
🏋️ Integrarlo con tu rutina actual
📈 Estrategia de mesociclo (4–8 semanas)
🔬 Optimización hormonal y recuperación

Solo dime y lo hacemos 💪`;

    await snapshot.docs[0].ref.update({ diet });
    console.log("Diet updated successfully for user ID:", snapshot.docs[0].id);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
