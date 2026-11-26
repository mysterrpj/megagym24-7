// Dependency-free PNG generation. Run: node scripts/generate-pwa-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const directory = new URL('../public/icons/', import.meta.url);
mkdirSync(directory, { recursive: true });

function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, checksum]);
}

// The entire dumbbell stays inside the maskable icon's central safe circle.
const rectangles = [
    [0.29, 0.475, 0.71, 0.525],
    [0.25, 0.37, 0.32, 0.63],
    [0.34, 0.32, 0.41, 0.68],
    [0.59, 0.32, 0.66, 0.68],
    [0.68, 0.37, 0.75, 0.63],
];

for (const [name, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
    ['apple-touch-icon.png', 180],
]) {
    const stride = size * 3 + 1;
    const pixels = Buffer.alloc(size * stride);
    // Supersampling smooths the edges without external image libraries.
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const color = [0, 0, 0];
            for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
                const u = (x + (sx + 0.5) / 4) / size;
                const v = (y + (sy + 0.5) / 4) / size;
                const inside = rectangles.some(([left, top, right, bottom]) => u >= left && u <= right && v >= top && v <= bottom);
                const rgb = inside ? [255, 255, 255] : [22, 163, 74];
                for (let channel = 0; channel < 3; channel++) color[channel] += rgb[channel];
            }
            const offset = y * stride + 1 + x * 3;
            for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = Math.round(color[channel] / 16);
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header[8] = 8;
    header[9] = 2; // Opaque RGB, safe for Android masks and Apple touch icons.
    const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(pixels)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
    writeFileSync(new URL(name, directory), png);
    console.log(`Generated ${name}: ${size}x${size}`);
}
