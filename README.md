# MegaGym 24/7

Sistema de gestión para gimnasio con bot de WhatsApp, dashboard administrativo y pagos en línea.

## Estado actual

- Frontend en `React + Vite + TypeScript`
- Backend en `Firebase Functions`
- Base de datos en `Firestore`
- WhatsApp vía `Twilio`
- IA vía `OpenAI`
- Pagos vía `Culqi`
- Hosting en `Firebase Hosting`

URL actual:

- `https://fit-ia-megagym.web.app`

## Funcionalidades principales

- Gestión de miembros y membresías
- Estados de miembros limitados a Activo, Vencido e Inactivo
- Historial de membresías por periodo con costo, pagado, deuda y pagos asociados
- Notas administrativas internas por miembro
- Historial de mensajes del bot en dashboard
- Recordatorios automáticos de vencimiento y deuda, excluyendo miembros inactivos
- Consulta de rutinas y dietas por WhatsApp
- Generación de links de pago Culqi
- Envío de voucher/comprobante por WhatsApp y reenvío desde el panel de pagos
- Transcripción de audios de WhatsApp
- Módulo de clases conectado a Firestore
- Reserva pagada de clases grupales por WhatsApp
- Memoria progresiva y personalización del bot por cliente

## Módulo de clases

Actualmente:

- el dashboard `Clases` ya lee `classes`, `bookings` y `members`;
- crear una clase desde el panel ya guarda en Firestore;
- el bot puede consultar clases y reservar;
- las reservas validan duplicados y cupos;
- las clases grupales reales operativas son `FULLBODY` de lunes a viernes a las `8:30 AM` y `8:00 PM` con `LIZ PIA`;
- las clases grupales se pagan aparte de la membresía por `S/ 6` vía `Culqi`;
- el bot distingue entre membresía, clase grupal y pase diario de máquinas en recepción;
- existe `classBookingReminder` para recordar clases grupales confirmadas;
- ese recordatorio no se envía si la reserva se hizo el mismo día y faltaban `2 horas o menos` para la clase;
- si `classes` está vacío, el dashboard muestra una vista demo coherente para que no aparezca todo en cero.

## Memoria del bot

Sofía ya empezó a guardar memoria útil del cliente de forma progresiva en `members`:

- datos del `trainingProfile`:
  - `objetivo`
  - `nivel`
  - `diasSemana`
  - `limitaciones`
  - `horarioHabitual`
  - `preferenciaClases`
  - `constancia`
  - `estadoMotivacional`
- memoria conversacional breve en `assistantMemory`:
  - `ultimaInteraccionClave`
  - `ultimaInteraccionTexto`

La idea es que no pregunte todo de golpe, sino que complete el perfil poco a poco mientras conversa.

Pendiente:

- cancelación de reservas;
- asistencia / no-show;
- lista de espera o reprogramación.

## Estructura clave

- `src/`: frontend del dashboard y vistas cliente
- `functions/src/index.ts`: webhooks y funciones principales
- `functions/src/bot/messageProcessor.ts`: cerebro del bot
- `functions/src/bot/transcription.ts`: transcripción de audios
- `CONTEXTO_PROYECTO.md`: fuente principal de verdad del proyecto

## Documentación importante

- [CONTEXTO_PROYECTO.md](./CONTEXTO_PROYECTO.md): contexto, reglas y estado real actual
- [ROADMAP.md](./ROADMAP.md): roadmap histórico con actualización corta del estado
- [AGENT_STATUS.md](./AGENT_STATUS.md): estado histórico con nota de superseded
- [AGENTE_PERSONALIZADO_PLAN.md](./AGENTE_PERSONALIZADO_PLAN.md): plan histórico de Sofía

## Nota

Si vas a tocar lógica del bot o reglas de negocio, revisa primero `CONTEXTO_PROYECTO.md`.
