# ROLLBACK — Voz con Agora (Sofía por voz)

> Cómo volver al estado anterior de forma segura, sin borrar nada de lo que hoy funciona.
> Toda la función de voz es **aditiva** y vive en la rama `feature/voz-agora` de dos proyectos:
> `24-7chatmegagym` (bot) y `agoravoz` (página de voz). El bot de voz viejo de
> `AppWebMegagym` (`public/js/voice-client.js`, Gemini directo) **no se tocó**.

---

## Resumen rápido

| Quieres... | Haz esto |
|---|---|
| **Apagar la voz sin revertir código** | Quita `VOICE_LINK_SECRET` del `.env` del bot y redeploya. Sofía dejará de enviar links de voz. |
| **Volver del todo al estado previo** | Cambia ambos repos a `master` y redeploya. |
| **Que agoravoz no personalice** | Deja `VOICE_CONTEXT_URL` vacía en agoravoz. Arranca en modo genérico. |

Ninguna de estas opciones borra archivos ni datos.

---

## Interruptores suaves (sin cambiar de rama)

### 1. Apagar la generación de links de voz (lado bot)
El tool `generar_link_voz` depende de `VOICE_LINK_SECRET`. Si esa variable **no está**:
- `generar_link_voz` devuelve `not_configured` y **no** entrega links.
- Todo lo demás del bot sigue igual (la tool queda inerte, no rompe nada).

Pasos:
1. En `functions/.env`, comenta o borra la línea `VOICE_LINK_SECRET=...`.
2. Redeploya las functions: `firebase deploy --only functions`.

### 2. Apagar la personalización (lado agoravoz)
Si `VOICE_CONTEXT_URL` está vacía, la página de voz **no** llama al bot y arranca
siempre en **modo informativo público** (Sofía genérica). El enlace con `?token=`
simplemente se ignora para personalizar.

### 3. Desactivar el "un solo uso" del token
`VOICE_TOKEN_SINGLE_USE=false` (valor por defecto). No hace falta tocar nada; ya está
en el estado permisivo (permite reintentos dentro de los 15 min del token).

---

## Rollback completo (volver a `master`)

El estado anterior a la voz es la rama `master` en ambos proyectos.

### Proyecto bot — `24-7chatmegagym`
```bash
cd "24-7chatmegagym"
git checkout master
firebase deploy --only functions
```
Esto quita del deploy la tool `generar_link_voz`, la función `getVoiceContext` y la
línea de voz del prompt. El bot vuelve a funcionar exactamente como antes.

> Nota: las variables `VOICE_*` en `functions/.env` quedan inertes en `master` (no se usan).
> Puedes dejarlas o borrarlas; no afectan.

### Proyecto voz — `agoravoz`
```bash
cd "agoravoz"
git checkout master
# redeploy segun tu hosting (Firebase App Hosting / Vercel)
```
En `master`, `invite-agent` vuelve al agente demo original ("Ada" de Agora) y
`LandingPage` no lee `?token=` ni muestra los avisos de voz.

---

## Web informativa (`AppWebMegagym`) — feature flag implementado (Sección 6)

El botón de micrófono del chat de la web ahora se controla con un **flag** en el
`index.html` de la raíz (el de `public/` es una copia vieja, no se usa):

```html
<script>
    window.MEGAGYM_VOICE_MODE = 'agora';   <!-- 'agora' o 'gemini' -->
    window.MEGAGYM_VOICE_URL = 'https://agoravoz-gemini-live--fit-ia-megagym.us-east4.hosted.app';
</script>
```

- `'agora'` → el botón abre la página de voz nueva en otra pestaña.
- `'gemini'` → el botón vuelve al bot de voz clásico integrado (`voice-client.js`, que
  sigue **intacto** y cargado).

**Rollback de la web** = cambiar `'agora'` por `'gemini'` y `npm run deploy` (en
`AppWebMegagym`). Rama de trabajo: `feature/voz-agora` (la previa es `main`).

## URLs de producción (referencia)

- Página de voz (App Hosting, backend `agoravoz-gemini-live`, us-east4):
  `https://agoravoz-gemini-live--fit-ia-megagym.us-east4.hosted.app`
- Validador de tokens: `https://us-central1-fit-ia-megagym.cloudfunctions.net/getVoiceContext`
- Bot y functions: proyecto Firebase `fit-ia-megagym` · Web informativa: proyecto `megagym-app-fa3dc`.
- Para **apagar del todo la página de voz**: pausar/borrar el backend `agoravoz-gemini-live`
  en Firebase Console → App Hosting (no afecta al bot de WhatsApp).

---

## Datos de Firestore creados por la función

- Colección `usedVoiceTokens`: solo se crea si `VOICE_TOKEN_SINGLE_USE=true`. Guarda
  `jti` usados con un campo `expireAt` (apto para política TTL de Firestore). Es seguro
  borrar la colección entera; no afecta a miembros ni pagos.

---

## Checklist de reversibilidad (requisito 4B del plan) — cumplido

- [x] Todo el trabajo en rama `feature/voz-agora` (no en `master`).
- [x] Cambios **aditivos**: `generar_link_voz` y `getVoiceContext` se suman; no reemplazan tools existentes.
- [x] Interruptores suaves (env vars) para apagar sin revertir código.
- [x] El bot de voz viejo de `AppWebMegagym` no se borró.
- [x] Este documento con los pasos exactos de rollback.

*Documento creado al terminar la Fase 7. Rama de trabajo: `feature/voz-agora`.*
