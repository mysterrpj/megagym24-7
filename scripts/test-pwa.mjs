// Run after npm run build: node --test scripts/test-pwa.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const manifest = JSON.parse(read('public/manifest.webmanifest'));

test('Instalación independiente con identidad estable y ruta protegida existente', () => {
    assert.equal(manifest.id, '/');
    assert.equal(manifest.name, 'MegaGym');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, '/login');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.lang, 'es');
    assert.match(read('src/App.tsx').toString(), /path="\/login"/);
    assert.deepEqual(JSON.parse(read('dist/manifest.webmanifest')), manifest);
});

test('Íconos PNG reales con dimensiones válidas y recursos copiados al build', () => {
    assert(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'));
    assert(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'));
    assert(manifest.icons.some((icon) => icon.purpose === 'maskable'));
    const icons = [...manifest.icons, { src: '/icons/apple-touch-icon.png', sizes: '180x180' }];
    for (const icon of icons) {
        const png = read(`public${icon.src}`);
        assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
        assert.equal(png[25], 2, 'RGB opaco');
        assert.deepEqual(read(`dist${icon.src}`), png);
    }
});

test('HTML publicado enlaza manifiesto y configuración de iPhone', () => {
    const html = read('dist/index.html').toString();
    assert.match(html, /<html lang="es">/);
    assert.match(html, /rel="manifest" href="\/manifest.webmanifest"/);
    assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
    assert.match(html, /rel="apple-touch-icon"[^>]*href="\/icons\/apple-touch-icon.png"/);
    assert.match(html, /name="theme-color" content="#0a0a0a"/);
});

test('La adaptación no registra service workers ni intercepta solicitudes', () => {
    const entry = read('src/main.tsx').toString();
    assert.doesNotMatch(entry, /serviceWorker|registerSW|workbox/);
});
