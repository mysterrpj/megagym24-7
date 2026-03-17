# Plan de Implementación: Twilio en Producción (Opción B: Tu Propio Número +51)

Este documento detalla el paso a paso exacto para conectar un chip peruano nuevo a la API Oficial de WhatsApp a través de Twilio, configurar el perfil de tu gimnasio y salir del entorno "Sandbox" para poder enviar vouchers automáticamente a todos tus nuevos miembros, sin pagar alquiler de número.

## Fase 1: Preparativos Técnicos (El Chip)

### 1. Compra el Nuevo Chip (SIM Card)
- Ve a cualquier bodega o supermercado y compra un chip prepago nuevo (Claro, Movistar, Entel, Bitel). Costo aproximado: S/ 5.00.
- **IMPORTANTE:** El número debe ser 100% nuevo o, si ya lo tienes, **no debe estar registrado** actualmente ni en la app regular de WhatsApp ni en WhatsApp Business en ningún celular.

### 2. Activa el Chip y recibe SMS
- Inserta el chip en cualquier teléfono celular que esté desbloqueado.
- Llama a un número de prueba o envía un SMS para verificar que la línea está activa y puede recibir mensajes de texto (indispensable para la validación de Meta).
- **Pro Tip:** Guarda este celular a la mano, necesitarás recibir un código SMS de 6 dígitos en los próximos pasos.

---

## Fase 2: Configuración en Twilio y Meta (Facebook)

### 1. Inicia el proceso en Twilio
- Ingresa a tu cuenta de [Twilio Console](https://console.twilio.com/).
- En el menú lateral izquierdo, ve a **Messaging > Senders > WhatsApp Senders**.
- Haz clic en el botón **"New WhatsApp Sender"**.
- Twilio te mostrará una advertencia sobre cómo funciona WhatsApp Business API. Acepta los términos.

### 2. Vincula tu Bussiness Manager (Meta)
- El asistente de Twilio abrirá una ventana emergente (pop-up) que te conectará con Facebook/Meta.
- Inicia sesión con la cuenta de Facebook personal que tiene permisos de administrador sobre la **Página de Facebook de tu gimnasio** (MegaGym 24/7).
- Sigue los pasos de Meta para crear o seleccionar un **WhatsApp Business Account (WABA)** associado a tu cuenta comercial de Facebook.

### 3. Configura el Perfil Público del Gimnasio
Durante el proceso con Meta, se te pedirá que llenes la información pública que verán tus clientes:
- **Nombre a mostrar (Display Name):** Escribe exactamente "MegaGym 24/7" (o el nombre comercial exacto). Meta es estricto y el nombre debe coincidir con el de tu página o documentos.
- **Categoría:** Salud y Fitness.
- **Descripción:** (Opcional) "Tu gimnasio abierto 24 horas. Envío automático de comprobantes."

### 4. Verifica el Número Peruano (+51)
- Meta te pedirá ingresar el número de teléfono con el código de país.
- Selecciona **Perú (+51)** e ingresa el número de 9 dígitos de tu nuevo chip (ej. 987654321).
- Selecciona el método de verificación: **Mensaje de Texto (SMS)** o **Llamada de voz**.
- Revisa el celular donde pusiste el chip. Recibirás un código de 6 dígitos.
- Ingresa ese código en la pantalla de Meta.
¡Felicidades! Meta ha aprobado el número. La ventana emergente se cerrará y volverás a Twilio.

---

## Fase 3: Activación Final en Twilio

### 1. Completa el Registro del Sender
- De vuelta en Twilio, el sistema procesará la conexión con Meta por un momento.
- Tu nuevo número peruano aparecerá ahora en la lista de **WhatsApp Senders**.
- Anota o copia este número, porque será el que reemplazará al Sandbox en tu código (`whatsapp:+51987...`).

### 2. Crea y Aprueba la "Plantilla" (Template) del Voucher
Como ya no estás en el Sandbox, no puedes enviar cualquier texto a clientes nuevos libremente. Necesitas que Meta apruebe tu mensaje de voucher:
- En Twilio, ve a **Messaging > Content Template Builder**.
- Crea un nuevo template.
- Nombre: `voucher_pago_gym`
- Idioma: `Spanish (es)`
- Categoría: `Utility` (Utilidad / Actualización de cuenta).
- **Cuerpo del mensaje (Copia este formato exacto):**
  ```text
  ✅ *PAGO CONFIRMADO - MEGAGYM*

  👤 {{1}}
  📋 {{2}}
  💰 S/ {{3}}
  📅 Válido: {{4}} al {{5}}

  ¡Gracias por tu preferencia! 💪
  ```
- Envía la plantilla a revisión. Meta suele aprobar estas plantillas de utilidad en menos de 5 minutos, aunque puede tardar algunas horas si es fin de semana.

---

## Fase 4: Cambios Mínimos en tu Código (Una vez aprobado lo anterior)

Una vez que tienes el chip enlazado y la plantilla aprobada, solo haremos dos cambios muy pequeños en tu `functions/src/index.ts`:

1. **Cambiar el "From":**
   Cambiaremos `'whatsapp:+14155238886'` por tu nuevo número, por ejemplo, `'whatsapp:+51987654321'`.
   
2. **Enviar usando el "Content SID":**
   En lugar de enviar un `body: voucherText` de texto libre como hacías en el Sandbox, actualizaremos el código para que Twilio envíe el *Template* aprobado (`contentVariables`) que creamos en el paso anterior. 

---

**Resumen de Costos Operativos Mensuales Estimados:**
*   Mantenimiento del Número (Twilio/Meta): **$0.00**
*   Conversación iniciada por enviar el voucher: **~$0.04 USD por cliente nuevo**
*   *Nota: Recibirás una factura de Twilio a fin de mes cobrando solo esos centavos por los vouchers enviados.*
