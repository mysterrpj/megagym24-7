# MegaGym 24/7 - Contexto y Arquitectura del Proyecto

## Actualizacion Operativa (2026-04-21) - Mensajes minimalista

La pantalla `Mensajes` queda como una vista minimalista de supervision e historial, no como CRM operativo.

Estado actual:

- lista de conversaciones a la izquierda;
- historial de chat al centro;
- nombres reales resueltos desde `members` por telefono normalizado;
- aviso inferior indicando que las respuestas se envian automaticamente desde el bot;
- sin ficha rapida lateral;
- sin envio manual desde dashboard;
- sin botones de accion CRM.

Razon: el propietario no atiende manualmente desde el panel; el bot Sofia se encarga de responder, cobrar, reservar y recordar. Se probo una ficha rapida lateral, pero fue retirada para mantener la pantalla limpia y evitar confusion.

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

## Mejoras del Bot (Abril 2026)

### ✅ Política de acceso por días vencido (2026-04-13)

| Días vencido | Acceso |
|---|---|
| 0 | ✅ Activo, acceso completo |
| 1 - 14 | ✅ Acceso completo, sin ningún aviso ni link de pago |
| 15+ | ❌ Bloquea rutinas, dieta, voucher, historial y estado de membresía. Responde preguntas generales con normalidad, sin mencionar el bloqueo ni generar links a menos que el cliente lo pida directamente |

**Razón:** Gimnasio pequeño con ambiente de confianza entre todos. No se quiere presionar a los clientes con avisos constantes. Si el cliente quiere renovar, escribe al bot y Sofía le ayuda.

### ✅ Recordatorios automáticos de membresía (2026-04-13)

Función cron `membershipReminder` en `index.ts`, corre todos los días a las **7 PM hora Lima**:

- **3 días antes del vencimiento:** Envía aviso amigable por WhatsApp vía Twilio. Sin link de pago (ese lo genera Sofía cuando el cliente escribe).
- **Recordatorio de deuda:** Cada 7 días desde `startDate`, si `debt > 0`, envía recordatorio del saldo pendiente. Se detiene automáticamente cuando `debt` llega a 0.

### ✅ Personalidad de Sofía mejorada (2026-04-13)

- Usa expresiones peruanas naturales: "¡De una!", "¡Qué crack!", "¡No te rajes!", "al toque", "bacán".
- Reacciona emocionalmente según contexto: celebra logros antes de dar consejos.
- Emojis variados según situación (no siempre los mismos).
- Puede hacer bromas cortas cuando el momento lo permite.

### ✅ Estilo de respuesta WhatsApp (2026-04-13)

- Sin listas numeradas — máximo 3 ítems con emojis como viñetas.
- Sin negritas para subtítulos — solo para resaltar UNA palabra clave.
- Para preguntas técnicas de fitness: máx 2-3 oraciones + oferta de profundizar interactivamente.
- Saludo de primer contacto: natural y directo, sin listar funciones como un menú.

### ✅ Bot responde preguntas generales fuera del gym (2026-04-13)

El bot no está restringido a temas del gimnasio. Puede responder cualquier pregunta general (fitness, nutrición, temas educativos, etc.) con el tono de Sofía. Esto genera engagement y fideliza a clientes que no conocen la IA.

### ✅ Reconocer intención de pago (`messageProcessor.ts`) (2026-04-09)

Si el cliente expresa intención de pagar/renovar, Sofía celebra la decisión, genera el link y no menciona el vencimiento en esa respuesta.

### ⏳ Unificar nombre del remitente en WhatsApp

**Pendiente:** Ir a Twilio Console → Messaging → Senders → WhatsApp Senders → tu número, y verificar/unificar el display name. También revisar en Meta Business Manager → WhatsApp Manager → tu número → Editar perfil.

---

## Documentos Archivados

Los siguientes archivos son documentación histórica del proyecto, ya completada. No reflejan el estado actual:
- `AGENT_STATUS.md` — Estado del sistema a enero 2026.
- `ROADMAP.md` — Roadmap histórico (Stripe fue reemplazado por Culqi).
- `TWILIO_PROD_PLAN.md` — Plan de migración a Twilio producción, ya ejecutado.
- `AGENTE_PERSONALIZADO_PLAN.md` — Plan de implementación del agente Sofía, ya ejecutado.

---

*Nota para el Asistente AI: Si estás leyendo esto al iniciar un nuevo chat, confírmale al usuario que has asimilado el contexto del proyecto y estás listo para ayudar sin romper la lógica actual.*

---

## ActualizaciÃ³n Operativa (2026-04-20)

### Mensajes y dashboard

- La colecciÃ³n `messages` ya centraliza:
  - mensajes entrantes del cliente (`inbound`);
  - respuestas normales del bot (`outbound`);
  - recordatorios automÃ¡ticos de `membershipReminder`.
- La pantalla `Mensajes` del dashboard ya muestra el nombre real del cliente resolviÃ©ndolo desde `members` por telÃ©fono normalizado.
- Existe una Cloud Function `sendManualWhatsAppMessage`, pero el dashboard **no la usa actualmente**.
- DecisiÃ³n actual del producto: el nÃºmero de Twilio queda como canal principal del bot automÃ¡tico y el panel de `Mensajes` queda en modo visualizaciÃ³n/historial.

### Recordatorios automÃ¡ticos

