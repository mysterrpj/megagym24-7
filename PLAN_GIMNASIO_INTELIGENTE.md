# Plan Gimnasio Inteligente MegaGym

Fecha de referencia: 2026-08-29.

Este documento define una vision de largo plazo para convertir MegaGym en un gimnasio mas autonomo, conectado y facil de supervisar. No reemplaza `CONTEXTO_PROYECTO.md`; cualquier asistente IA debe leer primero ese archivo antes de proponer cambios tecnicos.

## Objetivo

Crear una plataforma modular que controle y supervise las operaciones principales del gimnasio:

- clientes y membresias;
- pagos;
- WhatsApp con Sofia;
- acceso inteligente;
- camaras y alertas;
- inventario y ventas;
- musica, luces y ambiente;
- reportes operativos.

La meta no es hacerlo todo de golpe. La estrategia correcta es avanzar por fases, usando lo que MegaGym ya tiene funcionando y agregando integraciones sin romper el sistema actual.

## Estado actual aprovechable

MegaGym ya tiene una base importante:

- dashboard administrativo en React + Vite;
- backend en Firebase Functions;
- base de datos en Firestore;
- bot de WhatsApp con Twilio;
- Sofia responde por texto, audio transcrito y voz;
- pagos con Culqi;
- membresias, deudas, vouchers y recordatorios;
- clases grupales FULLBODY con reservas pagadas;
- memoria progresiva del cliente;
- menu rapido de WhatsApp;
- selector de proveedor de voz: `agora`, `gemini`, `gpt-realtime-mini`.

Esto significa que la Fase 1 ya esta bastante avanzada. El siguiente paso no debe ser comprar hardware inmediatamente, sino ordenar la arquitectura para que el hardware se conecte bien despues.

## Arquitectura general propuesta

La arquitectura recomendada es:

`Panel Admin + Sofia WhatsApp + Backend Central + Firestore + Servicios externos + Hardware local`

Componentes:

- **Panel Admin:** control y supervision desde cualquier lugar.
- **Backend Central:** Firebase Functions como coordinador de reglas de negocio.
- **Firestore:** fuente de verdad para miembros, pagos, membresias, accesos, inventario y reportes.
- **Sofia WhatsApp:** canal conversacional para clientes.
- **Hardware local:** chapa/controlador de puerta, camaras, sensores, mini PC o gateway.
- **Integraciones externas:** Twilio, Culqi, proveedores de voz, camaras IP, musica, domotica.

Regla clave: el hardware no debe decidir por su cuenta. El hardware consulta o recibe instrucciones del backend, y el backend registra todo.

## Fase 1 - Base digital y WhatsApp

Estado: mayormente implementado.

Objetivo:

Dejar solida la operacion digital antes de conectar puerta, camaras o inventario.

Incluye:

- miembros y membresias;
- pagos y deuda;
- vouchers;
- recordatorios;
- WhatsApp con Sofia;
- clases grupales;
- rutinas y dieta;
- menu rapido;
- memoria compartida entre chat y voz;
- documentacion actualizada.

Pendiente recomendado:

- dejar el portal del miembro como pendiente futuro, porque hoy los clientes interactuan principalmente por WhatsApp;
- empezar por un modulo simple de asistencia/acceso desde Sofia, sin hardware todavia;
- mejorar reglas de seguridad de Firestore;
- migrar `functions.config()` a parametros antes de marzo 2027;
- planificar migracion de runtime `Node.js 20`.

## Fase 2 - Control de acceso inteligente

Objetivo:

Permitir o bloquear ingreso segun membresia, horario y reglas del gimnasio.

Flujo ideal:

1. Cliente llega al gimnasio.
2. Se identifica por metodo elegido: QR, PIN, tarjeta RFID, huella o WhatsApp.
3. El backend valida su membresia.
4. Si esta habilitado, abre la puerta.
5. Se registra el ingreso en Firestore.
6. Si hay problema, Sofia o el panel pueden avisar el motivo.

Opciones de identificacion:

- QR desde portal del miembro;
- PIN temporal;
- tarjeta RFID;
- lector biometrico;
- validacion por WhatsApp.

Recomendacion inicial:

Empezar por WhatsApp/Sofia y registro interno, sin abrir puerta todavia. Despues probar QR o PIN. Es mas simple, barato y facil de depurar que biometria.

### Fase 2A - Inicio recomendado ahora: acceso por WhatsApp sin hardware

