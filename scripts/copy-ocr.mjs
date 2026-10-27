// Кладёт модуль распознавания текста (tesseract.js) и языковые модели (русский, английский) в public/ocr,
// чтобы распознавание работало без интернета и без внешних CDN. Запускается само перед dev и build.
//   node scripts/copy-ocr.mjs [папка-назначения]
// Модели (сжатые .gz) публикуются с расширением .wasm: хостинг тестовой ссылки раздаёт только «веб-типы» файлов.
// Обёртка worker-wrap.js подставляет эти имена при загрузке; распознаватель сам распаковывает сжатые данные.
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'public/ocr');
const nm = resolve('node_modules');
const files = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['@tesseract.js-data/rus/4.0.0_best_int/rus.traineddata.gz', 'rus.traineddata.wasm'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.wasm'],
];

const WRAP = `// Фоновый процесс распознавания: модели лежат рядом как *.traineddata.wasm (см. scripts/copy-ocr.mjs)
const nativeFetch = self.fetch.bind(self);
self.fetch = (url, opts) => nativeFetch(String(url).replace(/\\.traineddata\\.gz$/, '.traineddata.wasm'), opts);
importScripts('worker.min.js');
`;

mkdirSync(out, { recursive: true });
let total = 0;
for (const [from, to] of files) {
  const src = join(nm, from);
  if (!existsSync(src)) throw new Error(`Нет ${from} — выполните npm install`);
  const dst = join(out, to);
  const size = statSync(src).size;
  // Не копируем заново, если файл уже на месте (dev-сервер стартует быстрее)
  if (!existsSync(dst) || statSync(dst).size !== size) copyFileSync(src, dst);
  total += size;
}
writeFileSync(join(out, 'worker-wrap.js'), WRAP, 'utf8');
console.log(`✓ распознавание текста: ${files.length + 1} файлов, ${(total / 1024 / 1024).toFixed(1)} МБ → ${out}`);
