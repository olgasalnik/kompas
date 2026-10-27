// QR-код на демо-стенд для презентации и постера → docs/qr/.
//   node scripts/qr.mjs [--url=https://…]
// kompas-demo-qr.svg — вектор (постер любого размера), kompas-demo-qr.png — 2000 px (слайды),
// kompas-demo-card.png — QR с подписью и адресом. Картинки рисует установленный Edge.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.argv.find((a) => a.startsWith('--url='))?.slice(6) ?? 'https://olgasalnik.github.io/kompas/';
const outDir = resolve('docs/qr');
mkdirSync(outDir, { recursive: true });

// Уровень коррекции Q (до 25 % повреждений) и поле в 4 модуля — так код читается и с распечатки.
const qr = (color) =>
  renderToStaticMarkup(createElement(QRCodeSVG, { value: url, size: 1000, level: 'Q', marginSize: 4, fgColor: color, bgColor: '#ffffff' }))
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
writeFileSync(resolve(outDir, 'kompas-demo-qr.svg'), qr('#000000'));

const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(resolve('node_modules/@fontsource', pkg, 'files', file)).toString('base64')}`;
const shown = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
const card = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Manrope; font-weight: 800; src: url(${font('manrope', 'manrope-cyrillic-800-normal.woff2')}); }
@font-face { font-family: Golos; font-weight: 500; src: url(${font('golos-text', 'golos-text-cyrillic-500-normal.woff2')}); }
@font-face { font-family: Golos; font-weight: 500; unicode-range: U+0000-00FF; src: url(${font('golos-text', 'golos-text-latin-500-normal.woff2')}); }
body { margin: 0; }
#card { width: 1600px; height: 2000px; background: #ffffff; display: grid; justify-items: center; align-content: center; gap: 48px; font-family: Golos, sans-serif; color: #1f1b2e; }
h1 { margin: 0; font: 800 120px/1 Manrope, sans-serif; color: #3a2b73; }
.sub { font-size: 56px; color: #5d5873; margin-top: -16px; }
.qr { width: 1150px; height: 1150px; }
.qr svg { width: 100%; height: 100%; display: block; }
.url { font-size: 64px; color: #3a2b73; }
.note { font-size: 40px; color: #8a84a3; }
</style>
<div id="card"><h1>Компас</h1><div class="sub">Демо-стенд — наведите камеру телефона</div>
<div class="qr">${qr('#3a2b73')}</div><div class="url">${shown}</div><div class="note">Данные синтетические</div></div>`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 2000, height: 2000 } });
await page.setContent(`<!doctype html><style>body{margin:0}svg{width:2000px;height:2000px;display:block}</style>${qr('#000000')}`);
await page.locator('svg').screenshot({ path: resolve(outDir, 'kompas-demo-qr.png') });
await page.setViewportSize({ width: 1600, height: 2000 });
await page.setContent(card);
await page.evaluate(() => document.fonts.ready);
await page.locator('#card').screenshot({ path: resolve(outDir, 'kompas-demo-card.png') });
await browser.close();
console.log(`✓ QR на ${url} → ${outDir}`);
