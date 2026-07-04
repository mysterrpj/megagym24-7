# PLAN: Voz con Agora lanzada desde el bot de WhatsApp (Sofía)

> **Para el asistente IA que lea esto:** Esta es una función que toca **DOS proyectos**:
> 1. `24-7chatmegagym` (este) — el bot de WhatsApp que genera el link + los datos del cliente.
> 2. `agoravoz` (carpeta hermana) — la app de voz Agora + Gemini Live que abre el link.
>
> **Antes de tocar nada, lee:**
> - `CONTEXTO_PROYECTO.md` (este proyecto) — fuente de verdad, respeta TODAS sus reglas.
> - `../agoravoz/CLAUDE.md` — reglas críticas de la app de voz (no romper el guard `isReady`,
>   no llamar `client.leave()` manual, mantener `RtcTokenBuilder.buildTokenWithRtm`, etc.).
>
> Confírmale al usuario que asimilaste ambos contextos antes de escribir código.

---

## 0. Objetivo en una frase

El bot de WhatsApp (Sofía) le envía a un **miembro con membresía activa** un **link**. Al tocarlo,
el cliente **habla por voz con Sofía usando Agora**, y esa Sofía de voz **ya sabe quién es**
(su rutina, su membresía, su nombre) **sin que el cliente se loguee**.

Además (Propuesta C): la **misma** página de voz sirve, sin token, como el bot **informativo
público** de la web del gym — una sola tecnología de voz (Agora) para todo.

---

## 1. Cómo funciona (arquitectura)

```
Cliente (WhatsApp): "quiero mi asesoría por voz"
        │
[24-7chatmegagym] Sofía verifica: ¿membresía activa?
        │  Sí → genera un TOKEN DE IDENTIDAD firmado (lleva el teléfono, vence en ~15 min)
        │  y arma el link:  https://<pagina-voz>/?token=<JWT>
        ▼
Cliente toca el link → se abre la página de voz (agoravoz)
        │
[agoravoz] lee ?token → lo manda a validar a una función del bot
        │
[24-7chatmegagym] getVoiceContext(token): verifica firma + vencimiento + que siga activo
        │  → devuelve datos del miembro (nombre, rutina, estado membresía, etc.)
        ▼
[agoravoz] arma el prompt de Sofía CON esos datos → inicia el agente Agora + Gemini Live
        ▼
Cliente habla por voz con Sofía personalizada  🎙️   (sin login)
```

### Dos "tokens" distintos — NO confundirlos
- **Token de identidad (nuevo):** lo firma el bot de WhatsApp, lleva el teléfono del cliente.
  Sirve para saber *quién* es. Es el `?token=` del link.
- **Token de Agora (ya existe):** el RTC+RTM token que genera `agoravoz` en
  `app/api/generate-agora-token/route.ts`. Sirve para *conectarse al canal de audio*. **No se
  toca su lógica** (mantener `RtcTokenBuilder.buildTokenWithRtm`).

### Dos modos de la misma página (Propuesta C)
- **Con `?token=` (desde WhatsApp):** Sofía personalizada para miembro activo.
- **Sin token (desde la web informativa):** Sofía genérica de información (planes, precios,
  horarios, ubicación). Público general.

---

## 2. Alcance de esta versión (v1) — leer con atención

Para no sobre-complicar, la v1 es **personalización de solo lectura**:
- La Sofía de voz **conoce** al cliente (nombre, rutina, días para vencer, etc.) y conversa,
  motiva, explica su rutina y responde dudas.
- **Los pagos NO se hacen por voz en la v1.** Si el cliente quiere renovar/pagar, Sofía-voz le
  dice: *"te paso el link por WhatsApp"* y el pago sigue por el flujo actual de Culqi en WhatsApp.
  (Cobrar por voz = Fase futura con function calling.)
- Esto evita construir herramientas nuevas ahora y reutiliza lo que ya existe.

**NO implementar en v1:** function calling / tools en el agente de voz, pagos por voz, historial
por voz. Se anota como mejora futura al final.

---

## 3. Fases de implementación

