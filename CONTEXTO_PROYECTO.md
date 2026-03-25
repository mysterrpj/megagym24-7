# MegaGym 24/7 - Contexto y Arquitectura del Proyecto

Este documento sirve como la fuente principal de la verdad (SoT) para la arquitectura, configuración y reglas de negocio del bot de WhatsApp de MegaGym. **Cualquier Inteligencia Artificial que asista en este proyecto DEBE leer y respetar este documento antes de proponer o realizar cambios en el bot.**

## Arquitectura General

El proyecto es un sistema para la gestión de un gimnasio ("MegaGym") con un bot de WhatsApp integrado. 
*   **Frontend**: React + Vite (Dashboard administrativo y vista de clientes).
*   **Backend**: Firebase Functions (Node.js 20).
*   **Base de Datos**: Firestore.
*   **Integraciones Clave**:
    *   **Twilio**: Proveedor de la API de WhatsApp.
    *   **Culqi**: Pasarela de pagos para las membresías.
    *   **OpenAI**: Proveedor de LLM (GPT-4o) para el cerebro del bot y Whisper para la transcripción de audios.

## Archivos Críticos del Bot

1.  `functions/src/index.ts`: 
    *   Contiene el webhook principal de Twilio (`twilioWebhookWhatsapp`).
    *   Maneja la lógica de recepción de mensajes.
    *   **Audios**: Aquí se detectan los mensajes de voz (MediaUrl0 con audio/*), se descargan y se envían a transcribir con Whisper antes de pasarlos al procesador de mensajes.
    *   Contiene los webhooks de Culqi (`culqiWebhook`, `createCulqiCharge`).
2.  `functions/src/bot/transcription.ts`:
    *   Usa la API de Whisper (`openai.audio.transcriptions.create`) para convertir notas de voz de WhatsApp a texto.
3.  `functions/src/bot/messageProcessor.ts`:
    *   **Es el "Cerebro" del bot (Sofía).**
    *   Contiene la función `processMessage` que inyecta la hora actual, el contexto del cliente (sacado de Firestore) y define la personalidad y reglas de la IA.
    *   Define las herramientas (tools/functions) que el LLM puede ejecutar (ej. `get_student_routine`, `generate_payment_link`).
    *   Contiene la función `executeTool` que ejecuta localmente la lógica en la base de datos cuando el LLM decide usar una herramienta.

## Reglas Estrictas para Modificar el Prompt (`messageProcessor.ts`)

> [!WARNING]
> Históricamente, las IAs han arruinado la lógica del bot al intentar sobre-optimizar el `systemPrompt` o las descripciones de los `tools`. ¡Sigue estas reglas al pie de la letra!

1.  **Cero Restricciones Negativas**: NUNCA utilices palabras como "NUNCA pidas el teléfono" o "ESTÁ PROHIBIDO mencionar la fecha". Los LLM sufren del problema del "elefante rosa" (pink elephant problem) y terminarán haciendo exactamente lo que se les prohíbe. 
2.  **Contexto a través de Herramientas**: El teléfono del usuario (`phone`) ya se extrae en `index.ts` a partir del mensaje de Twilio y se pasa a `processMessage`. En la descripción de los parámetros de los **tools**, simplemente pon `"El número de teléfono del usuario."` y el LLM lo inyectará automáticamente desde el contexto provisto.
3.  **No Sobre-diseñar**: El prompt de Sofía debe ser positivo, energético e instruccional ("Usa la hora de esta manera", "Si pasa X, haz Y"). Si quieres que el bot deje de hacer algo, elimina las instrucciones que lo causan en lugar de agregar una regla que lo prohíba de forma explícita.
4.  **Uso de la Herramienta Rutina**: Cuando un cliente pide su rutina, el tool a utilizar siempre es `get_student_routine`. El bot no debe pedir verificación de identidad si el teléfono ya viene en la petición.

## Datos Base de MegaGym

*   **Dirección**: Mz I Lt 5 Montenegro, San Juan de Lurigancho.
*   **Horarios**: Lunes a Viernes (6am-10pm), Sábados (6am-6pm), Domingos (6am-12pm).
*   **Precios**: 1 Mes (S/80), 2 Meses (S/120), 3 Meses (S/150). Clase suelta (S/6).

---

*Nota para el Asistente AI: Si estás leyendo esto al iniciar un nuevo chat, confírmale al usuario que has asimilado el contexto del proyecto y estás listo para ayudar sin romper la lógica actual.*
