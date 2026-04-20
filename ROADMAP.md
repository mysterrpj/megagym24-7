> [!NOTE]
> **DOCUMENTO ARCHIVADO Y COMPLETADO**. Este roadmap ya no guía el desarrollo actual. La fuente de verdad vigente es `CONTEXTO_PROYECTO.md`.

# Roadmap Histórico - MegaGym 24/7

Este archivo se conserva como referencia histórica del proyecto.

## Estado real actual (2026-04-20)

Lo que ya está operativo:

- bot de WhatsApp en producción con `Twilio + OpenAI`;
- pagos operativos con `Culqi`;
- recordatorios automáticos de vencimiento y deuda activos;
- historial de mensajes y recordatorios visible en dashboard;
- módulo de clases en Fase 1 conectado a `Firestore`;
- validación de cupos y duplicados en reservas del bot ya implementada;
- vista demo de clases activa cuando `classes` está vacía.

Pendientes vivos, pero fuera de este roadmap histórico:

- cancelación de reservas de clases;
- recordatorios automáticos de clase;
- asistencia / no-show;
- lista de espera o reprogramación;
- migración futura de `functions.config()` y runtime `Node.js 20`.

---

## Fase 1: Cimientos y MVP (Completado)

- [x] Configuración del entorno de desarrollo
- [x] Dashboard base
- [x] Firebase Auth + Firestore
- [x] CRUD principal de miembros y membresías
- [x] Seeder / datos de prueba base

## Fase 2: Integraciones externas (Completado)

- [x] WhatsApp vía Twilio
- [x] IA vía OpenAI
- [x] Transcripción de audios
- [x] Pagos en línea

Nota:

- `Stripe` fue una ruta inicial de este roadmap, pero quedó descartado en la implementación real.
- La integración final usada en producción es `Culqi`.

## Fase 3: Producción (Completado)

- [x] Deploy en Firebase Hosting
- [x] Deploy de Cloud Functions
- [x] Bot en producción
- [x] Dashboard administrativo funcional

## Fase 4: Expansión (Pendiente histórico)

Ideas que siguen siendo válidas como backlog:

- app móvil para clientes;
- control de acceso;
- reportes financieros más avanzados;
- automatizaciones adicionales de retención.