### FASE 1 — [24-7chatmegagym] Generar el link de voz desde el bot
Archivos: `functions/src/bot/messageProcessor.ts`, `functions/src/index.ts`.
- [ ] Definir un **secreto compartido** para firmar tokens (ej. `VOICE_LINK_SECRET`) como
  variable de entorno/param de las functions. **NUNCA escribir el secreto en markdown ni en el
  chat.** Reutilizar el mecanismo de config que ya use el proyecto (ver nota de migración
  `functions.config()` → params en `CONTEXTO_PROYECTO.md`).
- [ ] Añadir una **tool nueva** a Sofía, p. ej. `generar_link_voz`:
  - Recibe el teléfono del cliente (ya viene en el contexto, igual que las otras tools — ver la
    regla de "Contexto a través de Herramientas" en `CONTEXTO_PROYECTO.md`).
  - Verifica **membresía activa** (reutilizar la lógica de estado que ya usa el bot; si el
    cliente está `overdue`/`inactive`, NO generar link — Sofía invita a renovar).
  - Si activo: firma un **JWT** con `{ phone: <normalizado>, exp: +15min }` usando
    `VOICE_LINK_SECRET` (usar la librería `jsonwebtoken` o equivalente).
  - Devuelve el link `https://<dominio-voz>/?token=<JWT>` para que Sofía lo envíe por WhatsApp.
  - Normalizar el teléfono con **la misma lógica que ya usa el bot** (quitar `whatsapp:`,
    espacios, prefijo `+51`) para que coincida con los docs de `members`.
- [ ] Seguir las reglas del prompt de `CONTEXTO_PROYECTO.md` (cero restricciones negativas,
  prompt positivo). Instruir a Sofía: "cuando un miembro activo pida asesoría por voz / hablar
  por voz, usa `generar_link_voz` y envíale el enlace".

### FASE 2 — [24-7chatmegagym] Función que valida el token y entrega el contexto
Archivo: `functions/src/index.ts` (nueva Cloud Function HTTP).
- [ ] Crear `getVoiceContext` (HTTP, con CORS habilitado para el dominio de la página de voz):
  - Recibe `{ token }`.
  - Verifica firma y vencimiento del JWT con `VOICE_LINK_SECRET`. Si inválido/vencido → 401.
  - Extrae el `phone`, busca el miembro en `members` (probar los formatos de teléfono
    alternativos que ya usa el bot en `get_student_routine`).
  - **Re-verifica que siga activo** (defensa en profundidad; el token es corto pero por si acaso).
  - Devuelve un JSON mínimo y seguro para personalizar: `{ name, status, diasParaVencer,
    plan, rutinaResumen | routineUrl, objetivo }`. **No enviar datos sensibles innecesarios**
    (no `adminNotes`, no DNI, no historial completo).
  - Respetar la política de acceso por días vencido de `CONTEXTO_PROYECTO.md`.
- [ ] Rutina: leer de `studentRoutineAssignments` por `studentPhone` (misma fuente que la tool
  `get_student_routine`).

### FASE 3 — [agoravoz] Leer el token y personalizar el agente
Archivos: `components/LandingPage.tsx`, `app/api/invite-agent/route.ts` (ver `agoravoz/CLAUDE.md`).
- [ ] En la carga de la página, leer `?token=` de la URL.
- [ ] Si hay token: llamar (POST) a `getVoiceContext` del proyecto del bot y obtener el contexto
  del miembro. Manejar el caso de token inválido/vencido con un mensaje claro
  ("Este enlace expiró, pídele uno nuevo a Sofía por WhatsApp").
- [ ] Inyectar ese contexto en el **system prompt** del agente (en `invite-agent/route.ts`), de
  forma que Sofía-voz salude por su nombre y conozca su rutina/estado.
- [ ] **No romper** el patrón `isReady && joinSuccess` ni el ciclo de vida de los hooks (ver
  `agoravoz/CLAUDE.md`). El contexto se resuelve ANTES de invitar al agente.

