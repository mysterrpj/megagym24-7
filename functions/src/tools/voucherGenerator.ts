
// Uses node `canvas` to draw the voucher programmatically — zero browser dependency.
// No top-level imports — all lazy-loaded inside the function.

export async function generateVoucherImage(data: any): Promise<string> {
    const admin = require('firebase-admin');
    const { createCanvas } = require('canvas');

    const W = 480;
    const PADDING = 30;
    const LINE_H = 30;
    const numRows = 7;
    const H = 90 + 70 + numRows * LINE_H + 100 + 60;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Fondo blanco
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // Header negro
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, W, 90);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MEGAGYM', W / 2, 48);

    ctx.font = '14px Arial';
    ctx.fillStyle = '#CCCCCC';
    ctx.fillText('COMPROBANTE DE PAGO', W / 2, 72);

    // Línea punteada
    drawDashedLine(ctx, PADDING, 105, W - PADDING, 105);

    // Título
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Recibo de Membresía', W / 2, 140);

    // Filas de datos
    ctx.textAlign = 'left';
    let y = 180;

    const rows: [string, string][] = [
        ['Cliente:', (data.customerName || 'Cliente').toUpperCase()],
        ['Fecha:', data.date],
        ['Hora:', data.time],
        ['N° Orden:', (data.orderId || 'N/A').toString().slice(-10).toUpperCase()],
        ['Plan:', data.planName],
        ['Método:', data.paymentMethod || 'CULQI'],
        ['Monto:', `S/ ${data.amount}`]
    ];

    rows.forEach(([label, value]) => {
        ctx.font = '16px Arial';
        ctx.fillStyle = '#888888';
        ctx.fillText(label, PADDING, y);

        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#111111';
        ctx.fillText(value, PADDING + 100, y);

        y += LINE_H;
    });

    // Línea punteada
    drawDashedLine(ctx, PADDING, y + 10, W - PADDING, y + 10);

    // Total
    y += 45;
    ctx.textAlign = 'center';
    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#111111';
    ctx.fillText(`TOTAL: S/ ${data.amount}`, W / 2, y);

    // Mensaje final
    y += 40;
    ctx.font = '15px Arial';
    ctx.fillStyle = '#555555';
    ctx.fillText('¡Gracias por entrenar en MegaGym!', W / 2, y);

    // Buffer JPEG
    const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });

    // Subir a Firebase Storage con un download token único
    if (!admin.apps.length) admin.initializeApp();
    const bucket = admin.storage().bucket('fit-ia-megagym.appspot.com');

    const fileName = `vouchers/voucher_${Date.now()}.jpg`;
    const file = bucket.file(fileName);

    // Token único que permite acceso público sin cambiar permisos del bucket
    const crypto = require('crypto');
    const downloadToken = crypto.randomUUID();

    await file.save(buffer, {
        metadata: {
            contentType: 'image/jpeg',
            metadata: {
                firebaseStorageDownloadTokens: downloadToken
            }
        },
        resumable: false
    });

    // URL de Firebase Storage con token — accesible públicamente por Twilio
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(fileName)}?alt=media&token=${downloadToken}`;
    console.log('Voucher listo:', downloadUrl);
    return downloadUrl;
}

function drawDashedLine(ctx: any, x1: number, y1: number, x2: number, y2: number) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
}
