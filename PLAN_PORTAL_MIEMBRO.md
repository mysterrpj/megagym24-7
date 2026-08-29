# PLAN: Terminar el Portal del Miembro (Cliente)

> **Para el asistente IA que lea esto:** Este archivo es un plan de trabajo. Antes de tocar
> cualquier cosa, **lee primero `CONTEXTO_PROYECTO.md`** (es la fuente de verdad del proyecto)
> y respeta todas sus reglas. Este plan NO reemplaza ese documento; se apoya en él.
>
> Confírmale al usuario que asimilaste el contexto y este plan antes de escribir código.

---

## 0. Objetivo en una frase

Hoy el cliente puede registrarse y loguearse, pero su panel (`/member-dashboard`) está
**vacío / hardcodeado**: no muestra su membresía real, su rutina, su dieta ni sus clases.
La meta es que, cuando un cliente inicie sesión, el portal muestre **sus datos reales de
Firestore** (los mismos que Sofía usa por WhatsApp).

Esto tiene valor por sí solo **y** deja lista la base para, más adelante, agregar voz en tiempo
real con Agora (ver sección final).

---

## 1. Reglas obligatorias antes de tocar código

1. **No romper el bot.** El bot (`functions/src/bot/messageProcessor.ts`) y sus reglas de
   negocio (deuda, acceso por días vencido, personalidad de Sofía) NO se tocan salvo que este
   plan lo pida explícitamente. Todo el trabajo es **frontend (`src/`) + reglas de seguridad +
   como mucho una Cloud Function nueva para vincular cuentas**.
2. **La deuda es `member.debt`.** No recalcular deuda restando pagos (ver la regla crítica del
   voucher en `CONTEXTO_PROYECTO.md`). Para mostrar deuda en el portal, leer `member.debt`.
3. **Respetar la política de acceso por días vencido** (0-14 acceso completo, 15+ restringido).
   El portal no debe exponer rutina/dieta a un miembro con 15+ días vencido si se quiere ser
   coherente con el bot. (Empezar mostrando membresía/estado; la restricción fina se define en
   la Fase 4.)
4. **Estados válidos:** `active`, `overdue`, `inactive`. Nada más.

---

## 2. Diagnóstico actual (lo que ya existe y lo que falla)

### Lo que YA funciona
- Auth con Firebase: `src/lib/auth.tsx` (`RequireAuth`, `RequireAdmin`, `useUserRole`).
- Rutas: `/register`, `/login`, `/member-dashboard` en `src/App.tsx`.
- Registro: `src/pages/RegisterPage.tsx` crea usuario y un doc en `members`.
- Pago: `src/pages/MemberDashboard.tsx` ya tiene un botón que llama a `createCulqiCheckout`.
- Página de pago pública probada: `src/pages/PublicPaymentPage.tsx` (usa `createCulqiCharge`).

### El PROBLEMA DE RAÍZ — Identidad partida en dos (esto es el bloqueante real)

Hay **dos formas distintas** en que existe un "miembro", y **no están conectadas**:

| | Miembro del gym (bot/WhatsApp) | Cuenta web (registro) |
|---|---|---|
| Dónde se crea | Admin en el dashboard (`useFirestore.ts` → `addMember`) | `RegisterPage.tsx` |
| ID del documento | Auto-generado por Firestore | `user.uid` de Firebase Auth |
| Llave real de búsqueda | **`phone`** (teléfono normalizado) | El `uid` |
| Datos que tiene | plan, `endDate`, `debt`, `status`, `diet`, `trainingProfile`, pagos… | Solo `name`, `email`, `role`, `status:'active'`, `createdAt` |

Consecuencias concretas:
- `RegisterPage.tsx` (líneas ~41-48) hace `setDoc(doc(db,'members',user.uid), {...})` → crea un
  **doc nuevo y vacío**, distinto del doc real del cliente en el gym.
- `useUserRole` en `auth.tsx` lee `doc(db,'members', currentUser.uid)` → encuentra ese doc
  vacío, no el real.
- Las **rutinas** viven en otra colección: `studentRoutineAssignments`, buscadas por
  **`studentPhone`** (ver `messageProcessor.ts` ~línea 896). Sin el teléfono vinculado, el
  portal no puede traer la rutina.

**Conclusión:** aunque conectemos el UI a Firestore, sin resolver la identidad el portal
mostraría un doc vacío. **Primero hay que vincular la cuenta web (uid) con el miembro real
(por teléfono).** Ese es el corazón de este plan.

