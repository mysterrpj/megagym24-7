# Plan Acceso por WhatsApp - Fase Segura

Fecha de referencia: 2026-08-29.

Este documento define una primera fase segura para registrar asistencia/acceso usando Sofia por WhatsApp, sin comprar hardware y sin cambiar el comportamiento actual de produccion hasta que el propietario lo active.

Antes de implementar, leer:

- `CONTEXTO_PROYECTO.md`
- `PLAN_SOFIA_PROACTIVA.md`
- `PLAN_GIMNASIO_INTELIGENTE.md`

## Objetivo

Permitir que un cliente escriba a Sofia algo como `ya llegue al gym` y que el sistema registre un ingreso en Firestore, sin abrir una puerta fisica todavia.

La meta de esta fase no es automatizar la chapa. La meta es validar:

- si Sofia reconoce bien la intencion de ingreso;
- si el sistema identifica correctamente al cliente por WhatsApp;
- si la membresia se valida bien;
- si el ingreso queda registrado;
- si el panel puede mostrar historial basico.

## Regla principal de seguridad

No modificar la experiencia normal de los clientes hasta que el propietario lo active.

La implementacion futura debe quedar detras de una bandera:

`ACCESS_LOG_ENABLED=false`

Con esa bandera apagada, el bot debe seguir funcionando como ahora.

## Alcance de la primera version

Incluye:

- detectar intenciones de ingreso por WhatsApp;
- buscar al miembro por telefono;
- validar estado de membresia;
- registrar intento de ingreso en `accessLogs`;
- responder de forma breve y natural;
- permitir modo prueba solo para numeros autorizados.

No incluye:

- abrir puerta fisica;
- comprar chapa;
- conectar camaras;
- usar reconocimiento facial;
- cambiar pagos;
- cambiar membresias;
- cambiar selector de voz;
- cambiar el menu rapido de WhatsApp;
- exponer datos nuevos al cliente.

## Frases que Sofia debe reconocer

Ejemplos:

- `quiero ingresar`
- `ya llegue`
- `ya llegue al gym`
- `estoy en la puerta`
- `voy a entrar`
- `registrame mi ingreso`
- `marca mi asistencia`
- `marcar asistencia`
- `estoy entrando`

No debe dispararse con mensajes ambiguos como:

- `hola`
- `menu`
- `quiero pagar`
- `quiero mi rutina`
- `a que hora abren`

## Coleccion Firestore propuesta

Coleccion: `accessLogs`

Campos sugeridos:

```ts
{
  memberId: string | null;
  memberName: string | null;
  phone: string;
  source: 'whatsapp';
  intentText: string;
  statusAtAccess: 'active' | 'overdue' | 'inactive' | 'unknown';
  allowed: boolean;
  reason: string;
  createdAt: Timestamp;
  localDate: string; // YYYY-MM-DD America/Lima
  localTime: string; // HH:mm America/Lima
  testMode: boolean;
}
```

Razones posibles:

- `active_member`
- `overdue_grace_period`
- `overdue_restricted`
- `inactive_member`
- `member_not_found`
- `feature_disabled`
- `test_number_only`

## Reglas de acceso recomendadas

Usar la misma filosofia actual de Sofia:

- miembro `active`: registrar como permitido;
- miembro `overdue` con pocos dias vencido: registrar como permitido o advertencia suave, segun la regla vigente del bot;
- miembro `overdue` con muchos dias vencido: registrar como no permitido;
- miembro `inactive`: registrar como no permitido;
- telefono no encontrado: no registrar como ingreso permitido.

Importante: esta fase solo registra. No abre puerta.

## Respuestas sugeridas de Sofia

Miembro activo:

`Listo, registre tu ingreso de hoy. Dale con todo.`

Vencido dentro de margen de confianza:

`Listo, registre tu ingreso. Ve entrenando tranquilo y luego regularizamos tu membresia.`

Vencido fuera de margen:

`Te ayudo al toque. Primero revisemos tu membresia para dejar todo en orden.`

Inactivo:

`Te ayudo. Para registrar tu ingreso necesitamos activar tu membresia primero.`

No encontrado:

`No encuentro tu numero registrado todavia. Escribeme tu nombre o consulta en recepcion para ayudarte.`