- `membershipReminder` sigue ejecutÃ¡ndose todos los dÃ­as a las 7 PM hora Lima.
- Desde 2026-04-19, ademÃ¡s de enviar por WhatsApp, tambiÃ©n guarda en `messages` los recordatorios automÃ¡ticos futuros.
- Los recordatorios anteriores a este cambio no aparecen retroactivamente en `messages`.

### Clases - Fase 1 completada

Se completÃ³ la Fase 1 del mÃ³dulo de clases:

- `src/pages/dashboard/ClassesPage.tsx` ya lee datos reales desde Firestore:
  - `classes`
  - `bookings`
  - `members`
- Crear una clase desde el dashboard ya persiste en `classes`.
- El detalle de clase ya muestra inscritos reales cuando existen reservas reales.
- `book_class` fue endurecida para validar:
  - que la clase exista;
  - que no estÃ© inactiva;
  - que no se duplique la reserva del mismo miembro;
  - que no se exceda la capacidad.
- Esta lÃ³gica fue desplegada dentro de `twilioWebhookWhatsapp`, porque `processMessage` vive detrÃ¡s de ese webhook.

### Vista demo de clases

Mientras la colecciÃ³n `classes` estÃ© vacÃ­a, el dashboard `Clases` muestra una vista demo coherente para que no aparezca todo en cero.

Base usada para la demo:

- clases grupales de lunes a viernes a las 8:30 AM y 8:00 PM;
- profesora `LIZ PIA`;
- precio de `S/ 6 por clase`.

La demo agrega horarios ficticios coherentes para completar la grilla semanal y llenar:

- tarjetas de `Clases/Semana`, `Reservas`, `OcupaciÃ³n`, `Capacidad`;
- grÃ¡fico de ocupaciÃ³n por dÃ­a;
- detalle de inscritos por clase.

Importante:

- la demo es solo visual;
- no escribe reservas ficticias en Firestore;
- desaparece automÃ¡ticamente cuando existan clases reales cargadas en `classes`.

## Pendientes actuales

### Clases

TodavÃ­a faltan estas piezas para dejar el sistema de clases maduro:

- cancelaciÃ³n de reservas;
- reprogramaciÃ³n o lista de espera;
- recordatorios automÃ¡ticos de clase;
- registro de asistencia / no-show;
- sembrado opcional de horarios demo en Firestore real;
- confirmaciones mÃ¡s ricas del bot con clase, horario e instructor.

### Infraestructura

- migrar desde `functions.config()` a params antes de marzo 2027;
- actualizar runtime de `Node.js 20`;
- revisar actualizaciÃ³n de `firebase-functions`.
## Actualización Complementaria (2026-04-20)

### Clases grupales pagadas operativas

- clases reales cargadas en `classes`:
  - `FULLBODY`
  - lunes a viernes
  - `8:30 AM` y `8:00 PM`
  - instructora `LIZ PIA`
  - precio `S/ 6`
- el bot distingue entre:
  - `membresía` → genera link de membresía;
  - `clase grupal / aeróbicos / FULLBODY` → genera link `class_booking`;
  - `clase libre de máquinas / pase por día` → no genera link; ese pago se hace en recepción.
- el pago de clase grupal usa el mismo checkout de `Culqi`:
  - el cliente puede pagar por `Yape` o `tarjeta` dentro del mismo flujo;
  - al aprobarse el pago, se crea una reserva real en `bookings` con `status: confirmed`.
- las clases grupales están abiertas al público general que escriba al bot y pague, no solo a miembros activos.

### Recordatorios automáticos de clases grupales

- existe `classBookingReminder`;
- corre cada `30 minutos` en horario `America/Lima`;
- revisa reservas `confirmed` del día actual;
- recuerda la clase cuando faltan entre `90` y `150` minutos para el inicio;
- guarda el recordatorio en `messages` con `source: scheduled_class_booking_reminder`;
- marca `classReminderSentAt` para no repetir el recordatorio;
- si la reserva fue hecha el mismo día y faltaban `2 horas o menos` para la clase, no se envía recordatorio.
## Actualización Complementaria (2026-04-21)

### Memoria progresiva y personalización de Sofía

Desde 2026-04-21, `messageProcessor.ts` ya empezó a guardar memoria útil del cliente de forma progresiva dentro de `members`.

Campos aprovechados dentro de `trainingProfile`:

- `objetivo`
- `nivel`
- `diasSemana`
- `limitaciones`
- `horarioHabitual`
- `preferenciaClases`
- `constancia`
- `estadoMotivacional`

Memoria conversacional breve:

- `assistantMemory.ultimaInteraccionClave`
- `assistantMemory.ultimaInteraccionTexto`

Reglas actuales de funcionamiento:

- Sofía no debe pedir todo como formulario.
- Completa el perfil poco a poco mientras conversa.
- Usa esa memoria en el prompt para responder de forma más personal.
- Ya puede preguntar también por:
  - horario habitual
  - molestias o lesiones
- La memoria nueva no reemplaza pagos, clases ni recordatorios; se suma a esos flujos.

Pendiente de esta línea de trabajo:

- profundizar progreso, adherencia, recaídas y riesgo de abandono;
- definir mejor cuándo actualizar o sobrescribir memoria vieja;
- decidir si algunos datos deben mostrarse o editarse también desde el dashboard.
