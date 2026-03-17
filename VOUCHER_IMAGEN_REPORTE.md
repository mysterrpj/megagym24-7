# Reporte: Voucher en Formato Imagen para MegaGym

## Resumen del Problema

Se intentó cambiar el voucher de pago de **texto plano** a **imagen** (estilo ticket térmico).
El objetivo era que al pagar o pedir su recibo, el cliente reciba una imagen bonita por WhatsApp.

**Estado actual:** Voucher en texto (funciona correctamente).
**Estado deseado:** Voucher como imagen JPEG enviada por WhatsApp vía Twilio.

---

## Errores Encontrados

### Error 1 — Timeout al desplegar (`Timeout after 10000`)

**Qué pasaba:**
```
Error: User code failed to load. Cannot determine backend specification. Timeout after 10000.
```

**Causa:**
- Se tenían instaladas librerías pesadas e innecesarias: `puppeteer-core`, `node-html-to-image`, `stripe`.
- `node-html-to-image` intenta descargar Chromium durante `npm install`, lo que falla en Firebase.
- `firebase-functions` estaba en v7.1.1 que cambió su protocolo de inicialización y era incompatible con el CLI v15.

**Solución aplicada:**
- Se eliminaron `puppeteer-core`, `node-html-to-image` y `stripe` del `package.json`.
- Se bajó `firebase-functions` de v7.1.1 → **v6.6.0** (última versión estable compatible con `firebase-admin@13` y que soporta `runWith`).

---

### Error 2 — Bucket de Storage no encontrado (`The specified bucket does not exist`)

**Qué pasaba:**
```
Tool [send_payment_voucher] result: {"error":"The specified bucket does not exist."}
```

**Causa:**
Firebase Functions tiene dos nombres para el mismo Storage:
- **Nombre Firebase (URL):** `fit-ia-megagym.firebasestorage.app` ← lo que devuelve `FIREBASE_CONFIG`
- **Nombre GCS (bucket real):** `fit-ia-megagym.appspot.com` ← lo que necesita el SDK de Admin

Cuando se llama `admin.storage().bucket()` sin argumentos, usa `FIREBASE_CONFIG.storageBucket` que es `fit-ia-megagym.firebasestorage.app`, pero ese nombre no es reconocido por el SDK de Admin como bucket GCS.

**Solución:**
Usar el nombre GCS directamente:
```typescript
const bucket = admin.storage().bucket('fit-ia-megagym.appspot.com');
```

---

### Error 3 — Imagen no accesible por Twilio (URL sin permisos públicos)

**Qué pasaba:**
La imagen se subía a Firebase Storage correctamente, pero Twilio no podía descargarla porque el bucket no tiene acceso público.

**Causa:**
Firebase Storage usa "Uniform bucket-level access" por defecto. Esto impide hacer archivos públicos individualmente con `file.makePublic()`. Twilio necesita una URL pública para enviar la imagen.

**Soluciones intentadas:**
1. `file.makePublic()` → Falla silenciosamente con buckets de acceso uniforme.
2. Función proxy `serveVoucher` → Se desplegó, pero sin permiso IAM `roles/functions.admin` no se puede hacer pública automáticamente.
3. `firebaseStorageDownloadTokens` → Genera una URL con token tipo `https://firebasestorage.googleapis.com/v0/b/...?alt=media&token=xxx`. Teóricamente funciona, pero el bucket `firebasestorage.app` no fue reconocido.

---

## Solución Definitiva Recomendada (para implementar)

### Opción A — Firebase Storage con permisos correctos ⭐ Recomendada

**Pasos:**

1. Ir a [Google Cloud Console → IAM](https://console.cloud.google.com/iam-admin/iam?project=fit-ia-megagym)

2. Buscar la cuenta de servicio: `fit-ia-megagym@appspot.gserviceaccount.com`

3. Agregar el rol: **Service Account Token Creator** (`roles/iam.serviceAccountTokenCreator`)

4. Esto permite generar **Signed URLs** desde el código:
```typescript
const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000 // 2 horas
});
```

5. Usar `signedUrl` como `mediaUrl` en Twilio. Twilio puede acceder a esta URL sin problemas.

**Por qué es la mejor opción:**
- No requiere hacer el bucket público.
- La URL expira automáticamente (seguro).
- No depende de servicios externos.
- Un solo paso en la consola de Google Cloud.

---

### Opción B — Hacer la carpeta `vouchers/` pública en el bucket

**Pasos:**

1. Ir a [Google Cloud Console → Storage](https://console.cloud.google.com/storage/browser/fit-ia-megagym.appspot.com?project=fit-ia-megagym)

2. Seleccionar el bucket `fit-ia-megagym.appspot.com`

3. Ir a la pestaña **Permisos**

4. Deshabilitar "Acceso uniforme a nivel de bucket" (si está habilitado)

5. En el código, después de subir el archivo:
```typescript
await file.makePublic();
const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(fileName)}`;
```

6. Usar `publicUrl` como `mediaUrl` en Twilio.

**Desventaja:** Hace los vouchers accesibles para cualquier persona que tenga la URL.

---

### Opción C — Función `serveVoucher` con permisos IAM

La función `serveVoucher` ya está desplegada en Firebase. Solo necesita permisos públicos.

**Pasos:**

1. Ir a [Google Cloud Console → Cloud Functions](https://console.cloud.google.com/functions/list?project=fit-ia-megagym)

2. Hacer clic en `serveVoucher`

3. Ir a la pestaña **Permisos**

4. Hacer clic en **Agregar principal**

5. En "Nuevos principales" escribir: `allUsers`

6. En "Rol" seleccionar: `Cloud Functions > Invocador de Cloud Functions`

7. Guardar

8. En el código, la URL sería:
```typescript
const proxyUrl = `https://us-central1-fit-ia-megagym.cloudfunctions.net/serveVoucher?file=${encodeURIComponent(fileName)}`;
```

**Ventaja:** La función ya está desplegada, solo es configuración en la consola.

---

## Código Listo para Activar

Una vez resueltos los permisos (cualquiera de las 3 opciones), el código de `voucherGenerator.ts` que genera el ticket ya está probado y funciona:

- Ticket estilo recibo térmico: 480px de ancho, fondo blanco, header negro
- Muestra: Cliente, Fecha, Hora, N° Orden, Plan, Método, Monto, Total
- Librería: `canvas` (sin navegador, 100% Node.js)

Solo hay que:
1. Agregar `"canvas": "^3.2.1"` al `package.json`
2. Cambiar `send_payment_voucher` en `messageProcessor.ts` para usar `generateVoucherImage`
3. Cambiar `culqiWebhook` en `index.ts` para enviar imagen
4. Elegir una de las opciones de permisos arriba

---

## Resumen de Estado Actual

| Componente | Estado |
|---|---|
| Bot WhatsApp | ✅ Funcionando |
| Voucher en texto | ✅ Funcionando |
| Voucher en imagen (canvas) | ⏸️ Código listo, pendiente permisos Storage |
| Deploy sin timeout | ✅ Resuelto (firebase-functions v6.6.0) |
| Bucket GCS correcto | ✅ Identificado: `fit-ia-megagym.appspot.com` |
| Permisos IAM para Storage | ❌ Pendiente (causa del bloqueo actual) |
