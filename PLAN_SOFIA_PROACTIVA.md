# Plan Sofia Proactiva - Estado Actual

Fecha de referencia: 2026-04-21.

Este documento resume el estado actual de Sofia como asistente automatico de MegaGym. La fuente principal de verdad sigue siendo `CONTEXTO_PROYECTO.md`.

## Decision de producto

Sofia debe funcionar principalmente como bot automatico por WhatsApp. El dashboard se usa para supervision, gestion administrativa y consulta de historial, no para atender manualmente al cliente.

Por eso, la pantalla `Mensajes` queda minimalista:

- lista de conversaciones;
- historial de mensajes;
- nombres reales cuando el telefono coincide con `members`;
- aviso de que el bot responde automaticamente;
- sin ficha rapida lateral;
- sin envio manual desde dashboard;
- sin controles CRM por ahora.

## Ya implementado

- Respuestas automaticas por WhatsApp via Twilio.
- Transcripcion de audios con Whisper.
- Pagos con Culqi para membresias.
- Pagos con Culqi para reservas de clases grupales.
- Clases grupales `FULLBODY` de lunes a viernes a las `8:30 AM` y `8:00 PM` con `LIZ PIA`.
- Precio de clase grupal: `S/ 6`.
- Reservas de clases grupales abiertas al publico general que escriba al bot.
- Recordatorios automaticos de membresia y deuda.
- Recordatorios automaticos de clases grupales confirmadas.
- Memoria progresiva del cliente en `trainingProfile` y `assistantMemory`.
- Dashboard de mensajes como historial limpio.

## Reglas actuales importantes

- Si el cliente pide membresia, Sofia genera link de membresia.
- Si el cliente pide reservar o pagar una clase grupal, aerobicos o FULLBODY, Sofia genera link de `class_booking`.
- Si el cliente pide clase libre de maquinas o pase por dia de gimnasio, el pago se hace en recepcion por ahora.
- La memoria del cliente se obtiene poco a poco en conversacion; Sofia no debe convertirlo en formulario.
- No implementar envio manual desde `Mensajes` salvo decision explicita futura.
- No convertir `Mensajes` en CRM completo si el propietario no lo va a usar.

## Pendiente recomendado

- Probar una reserva real completa: pedir clase, pagar con Culqi/Yape o tarjeta, verificar creacion de `booking`.
- Revisar el comportamiento cuando el pago se aprueba pero el cupo ya no existe.
- Definir politica futura de cancelacion/reprogramacion sin devolucion.
- Profundizar memoria de cliente para progreso, adherencia y riesgo de abandono.
- Migrar configuracion de `functions.config()` a parametros antes de marzo 2027.

## No priorizar por ahora

- Voucher como imagen por WhatsApp.
- Registro manual de asistencia.
- CRM conversacional completo.
- Envio manual desde dashboard.
