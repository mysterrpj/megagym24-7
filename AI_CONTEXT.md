# AI_CONTEXT.md — Memoria Técnica Permanente de MegaGym 24/7

> **Para cualquier IA que vaya a trabajar en este repositorio:** lee este documento
> **completo** antes de proponer o ejecutar cualquier cambio. Este archivo es la puerta de
> entrada a todo el contexto del proyecto. Si algo contradice lo que ves en el código, lo que
> manda es lo que **este archivo** describe como estado real, y debes avisar del desfase en tu
> respuesta.

- **Última actualización:** 2026-08-29
- **Rama de trabajo activa:** `feature/voz-agora`
- **Proyecto Firebase principal:** `fit-ia-megagym`
- **Propietario/operador:** Robert Pichihua Julca (WhatsApp del propietario: `+51951296572`)

---

## 1. Propósito y uso de este documento

Este archivo existe para que cualquier IA (Codex, Claude, ChatGPT, otro agente) pueda entender
el proyecto **por completo** sin tener que leer todo el código desde cero y sin romper nada.

Reglas generales de uso:

1. Es la **memoria técnica permanente**: se actualiza en el mismo commit en que se implementa
   una nueva funcionalidad.
2. No reemplaza a `CONTEXTO_PROYECTO.md` como fuente de verdad de reglas de negocio: **ambos
   deben leerse** y mantenerse coherentes.
3. Si una funcionalidad cambia, este archivo cambia con ella (sección 17 explica el mecanismo).
4. No contiene secretos. Nunca escribir claves, tokens ni contraseñas aquí.

---

## 2. Resumen ejecutivo

MegaGym 24/7 es un gimnasio real en San Juan de Lurigancho, Lima (Perú), operado por una sola
persona (Robert). El proyecto digital es un sistema completo de gestión:

- **Un bot de WhatsApp llamado Sofía** que atiende a los clientes automáticamente: responde
  dudas, genera links de pago (Culqi), confirma reservas de clases grupales, entrega rutinas y
  dietas, envía comprobantes, transcribe audios, recuerda vencimientos y deudas, y puede hablar
  **por voz** en tiempo real con los miembros.
- **Un panel administrativo web** (`/dashboard`) para supervisar mensajes, miembros,
  membresías, clases, pagos, accesos y configuración.
- **Voz en tiempo real sin intermediarios**: el miembro recibe un enlace por WhatsApp, lo abre
  en el navegador y conversa directamente con Sofía vía **Gemini Live** o **GPT-Realtime mini**
  (la elección se hace desde el panel; Agora quedó como opción histórica/legacy).
- **Un coach de voz llamado Robert** (voz masculina) para la app de rutinas de competidores,
  reutilizando la misma infraestructura de voz.
- **Registro de acceso por WhatsApp** (`accessLogs`), implementado en modo prueba solo con el
  número del propietario, listo para activarse para todos cuando el dueño lo apruebe.

Todo corre sobre **Firebase** (Hosting + Cloud Functions + Firestore + Storage + Auth +
Cloud Scheduler), con **Twilio** para WhatsApp, **OpenAI** como cerebro y transcripción,
**Culqi** como pasarela de pagos peruana, y **Gemini Live / OpenAI Realtime** para la voz.

---

## 3. Objetivo y visión del negocio

**Objetivo operativo:** que MegaGym funcione con un asistente automático (Sofía) que atienda por
WhatsApp casi todo: información, pagos, clases, rutinas, dietas, recordatorios y voz — sin que
Robert tenga que contestar manualmente.

**Visión de largo plazo (ver `PLAN_GIMNASIO_INTELIGENTE.md`):** convertir el gimnasio en una
plataforma modular que también controle:

- acceso inteligente (chapa eléctrica + PIN/QR, validado por el backend);
- cámaras y alertas;
- inventario y ventas;
- música, luces y ambiente;
- reportes operativos inteligentes.

**Decisiones de producto que marcan todo:**

- El panel es para **supervisión**, no para atender clientes. Sofía hace el trabajo.
- Los clientes interactúan **por WhatsApp**; el portal web del miembro quedó **descartado**
  como prioridad (decisión del propietario, agosto 2026).
- No se presiona a los clientes con avisos constantes de vencimiento (ambiente de confianza de
  gimnasio pequeño).
- Todo lo nuevo se hace **aditivo y reversible**: nada debe romper lo que ya funciona.
- El propietario prueba primero **con su propio número**; la activación general siempre requiere
  su aprobación explícita.

---

## 4. Estado actual (2026-08-29)

### 4.1 Proyectos involucrados

| Proyecto | Ruta local | GitHub | Rol |
|---|---|---|---|
| Bot + panel + backend | `24-7chatmegagym` (este repo) | `mysterrpj/megagym24-7` | WhatsApp, admin, pagos, voz (backend) |
| Página de voz | `agoravoz` (carpeta hermana) | `mysterrpj/agoravoz-gemini-live` | WebRTC directo, Gemini Live y GPT-Realtime |
| App de rutinas (Robert) | `rutinas` (proyecto del usuario) | — | Coach de rutinas, usa la voz del bot |
| Web informativa | `AppWebMegagym` | — | Landing pública con botón de voz |

### 4.2 URLs de producción

- Panel y app: `https://fit-ia-megagym.web.app`
- Webhook de WhatsApp: `https://us-central1-fit-ia-megagym.cloudfunctions.net/twilioWebhookWhatsapp`
- Página de voz: `https://agoravoz-gemini-live--fit-ia-megagym.us-east4.hosted.app`
- Validador de tokens de voz: `https://us-central1-fit-ia-megagym.cloudfunctions.net/getVoiceContext`
- Página de pago: `https://fit-ia-megagym.web.app/pagar?...`
- Web informativa: `https://megagym-app-fa3dc.web.app`

### 4.3 Rama y control de versiones

- Rama de trabajo: **`feature/voz-agora`** (todo el trabajo de voz + acceso vive aquí).
- Rama `master`: estado anterior a la voz (rollback completo = volver a `master` y redeploy).
- Flujo habitual: commits pequeños en `feature/voz-agora`, push a GitHub, deploy con Firebase CLI.
- No hay CI/CD automático verificado para functions; el deploy es manual (`firebase deploy`).

---

## 5. Arquitectura general

### 5.1 Diagrama simplificado