### Riesgo de seguridad a corregir
`firestore.rules` actualmente es `allow read, write: if true` (abierto a todo el mundo). Para un
portal de clientes eso significa que cualquiera podría leer los datos de todos los miembros.
Hay que endurecerlo (Fase 5) **con cuidado de no romper el dashboard admin**.

---

## 3. Decisión clave de diseño: vincular por teléfono

El teléfono es la llave que ya usa todo el sistema (bot, rutinas, pagos, recordatorios). Por lo
tanto **la cuenta web se vincula al miembro real mediante el teléfono**.

Flujo elegido (el más simple y robusto, sin romper el bot):
1. Al registrarse/loguearse por primera vez, el cliente ingresa su **número de WhatsApp**.
2. Una Cloud Function busca en `members` un doc con ese `phone` (normalizado a `+51XXXXXXXXX`).
3. Si existe → escribe `authUid: <uid>` en **ese** doc real (campo nuevo, no rompe nada).
4. Si no existe → es alguien que aún no es cliente del gym: se le muestra un estado "sin
   membresía" e invitación a inscribirse (el botón de pago que ya existe).
5. El portal (y `useUserRole`) pasan a buscar al miembro por `where('authUid','==',uid)` en vez
   de por ID de documento.

> **Por qué en Cloud Function y no en el cliente:** normalizar el teléfono y escribir en el doc
> de otro miembro debe hacerse en backend para no depender de reglas laxas ni exponer la
> colección completa al navegador.

Normalización de teléfono a reutilizar: revisar cómo lo hace `index.ts`/`messageProcessor.ts`
(quitar `whatsapp:`, espacios, forzar prefijo `+51`) y **usar exactamente la misma lógica** para
que coincida con los docs existentes.

---

## 4. Fases de implementación

### Fase 1 — Vinculación de identidad (PRIMERO, es el bloqueante)
- [ ] Crear Cloud Function callable `linkMemberAccount({ phone })` en `functions/src/`:
  - Normaliza el teléfono con la misma lógica del bot.
  - Busca `members` por `phone` (probar los formatos alternativos que ya usa el bot: con/sin
    `+51`, etc.).
  - Si encuentra: `updateDoc(memberRef, { authUid: uid, email, name })` (email/name del auth).
  - Si no encuentra: devolver `{ linked: false }` (no crear doc nuevo aquí).
- [ ] Cambiar `RegisterPage.tsx`: **no** crear el doc vacío `members/{uid}`. Tras registrarse,
  redirigir a un paso "Vincula tu número" que llame a `linkMemberAccount`.
- [ ] (Opción recomendada) Añadir verificación ligera del teléfono. Mínimo viable: confiar en el
  número + DNI que coincida con el doc. Ideal futuro: OTP por WhatsApp. Dejar el mínimo viable
  ahora y anotar el OTP como mejora.
- [ ] Actualizar `useUserRole`/crear `useCurrentMember` para resolver el miembro por `authUid`.

### Fase 2 — Hook de datos del miembro
- [ ] Crear `src/hooks/useCurrentMember.ts`:
  - Escucha (`onSnapshot`) el doc de `members` donde `authUid == user.uid`.
  - Devuelve: `plan`, `status`, `startDate`, `endDate`, `expirationDate`, `debt`, `planPrice`,
    `amountPaid`, `diet`, `trainingProfile`, `payments`, y flags derivados
    (`diasParaVencer`, `diasVencido`).
- [ ] Crear helpers de fecha con `date-fns` (ya está instalado) para calcular días restantes /
  vencidos a partir de `endDate`/`expirationDate`.

### Fase 3 — Conectar el UI del panel a datos reales
Archivo: `src/pages/MemberDashboard.tsx` (hoy todo hardcodeado).
- [ ] **Tarjeta "Mi Membresía"**: reemplazar el bloque fijo "No tienes membresía activa"
  (línea ~37) por el estado real:
  - Si `status==='active'`: mostrar plan, fecha de vencimiento y días restantes.
  - Si `status==='overdue'`: mostrar vencida + días vencido + botón renovar.
  - Si `debt > 0`: mostrar saldo pendiente (leer `member.debt`, NO recalcular).
  - Si no hay miembro vinculado / sin membresía: mostrar los planes + botón pagar (lo actual).
- [ ] **Tarjeta "Mi Rutina"** (nueva): leer de `studentRoutineAssignments` por el `phone` del
  miembro vinculado y mostrar título + link (`routineUrl`). Respetar acceso por días vencido.
