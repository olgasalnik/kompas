// «Как сделан проект» в PDF (A4, номера страниц) из docs/story/story.html через установленный Edge.
//   node scripts/story-images.mjs   (иллюстрации из docs/screens, один раз после новых скриншотов)
//   node scripts/story-pdf.mjs
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const html = resolve('docs/story/story.html');
const out = resolve('docs/Компас_как_сделан_проект.pdf');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: out,
  format: 'A4',
  printBackground: true,
  margin: { top: '15mm', bottom: '17mm', left: '16mm', right: '16mm' },
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%; font-size:7.5pt; color:#7b7594; padding:0 16mm; display:flex; justify-content:space-between; font-family: Segoe UI, Arial, sans-serif"><span>Компас — как сделан проект</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
});
await browser.close();
console.log(`✓ ${out}`);