```text
Cliente (WhatsApp) ? Twilio Webhook ? twilioWebhookWhatsapp (Cloud Function)
        |                                      |
        |                              audio? ? Whisper (transcripción)
        |                                      |
        |                              messageProcessor.ts (cerebro de Sofía)
        |                                      |
        |                              +-------+------------------------+
        |                              ?       ?                        ?
        |                       OpenAI Chat    Tools (Firestore)    Twilio respuesta
        ?
Página de voz (agoravoz) ? getVoiceContext (valida token JWT + entrega contexto)
        |                         |
        ? Gemini Live / GPT-Realtime (WebRTC directo, sin Agora)
                |
                ? saveVoiceSessionMemory (resumen de la llamada ? members.assistantMemory)

Panel admin (React/Vite) ? Firestore (lectura/escritura con reglas de admin)
        |
        ? settings/voice (selector de proveedor de voz) ? lo lee getVoiceContext

Culqi ? checkout en /pagar ? createCulqiCharge ? culqiWebhook ? actualiza member
Cloud Scheduler ? membershipReminder (19:00 Lima) / classBookingReminder (cada 30 min)
```

### 5.2 Componentes de la arquitectura

1. **Frontend (React + Vite + TS)** — panel admin + landing + login/registro + página de pago.
2. **Backend (Firebase Cloud Functions v1)** — webhooks, pagos, recordatorios, voz, acceso.
3. **Firestore** — fuente de verdad de todos los datos.
4. **Firebase Auth** — login del panel, roles: admin por email, clientes con rol user.
5. **Twilio WhatsApp API** — envío y recepción de mensajes y menú interactivo (Content API).
6. **OpenAI** — modelo de chat de Sofía, gpt-4o crítico / gpt-4o-mini default, Whisper para
   audios, resúmenes de voz y GPT-Realtime para voz.
7. **Google Gemini Live** — voz directa alternativa, más económica.
8. **Culqi** — órdenes y cobros en soles, tarjeta y Yape.
9. **Cloud Scheduler** — recordatorios de membresía y de clases.
10. **Firebase Storage** — vouchers e imágenes, flujo secundario, y serveVoucher.

---

## 6. Tecnologías y por qué se eligieron

- **React 18 + Vite 5 + TypeScript** en src: panel rápido, tipado y ecosistema grande; base inicial del proyecto.
- **Tailwind CSS 3 + shadcn/Radix** en src/components/ui: UI oscura de fitness consistente y accesible.
- **React Router 6**: rutas de la SPA, públicas y admin.
- **Firebase** Hosting, Functions v1, Firestore, Auth, Storage, Scheduler: sin servidores que administrar, datos en tiempo real, gratis hasta cierto volumen.
- **Node 22** en functions: runtime vigente de Firebase, migrado desde Node 20 por deprecación.
- **firebase-functions v6.6.0**: versión estable compatible con runWith y admin v13; v7 rompía el deploy.
- **OpenAI SDK openai@4**: cerebro de Sofía, Whisper, resúmenes y Realtime.
- **Twilio SDK**: API oficial de WhatsApp con número peruano +51.
- **Culqi REST + Checkout v4 JS**: pasarela peruana con Yape y tarjeta; Stripe quedó descartado.
- **@google/genai**: emisión server-side de tokens de Gemini Live.
- **canvas** en functions: generador de voucher en imagen, flujo secundario.

---

## 7. Estructura de carpetas explicada

```text
24-7chatmegagym/
+-- AI_CONTEXT.md                  ? ESTE ARCHIVO, memoria técnica permanente
+-- CONTEXTO_PROYECTO.md           ? Fuente de verdad de reglas de negocio, leer SIEMPRE
+-- README.md                      ? Resumen general
+-- ROADMAP.md                     ? Histórico, archivado
+-- AGENT_STATUS.md                ? Histórico, archivado
+-- AGENTE_PERSONALIZADO_PLAN.md   ? Plan histórico de Sofía, archivado
+-- TWILIO_PROD_PLAN.md            ? Plan histórico Twilio, archivado
+-- PLAN_SOFIA_PROACTIVA.md        ? Estado de Sofía y aviso URGENTE de claves Gemini
+-- PLAN_GIMNASIO_INTELIGENTE.md   ? Visión de largo plazo por fases
+-- PLAN_ACCESO_WHATSAPP.md        ? Plan y estado del acceso por WhatsApp, Fase 2A
+-- PLAN_PORTAL_MIEMBRO.md         ? Plan del portal del miembro, en pausa y descartado
+-- PLAN_BOT_VOZ_AGORA.md          ? Plan histórico de la voz, completado
+-- ROLLBACK_VOZ.md                ? Cómo revertir la voz paso a paso
+-- UI-PROMPT.md                   ? Prompt original usado en Lovable, histórico
+-- VOUCHER_IMAGEN_REPORTE.md      ? Reporte del voucher en imagen, histórico
+-- COMPROBANTES_PAGO.md           ? Documentación del comprobante de pago
+-- firebase.json                  ? Config de Hosting, Functions y Firestore
+-- .firebaserc                    ? Proyecto default: fit-ia-megagym
+-- firestore.rules                ? Reglas de seguridad de Firestore, endurecidas
+-- firestore.indexes.json         ? Índices compuestos de messages
+-- package.json                   ? Frontend: React, Vite, TS, Tailwind
+-- vite.config.ts, tsconfig*.json, tailwind.config.js, postcss.config.js
+-- index.html
+-- scripts/seed-db.js             ? Seeder de datos de prueba, uso manual
+-- src/
¦   +-- main.tsx y App.tsx         ? Rutas de la app
¦   +-- lib/
¦   ¦   +-- firebase.ts            ? Inicialización Firebase con VITE_*
¦   ¦   +-- auth.tsx               ? useUserRole, RequireAuth, RequireAdmin
¦   ¦   +-- utils.ts               ? Helpers como cn
¦   +-- hooks/useFirestore.ts      ? useMembers, useClasses, useMemberships
¦   +-- components/
¦   ¦   +-- layout/                ? DashboardLayout y Sidebar
¦   ¦   +-- ui/                    ? button, card, input, label, select
¦   ¦   +-- dashboard/NewInvoiceDialog.tsx
¦   ¦   +-- landing/PhoneMockup.tsx
¦   +-- pages/
¦       +-- LandingPage.tsx        ? Pública
¦       +-- LoginPage.tsx y RegisterPage.tsx
¦       +-- PublicPaymentPage.tsx  ? /pagar, Culqi Checkout v4
¦       +-- MemberDashboard.tsx    ? Portal cliente, básico y sin prioridad
¦       +-- dashboard/
¦           +-- MessagesPage.tsx   ? Historial de conversaciones
¦           +-- MembersPage.tsx    ? CRUD de miembros, pagos, rutinas y dieta
¦           +-- MembershipsPage.tsx? Planes
¦           +-- ClassesPage.tsx    ? Clases y reservas, vista demo si vacío
¦           +-- PaymentsPage.tsx   ? Transacciones, facturas y reenvío de voucher
¦           +-- AccessPage.tsx     ? Registros de acceso, accessLogs
¦           +-- SettingsPage.tsx   ? Config del gym, SELECTOR DE VOZ y seed
+-- functions/
    +-- package.json               ? Node 22, dependencias de backend
    +-- tsconfig.json
    +-- functions.yaml             ? Spec generada de endpoints, no editar a mano
    +-- .env                       ? SECRETOS, gitignored, NUNCA commitear
    +-- src/
        +-- index.ts               ? TODAS las Cloud Functions y helpers
        +-- index.ts.bak e index.ts.new  ? Backups legacy, no usar
        +-- bot/
        ¦   +-- messageProcessor.ts? CEREBRO de Sofía, tools, prompt e intercepts
        ¦   +-- transcription.ts   ? Whisper para audios
        ¦   +-- routines.ts        ? MICRO_RUTINAS, fallback de rutinas
        +-- ai/agent.ts            ? LEGACY, solo lo usa index.ts.bak, no tocar
        +-- tools/
            +-- definitions.ts     ? LEGACY, tools viejas, solo index.ts.bak
            +-- paymentHandler.ts  ? Crea orden Culqi y arma el link /pagar
            +-- culqiUtils.ts      ? Cliente Culqi usado por paymentHandler
            +-- voiceLink.ts       ? Firma y verifica JWT HS256 de voz, crypto nativo
            +-- voucherGenerator.ts? Genera voucher en imagen, flujo secundario
```

