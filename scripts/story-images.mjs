// Иллюстрации для docs/story: нужная часть скриншота, уменьшенная и сжатая в JPEG (чтобы PDF был лёгким).
// Обрезка и сжатие — canvas в установленном Edge, без дополнительных библиотек.
//   node scripts/story-images.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = resolve('docs/screens');
const out = resolve('docs/story/img');
mkdirSync(out, { recursive: true });

// файл, верх вырезаемой части, её высота (пиксели исходника), ширина результата[, левый край, ширина части]
const list = [
  ['01_landing', 0, 900, 1200],
  ['02_doctor_dashboard', 0, 760, 1200],
  ['03_doctor_dossier_s6', 0, 900, 1200],
  ['06_doctor_therapy_s3_warn', 0, 740, 1200],
  ['23_doctor_red_alert_modal', 10, 700, 900, 280, 885],
  ['12_therapist_s7', 40, 760, 1000, 185, 1070],
  ['34_doctor_ocr_review', 520, 640, 1200, 250, 1190],
  ['37_doctor_recipe_s6', 2385, 940, 800, 270, 655],
  ['43_doctor_privacy', 0, 860, 1200],
  ['21_demo_page', 0, 740, 1200],
  ['25_doctor_metrics', 0, 900, 1200],
  ['20_patient_login', 0, 844, 390],
  ['14_patient_today_s6', 0, 844, 390],
  ['15_patient_checkin', 0, 844, 390],
  ['24_patient_safe_screen_s5', 0, 844, 390],
  ['41_patient_bot', 0, 844, 390],
  ['39_patient_voice_recording', 0, 844, 390],
  ['38_patient_supply', 0, 844, 390],
  ['17_patient_chat_s3', 0, 844, 390],
];

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
let total = 0;
for (const [name, top, height, width, left = 0, cropW = 0] of list) {
  const png = readFileSync(join(src, `${name}.png`)).toString('base64');
  const b64 = await page.evaluate(
    async ({ png, top, height, width, left, cropW }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const h = Math.min(height, img.naturalHeight - top);
      const w = cropW || img.naturalWidth - left;
      const scale = width / w;
      const c = document.createElement('canvas');
      c.width = width;
      c.height = Math.round(h * scale);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, left, top, w, h, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.84).split(',')[1];
    },
    { png, top, height, width, left, cropW },
  );
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(join(out, `${name}.jpg`), buf);
  total += buf.length;
}
await browser.close();
console.log(`✓ ${list.length} иллюстраций, ${Math.round(total / 1024)} КБ → ${out}`);