Esta es la primera fase practica para MegaGym, porque los clientes ya usan a Sofia por WhatsApp. Para el detalle tecnico de esta fase, usar `PLAN_ACCESO_WHATSAPP.md`.

Objetivo:

Validar el flujo de acceso antes de comprar chapa, camaras o lectores.

Flujo inicial:

1. Cliente escribe a Sofia: `quiero ingresar`, `estoy en la puerta`, `voy a entrar` o algo similar.
2. Sofia identifica al cliente por su numero de WhatsApp.
3. El backend revisa su documento en `members`.
4. Si tiene acceso habilitado, registra un ingreso en `accessLogs`.
5. Sofia responde de forma breve indicando que el ingreso quedo registrado.
6. Si esta vencido o inactivo, Sofia responde con tacto segun las reglas actuales del bot.

Alcance de esta fase:

- no abre puerta real;
- no requiere comprar hardware;
- no requiere portal del miembro;
- solo valida reglas, datos y registro de ingresos;
- prepara la base para conectar una chapa despues.

Intenciones que Sofia deberia reconocer cuando se implemente:

- `quiero ingresar`
- `estoy en la puerta`
- `voy a entrar`
- `registrame mi ingreso`
- `marcar asistencia`
- `ya llegue al gym`

Resultado esperado:

- Crear registros reales en `accessLogs`.
- Ver en el panel cuantos clientes ingresaron.
- Detectar miembros activos, vencidos e inactivos.
- Tener historial antes de automatizar la puerta fisica.

### Portal del miembro como pendiente futuro

El portal web para clientes sigue siendo importante, pero no es el primer paso operativo.

Se mantiene como pendiente para mas adelante:

- login del cliente;
- vinculacion `usuario web -> miembro real por telefono`;
- vista de membresia, deuda, rutina, dieta y clases;
- QR personal para ingreso;
- pagos desde el portal;
- historial del cliente.

Cuando se retome, usar `PLAN_PORTAL_MIEMBRO.md` como guia. La vinculacion por telefono sera necesaria para que el portal sepa que el usuario web es el mismo cliente que Sofia conoce por WhatsApp.

Colecciones sugeridas:

- `accessLogs`
- `accessDevices`
- `accessRules`
- `memberAccessTokens`

Datos importantes por ingreso:

- `memberId`
- `phone`
- `status`
- `deviceId`
- `allowed`
- `reason`
- `createdAt`

## Fase 3 - Camaras, seguridad y alertas

Objetivo:

Supervisar el gimnasio y recibir alertas utiles sin convertirlo en un sistema complejo desde el inicio.

Etapa inicial recomendada:

- camaras IP con grabacion local o nube;
- vista rapida desde el panel o enlace seguro;
- alertas basicas por horario;
- registro de eventos importantes.

Etapa avanzada futura:

- deteccion de movimiento fuera de horario;
- alerta si puerta queda abierta;
- captura de evidencia cuando hay intento de acceso denegado;
- resumen diario de eventos;
- analisis con IA solo cuando el sistema basico ya este estable.

No empezar con reconocimiento facial. Es mas delicado legalmente, mas caro y mas dificil de mantener.

## Fase 4 - Inventario y ventas

Objetivo:

Controlar suplementos, bebidas, accesorios y ventas desde el mismo sistema.

Incluye:

- productos;
- stock;
- ventas;
- metodos de pago;
- alertas de reposicion;
- reporte de margen;
- historial por cliente si aplica.

Colecciones sugeridas:

- `products`
- `inventoryMovements`
- `sales`
- `suppliers`

Flujo:

1. Admin registra producto.
2. Se vende desde panel o por pedido de WhatsApp.
3. El sistema descuenta stock.
4. Si baja del minimo, genera alerta.
5. Reporte diario muestra ventas e inventario critico.

## Fase 5 - Musica, luces y ambiente

Objetivo:

Controlar el ambiente del gimnasio desde horarios o desde el panel.

Casos de uso:

- encender musica al abrir;
- bajar volumen en horarios especificos;
- apagar luces al cierre;
- modo clase FULLBODY;
- modo limpieza;
- control remoto desde celular/panel.

Recomendacion:

Implementar esto despues del acceso inteligente e inventario. Es valioso, pero no debe competir con funciones operativas mas importantes.

Integraciones posibles:

- parlante o sistema de audio compatible con control remoto;
- enchufes inteligentes;
- relays WiFi;
- Home Assistant;
- mini PC local como gateway.

## Fase 6 - Reportes inteligentes

Objetivo:

Que el sistema no solo guarde datos, sino que ayude a tomar decisiones.