Nota: hay artefactos sueltos que no se deben tocar sin permiso: la carpeta extraña
`@/components/ui/select.tsx`, los archivos `vite.config.ts.timestamp-*.mjs`,
`functions/git_history*.txt`, `debug_plans.js`, `functions/diagnose.js` y
`functions/update_diet.js`.

---

## 8. Componentes y módulos principales y cómo se relacionan

### 8.1 El cerebro del bot: functions/src/bot/messageProcessor.ts

Es el módulo más delicado del proyecto. Exporta:

- processMessage(db, phone, messageText) — flujo principal de Sofía.
- executeTool(name, args) — ejecución de tools, también la usa getVoiceContext.

Orden interno de processMessage:

1. Busca al miembro por teléfono con findMember, probando formatos +51, 51, whatsapp: y otros.
2. Guarda memoria de perfil y conversacional con saveClientMemory, ver sección 11.
3. Detecta intención de renovación diferida, continuar y pagar después, guarda assistantMemory.renewalIntent y responde.
4. Intercept de acceso Fase 2A: si ACCESS_LOG_ENABLED es true, el teléfono está en ACCESS_LOG_TEST_PHONES y el mensaje parece de ingreso, llama register_access_log de forma determinista sin LLM y responde según el resultado. Si está apagado, no hace nada.
5. Carga historial de messages, últimos 12 mensajes.
6. Intercepts deterministas sin LLM para casos críticos: queja de link equivocado, estado de membresía, horarios, voucher, pago de deuda y reserva de clase grupal.
7. Construye el systemPrompt con hora Lima, datos del cliente, memoria, perfil y reglas.
8. Llama a OpenAI con tools y tool_choice auto; el modelo lo elige selectChatModel según keywords: gpt-4o para pagos, membresías y clases, gpt-4o-mini para el resto.
9. Si hay tool calls, las ejecuta; hay respuestas directas para links de pago, rutina y voucher; si no, hace una segunda llamada a OpenAI para redactar la respuesta.
10. Sanea la respuesta con sanitizeAssistantReply, quitando URLs ficticias y enlaces rotos.

Tools expuestas al LLM, 12 en total:

- get_membership_plans — lista planes de memberships.
- get_available_classes — clases activas y próxima fecha reservable.
- book_class — reserva directa con validación de duplicado y cupo.
- generate_payment_link — genera link Culqi para membership, debt_payment o class_booking.
- register_user — crea o actualiza miembro prospecto.
- get_student_routine — rutina desde studentRoutineAssignments por studentPhone.
- get_student_diet — dieta desde member.diet.
- send_payment_voucher — comprobante de pago en texto.
- update_member_profile — guarda trainingProfile con señales de entrenamiento y nutrición.
- get_payment_history — historial de pagos.
- check_member_status — estado de membresía, solo si el cliente pregunta.
- generar_link_voz — firma JWT de voz y devuelve enlace personalizado.

Tool interna, no expuesta al LLM:

- register_access_log — registra ingreso en accessLogs, con duplicados bloqueados 10 minutos.

### 8.2 Webhooks y funciones HTTP, functions/src/index.ts

Todas las Cloud Functions viven en un solo archivo:

- twilioWebhookWhatsapp, HTTP, 1GB y 120s — recibe mensajes de WhatsApp, resuelve el menú, transcribe audio, guarda messages, llama a processMessage y responde TwiML.
- culqiWebhook, HTTP, 512MB — escucha checkout.order.paid, crea reserva de clase, aplica pago de deuda o renueva membresía y envía confirmación y voucher.
- createCulqiCharge, HTTP, 512MB — cobra con token del Checkout /pagar y aplica el mismo efecto que el webhook.
- generateCulqiLink, HTTP, 512MB — crea orden Culqi y devuelve el link /pagar, lo llama la tool.
- sendManualWhatsAppMessage, Callable, 512MB y 120s — reenvío manual de voucher desde el panel.
- membershipReminder, Scheduler, 512MB y 300s — todos los días a las 19:00 Lima.
- classBookingReminder, Scheduler, 512MB y 300s — cada 30 minutos.
- serveVoucher, HTTP, 512MB — sirve imágenes de vouchers desde Storage.
- getVoiceContext, HTTP, 256MB y 30s — valida JWT de voz y entrega contexto mínimo del miembro.
- saveVoiceSessionMemory, HTTP, 512MB y 60s — guarda el resumen de la llamada de voz en assistantMemory.
- getVoiceTestGeminiToken, HTTP, 256MB y 60s — emite token de Gemini Live para pruebas.
- getVoiceTestRealtimeToken, HTTP, 256MB y 60s — emite client_secret de GPT-Realtime para pruebas.
- createCoachVoiceLink, HTTP, 256MB y 30s — firma JWT del coach Robert con role=coach.
- getCoachVoiceContext, HTTP, 256MB y 30s — contexto del coach: mes, métodos, rutinas y alumnas.

