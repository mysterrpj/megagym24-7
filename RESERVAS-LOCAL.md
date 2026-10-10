# Probar las reservas de clases grupales

El sistema tiene ahora **dos caras**:

| Cara | Ruta | Quién la usa |
| --- | --- | --- |
| Panel administrativo | `/dashboard/classes` | Tú y recepción |
| Página pública de reserva | `/reservar/clase/:classId?fecha=AAAA-MM-DD` | Las alumnas, sin crear cuenta |

Las reservas se guardan con el **backend** (`adminClassReservation`, `createPublicClassReservation`,
…). Por eso, para probar de verdad hace falta uno de estos dos caminos.

---

## Camino A — Todo local, sin tocar producción (recomendado)

Solo requiere instalar **Java 21 (JRE)** una vez. El emulador de Firestore de Google está escrito
en Java y no funciona sin él.

1. Descarga e instala **Eclipse Temurin JRE 21** para Windows x64:
   <https://adoptium.net/temurin/releases/?version=21&package=jre&os=windows&arch=x64>
   (marca *Add to PATH* durante la instalación).
2. Comprueba en una terminal nueva: `java -version`
3. Abre **tres terminales** en `C:\Users\Lenovo\PROYECTOS CLAUDE CODE\24-7chatmegagym`:

```powershell
# Terminal 1 — backend y base de datos falsos (se queda abierta)
npm run emulators

# Terminal 2 — datos de prueba: cuenta admin, clases y enlaces
npm run emulators:seed

# Terminal 3 — la web
npm run dev:emulator
```

4. Entra al panel: <http://127.0.0.1:5173/login>
   - Correo: `admin@fitia.com`
   - Contraseña: `prueba123`
5. Ve a **Clases** → toca la clase *Aeróbicos* → pestaña **Reservas**.
6. Prueba como alumna: usa el enlace que imprime la terminal 2, por ejemplo
   <http://127.0.0.1:5173/reservar/clase/clase-prueba-aerobicos?fecha=...>
   Ábrelo en una ventana de incógnito para simular a otra persona.

Los emuladores no tocan tu proyecto real: viven en el proyecto falso `demo-megagym`.
Para ver los datos crudos: <http://127.0.0.1:4000> (interfaz de los emuladores).

---

## Camino B — Contra tu Firebase real

Requiere publicar los cambios en tu proyecto:

```powershell
firebase deploy --only functions,firestore:rules
npm run dev
```

Esto **sí** modifica producción: agrega las funciones de reserva y cambia las reglas para que las
reservas solo se puedan escribir desde el backend. Las reglas nuevas bloquean la escritura directa
desde el navegador a `bookings` y `classBookingClaims`, así que las funciones deben desplegarse en
el mismo momento para que el panel siga funcionando.

---

## Qué probar

### En el panel administrativo

- Editar nombre, instructora, día, hora, duración, capacidad (1–20), precio y estado.
- Activar **Reservas por internet** y escribir las instrucciones de pago (Yape/Plin).
- Pestaña **Compartir**: copiar el enlace y enviarlo por WhatsApp.
- Pestaña **Reservas**: plano de 5 × 4, confirmar pago, marcar llegada, cancelar y liberar.

### En la página pública

- Elegir una ubicación libre.
- Enviar nombre, celular y código de operación.
- Ver que quede **pendiente de verificar**, no pagada.
- Confirmar desde el panel y ver que la alumna vea "confirmado" al refrescar.
- Verificar que la misma alumna no pueda reservar dos lugares en la misma clase.
- Recargar la página y comprobar que la reserva sigue guardada.

---

## Reglas del sistema

- El salón tiene **20 ubicaciones** (5 columnas × 4 filas) numeradas igual que el piso.
- Cada ubicación pertenece a **una sola fecha**; la reserva no se repite cada semana.
- Una reserva pública nace **pendiente**; recepción confirma el pago tras verificar el abono.
- La página pública **nunca** muestra nombres, teléfonos ni códigos de otras alumnas.
- Si hay reservas antiguas sin fecha, el panel avisa y no las migra automáticamente.

---

## Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| "Could not spawn `java -version`" | Falta Java; ver Camino A, paso 1. |
| "No pudimos conectar con el servicio de reservas" | Los emuladores no están encendidos o las funciones no están desplegadas. |
| El enlace público dice que la clase no existe | Falta ejecutar `npm run emulators:seed` o la fecha del enlace no corresponde al día de esa clase. |
| "Las reservas por internet aún no están habilitadas" | Falta activar *Reservas por internet* y las instrucciones de pago en la clase. |