Reportes utiles:

- ingresos del dia, semana y mes;
- membresias por vencer;
- miembros vencidos;
- deuda pendiente;
- asistencia por cliente;
- horas con mas movimiento;
- clases mas reservadas;
- ventas de suplementos;
- clientes en riesgo de abandono;
- uso de Sofia por WhatsApp;
- conversiones de links de pago.

Automatizaciones futuras:

- resumen diario por WhatsApp al propietario;
- alerta si baja la asistencia;
- alerta si un cliente activo deja de venir;
- sugerencias para campanas de renovacion;
- reporte semanal de caja.

## Seguridad y permisos

Principios:

- cada usuario debe tener un rol claro;
- el cliente solo ve sus propios datos;
- el admin ve todo;
- el bot opera con permisos de backend, no desde el navegador;
- todo acceso fisico debe quedar registrado;
- los errores de hardware deben registrarse, no ocultarse.

Roles sugeridos:

- `admin`
- `trainer`
- `staff`
- `member`
- `system`

Registros obligatorios:

- cambios de membresia;
- pagos;
- aperturas de puerta;
- accesos denegados;
- cambios de inventario;
- acciones criticas del admin.

## Hardware recomendado

No comprar todo al inicio. Primero validar compatibilidad con integraciones.

Prioridad alta:

- router estable;
- internet confiable;
- UPS pequena para router y controlador de acceso;
- chapa electrica o magnetica compatible con relay/controlador;
- mini PC, Raspberry Pi o equipo similar como gateway local.

Prioridad media:

- camaras IP con RTSP/ONVIF;
- lector QR/RFID;
- sensor de puerta abierta/cerrada;
- boton fisico de salida;
- boton manual de emergencia.

Prioridad futura:

- control de luces;
- control de musica;
- sensores de movimiento;
- biometria.

## Riesgos principales

- depender de internet para abrir la puerta;
- dejar Firestore con reglas abiertas;
- comprar hardware cerrado sin API;
- mezclar automatizacion fisica con logica improvisada;
- no tener modo manual de emergencia;
- intentar reconocimiento facial demasiado pronto;
- no registrar auditoria de accesos;
- romper el bot actual al integrar nuevas funciones.

Mitigacion:

- gateway local con cache de miembros activos;
- modo manual de apertura;
- logs obligatorios;
- hardware con API o protocolos conocidos;
- pruebas por fases;
- documentacion antes de cada integracion.

## Orden realista de implementacion

1. Crear modulo de asistencia/acceso por WhatsApp sin hardware.
2. Registrar ingresos en `accessLogs`.
3. Mostrar ingresos basicos en el panel admin.
4. Probar reglas de acceso con clientes reales durante unos dias.
5. Endurecer reglas de seguridad de Firestore antes de exponer mas datos.
6. Retomar portal del miembro cuando el flujo por WhatsApp ya este validado.
7. Agregar QR/PIN para ingreso.
8. Conectar una chapa/controlador en modo piloto.
9. Integrar camaras basicas y alertas.
10. Crear inventario, ventas y reportes inteligentes.
11. Automatizar musica, luces y ambiente.

## Que no implementar todavia

- reconocimiento facial;
- biometria obligatoria;
- camaras con IA avanzada;
- apertura de puerta sin fallback manual;
- inventario complejo con contabilidad completa;
- domotica antes de resolver acceso y seguridad;
- cambios que eliminen funciones actuales de Sofia.

## Decision tecnica inicial recomendada

Para MegaGym, la mejor ruta es:

1. Consolidar el sistema actual.
2. Implementar primero acceso/asistencia por WhatsApp con Sofia, sin hardware.
3. Preparar un modulo `accessLogs` en Firestore.
4. Probar el flujo con clientes reales y panel admin.
5. Dejar el portal del miembro como fase posterior, usando `PLAN_PORTAL_MIEMBRO.md`.
6. Comprar hardware solo cuando el flujo digital ya este validado.

Esto mantiene el proyecto modular y evita gastar en equipos que luego no se puedan integrar.

## Nota para futuros asistentes IA

Antes de implementar cualquier fase, leer:

- `CONTEXTO_PROYECTO.md`
- `PLAN_SOFIA_PROACTIVA.md`
- `PLAN_PORTAL_MIEMBRO.md`
- este archivo

No cambiar el comportamiento de Sofia, pagos, membresias ni voz sin aprobacion explicita del usuario. Este plan es una guia de crecimiento, no una orden para implementar todo de inmediato.
