# 📄 Sistema de Comprobantes de Pago por WhatsApp

## ✅ FUNCIONALIDAD AGREGADA

Ahora cuando un cliente paga por WhatsApp, **automáticamente recibe un comprobante de pago** con todos los detalles.

---

## 🎨 CÓMO SE VE EL COMPROBANTE

El comprobante es una imagen profesional que incluye:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━
        MEGAGYM
━━━━━━━━━━━━━━━━━━━━━━━━━━━

        ✓
    PAGO EXITOSO

━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cliente:
Juan Pérez González

Plan:
Plan 1 Mes

Monto Pagado:
S/ 80.00

Método:
Culqi

Fecha:
01/02/2026 15:30

Código:
chr_live_xxxxx

━━━━━━━━━━━━━━━━━━━━━━━━━━━
    MEMBRESÍA VÁLIDA
 Desde: 2026-02-01
 Hasta: 2026-03-01
━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Gracias por tu confianza
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🔧 CAMBIOS REALIZADOS

### 1. Agregada Dependencia
**Archivo**: `functions/package.json`
```json
"canvas": "^2.11.2"
```

### 2. Nueva Función
**Archivo**: `functions/src/index.ts`
```typescript
async function generateAndSendVoucher(data: {...})
```

Esta función:
- ✅ Genera imagen del comprobante (600x900px)
- ✅ Sube la imagen a Firebase Storage
- ✅ Envía la imagen por WhatsApp vía Twilio

### 3. Integrada en Webhooks
El comprobante se envía automáticamente en:
- `culqiWebhook` - Cuando Culqi confirma el pago
- `createCulqiCharge` - Cuando se procesa el pago directo

---

## 📦 INSTALACIÓN

### Paso 1: Instalar dependencias
```bash
cd functions
npm install
```

### Paso 2: Build y Deploy
```bash
npm run build
firebase deploy --only functions
```

---

## 🎯 FLUJO COMPLETO

1. Cliente escribe por WhatsApp: "Quiero el plan 1 mes"
2. Bot responde y envía link de pago
3. Cliente paga con su tarjeta/Yape
4. **Webhook de Culqi detecta pago exitoso**
5. **Cloud Function genera comprobante**
6. **Comprobante se sube a Firebase Storage**
7. **Bot envía mensaje + imagen por WhatsApp**

Ejemplo del mensaje:
```
✅ ¡Pago confirmado!

Hola Juan Pérez, tu membresía *Plan 1 Mes*
ha sido activada.

Aquí está tu comprobante de pago:

[Imagen del comprobante]
```

---

## 🗂️ ALMACENAMIENTO

Los comprobantes se guardan en:
```
Firebase Storage:
gs://fit-ia-megagym.appspot.com/comprobantes/
  ├── chr_live_xxxxx_1738435200000.png
  ├── chr_live_yyyyy_1738435400000.png
  └── ...
```

**Formato del nombre:**
`{chargeId}_{timestamp}.png`

---

## 🔍 LOGS Y DEBUGGING

Para ver los logs del proceso:

```bash
firebase functions:log --only culqiWebhook
```

Busca estos mensajes:
- `📄 Generando comprobante de pago...`
- `📸 Comprobante generado: [URL]`
- `📱 Comprobante enviado por WhatsApp a: +51xxx`
- `✅ Comprobante enviado`

---

## ⚠️ IMPORTANTE

### Requisitos:
- ✅ Twilio configurado (para envío de imágenes)
- ✅ Firebase Storage activado
- ✅ Node.js 20 (para canvas)

### Permisos Firebase Storage:
Asegúrate de que las reglas permitan escritura desde Cloud Functions:

```javascript
// storage.rules
service firebase.storage {
  match /b/{bucket}/o {
    match /comprobantes/{allPaths=**} {
      allow read;
      allow write: if request.auth != null ||
                      request.resource.size < 5 * 1024 * 1024; // 5MB
    }
  }
}
```

---

## 🎨 PERSONALIZACIÓN

Para cambiar el diseño del comprobante, edita la función `generateAndSendVoucher()` en `functions/src/index.ts`:

**Colores:**
- Background: `#000000` (Negro)
- Header: `#FCD34D` (Amarillo MegaGym)
- Success icon: `#22C55E` (Verde)
- Text primario: `#FFFFFF` (Blanco)
- Text secundario: `#A1A1AA` (Gris)

**Tamaño:**
- Ancho: 600px
- Alto: 900px

---

## 🧪 CÓMO PROBAR

### 1. Hacer un pago de prueba
```bash
# Usa el bot para generar link de pago
# Paga con tarjeta de prueba de Culqi
```

### 2. Ver el comprobante
- Revisa tu WhatsApp
- Deberías recibir la imagen del comprobante

### 3. Verificar en Firebase Storage
```
Firebase Console → Storage → comprobantes/
```

---

## 📊 DATOS INCLUIDOS EN EL COMPROBANTE

| Campo | Fuente | Ejemplo |
|-------|--------|---------|
| Cliente | Culqi webhook | "Juan Pérez" |
| Plan | Metadata | "Plan 1 Mes" |
| Monto | Order amount | "S/ 80.00" |
| Método | Fijo | "Culqi" |
| Fecha | Server timestamp | "01/02/2026 15:30" |
| Código | Charge ID | "chr_live_xxxxx" |
| Validez | Calculado | "01/02 - 01/03" |

---

## 🚨 TROUBLESHOOTING

### El comprobante no se envía

**Posibles causas:**
1. Canvas no instalado correctamente
2. Firebase Storage sin permisos
3. Twilio sin crédito
4. Error en build de TypeScript

**Solución:**
```bash
cd functions
rm -rf node_modules package-lock.json
npm install
npm run build
firebase deploy --only functions
```

### La imagen se genera pero no se envía

**Verifica Twilio:**
```bash
firebase functions:config:get
```

Debe mostrar:
```json
{
  "twilio": {
    "account_sid": "ACxxxxx",
    "auth_token": "xxxxx"
  }
}
```

### Error "Canvas module not found"

Canvas necesita dependencias nativas. Si falla al hacer deploy:

**Alternativa:** Usar `sharp` en lugar de `canvas`
```bash
npm uninstall canvas
npm install sharp
```

Luego modificar el código para usar sharp.

---

## ✨ MEJORAS FUTURAS (OPCIONALES)

- [ ] Agregar QR code para validar entrada al gym
- [ ] Enviar también por email (PDF)
- [ ] Incluir logo del gimnasio
- [ ] Mostrar historial de pagos en el comprobante
- [ ] Agregar firma digital

---

¡Listo! Ahora tus clientes reciben comprobantes profesionales automáticamente 🚀
