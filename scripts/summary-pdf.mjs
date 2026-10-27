// Сводка проекта в PDF (A4) из docs/summary/summary.html через установленный Edge.
//   node scripts/summary-pdf.mjs [--png]   (--png дополнительно сохраняет страницы картинками для проверки)
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const html = resolve('docs/summary/summary.html');
const out = resolve('docs/Компас_сводка_проекта.pdf');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
if (process.argv.includes('--png')) {
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.screenshot({ path: resolve('docs/summary/preview.png'), fullPage: true });
}
await browser.close();
console.log(`✓ ${out}`);