### 8.3 Menú rápido de WhatsApp

- Se activa con: menu, menú, opciones, ver opciones y mostrar menú.
- Usa Twilio Content API con twilio/list-picker; el Content SID se cachea en settings/whatsappMenu o en TWILIO_WHATSAPP_MENU_CONTENT_SID.
- Si falla el envío interactivo, cae a texto fallback con las mismas opciones.
- Opciones: Renovar membresía, Reservar FULLBODY, Hablar por voz y Ver mi rutina.
- Las respuestas del menú se convierten en intenciones normales, por ejemplo Quiero renovar mi membresía.
- Aviso discreto: Si quieres ver opciones rápidas, escribe menu. Aparece solo en primer contacto o si pasaron 24 horas o más desde el último mensaje, y nunca justo después de pedir el menú.

### 8.4 Pagos con Culqi

Flujo completo en la sección 9.4: generate_payment_link crea una orden en Culqi /v2/orders y arma el link /pagar; el cliente paga en el Checkout v4 con Yape o tarjeta; createCulqiCharge o culqiWebhook procesan, actualizan members o crean bookings y envían la confirmación por WhatsApp.

Reglas:

- Montos en centavos: S/70 son 7000. Plan Mensual S/70, Bimestral S/120, Trimestral S/150, Interdiario S/50 y clase grupal S/6 que son 600.
- Si el miembro tiene deuda y pide membresía, el sistema convierte el pago a debt_payment.
- El pago de deuda solo descuenta member.debt y no renueva.
- La reserva de clase grupal se confirma solo después del pago, en una transacción con cupo.
- Los pagos de S/0 no generan voucher.

### 8.5 Recordatorios automáticos

membershipReminder, 19:00 Lima:

- 3 días antes del vencimiento envía aviso amigable sin link.
- Miembros con assistantMemory.renewalIntent igual a continue_pay_later y 5 días o más sin respuesta reciben un recordatorio suave una sola vez, marcado con renewalFollowupSentAt.
- Día 1 y día 7 de vencido envía recordatorio de renovación y marca lastOverdueReminderDay.
- Deuda mayor a 0 envía recordatorio de saldo cada 7 días desde startDate y se detiene al pagar.
- Nunca envía a miembros inactive o prospect.

classBookingReminder, cada 30 minutos:

- Revisa reservas confirmed del día; si faltan 90 a 150 minutos para la clase, envía recordatorio.
- Se omite si la reserva se hizo el mismo día con 2 horas o menos de anticipación.
- Marca classReminderSentAt para no repetir.

### 8.6 Voz de Sofía, sin Agora

- El miembro pide hablar por voz y la tool generar_link_voz firma un JWT HS256 con phone, jti, iat y exp, 15 minutos, usando VOICE_LINK_SECRET, y arma el link {VOICE_PAGE_URL}/?token=...
- La página de voz agoravoz envía el token a getVoiceContext, que valida firma y vencimiento, devuelve 401 si no es válido, re-verifica elegibilidad con no inactive y menos de 15 días vencido, devuelve 403 si no, y si VOICE_TOKEN_SINGLE_USE es true marca usedVoiceTokens/{jti}.
- Devuelve name, status, diasParaVencer, plan, objetivo, assistantMemory con última interacción y resúmenes, rutinaResumen, rutinaDetalle, routineUrl y voice.provider con voice.model.
- agoravoz arranca el proveedor elegido:
  - gemini — Gemini Live con modelo gemini-3.1-flash-live-preview, con interrupción y voz femenina para Sofía.
  - gpt-realtime-mini — OpenAI Realtime mini con voz coral femenina.
  - agora — opción histórica con Agora más Gemini, conservada como fallback.
- Al cerrar la llamada, agoravoz manda el transcript a /api/save-voice-memory, que reenvía token y transcript a saveVoiceSessionMemory; el bot valida el token, resume con OpenAI gpt-4o-mini o OPENAI_MEMORY_SUMMARY_MODEL y guarda en members.assistantMemory, ver sección 11.
- El chat de texto lee esa memoria, así Sofía puede continuar lo hablado por voz y viceversa.

### 8.7 Coach Robert, voz del entrenador en la app de rutinas

- La app de rutinas pide un link a createCoachVoiceLink con mes entre 1 y 12; firma role=coach y mes, 15 minutos, y devuelve {VOICE_PAGE_URL}/?token=...&role=coach.
- getCoachVoiceContext valida role igual a coach y devuelve mes y metodo, 12 métodos avanzados de COACH_METHODS, ultimaRutina y rutinaAnterior desde sharedRoutines, alumnasActivas con hasta 10 miembros activos con nombre, objetivo y plan sin datos sensibles, gymData con dirección, horarios, planes y WhatsApp, y voice.provider con voice.model del mismo switch del panel.
- Voz masculina: Charon en Gemini y onyx en GPT. Nombre: Robert, experto en preparación de competidores.

### 8.8 Acceso por WhatsApp, Fase 2A

- Banderas: ACCESS_LOG_ENABLED, true en modo prueba, y ACCESS_LOG_TEST_PHONES con +51951296572 del propietario.
- Detección conservadora mentionsAccessIntent con frases como ya llegué al gym, quiero ingresar o estoy en la puerta, y lista de negativos como pagar, rutina, menú, horario y otras.
- La tool interna register_access_log evalúa membresía:
  - active — permitido con motivo active_member.
  - vencido hasta 3 días — permitido con motivo overdue_grace_period.
  - vencido más de 3 días — no permitido con motivo overdue_restricted.
  - inactive o expired — no permitido con motivo inactive_member.
  - no encontrado — motivo member_not_found.
- Guarda en accessLogs con localDate y localTime de Lima y testMode true; duplicados bloqueados 10 minutos.
- Respuestas deterministas de Sofía según el resultado.
- Panel: Accesos en /dashboard/access con filtro por fecha, resumen del día y detalle.
- Estado: implementado y desplegado en modo prueba. NO activar para todos sin aprobación.

### 8.9 Panel admin en React