- [ ] **Tarjeta "Mi Dieta"** (nueva u opcional): mostrar `member.diet` si existe.
- [ ] **Tarjeta "Próximas Clases"**: reemplazar el texto fijo (línea ~89) leyendo `bookings`
  del miembro con `status:'confirmed'` y fecha futura.
- [ ] **Historial de pagos** (opcional): listar `member.payments`.

### Fase 4 — Pago desde el portal (alinear con el flujo probado)
- [ ] Revisar que el botón "Pagar" del portal termine en el mismo flujo que `PublicPaymentPage`
  (`createCulqiCharge` con `phone`, `orderId`, `paymentType`). Hoy el portal usa
  `createCulqiCheckout` sin vincular teléfono → el pago podría no actualizar el doc correcto.
  Asegurar que el pago pase el `phone`/identidad del miembro vinculado.
- [ ] Confirmar que tras pagar, el `status`/`endDate`/`debt` del miembro se actualizan (eso ya lo
  maneja `createCulqiCharge`/webhook Culqi; solo verificar que llega el teléfono correcto).
- [ ] Reutilizar la política: pagos de S/0 no generan voucher (ver CONTEXTO_PROYECTO.md).

### Fase 5 — Reglas de seguridad (con cuidado)
Archivo: `firestore.rules` (hoy abierto a todos).
- [ ] Endurecer sin romper el dashboard admin (que usa el SDK cliente). Propuesta:
  - Admin (por email en la lista de `auth.tsx`) → acceso total.
  - Miembro autenticado → **leer solo el doc de `members` donde `authUid == request.auth.uid`**
    y sus propias `bookings`/rutinas.
  - Colecciones del bot (`messages`, etc.) → solo admin.
- [ ] El bot corre con Admin SDK (privilegios totales), así que las reglas **no** lo afectan.
- [ ] **Probar el dashboard admin después de cambiar reglas** — es el riesgo principal de esta
  fase. Si algo del admin deja de cargar, revisar las reglas antes de continuar.

### Fase 6 — Verificación
- [ ] `npm run build` sin errores de TypeScript.
- [ ] Registrar/loguear un cliente de prueba cuyo teléfono exista en `members`; confirmar que el
  panel muestra su membresía, rutina y clases reales.
- [ ] Loguear un usuario sin membresía; confirmar que ve el estado "sin membresía" + planes.
- [ ] Enviar un mensaje de WhatsApp de prueba al bot para confirmar que **sigue funcionando
  igual** (no se rompió nada del flujo existente).
- [ ] Probar el dashboard admin (miembros, pagos, clases, mensajes) tras las nuevas reglas.

---

## 5. Qué NO hacer

- No tocar la lógica del bot/`messageProcessor.ts` salvo lo estrictamente necesario.
- No recalcular deuda; usar `member.debt`.
- No crear un segundo doc de miembro por usuario (ese es justamente el bug a eliminar).
- No dejar `firestore.rules` abierto una vez que el portal exponga datos de clientes.
- No convertir el portal en un CRM ni duplicar la pantalla de "Mensajes".
- No implementar el módulo nutricional avanzado ni el tracker de rutinas (están marcados como
  "no priorizar" en `CONTEXTO_PROYECTO.md`).

---

## 6. Orden sugerido de ejecución

1. Fase 1 (identidad) — sin esto, nada del resto sirve.
2. Fase 2 (hook de datos).
3. Fase 3 (UI real).
4. Fase 4 (pago alineado).
5. Fase 5 (seguridad).
6. Fase 6 (verificación).

Entregar en commits pequeños por fase. Tras cada fase, `npm run build` y prueba manual.

---

## 7. Nota a futuro — Agora (NO implementar ahora)

Este portal es el **prerrequisito** para agregar, más adelante, un botón "🎙️ Hablar con Sofía"
con voz en tiempo real (Agora Conversational AI), como en el proyecto hermano `agoravoz`.

Motivo: la voz en la web necesita saber **quién es el cliente logueado** para darle su rutina,
membresía y clases — que es exactamente lo que resuelve la Fase 1 (vínculo uid↔teléfono). Una vez
que el portal funcione con datos reales, Agora se vuelve un añadido natural que reutiliza las
mismas "tools" del bot. **Pero primero se termina este portal. Agora queda en pausa.**

---

*Última actualización del plan: 2026-07-02.*