## Implementacion tecnica futura

### 1. Crear helper de deteccion

Archivo probable:

`functions/src/bot/messageProcessor.ts`

Funcion sugerida:

```ts
function mentionsAccessIntent(text: string) {
  // normalizar texto y detectar frases de ingreso/asistencia
}
```

Debe ser conservadora para evitar falsos positivos.

### 2. Crear tool interna

Tool sugerida:

`register_access_log`

Responsabilidad:

- recibir `phone` y `intentText`;
- buscar miembro por telefono;
- evaluar estado;
- crear documento en `accessLogs`;
- devolver resultado para que Sofia responda.

### 3. Bandera de activacion

Variables sugeridas:

```env
ACCESS_LOG_ENABLED=false
ACCESS_LOG_TEST_PHONES=+51951296572
```

Reglas:

- si `ACCESS_LOG_ENABLED=false`, no hacer nada nuevo;
- si esta en modo prueba, solo registrar para telefonos en `ACCESS_LOG_TEST_PHONES`;
- activar para todos solo despues de pruebas reales.

### 4. Vista simple en panel

Crear mas adelante una vista en admin:

- fecha;
- hora;
- nombre;
- telefono;
- permitido/no permitido;
- motivo;
- fuente `whatsapp`.

No hacer una vista compleja al inicio.

## Plan de pruebas

### Prueba local / desarrollo

- Compilar functions.
- Probar deteccion de frases con ejemplos positivos y negativos.
- Verificar que no afecta `menu`, pagos, rutina ni voz.

### Prueba en produccion controlada

1. Desplegar con `ACCESS_LOG_ENABLED=false`.
2. Confirmar que el bot sigue igual.
3. Activar solo para el numero del propietario.
4. Escribir `ya llegue al gym`.
5. Verificar documento en `accessLogs`.
6. Probar mensajes normales: `menu`, `quiero pagar`, `quiero mi rutina`.
7. Activar para 1 o 2 clientes de confianza.
8. Recien despues evaluar activarlo para todos.

## Rollback

Rollback rapido:

- poner `ACCESS_LOG_ENABLED=false`;
- redesplegar o actualizar configuracion segun el mecanismo usado;
- el bot vuelve a ignorar la funcion de acceso.

Rollback de codigo:

- retirar la tool `register_access_log`;
- retirar la deteccion `mentionsAccessIntent`;
- retirar cualquier vista admin agregada.

Como no hay hardware en esta fase, el rollback no afecta puertas ni seguridad fisica.

## Riesgos

- falso positivo: Sofia registra ingreso cuando el cliente solo estaba conversando;
- cliente no registrado escribe desde otro numero;
- estado de membresia desactualizado;
- Firestore sin reglas finas para futuras vistas del panel;
- confundir esta fase con apertura real de puerta.

Mitigacion:

- deteccion conservadora;
- modo prueba por numero;
- bandera apagada por defecto;
- logs claros;
- no conectar hardware hasta validar el flujo.

## Estado del plan

Estado actual: plan tecnico preparado, pendiente de implementacion.

Este archivo no significa que el acceso por WhatsApp ya este programado. Significa que ya existe una guia segura para implementarlo despues sin tocar produccion de forma riesgosa.

## Checklist de implementacion segura

### Etapa 0 - Preparacion

- [ ] Confirmar que `CONTEXTO_PROYECTO.md` y `PLAN_SOFIA_PROACTIVA.md` fueron leidos.
- [ ] Confirmar que el bot actual funciona antes de tocar codigo.
- [ ] Confirmar numero de prueba del propietario.
- [ ] Definir si el primer modo sera solo registro silencioso o respuesta visible de Sofia.

### Etapa 1 - Codigo apagado por defecto

- [ ] Agregar bandera `ACCESS_LOG_ENABLED=false`.
- [ ] Agregar lista opcional `ACCESS_LOG_TEST_PHONES`.
- [ ] Crear deteccion conservadora `mentionsAccessIntent`.
- [ ] Crear tool interna `register_access_log`.
- [ ] Asegurar que con la bandera apagada el bot responde igual que antes.

### Etapa 2 - Registro en Firestore