- Rutas protegidas con RequireAdmin; emails admin hardcodeados en auth.tsx: admin@fitia.com, mysterrpj@gmail.com y prueba@test.com.
- Sidebar: Mensajes, Miembros, Membresías, Clases, Pagos, Accesos y Configuración.
- SettingsPage: datos del gym en config/gym, selector de voz en settings/voice y botón de seed de prueba.
- MembersPage: CRUD, pago en efectivo, renovación, rutinas en studentRoutineAssignments, dieta en member.diet y notas admin en adminNotes.
- PaymentsPage: transacciones y facturas, con reenvío de voucher por WhatsApp.
- ClassesPage: CRUD de clases y reservas, con vista demo si classes está vacía.
- MessagesPage: historial de conversaciones que resuelve el nombre por teléfono, sin envío manual tipo CRM.
- MemberDashboard de cliente: existe pero está básico y hardcodeado; sin prioridad porque el portal quedó descartado.

---

## 9. Flujos completos paso a paso

### 9.1 Mensaje de texto de WhatsApp

1. El cliente escribe al número +51 907 935 299.
2. Twilio hace POST a twilioWebhookWhatsapp.
3. El webhook resuelve la intención del menú interactivo si aplica, transcribe el audio si llega MediaUrl0 de tipo audio usando Whisper con idioma es, guarda el mensaje en messages con direction inbound y, si es petición de menú, envía el menú interactivo o el fallback y termina.
4. Llama a processMessage con db, phone y el texto.
5. Guarda la respuesta en messages con direction outbound y devuelve TwiML a Twilio.
6. Twilio entrega el mensaje al cliente.

### 9.2 Menú rápido

1. El cliente escribe menu.
2. El webhook detecta isWhatsAppMenuRequest y envía el list-picker con el Content SID cacheado.
3. El cliente toca una opción y Twilio manda ButtonPayload o InteractiveData.
4. El webhook convierte la opción en intención de texto normal y sigue el flujo 9.1.

### 9.3 Renovar membresía o pagar

1. El cliente escribe quiero pagar o renovar.
2. Sofía usa la tool generate_payment_link, calcula plan y monto y crea la orden Culqi.
3. Si hay deuda pendiente, el link se convierte a debt_payment.
4. Sofía envía el link /pagar.
5. El cliente paga con tarjeta o Yape en el Checkout.
6. createCulqiCharge o culqiWebhook actualiza members con status active, nuevo startDate y endDate, expirationDate, debt, amountPaid y membershipHistory, cerrando el periodo anterior.
7. WhatsApp confirma el pago y envía el voucher en texto.

### 9.4 Reservar clase grupal FULLBODY pagada

1. El cliente pide FULLBODY o aeróbicos.
2. Sofía pregunta el horario, 8:30 AM o 8:00 PM, si no lo dijo.
3. get_available_classes valida la clase activa y la próxima fecha.
4. generate_payment_link con paymentType class_booking arma el link de S/6.
5. Tras el pago, createPaidClassBooking en transacción verifica que la clase exista y esté activa, que no haya reserva duplicada del mismo miembro en esa fecha, que haya cupo según capacity, y crea bookings con status confirmed y los datos del pago.
6. WhatsApp confirma la reserva y classBookingReminder avisará el día de la clase.

### 9.5 Pago de deuda

1. El cliente menciona deuda o saldo pendiente.
2. El intercept determinista valida que member.debt sea mayor a 0.
3. generate_payment_link con paymentType debt_payment arma el link con el monto de la deuda.
4. Tras el pago, applyDebtPayment descuenta debt, suma a amountPaid, registra en payments del miembro y en la colección payments.
5. WhatsApp confirma el nuevo saldo.

### 9.6 Rutina y dieta

- Rutina: la tool get_student_routine busca en studentRoutineAssignments por studentPhone probando varios formatos, ordena por fecha y devuelve las que tengan url.
- Sofía envía el título, el enlace y una invitación a preguntar por un ejercicio.
- Dieta: la tool get_student_diet lee member.diet y entrega por fases del día, nunca todo de golpe: lunes, martes y miércoles para días 1 a 3, jueves y viernes para días 4 y 5, sábado y domingo para días 6 y 7.
- Acceso restringido si daysOverdue es 15 o más: no se entregan rutina ni dieta y se responde normal sin mencionar el bloqueo.

### 9.7 Voz de llamada

1. Un miembro activo pide hablar por voz.
2. generar_link_voz valida elegibilidad: menos de 15 días vencido y no inactivo.
3. Firma el JWT de 15 minutos y devuelve el enlace; Sofía lo envía y sugiere abrirlo en Chrome o Safari.
4. El miembro abre la página y agoravoz llama a getVoiceContext.
5. La página arranca WebRTC directo con el proveedor de settings/voice, gemini o gpt-realtime-mini, e inyecta el contexto en el prompt de Sofía.
6. Al colgar, agoravoz envía el transcript a /api/save-voice-memory y saveVoiceSessionMemory guarda el resumen en members.assistantMemory.
7. La próxima vez que el miembro escriba por WhatsApp, Sofía usa ese resumen.

### 9.8 Voz del coach Robert

1. La app de rutinas pide un link con mes a createCoachVoiceLink.
2. Obtiene {VOICE_PAGE_URL}/?token=...&role=coach.
3. agoravoz llama a getCoachVoiceContext y arma el prompt del coach con el método del mes, las rutinas compartidas y las alumnas activas.
4. Voz masculina con el mismo selector de proveedor del panel.

### 9.9 Acceso por WhatsApp en modo prueba

1. Solo si ACCESS_LOG_ENABLED es true y el número está en ACCESS_LOG_TEST_PHONES.
2. mentionsAccessIntent detecta ya llegué al gym de forma conservadora.
3. register_access_log evalúa membresía, evita duplicados de 10 minutos y guarda en accessLogs.
4. Sofía responde según allowed y reason de forma determinista.
5. El panel Accesos muestra el registro del día.

### 9.10 Recordatorios

- Todos los días a las 19:00 Lima, membershipReminder revisa vencimiento en 3 días, renovación diferida de 5 días o más, vencido día 1 o 7 y deuda cada 7 días.
- Cada 30 minutos, classBookingReminder revisa reservas de 90 a 150 minutos antes de la clase.
- Ambos guardan el mensaje en messages con su source para auditoría.

---

## 10. Integraciones externas

