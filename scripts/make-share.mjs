// Превращает офлайн-сборку (offline/index.html) в страницу для публикации по ссылке:
// без собственных <html>/<head>/<body> (их добавляет хостинг), без ссылок на favicon и manifest.
//   npm run build:offline && node scripts/make-share.mjs <выходной.html>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const src = resolve('offline/index.html');
// По умолчанию — рядом с офлайн-сборкой (папка offline не попадает в репозиторий и не мешает в корне)
const out = resolve(process.argv[2] ?? 'offline/kompas-share.html');
const html = readFileSync(src, 'utf8');

const sOpen = html.indexOf('<script type="module"');
const sBody = html.indexOf('>', sOpen) + 1;
const styleOpen = html.indexOf('<style', sBody);
const sClose = html.lastIndexOf('</script>', styleOpen);
const stBody = html.indexOf('>', styleOpen) + 1;
const stClose = html.indexOf('</style>', stBody);
if ([sOpen, styleOpen, sClose, stClose].some((i) => i < 0)) throw new Error('Неожиданная структура offline/index.html');

const script = html.slice(sBody, sClose);
const style = html.slice(stBody, stClose);
const page = [
  '<title>Компас</title>',
  '<meta name="theme-color" content="#4b3a8c">',
  `<style>${style}</style>`,
  '<div id="root"></div>',
  `<script type="module">${script}</script>`,
  '',
].join('\n');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page, 'utf8');
console.log(`✓ ${out} — ${(page.length / 1024).toFixed(0)} КБ`);
// Распознавание текста грузит модели из папки ocr/ рядом со страницей — публикуются вместе с ней
execFileSync(process.execPath, [resolve('scripts/copy-ocr.mjs'), join(dirname(out), 'ocr')], { stdio: 'inherit' });