- [ ] Crear documentos en `accessLogs` solo cuando corresponda.
- [ ] Guardar telefono, miembro, estado, permitido/no permitido, motivo y hora Lima.
- [ ] Evitar duplicados excesivos si el cliente manda muchos mensajes seguidos.
- [ ] Registrar tambien intentos no permitidos para auditoria.

### Etapa 3 - Prueba solo con propietario

- [ ] Desplegar con la funcion apagada.
- [ ] Activar solo para el numero del propietario.
- [ ] Probar frases de ingreso.
- [ ] Probar frases normales: `menu`, `quiero pagar`, `quiero mi rutina`, `a que hora abren`.
- [ ] Confirmar que pagos, rutina, menu y voz siguen funcionando.

### Etapa 4 - Panel admin minimo

- [ ] Agregar vista simple de accesos o asistencia.
- [ ] Mostrar fecha, hora, cliente, telefono, estado, permitido y motivo.
- [ ] No crear reportes avanzados todavia.
- [ ] No mezclar esta vista con CRM ni mensajes manuales.

### Etapa 5 - Piloto controlado

- [ ] Activar para 1 o 2 clientes de confianza.
- [ ] Revisar falsos positivos.
- [ ] Revisar si los clientes entienden la frase de ingreso.
- [ ] Ajustar respuestas de Sofia sin cambiar flujos de pago, rutina ni voz.

### Etapa 6 - Activacion general

- [ ] Activar para todos solo si el piloto fue estable.
- [ ] Mantener bandera de apagado rapido.
- [ ] Documentar fecha de activacion en este archivo y en `CONTEXTO_PROYECTO.md`.

## Criterios para decir que esta fase esta terminada

La Fase 2A se considera completa cuando:

- Sofia reconoce intenciones de ingreso sin afectar conversaciones normales;
- se crea `accessLogs` con datos correctos;
- el flujo puede apagarse con `ACCESS_LOG_ENABLED=false`;
- se probo primero con el numero del propietario;
- el panel admin permite revisar ingresos basicos;
- no se rompio el menu de WhatsApp, pagos, rutinas, clases ni voz;
- queda documentada la fecha de despliegue y el estado real.

## Decisiones pendientes antes de implementar

- Definir el numero exacto de prueba para `ACCESS_LOG_TEST_PHONES`.
- Decidir si Sofia debe responder al cliente desde la primera prueba o si primero se registra en silencio.
- Definir si miembros vencidos dentro del margen de confianza cuentan como ingreso permitido.
- Definir cada cuanto evitar duplicados, por ejemplo no registrar dos ingresos del mismo cliente dentro de 10 minutos.
- Definir si el panel tendra una pagina nueva `Accesos` o si entrara dentro de `Miembros`/`Reportes`.

## Primer commit recomendado cuando se implemente

Commit 1:

- crear deteccion de intencion;
- crear `register_access_log`;
- agregar bandera apagada por defecto;
- compilar y probar;
- no crear vista admin todavia.

Commit 2:

- agregar vista admin minima para `accessLogs`;
- probar lectura de registros;
- documentar resultado.

Commit 3:

- activar piloto solo para numero autorizado;
- ajustar mensajes si hace falta;
- documentar fecha y resultado.

## Relacion con hardware futuro

Cuando esta fase este estable, recien se debe evaluar chapa/controlador.

El flujo futuro seria:

1. Sofia o QR registra intento de ingreso.
2. Backend valida membresia.
3. Backend registra `accessLogs`.
4. Gateway local recibe orden de apertura.
5. Chapa abre por unos segundos.
6. Sensor confirma puerta abierta/cerrada.
7. Todo queda auditado.

La Fase 2A solo llega hasta el paso 3.

## Relacion con portal del miembro

El portal del miembro queda para despues. Cuando se implemente, podra sumar:

- QR personal;
- historial de ingresos;
- estado de membresia;
- pagos;
- rutina y dieta;
- clases reservadas.

Pero no es requisito para empezar esta fase, porque Sofia ya identifica al cliente por WhatsApp.

## Decision recomendada

El primer paso real debe ser implementar solo el registro de acceso por WhatsApp en modo apagado/prueba.

No comprar hardware todavia.

No tocar el portal del miembro todavia.

El portal queda pendiente para mas adelante y se retoma con `PLAN_PORTAL_MIEMBRO.md`.