- **Twilio** — WhatsApp: webhook, envío y menú Content API. Variables TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_MENU_CONTENT_SID; el número whatsapp:+51907935299 está hardcodeado en index.ts.
- **OpenAI** — chat de Sofía, Whisper, resúmenes y Realtime. Variables OPENAI_API_KEY, OPENAI_CRITICAL_CHAT_MODEL con gpt-4o, OPENAI_DEFAULT_CHAT_MODEL con gpt-4o-mini y OPENAI_MEMORY_SUMMARY_MODEL.
- **Gemini Live** — voz directa alternativa. Variable GEMINI_API_KEY en functions/.env; el token se emite con @google/genai authTokens.create.
- **Culqi** — órdenes, Checkout v4 y cobros. Variables CULQI_PRIVATE_KEY y CULQI_PUBLIC_KEY; la public key también está hardcodeada en PublicPaymentPage.tsx.
- **Firebase** — Hosting, Functions, Firestore, Auth, Storage y Scheduler. Configuración en .firebaserc, firebase.json, firestore.rules y functions/.env.
- **agoravoz** — página de voz en App Hosting. Variables VOICE_PAGE_URL, VOICE_CONTEXT_URL y VOICE_MEMORY_URL opcional en ese proyecto.
- **App de rutinas** — coach Robert. Variable RUTINAS_APP_URL para el CORS de createCoachVoiceLink.

Variables de entorno de functions/.env, solo nombres, nunca los valores:

```text
OPENAI_API_KEY
STRIPE_SECRET_KEY            LEGACY, sin uso, Stripe descartado
STRIPE_WEBHOOK_SECRET        LEGACY, sin uso
CULQI_PUBLIC_KEY
CULQI_PRIVATE_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
VOICE_TOKEN_SINGLE_USE       false por defecto
VOICE_LINK_SECRET
VOICE_PAGE_URL
GEMINI_API_KEY
ACCESS_LOG_ENABLED           true en modo prueba
ACCESS_LOG_TEST_PHONES       +51951296572
```

Opcionales que lee el código: OPENAI_CRITICAL_CHAT_MODEL, OPENAI_DEFAULT_CHAT_MODEL, OPENAI_MEMORY_SUMMARY_MODEL, TWILIO_WHATSAPP_MENU_CONTENT_SID y RUTINAS_APP_URL.

Variables del frontend en src/lib/firebase.ts:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

---

## 11. Modelo de datos en Firestore

### members, el documento central del cliente

- name, string — nombre completo.
- phone, string — normalizado, por ejemplo +51951296572; se buscan varios formatos.
- email y dni, string — contacto e identidad.
- plan, string — nombre del plan actual.
- status, string — active, overdue, inactive o prospect.
- startDate y endDate, string YYYY-MM-DD — inicio y vencimiento de la membresía actual.
- expirationDate, Timestamp — vencimiento, duplicado de endDate para queries.
- planPrice, amountPaid y debt, number — precio, total pagado histórico y deuda actual.
- futureDebt y futureDebtStartDate — saldo futuro por adelantos.
- diet, string — dieta pegada por el admin en el campo Dieta Actual para Bot.
- trainingProfile, object — objetivo, nivel, diasSemana, limitaciones, horarioHabitual, preferenciaClases, constancia, estadoMotivacional, ultimaRutinaReportada, adherenciaEntrenamiento, ejercicioDificil, progresoReportado, molestiaEntrenando, riesgoAbandono, adherenciaNutricional, dificultadNutricional, comidaProblematica, patronRecaida, preferenciasAlimentarias y notasTrainer.
- assistantMemory, object — ultimaInteraccionClave, ultimaInteraccionTexto, resumenConversacional, ultimaSesionVozResumen, ultimoCanal, updatedAt, lastVoiceSessionAt, renewalIntent, renewalIntentText, renewalIntentAt y renewalFollowupSentAt.
- payments, array — historial con amount, method, type, date, chargeId y orderId.
- membershipHistory, array — periodos de membresía con plan, startDate, endDate, planPrice, amountPaid, debt, status y payments.
- adminNotes, string — notas internas que nunca se envían al cliente.
- profileStep, number — progreso del cuestionario de perfil.
- role, string — admin o user, usado por auth.
- authUid, string — vínculo futuro del portal web; hoy el registro web crea documentos vacíos con id igual al uid.
- createdAt, Timestamp — ingreso al gimnasio.

Regla crítica: debt es la fuente de verdad de la deuda. No recalcular restando pagos. amountPaid acumula el histórico con renovaciones incluidas y no sirve para el periodo actual; usar planPrice menos debt.

### Otras colecciones

- memberships — planes con name, price, duration, features y activeMembers.
- classes — clases con name, instructor, day de 0 a 6, time HH:mm, capacity y status active o inactive.
- bookings — reservas con memberId, classId, date, status confirmed o cancelled, paymentType, paymentAmount, paymentMethod, culqiChargeId, culqiOrderId, created_at y classReminderSentAt.
- payments — transacciones del panel con memberName, memberId, concept, amount, method, invoiceType, date y createdAt.
- messages — historial de chat con phone, content, direction inbound o outbound, timestamp y source; índices compuestos de phone y timestamp.
- accessLogs — ingresos con memberId, memberName, phone, source, intentText, statusAtAccess, allowed, reason, createdAt, localDate, localTime y testMode.
- settings/voice — provider igual a agora, gemini o gpt-realtime-mini, model, updatedAt y updatedBy.
- settings/whatsappMenu — contentSid, friendlyName y updatedAt como cache del menú.
- config/gym — name, address, phone, email, whatsappNumber, timezone, openTime y closeTime.
- studentRoutineAssignments — studentPhone, routineTitle, routineUrl, payload, status y createdAt.
- sharedRoutines — rutinas compartidas del coach con payload, title y createdAt.
- usedVoiceTokens — solo si VOICE_TOKEN_SINGLE_USE es true; usedAt y expireAt por jti, con TTL opcional.

### Reglas de Firestore, firestore.rules, ya endurecidas

- Admin por emails autorizados con acceso total.
- members: cada usuario autenticado solo lee y escribe su documento con document igual a uid y role igual a user, y no puede asignarse admin.
- memberships, classes, bookings, payments, messages, config, settings, accessLogs y studentRoutineAssignments solo para admin.
- El bot usa Admin SDK por backend y no depende de estas reglas.
- Verificado en producción: sin sesión da 403 y con sesión admin da 200.

---

## 12. Reglas de negocio, resumen ejecutivo

