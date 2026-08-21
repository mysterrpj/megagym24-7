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
- Seguimiento ligero de entrenamiento dentro de `trainingProfile`.
- Seguimiento nutricional ligero dentro de `trainingProfile`.
- Dashboard de mensajes como historial limpio.

## Reglas actuales importantes

- Si el cliente pide membresia, Sofia genera link de membresia.
- Si el cliente pide reservar o pagar una clase grupal, aerobicos o FULLBODY, Sofia genera link de `class_booking`.
- Si el cliente pide clase libre de maquinas o pase por dia de gimnasio, el pago se hace en recepcion por ahora.
- La memoria del cliente se obtiene poco a poco en conversacion; Sofia no debe convertirlo en formulario.
- Si el cliente habla de su rutina, cumplimiento, ejercicio dificil, progreso, dolor o faltas, Sofia puede guardar esa senal para explicar mejor y acompanar.
- Si el cliente habla de dieta, antojos, ansiedad, comidas que se salta o dificultad para cumplir, Sofia puede guardar esa senal y usarla para responder mejor.
- No implementar envio manual desde `Mensajes` salvo decision explicita futura.
- No convertir `Mensajes` en CRM completo si el propietario no lo va a usar.

## Pendiente recomendado

- Probar una reserva real completa: pedir clase, pagar con Culqi/Yape o tarjeta, verificar creacion de `booking`.
- Revisar el comportamiento cuando el pago se aprueba pero el cupo ya no existe.
- Definir politica futura de cancelacion/reprogramacion sin devolucion.
- Profundizar memoria de cliente para progreso y riesgo de abandono.
- Optimizar costos de IA con seleccion inteligente de modelo: usar `gpt-4o` para pagos, deuda, voucher, membresias y casos criticos; usar `gpt-4o-mini` para saludos, rutina/dieta por link, dudas simples, preguntas personales y conversaciones largas. Si se quiere volver rapido a `gpt-4o` para todo, configurar `OPENAI_DEFAULT_CHAT_MODEL=gpt-4o` y redesplegar funciones.
- Migrar configuracion de `functions.config()` a parametros antes de marzo 2027.

## Pendiente futuro - Nutricion

No implementar todavia. Retomar mas adelante cuando el flujo actual este probado con clientes reales.

- Mostrar en el dashboard los campos nutricionales guardados en `trainingProfile`.
- Crear seguimiento semanal simple de adherencia nutricional.
- Evaluar check-ins automaticos de nutricion por WhatsApp.
- Guardar historial por fecha solo si realmente se va a usar para seguimiento.
- Mantener la dieta base como plan manual pegado por el administrador; Sofia solo debe acompanar y personalizar, no reemplazar al entrenador/nutricionista.

## Pendiente futuro - Rutinas

No implementar todavia. Por ahora Sofia solo guarda seguimiento ligero para ayudar a entender rutinas y acompanar mejor.

- Registro avanzado de rutinas con series, pesos y repeticiones.
- Historial por ejercicio y fecha.
- Medicion de progreso por carga, repeticiones o cumplimiento.
- Vista en dashboard para que el entrenador revise avances y ejercicios problematicos.
- Alertas o resumen para detectar alumnos estancados o con riesgo de abandono.

## No priorizar por ahora

- Voucher como imagen por WhatsApp.
- Registro manual de asistencia.
- Tracker avanzado de rutinas con series, pesos y repeticiones.
- CRM conversacional completo.
- Envio manual desde dashboard.
- Modulo nutricional avanzado.

## 🔴 URGENTE - Claves Gemini (recordatorio)

- [ ] La proxima semana: cargar saldo (min. S/40) en el proyecto `agentevozmegagym` (`gen-lang-client-0174182024`) para reactivar las claves "MegaGym Voz Bot" y "MegaGym Voz Web".
- [ ] No borrar la clave vieja "Meganutri" hasta confirmar que las claves nuevas funcionan con saldo.
- [ ] Revisar la asistente de la landing ("MegaGym Voz Web"): quedo bloqueada con facturacion $0 y solo se reactiva con saldo o desvinculando la facturacion.
- Las claves ya estan dentro del proyecto: al cargar saldo se reactivan solas. No hace falta crear claves nuevas ni pasarlas de nuevo.
