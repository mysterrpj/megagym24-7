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
- Historial de mensajes del bot en dashboard
- Recordatorios automáticos de vencimiento y deuda
- Consulta de rutinas y dietas por WhatsApp
- Generación de links de pago Culqi
- Envío de voucher/comprobante
- Transcripción de audios de WhatsApp
- Módulo de clases conectado a Firestore

## Módulo de clases

Actualmente:

- el dashboard `Clases` ya lee `classes`, `bookings` y `members`;
- crear una clase desde el panel ya guarda en Firestore;
- el bot puede consultar clases y reservar;
- las reservas validan duplicados y cupos;
- si `classes` está vacío, el dashboard muestra una vista demo coherente para que no aparezca todo en cero.

Pendiente:

- cancelación de reservas;
- recordatorios automáticos de clase;
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