1. Estados de miembro: active, overdue e inactive, y prospect para no registrados. En el panel solo se usan Activo, Vencido e Inactivo.
2. Política por días vencido: 0 días acceso completo; de 1 a 14 días acceso completo sin avisos ni links, solo si el cliente pregunta; 15 días o más bloquea rutina, dieta, voucher, historial y estado, responde general con normalidad y no menciona el bloqueo.
3. Deuda: member.debt es la verdad. Un miembro vencido por más de 30 días pasa a Inactivo por edición manual o regla del panel.
4. Precios: 1 mes S/70, 2 meses S/120, 3 meses S/150, Interdiario S/50 y clase grupal S/6; la web informativa muestra S/80 y es una discrepancia histórica por confirmar.
5. Horarios: lunes a viernes de 6:00 a 22:00, sábados de 6:00 a 18:00 y domingos de 6:00 a 12:00.
6. Clases grupales: FULLBODY con LIZ PIA, lunes a viernes a las 8:30 AM y 8:00 PM, S/6, abiertas al público general; la reserva se confirma tras el pago; el pase de máquinas por día se paga en recepción sin link.
7. Voz: solo elegibles con menos de 15 días vencido y no inactivo; los pagos no se hacen por voz y se pasa el link por WhatsApp; el selector del panel no se elimina ni se reduce.
8. Memoria: chat y voz comparten assistantMemory y trainingProfile; Sofía completa el perfil poco a poco y nunca como formulario.
9. Menú: opcional; menu u opciones lo abren; el aviso discreto sigue las reglas de la sección 8.3.
10. Acceso: la Fase 2A solo registra y no abre puerta; modo prueba solo con el número del propietario hasta aprobación.
11. Voucher: texto actual; los pagos de S/0 no generan voucher; si no hay pago, se dice.
12. Recordatorios: nunca a inactivos; respetar las ventanas de tiempo de la sección 8.5.

---

## 13. Convenciones de código

- Rama: todo el trabajo en feature/voz-agora, con commits pequeños y descriptivos.
- TypeScript: el backend usa require perezoso dentro de las funciones, patrón existente para reducir cold start y problemas de bundling; el frontend usa imports ESM con alias @ que apunta a src.
- Builds: frontend con npm run build que corre tsc -b y vite build; functions con npm.cmd run build que corre tsc; agoravoz con pnpm.cmd run typecheck o pnpm run verify.
- Deploy: firebase deploy --only functions o --only hosting. Si se toca messageProcessor, desplegar functions completas porque el webhook y los recordatorios comparten ese archivo.
- Horas: siempre America/Lima con helpers como getLimaDateParts y getLimaDateString.
- Mensajes de Sofía: de 1 a 3 oraciones, de 1 a 3 emojis, negrita solo para una palabra clave, hasta 3 viñetas y nunca listas numeradas, enlaces en su propia línea y sin inventar URLs.
- Prompt de Sofía: reglas positivas; cero restricciones negativas con palabras como nunca o prohibido; no sobre-optimizar el prompt ni las descripciones de tools sin necesidad.
- Idioma: código y comentarios mixtos según archivo y documentación en español.

---

## 14. Riesgos y puntos sensibles

### Seguridad y secretos

- functions/.env está en .gitignore. NUNCA commitearlo ni pegar valores en chat o markdown.
- Las claves Gemini MegaGym Voz Bot y MegaGym Voz Web quedaron bloqueadas por facturación prepago sin saldo; la clave vieja Meganutri en modo gratuito es la que funciona. Recordatorio URGENTE en PLAN_SOFIA_PROACTIVA.md: cargar saldo mínimo S/40 en el proyecto agentevozmegagym la próxima semana y NO borrar Meganutri hasta confirmar.
- Se vieron claves en logs y configuración histórica: .claude/settings.json tiene un valor de culqi.private_key y PublicPaymentPage.tsx tiene la public key hardcodeada. Considerar rotar claves de Culqi, Twilio y OpenAI en algún momento.
- El CORS de voz restringe orígenes a VOICE_PAGE_URL más localhost, lo cual es correcto.
- Las funciones de prueba getVoiceTestGeminiToken y getVoiceTestRealtimeToken usan CORS abierto con asterisco; solo son para pruebas y no deben tratarse como productivas.

### Riesgos técnicos

- messageProcessor.ts es compartido por el webhook y los recordatorios; un cambio roto rompe todo el bot. Los cambios deben ser aditivos, con build y prueba con el número del propietario.
- NO activar el acceso para todos sin orden explícita del propietario; las banderas son ACCESS_LOG_ENABLED y ACCESS_LOG_TEST_PHONES.
- functions.config debe migrarse a parámetros antes de marzo 2027 y aún no está hecho.
- Código legacy sin uso: ai/agent.ts, tools/definitions.ts, index.ts.bak e index.ts.new; no tocarlos sin permiso y documentar antes de borrar.
- La página de voz agoravoz se despliega por separado en App Hosting y puede no autodesplegar; forzar con un commit real y monitorear rollouts si hace falta.
- El portal del miembro quedó descartado; no retomarlo sin aprobación.
- Los documentos DECISIONS.md, HANDOFF.md, PROJECT_CONTEXT.md, TODO.md, notes de agoravoz y los PLAN son del usuario; no editar sin autorización.

---

## 15. Decisiones de arquitectura, historial

1. Culqi en vez de Stripe: pasarela peruana con Yape y tarjeta; Stripe quedó como código legacy en .env.
2. Bot híbrido determinista más LLM: casos críticos como pagos, horarios, estado, acceso, voucher y clase usan intercepts sin LLM para evitar errores; el LLM maneja la conversación general con tools.
3. Modelo por costo: gpt-4o para casos críticos y gpt-4o-mini para el resto, configurable por entorno.
4. Voz directa sin Agora: WebRTC directo a Gemini Live o GPT-Realtime para mejor calidad y menor costo; agora queda como opción legacy del switch.
5. Memoria compartida entre chat y voz: assistantMemory es un solo campo compartido con ultimoCanal para saber de dónde vino la última interacción.
6. Switch de voz en el panel: settings/voice.provider gobierna el proveedor sin redeploy y lo leen getVoiceContext y getCoachVoiceContext.
7. Acceso en modo prueba: feature flag más lista de teléfonos; la activación general solo con aprobación.
8. Reglas Firestore endurecidas: admin por email y auto-doc por uid; el bot corre por backend y no depende de reglas.
9. Node 22: runtime migrado porque Node 20 está deprecado.
10. Portal del miembro descartado en agosto 2026; el QR y PIN futuros se harán por WhatsApp más lector en la puerta.

