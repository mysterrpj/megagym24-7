
// Uses node `canvas` to draw the voucher programmatically — zero browser dependency.
// No top-level imports

export async function generateVoucherImage(data: any): Promise<string> {
    const admin = require('firebase-admin');
    const { createCanvas } = require('canvas');

    // Ticket dimensions (like a thermal printer ticket)
    const W = 480;
    const PADDING = 30;
    const LINE_H = 28;

    // --- Calculate height dynamically ---
    const numRows = 7; // Client, Date, Time, OrderId, Plan, Method, Amount
    const H = 80 + 70 + numRows * LINE_H + 80 + 80; // header + title + rows + footer + barcode

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // --- Background ---
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // --- Header / Logo ---
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MEGAGYM', W / 2, 60);

    ctx.font = '16px Arial';
    ctx.fillText('La casa del dolor 💪', W / 2, 85);
    ctx.fillText('RUC: 20601234567 | Montenegro, SJL', W / 2, 105);

    drawDashedLine(ctx, PADDING, 125, W - PADDING, 125);

    // --- Title ---
    ctx.font = 'bold 24px Arial';
    ctx.fillText('COMPROBANTE DE PAGO', W / 2, 160);
    ctx.font = '14px Arial';
    ctx.fillText('(Copia Control)', W / 2, 180);

    // --- Content Rows ---
    ctx.textAlign = 'left';
    ctx.font = '18px Arial';
    let y = 220;

    const rows = [
        ['CLIENTE:', (data.customerName || 'Cliente').toUpperCase()],
        ['FECHA:', data.date],
        ['HORA:', data.time],
        ['N° ORDEN:', (data.orderId || 'N/A').split('_').pop()?.toUpperCase()],
        ['PLAN:', data.planName],
        ['METODO:', data.paymentMethod || 'CULQI'],
        ['MONTO:', `S/ ${data.amount}`]
    ];

    rows.forEach(([label, value]) => {
        ctx.fillStyle = '#666666';
        ctx.fillText(label, PADDING, y);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(value, PADDING + 110, y);
        ctx.font = '18px Arial';
        y += LINE_H;
    });

    y += 20;
    drawDashedLine(ctx, PADDING, y, W - PADDING, y);

    // --- Total / Footer ---
    y += 40;
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px Arial';
    ctx.fillText(`TOTAL: S/ ${data.amount}`, W / 2, y);

    y += 50;
    ctx.font = '16px Arial';
    ctx.fillStyle = '#444444';
    ctx.fillText('¡Gracias por entrenar con nosotros!', W / 2, y);

    // --- QR / Barcode Simulation ---
    y += 30;
    ctx.fillStyle = '#000000';
    const barW = 2;
    for (let i = 0; i < 60; i++) {
        const h = 40 + Math.random() * 10;
        if (Math.random() > 0.3) {
            ctx.fillRect(PADDING + 40 + i * (barW + 4), y, barW, h);
        }
    }

    // --- Convert to Buffer ---
    const buffer = canvas.toBuffer('image/jpeg');

    // --- Upload to Firebase Storage ---
    if (!admin.apps.length) admin.initializeApp();
    const storage = admin.storage();

    // Use default bucket from Firebase runtime config (auto-detected via FIREBASE_CONFIG env var)
    const bucket = storage.bucket();
    console.log(`Using default bucket: ${bucket.name}`);

    const fileName = `vouchers/voucher_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
    const file = bucket.file(fileName);

    console.log(`Uploading to Storage: ${fileName}`);
    await file.save(buffer, {
        metadata: { contentType: 'image/jpeg' },
        resumable: false
    });

    try { await file.makePublic(); } catch (_) { /* ignore ACL errors on uniform-access buckets */ }

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(fileName)}`;
    console.log('Voucher generated and uploaded:', publicUrl);
    return publicUrl;
}

function drawDashedLine(ctx: any, x1: number, y1: number, x2: number, y2: number) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#AAAAAA';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
}