### FASE 4 — [agoravoz] Modo sin token = Sofía informativa (Propuesta C)
- [ ] Si NO hay token: usar el **system prompt informativo** (persona de ventas pública).
  Fuente de esa personalidad ya escrita: `../AppWebMegagym/public/js/voice-client.js` líneas
  ~105-139 (planes sin matrícula S/80–120–150, aeróbicos S/80 o S/6, horarios 6am–10pm,
  ubicación Montenegro SJL, inscripción por WhatsApp 951 296 572).
  > Nota: verificar precios con el usuario — en WhatsApp (`CONTEXTO_PROYECTO.md`) el plan de 1 mes
  > figura S/70; en la web informativa figura S/80. Confirmar cuál es el vigente antes de fijarlo.
- [ ] Mismo componente, mismo Agora, solo cambia el prompt según haya token o no.

### FASE 5 — Prompt de Sofía (ambos modos)
- [ ] **Modo personalizado:** plantilla tipo *"Eres Sofía de MegaGym. Estás hablando con
  {name}. Su plan {plan} vence en {diasParaVencer} días. Su rutina de hoy: {rutinaResumen}.
  Salúdalo por su nombre, motívalo, responde sus dudas de entrenamiento. Si quiere renovar o
  pagar, dile que le envías el link por WhatsApp."* Mantener el estilo peruano de Sofía de
  `CONTEXTO_PROYECTO.md` ("¡De una!", "¡Qué crack!", etc.).
- [ ] **Modo informativo:** la persona pública de la Fase 4.
- [ ] Respetar reglas de prompt de `CONTEXTO_PROYECTO.md` (positivo, sin prohibiciones tipo
  "elefante rosa").

### FASE 6 — Micrófono en el navegador de WhatsApp
- [ ] Probar el link abierto **dentro de WhatsApp** (su navegador interno a veces bloquea el
  micrófono). Si falla:
  - Detectar el in-app browser y mostrar un botón "Abrir en Chrome/Safari", o
  - Instruir a Sofía a decir "ábrelo en tu navegador" al enviar el link.
- [ ] Reutilizar el manejo de audio móvil que ya está resuelto (downsampling, sampleRate) —
  referencia: `../AppWebMegagym/GUIA_AGENTE_VOZ_GEMINI.md` (efecto ardilla, error 1008, etc.).

### FASE 7 — Seguridad
- [ ] Token corto (≤15 min) y de un solo uso si es viable (guardar un `jti` usado en Firestore
  para invalidar reuso).
- [ ] `VOICE_LINK_SECRET` solo en variables de entorno; jamás en el repo, markdown o chat.
- [ ] `getVoiceContext` con CORS restringido al dominio de la página de voz.
- [ ] Confirmar restricción por HTTP referrer de la API key de Gemini (ver
  `GUIA_AGENTE_VOZ_GEMINI.md`, sección 3) para el dominio de producción de la página de voz.
- [ ] La página de voz sirve solo por HTTPS (requisito del micrófono).

### FASE 8 — Deploy y verificación
- [ ] `agoravoz`: `pnpm run verify` (ver su CLAUDE.md) y deploy de la página de voz.
- [ ] `24-7chatmegagym`: build de functions y deploy solo de las funciones nuevas
  (`generar_link_voz` va dentro del webhook; `getVoiceContext` es función aparte).
- [ ] **Prueba de punta a punta:**
  1. Desde WhatsApp, como miembro **activo**, pedir "hablar por voz" → recibir link.
  2. Abrir el link → confirmar que Sofía saluda por el nombre y conoce la rutina.
  3. Repetir como miembro **vencido** → confirmar que NO recibe link (o recibe invitación a
     renovar).
  4. Abrir la página de voz **sin token** → confirmar modo informativo público.
  5. Confirmar que el bot de WhatsApp **sigue funcionando igual** en todo lo demás.

---

## 4. Qué NO hacer

- No romper la lógica existente del bot (`messageProcessor.ts`): la tool nueva se **suma**, no
  reemplaza nada.
