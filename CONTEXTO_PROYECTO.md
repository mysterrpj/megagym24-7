# MegaGym 24/7 - Contexto y Arquitectura del Proyecto

Este documento sirve como la fuente principal de la verdad (SoT) para la arquitectura, configuración y reglas de negocio del bot de WhatsApp de MegaGym. **Cualquier Inteligencia Artificial que asista en este proyecto DEBE leer y respetar este documento antes de proponer o realizar cambios en el bot.**

## Arquitectura General

El proyecto es un sistema para la gestión de un gimnasio ("MegaGym") con un bot de WhatsApp integrado. 
*   **Frontend**: React + Vite (Dashboard administrativo y vista de clientes).
*   **Backend**: Firebase Functions (Node.js 20).
*   **Base de Datos**: Firestore.
*   **Integraciones Clave**:
    *   **Twilio**: Proveedor de la API de WhatsApp.
    *   **Culqi**: Pasarela de pagos para las membresías.
    *   **OpenAI**: Proveedor de LLM (GPT-4o) para el cerebro del bot y Whisper para la transcripción de audios.

## Archivos Críticos del Bot

1.  `functions/src/index.ts`: 
    *   Contiene el webhook principal de Twilio (`twilioWebhookWhatsapp`).
    *   Maneja la lógica de recepción de mensajes.
    *   **Audios**: Aquí se detectan los mensajes de voz (MediaUrl0 con audio/*), se descargan y se envían a transcribir con Whisper antes de pasarlos al procesador de mensajes.
    *   Contiene los webhooks de Culqi (`culqiWebhook`, `createCulqiCharge`).
    *   Todas las funciones tienen `.runWith({ memory: '512MB' o '1GB' })` para evitar timeouts de deploy.
2.  `functions/src/bot/transcription.ts`:
    *   Usa la API de Whisper (`openai.audio.transcriptions.create`) para convertir notas de voz de WhatsApp a texto.
3.  `functions/src/bot/messageProcessor.ts`:
    *   **Es el "Cerebro" del bot (Sofía).**
    *   Contiene la función `processMessage` que inyecta la hora actual, el contexto del cliente (sacado de Firestore) y define la personalidad y reglas de la IA.
    *   Define las herramientas (tools/functions) que el LLM puede ejecutar.
    *   Contiene la función `executeTool` que ejecuta localmente la lógica en la base de datos cuando el LLM decide usar una herramienta.

## Herramientas (Tools) disponibles en el Bot

| Tool | Descripción |
|---|---|
| `get_student_routine` | Obtiene las rutinas de entrenamiento asignadas al cliente desde Firestore. |
| `get_student_diet` | Obtiene la dieta personalizada asignada al cliente desde el campo `diet` en Firestore. |
| `generate_payment_link` | Genera un link de pago Culqi para una membresía específica. |
| `send_payment_voucher` | Genera y envía el comprobante de pago como imagen. |
| `update_member_profile` | Guarda el perfil de entrenamiento del cliente (objetivo, nivel, días/semana, limitaciones). |
| `get_payment_history` | Obtiene el historial de pagos del cliente. |
| `check_member_status` | Consulta el estado de la membresía del cliente (solo si él lo pide). |

## Sistema de Dietas

*   **Flujo Manual Híbrido**: El administrador genera la dieta en su herramienta externa (ChatGPT "PhD Coach") y la pega en el perfil del cliente desde el Dashboard.
*   **Dónde editar**: En el Dashboard → Sección "Miembros" → Botón "Editar" del cliente → Campo **"Dieta Actual (Para Bot)"**.
*   **Dónde se guarda**: En el documento del miembro en Firestore, campo `diet` (string).
*   **Entrega Nivel 3**: Sofía identifica el día actual y lo mapea a un grupo del plan semanal:
    *   Lun/Mar/Mié → Días 1-3
    *   Jue/Vie → Días 4-5
    *   Sáb/Dom → Días 6-7
    Sofía menciona la fase del día y pregunta qué comida quiere revisar el cliente. Nunca entrega toda la dieta de golpe.

## Comportamiento del Bot al Saludar

*   **Primer contacto** (nunca ha hablado con el bot): Sofía se presenta de forma cálida, menciona sus capacidades y no habla de pagos ni vencimientos.
*   **Cliente activo con vencimiento ≤ 3 días**: Sofía saluda y avisa sobre el próximo vencimiento con link de renovación.
*   **Cliente vencido**: Sofía lo notifica y lo invita a renovar.
*   **Cliente activo con > 3 días**: Sofía saluda normalmente sin mencionar fechas de vencimiento.

## Esquema de Firestore - Colección `members`

| Campo | Tipo | Descripción |
|---|---|---|
| `name` | string | Nombre completo |
| `phone` | string | Teléfono (formato +51XXXXXXXXX) |
| `email` | string | Email |
| `dni` | string | DNI |
| `plan` | string | Nombre del plan (ej. "Membresía Fit 2026") |
| `status` | string | `active`, `pending`, `overdue`, `prospect` |
| `startDate` | string | Fecha de inicio (YYYY-MM-DD) |
| `endDate` | string | Fecha de fin (YYYY-MM-DD) |
| `expirationDate` | Timestamp | Fecha de vencimiento (Firestore Timestamp) |
| `planPrice` | number | Precio del plan |
| `amountPaid` | number | Total pagado |
| `debt` | number | Deuda pendiente |
| `diet` | string | Dieta asignada por el administrador (texto libre) |
| `trainingProfile` | object | Perfil de entrenamiento: `{objetivo, nivel, diasSemana, limitaciones, notasTrainer}` |
| `payments` | array | Historial de pagos |

## Reglas Estrictas para Modificar el Prompt (`messageProcessor.ts`)

> [!WARNING]
> Históricamente, las IAs han arruinado la lógica del bot al intentar sobre-optimizar el `systemPrompt` o las descripciones de los `tools`. ¡Sigue estas reglas al pie de la letra!

1.  **Cero Restricciones Negativas**: NUNCA utilices palabras como "NUNCA pidas el teléfono" o "ESTÁ PROHIBIDO mencionar la fecha". Los LLM sufren del problema del "elefante rosa" (pink elephant problem) y terminarán haciendo exactamente lo que se les prohíbe. 
2.  **Contexto a través de Herramientas**: El teléfono del usuario (`phone`) ya se extrae en `index.ts` a partir del mensaje de Twilio y se pasa a `processMessage`. En la descripción de los parámetros de los **tools**, simplemente pon `"El número de teléfono del usuario."` y el LLM lo inyectará automáticamente desde el contexto provisto.
3.  **No Sobre-diseñar**: El prompt de Sofía debe ser positivo, energético e instruccional ("Usa la hora de esta manera", "Si pasa X, haz Y"). Si quieres que el bot deje de hacer algo, elimina las instrucciones que lo causan en lugar de agregar una regla que lo prohíba de forma explícita.
4.  **Uso de la Herramienta Rutina**: Cuando un cliente pide su rutina, el tool a utilizar siempre es `get_student_routine`. El bot no debe pedir verificación de identidad si el teléfono ya viene en la petición.

## Datos Base de MegaGym

*   **Dirección**: Mz I Lt 5 Montenegro, San Juan de Lurigancho.
*   **Horarios**: Lunes a Viernes (6am-10pm), Sábados (6am-6pm), Domingos (6am-12pm).
*   **Precios**: 1 Mes (S/80), 2 Meses (S/120), 3 Meses (S/150). Clase suelta (S/6).

## Regla Crítica: Cálculo de Deuda en el Voucher (`send_payment_voucher`)

> [!WARNING]
> Este bug ya fue corregido. No revertir este comportamiento.

**El problema:** El bot calculaba la deuda restando `planPrice - lastPayment.amount` (el último pago individual del array `payments`). Esto causaba que clientes con pagos en cuotas vieran un saldo pendiente incorrecto aunque ya hubieran pagado todo. Ejemplo: cliente paga S/50 primero y S/100 después → el bot mostraba "debe S/100" porque solo leía el primer registro del array.

**La solución aplicada (2026-04-02):** El tool `send_payment_voucher` en `messageProcessor.ts` ahora lee el campo `debt` directamente desde Firestore (`member.debt`) en lugar de recalcularlo. El campo `debt` es la fuente de verdad para la deuda real del cliente.

**Lógica actual:**
```typescript
const debt = member.debt !== undefined ? Math.max(0, Number(member.debt)) : Math.max(0, planPrice - (Number(lastPayment?.amount) || 0));
const amountPaid = Math.max(0, planPrice - debt);
```

**Nota importante:** El campo `amountPaid` en Firestore acumula el total histórico de todos los pagos del cliente a lo largo del tiempo (renovaciones incluidas). NO usarlo para calcular lo pagado en el plan actual. Usar siempre `planPrice - debt`.

## Documentos Archivados

Los siguientes archivos son documentación histórica del proyecto, ya completada. No reflejan el estado actual:
- `AGENT_STATUS.md` — Estado del sistema a enero 2026.
- `ROADMAP.md` — Roadmap histórico (Stripe fue reemplazado por Culqi).
- `TWILIO_PROD_PLAN.md` — Plan de migración a Twilio producción, ya ejecutado.
- `AGENTE_PERSONALIZADO_PLAN.md` — Plan de implementación del agente Sofía, ya ejecutado.

---

*Nota para el Asistente AI: Si estás leyendo esto al iniciar un nuevo chat, confírmale al usuario que has asimilado el contexto del proyecto y estás listo para ayudar sin romper la lógica actual.*