---

## 16. Roadmap y próximos pasos sugeridos

### Corto plazo, con aprobación del propietario

- Cargar saldo en el proyecto Gemini agentevozmegagym para las claves MegaGym Voz Bot y MegaGym Voz Web, confirmar que funcionan, y luego migrar GEMINI_API_KEY a una clave propia y retirar Meganutri.
- Terminar pruebas de la Fase 2A con el propietario: menu, quiero pagar, quiero mi rutina y a que hora abren, y confirmar que pagos, rutina, menú y voz siguen funcionando.
- Migrar functions.config a parámetros antes de marzo 2027.
- Rotar claves expuestas en logs, opcional pero recomendado.

### Medio plazo, según PLAN_GIMNASIO_INTELIGENTE

- Hardware de acceso: chapa eléctrica 12V fail-secure, teclado con PIN, transformador de 220 a 12V y botón o llave de emergencia. Referencias de compra en Perú ya compartidas: Mercado Libre, Sodimac, ferropolis TRAVEX y ZKTeco. Cuando compre, preparar la función Generar PIN en el panel.
- Piloto de acceso con 1 o 2 clientes de confianza.
- Activación general del acceso solo con su orden.
- Inventario y ventas, reportes, cámaras y alertas, música y luces, según fases 3 a 6 del plan.

### Explícitamente NO priorizado

- Portal del miembro, descartado.
- Reconocimiento facial y biometría.
- Tracker avanzado de rutinas con series y pesos, CRM completo, envío manual desde Mensajes y módulo nutricional avanzado.

---

## 17. CÓMO DEBE TRABAJAR UNA IA EN ESTE PROYECTO, OBLIGATORIO

Esta sección es un contrato de trabajo. Cualquier IA que toque este repositorio debe cumplirla.

### 17.1 Antes de tocar nada

1. Leer completo este archivo AI_CONTEXT.md.
2. Leer CONTEXTO_PROYECTO.md, fuente de verdad de reglas de negocio.
3. Leer el plan relevante según la tarea: PLAN_SOFIA_PROACTIVA.md para Sofía y voz, PLAN_ACCESO_WHATSAPP.md para acceso, PLAN_GIMNASIO_INTELIGENTE.md para visión y ROLLBACK_VOZ.md si toca voz.
4. Confirmar con git status y git branch el estado y la rama; trabajar en feature/voz-agora.
5. Identificar los archivos que se van a tocar y leerlos antes de editar.

### 17.2 Reglas de oro

1. Nunca romper lo que funciona. Los cambios deben ser aditivos y reversibles: agregar tools o flags en vez de reemplazar lógica.
2. No tocar messageProcessor.ts a la ligera. Es el cerebro compartido por el webhook y los recordatorios. Respetar las reglas del prompt: cero restricciones negativas, contexto vía tools y no sobre-diseñar.
3. No activar nada para todos sin aprobación explícita del propietario: acceso, nuevos recordatorios, cambios de precio o cambios de comportamiento de Sofía.
4. No editar archivos del usuario sin permiso: DECISIONS.md, HANDOFF.md, PROJECT_CONTEXT.md, TODO.md, notes de agoravoz y los PLAN, salvo que el propietario lo pida.
5. Nunca escribir secretos en código, markdown, chat, logs ni commits.
6. No borrar archivos legacy sin avisar: ai/agent.ts, tools/definitions.ts, backups y artefactos sueltos; primero documentar.
7. No modificar el selector de voz ni eliminar opciones sin decisión explícita del usuario.
8. No implementar lo marcado como no priorizar ni el portal del miembro.
9. Explicar simple: el propietario no es técnico; respuestas cortas, sin jerga y con analogías cuando haga falta.

### 17.3 Cómo analizar

- Primero leer y nunca adivinar: usar rg para ubicar y Get-Content para leer.
- Si una zona parece duplicada, por ejemplo ai/agent.ts frente a bot/messageProcessor.ts, verificar con rg qué la importa antes de concluir cuál es el cerebro.
- Antes de proponer cambios de datos, revisar el modelo de la sección 11 y las reglas de la sección 12.
- Si se tocan pagos, respetar: debt es la verdad, montos en centavos, reserva solo tras pago y S/0 sin voucher.
- Si se toca voz, respetar: JWT de 15 minutos firmado con VOICE_LINK_SECRET, elegibilidad con menos de 15 días vencido, payload mínimo sin datos sensibles y memoria compartida vía assistantMemory.

### 17.4 Cómo actualizar ESTE archivo

- Regla permanente: cada vez que se implemente una funcionalidad, se actualiza AI_CONTEXT.md en el mismo commit o PR que el código.
- Actualizar al menos la sección 4 de estado, la sección 8 de módulos, la sección 9 de flujos si aplica, la sección 11 de datos, la sección 12 de reglas, la sección 16 de roadmap y la fecha del encabezado.
- No borrar secciones: si algo dejó de aplicarse, marcarlo como LEGACY o histórico con fecha.
- Escribir en español, con pasos y listas claros.
- Si el código y este documento se desfasan, corregir el documento y avisar al propietario en la respuesta final.

### 17.5 Despliegues

- Antes de desplegar: npm.cmd run build para functions y npm run build para el frontend si se tocó.
- firebase deploy --only functions o --only hosting.
- Si se tocó messageProcessor.ts, desplegar functions completas.
- Después de desplegar, probar con el número del propietario +51951296572 y confirmar que pagos, rutina, menú, voz y acceso siguen funcionando.
- Si algo falla, usar ROLLBACK_VOZ.md para voz o apagar flags como ACCESS_LOG_ENABLED=false antes de revertir código.

### 17.6 Seguridad

- Verificar que ningún commit incluya .env, claves o tokens.
- No pegar valores de .env en el chat.
- No abrir CORS de producción con asterisco; las funciones de prueba son la excepción.
- Reportar cualquier clave vista en logs o historial como pendiente de rotación.

---

## 18. Referencia rápida de comandos

```text
npm run dev            desarrollo del panel
npm run build          build de producción del panel, tsc y vite
cd functions
npm.cmd run build      build de functions, tsc
cd ..
firebase deploy --only functions
firebase deploy --only hosting
pnpm.cmd run typecheck    typecheck de agoravoz
pnpm run verify           verify de agoravoz
git status
git branch --show-current
```

Fin del documento. Cualquier IA debe confirmar que leyó AI_CONTEXT.md y CONTEXTO_PROYECTO.md antes de trabajar.