- No tocar la generación del token de Agora (`RtcTokenBuilder.buildTokenWithRtm`).
- No quitar el guard `isReady` ni el patrón de hooks de `agoravoz`.
- No implementar pagos por voz en la v1.
- No poner el secreto de firma en el repo/markdown/chat.
- No enviar datos sensibles del miembro al frontend (solo lo mínimo para personalizar).
- No enviar el link de voz a miembros vencidos/inactivos.

---

## 4B. Reversibilidad — poder volver a como funciona HOY (IMPORTANTE)

> El usuario quiere poder **desactivar Agora más adelante y volver al estado actual** (el bot de
> voz directo a Gemini que ya funciona en `AppWebMegagym`). Todo el trabajo debe ser **reversible
> sin borrar nada de lo que hoy funciona.**

Reglas obligatorias para que sea reversible:

- [ ] **Git primero.** Antes de empezar, en CADA proyecto que se toque: hacer commit del estado
  actual limpio y crear una **rama nueva** (ej. `feature/voz-agora`). Todo el trabajo va en esa
  rama. Volver atrás = cambiar de rama. No trabajar sobre `master`/`main` directo.
- [ ] **No borrar el bot de voz actual.** El archivo `../AppWebMegagym/public/js/voice-client.js`
  (Gemini directo) **NO se elimina.** En la Fase 6, "reemplazar" significa solo **cambiar a qué
  apunta el enlace** en `index.html`, dejando el archivo viejo intacto. Volver atrás = apuntar el
  enlace de vuelta al `voice-client.js`.
- [ ] **Interruptor de encendido/apagado (feature flag).** Agregar una variable de configuración
  (ej. `VOICE_MODE=agora` | `gemini`) que permita cambiar entre "voz con Agora" y "voz directa
  Gemini" **sin tocar código**, solo cambiando la config y redeployando.
- [ ] **Cambios aditivos, no destructivos.** En el bot de WhatsApp, la tool `generar_link_voz` y
  la función `getVoiceContext` se **suman**; no modifican ni quitan tools existentes. Si mañana no
  se usan, quedan inertes sin romper nada.
- [ ] **Documentar el rollback.** Al terminar, el asistente debe escribir en este mismo archivo
  (o en un `ROLLBACK_VOZ.md`) los pasos exactos para volver atrás: qué rama, qué variable poner,
  qué enlace revertir, qué deploy correr.

Con esto, "dejar de usar Agora" es: poner el feature flag en `gemini` (o revertir la rama) y
redeploy. El estado actual queda siempre recuperable.

## 5. Nota de costo (recordatorio para el usuario)

- Los **10.000 min/mes gratis de Agora** cubren el **transporte de audio**. A pocos miembros,
  sobra.
- El **cerebro (Gemini Live)** se paga aparte por minuto, con o sin Agora. A bajo volumen es
  pequeño. Considerar limitar la voz a **miembros activos** (ya está en el plan) para acotar uso.

---

## 6. Cerrar la Propuesta C: apuntar la web informativa a esta página
Proyecto: `AppWebMegagym` (página informativa).
- [ ] Reemplazar el bot de voz viejo (`public/js/voice-client.js`, Gemini directo) por un enlace
  a la **misma página de voz de Agora en modo sin token** (informativo).
- [ ] Así queda **una sola tecnología de voz** (Agora) para público y para miembros.
- [ ] Hacerlo al final, cuando el modo informativo (Fase 4) ya esté probado.

---

## 7. Mejora futura (no ahora)

- Dar al agente de voz **function calling** para que pueda, por voz: generar link de pago,
  reservar clase, consultar historial — reutilizando las tools que hoy tiene Sofía en WhatsApp
  (`generate_payment_link`, `book_class`, `get_payment_history`, etc.).
- Esto convierte la Sofía de voz en tan capaz como la de WhatsApp. Requiere exponer esas tools
  al agente de Agora/Gemini. Dejar para una v2 cuando la v1 esté probada con clientes reales.

---

*Plan creado: 2026-07-02. Toca los proyectos `24-7chatmegagym` y `agoravoz` (y al final
`AppWebMegagym`).*
