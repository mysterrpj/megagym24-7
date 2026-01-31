# 🗺️ Roadmap del Proyecto - Fit IA

Este documento detalla los pasos restantes para llevar el sistema de local a producción.

## 🟢 Fase 1: Cimientos y MVP (Completado)
- [x] Configuración del entorno de desarrollo (Vite, React, Tailwind).
- [x] Diseño de UI/UX "Dark Mode & Green".
- [x] Configuración de Firebase (Proyecto, Auth, Firestore).
- [x] Desarrollo de todas las páginas del Dashboard.
- [x] Conexión de páginas a Base de Datos (Lectura/Escritura).
- [x] Sistema de Datos de Prueba (Seeder).

## 🟡 Fase 2: Integraciones Externas (Próximo Paso)
Esta fase conecta el sistema con el mundo real (Cobros y Mensajes).

- [ ] **Pasarela de Pagos (Stripe)**
    - [x] Obtener claves de API de Stripe (Test Mode).
    - [x] Configurar Cloud Function `createStripeCheckout`.
    - [x] Botón "Suscribirse" integrado en el Dashboard (Planes) con redirección a Stripe.
    - [x] Crear Webhook para confirmar pagos (Función desplegada, configuración pendiente en Stripe Dashboard).

- [ ] **Agente IA de WhatsApp (Twilio + OpenAI)**
    - [x] Configurar variables de entorno y reintentar despliegue.

## 🟢 Fase 3: Despliegue y Producción (COMPLETADO)
Llevar la aplicación a internet y asegurar el acceso.

- [x] **Despliegue (Hosting)**
    - [x] Configurar `firebase.json`.
    - [x] Frontend desplegado en Firebase Hosting (`fit-ia-megagym.web.app`).

- [x] **Seguridad y Acceso**
    - [x] Implementar Registro de Usuarios.
    - [x] Implementar Roles (Admin vs Miembro).
    - [x] Proteger rutas del Admin Dashboard.
    - [x] Crear Dashboard simple para Miembros.
Llevar la aplicación a internet.

- [ ] **Dominio Personalizado** (Opcional).
- [ ] **Afinar Reglas Firestore**: Refinar `firestore.rules` para producción estricta.

## 🟣 Fase 4: Expansión (Futuro)
Ideas para versiones posteriores.
- [ ] App Móvil nativa para clientes (QR para entrar).
- [ ] Control de Acceso (Torniquetes conectados a Arduino/ESP32).
- [ ] Reportes avanzados de Finanzas (Exportar a Excel/PDF).
