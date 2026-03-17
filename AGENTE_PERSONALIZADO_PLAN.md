# Plan de Implementación: Agente IA Personalizado (Estilo OpenClaw) para WhatsApp

Este documento contiene la arquitectura técnica y el paso a paso para transformar a `nely_bot` (o cualquier otro agente que uses) en un entrenador virtual que reconozca a cada miembro de MegaGym 24/7 y adapte sus respuestas a su plan, estado físico y edad.

## La Arquitectura: ¿Cómo funciona este "Multi-Agente"?

No crearemos un "bot diferente" para cada cliente. Usaremos un único **motor central de IA (ej. OpenAI)** que recibirá un "Contexto Inyectado" justo antes de responder.

1.  **El cliente escribe:** "Hola, ¿qué rutina me recomiendas hoy?"
2.  **Firebase intercepta el número:** El backend busca a ese cliente por su número de celular en Firestore (Colección `members`).
3.  **Inyección de Contexto (System Prompt Dinámico):** El backend crea un mensaje oculto (System Prompt) combinando las "Reglas Generales de Nely_Bot" + "Los Datos de este Cliente".
4.  **Historial de Chat:** El backend le pasa a la IA los últimos 5 o 10 mensajes intercambiados **exclusivamente con ese usuario** para que tenga memoria de corto plazo.
5.  **Generación de Respuesta:** La IA recibe todo, genera el consejo, y Twilio lo envía por WhatsApp.

---

## FASE 1: Preparación de la Base de Datos (Firestore)

Para que la IA pueda dar un servicio personalizado, **toda la información de valor del cliente debe estar en tu base de datos**.

1.  **Abre tu panel de Firebase y expande la colección `members`.**
2.  Cuando el recepcionista de MegaGym inscribe a alguien (o cuando pagan por web), asegúrate de que el sistema guarde información adicional (opcional pero vital para la IA).
    *   `name`: "Carlos Rodríguez"
    *   `age`: 35
    *   `weight_kg`: 82
    *   `goal`: "Pérdida de peso" o "Hipertrofia"
    *   `plan`: "Plan Trimestral"
    *   `endDate`: "2026-05-19"
3.  **Colección de Mensajes:** En tu archivo `index.ts`, ya guardas el historial en la colección `messages` vinculada al teléfono. Esto está perfecto.

---

## FASE 2: Modificando el Código Backend (`index.ts`)

La magia ocurre en tu función `processMessage(phone, incomingMsg)`. Aquí reconstruiremos el bloque para que consulte Firebase antes de enviarle la pregunta a la API de OpenAI/OpenClaw.

### Paso 2.1: El "Corazón" del Agente (System Prompt Dinámico)
Actualmente, el bot tiene un texto base (ej. "Eres un entrenador de MegaGym..."). Lo cambiaremos para que sea una plantilla que se llena con los datos del usuario.

```typescript
// Lógica para dentro de processMessage()

// 1. Buscar al cliente en la Base de Datos
const memberDoc = await db.collection('members').where('phone', '==', phone).limit(1).get();
let customerContext = "Este es un cliente no registrado, o un posible prospecto. Háblale sobre los precios del gimnasio MegaGym 24/7.";

if (!memberDoc.empty) {
    const data = memberDoc.docs[0].data();
    
    // 2. Construir el contexto personalizado
    customerContext = `
        La persona con la que hablas es un CLIENTE ACTIVO del gimnasio MegaGym 24/7.
        - Nombre: ${data.name || 'Desconocido'}
        - Edad: ${data.age || 'No especificada'}
        - Objetivo Principal: ${data.goal || 'Entrenamiento general'}
        - Rutina/Plan Actual: ${data.plan || 'Plan Básico'}
        - Vencimiento de Membresía: ${data.endDate || 'Desconocido'}
        
        INSTRUCCIONES CLAVES PARA TI (LA IA):
        Dirígete a él/ella por su nombre con mucho entusiasmo. Si te pide consejos de ejercicio, adapta la rutina estrictamente a su "Objetivo Principal". Recuérdale renovar SOLO si su "Vencimiento" está a menos de 5 días de hoy.
    `;
}
```

### Paso 2.2: Añadiéndole "Memoria" (Historial de Conversación)
La IA no sabe qué pasó hace 5 minutos (es amnésica). Hay que enviarle los mensajes recientes **sólo de ese número de celular**.

```typescript
// 3. Buscar los últimos 8 mensajes de este cliente en específico
const historySnap = await db.collection('messages')
    .where('phone', '==', phone)
    .orderBy('timestamp', 'desc')
    .limit(8)
    .get();

const chatHistory = [];
// Armar el array de mensajes en orden cronológico (de más viejo al más nuevo)
historySnap.docs.reverse().forEach(doc => {
    const msg = doc.data();
    chatHistory.push({
        role: msg.direction === 'inbound' ? 'user' : 'assistant',
        content: msg.content
    });
});
```

### Paso 2.3: La Llamada Mágica a la API de IA
Finalmente, unes el perfil, la memoria y el nuevo mensaje, y se lo mandas a OpenAI o a la API de tu agente.

```typescript
// 4. Armar el array final que se envía a OpenAI
const openAiMessages = [
    { 
        role: "system", 
        content: `Eres Nely_Bot, la entrenadora virtual estrella de MegaGym 24/7. Tienes un tono motivador, usas emojis de gimnasio 💪🔥 y respuestas cortas (máximo 3 párrafos cortos para WhatsApp). \n\n --- INFO DEL CLIENTE --- \n ${customerContext}` 
    },
    ...chatHistory,
    {
        role: "user",
        content: incomingMsg // El mensaje actual ("¿Qué me toca hoy?")
    }
];

// Llamada a tu API (OpenAI o Google) enviando el array 'openAiMessages'
```

---

## FASE 3: Obtener la "LLave" de la IA (API Key)

Como conversamos, el código de arriba necesita una cuenta comercial de IA prepago (No tu ChatGPT Plus mensual).

1.  **Crea una cuenta de desarrollador en OpenAI:** Ve a [platform.openai.com](https://platform.openai.com).
2.  **Configura un método de pago (Billing):** Añade una tarjeta de crédito o débito. Haz un pago inicial/recarga mínima de **$5.00 a $10.00 USD**. Te durará muchísimo.
3.  **Genera la Llave Secreta:** Ve a *API Keys* > *Create new secret key*. Guárdala en un lugar súper seguro (Ej. `sk-proj-xyz...`).
4.  **Pon la llave en tus secretos de Firebase:** En tu terminal, ejecuta algo como `firebase functions:secrets:set OPENAI_API_KEY` para que tu backend la pueda leer, o agrégalo en tu `.env`.

> 💡 **Tip Tecnológico (Modelo):** Te recomiendo empezar usando el modelo `gpt-4o-mini`. Cuesta fracciones de centavo, es increíblemente rápido para WhatsApp (vital para que el cliente no espere mucho) y procesa perfiles personales casi al mismo nivel que su hermano mayor (gpt-4o).

---

## ¿Estás listo para mañana?

Cuando tengas todo listo (el nuevo chip + la cuenta recargada en OpenAI), este será nuestro flujo de código:

1. Modificaremos tu `processMessage()` en el backend para inyectar este "System Prompt Dinámico" como vimos en la Fase 2.
2. Reconectaremos Twilio (siguiendo el plan `TWILIO_PROD_PLAN.md`).
3. ¡Tendrás oficialmente un ejército de Nely_Bots personalizadas cobrando el sueldo de $5 dólares al mes a todos tus miembros de Megagym!
