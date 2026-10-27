// Проверка распознавания в настоящем браузере (установленный Edge): скан выписки → текст → находки → сохранение;
// голосовой ввод — с подменой SpeechRecognition (в фоновом браузере нет микрофона).
//   npm run dev            (в другом окне)
//   node scripts/check-recognition.mjs [--base=http://localhost:5180/] [--shots=папка]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const base = arg('base', 'http://localhost:5180/');
const shots = arg('shots', '');
if (shots) mkdirSync(resolve(shots), { recursive: true });
// Перед кадром убираем всплывающие уведомления от предыдущих шагов — для чистых скриншотов
const snap = async (page, name, full = true) => {
  if (!shots) return;
  await page.addStyleTag({ content: '.toasts{display:none!important}' });
  await page.screenshot({ path: join(resolve(shots), `${name}.png`), fullPage: full });
};

// Фальшивый микрофон (звуковой сигнал) — чтобы проверить запись голосовых без настоящего устройства
const browser = await chromium.launch({ channel: arg('channel', 'msedge'), headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU', permissions: ['microphone', 'clipboard-read', 'clipboard-write'] });
// Подмена Web Speech API: «распознаёт» заранее заданную фразу
await ctx.addInitScript(() => {
  class FakeRecognition {
    start() {
      setTimeout(() => this.onstart?.(), 50);
      const phrase = window.__phrase ?? 'просыпаюсь в четыре утра и уже не могу уснуть';
      const res = (text, isFinal) => {
        const r = [{ transcript: text, confidence: 0.9 }];
        r.isFinal = isFinal;
        return r;
      };
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [res(phrase.split(' ').slice(0, 3).join(' '), false)] }), 300);
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [res(phrase, true)] }), 700);
      setTimeout(() => this.onend?.(), 900);
    }
    stop() {
      this.onend?.();
    }
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition;
});

const errors = [];
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`);
};

const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

// Зашифрованная запись стенда на диске (IndexedDB, в старых версиях — localStorage)
const readStoredRaw = (p) =>
  p.evaluate(
    () =>
      new Promise((res) => {
        const q = indexedDB.open('kompas-vault', 2);
        q.onerror = () => res(localStorage.getItem('kompas.db.v1') ?? '');
        q.onsuccess = () => {
          const d = q.result;
          if (!d.objectStoreNames.contains('data')) return d.close(), res(localStorage.getItem('kompas.db.v1') ?? '');
          const r = d.transaction('data').objectStore('data').get('kompas.db.v1');
          r.onsuccess = () => (d.close(), res(r.result ?? ''));
          r.onerror = () => (d.close(), res(''));
        };
      }),
  );

// Сброс стенда, чтобы начать с чистых данных: удалить хранилище и перезагрузить страницу
await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(
  () =>
    new Promise((r) => {
      localStorage.clear();
      const q = indexedDB.deleteDatabase('kompas-vault');
      q.onsuccess = q.onerror = q.onblocked = () => r();
    }),
);
await page.reload({ waitUntil: 'networkidle' });

// 1. Распознавание скана выписки (пациентка сценария 3)
await page.goto(`${base}#/doctor/patient/p3?tab=documents`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const t0 = Date.now();
await page.getByRole('button', { name: /Распознать текст/ }).first().click();
await page.getByRole('button', { name: /Сохранить в карточку/ }).waitFor({ timeout: 120_000 });
const secs = ((Date.now() - t0) / 1000).toFixed(1);
const recognized = await page.locator('.ocr-text').first().innerText();
check('скан распознан', recognized.length > 50, `${secs} с`);
check('в тексте есть «сертралин 50 мг»', /сертралин\s*50\s*мг/i.test(recognized));
const found = await page.locator('.ocr-found').first().innerText();
check('найдено: сертралин — взаимодействие', /сертралин.*взаимодейств/i.test(found), found.replace(/\s+/g, ' '));
// Код диагноза: либо распознан верно и совпал с карточкой, либо расхождение показано врачу
const icdOk = /F41\.1 · как в карточке/.test(found) || (await page.getByText(/не совпадает с диагнозом в карточке/).count()) > 0;
check('код МКБ-10 сверен с карточкой', icdOk, /F41\.1/.test(recognized) ? 'F41.1 распознан верно' : 'расхождение показано врачу');
await snap(page, '34_doctor_ocr_review');
await page.getByRole('button', { name: /Сохранить в карточку/ }).click();
await page.waitForTimeout(400);
check('печатная версия сохранена', await page.getByText('Печатная версия документа').first().isVisible());

// 2. Поиск по распознанному тексту
await page.goto(`${base}#/doctor`, { waitUntil: 'networkidle' });
await page.locator('#patient-search').fill('сертралин 50');
await page.waitForTimeout(400);
check('поиск находит распознанный документ', (await page.getByText(/Документ «Скан: выписка/).count()) > 0);

// 3. «Со слов пациента» голосом у врача
await page.goto(`${base}#/doctor/patient/p1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Записать голосом' }).click();
await page.waitForTimeout(1200);
const said = await page.getByLabel('Со слов пациента').inputValue();
check('голосом: текст в поле «со слов пациента»', said === 'Просыпаюсь в четыре утра и уже не могу уснуть', said);
await page.getByRole('button', { name: /^Записать$/ }).click();
await page.waitForTimeout(300);
await page.locator('#patient-words').scrollIntoViewIfNeeded();
await snap(page, '35_doctor_patient_words', false);
check('запись «со слов пациента» с пометкой «голосом»', (await page.locator('#patient-words').getByText('голосом').count()) > 0);

// 4. Пациент надиктовывает сообщение врачу
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => (window.__phrase = 'можно ли пить кофе утром'));
await page.goto(`${base}#/patient/chat?as=p1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.evaluate(() => (window.__phrase = 'можно ли пить кофе утром'));
await page.getByRole('button', { name: 'Надиктовать сообщение' }).click();
await page.waitForTimeout(450);
await snap(page, '36_patient_chat_voice', false);
await page.waitForTimeout(800);
const msg = await page.getByPlaceholder('Сообщение врачу').inputValue();
check('пациент: надиктованный текст в поле сообщения', msg === 'Можно ли пить кофе утром', msg);
await page.getByRole('button', { name: 'Отправить' }).click();
await page.waitForTimeout(400);
check('сообщение помечено «голосом»', (await page.getByText(/· голосом/).count()) > 0);

// 5. Голосовое сообщение: запись с микрофона, расшифровка, прослушивание у врача
await page.evaluate(() => (window.__phrase = 'меня беспокоит сон'));
await page.getByRole('button', { name: 'Записать голосовое врачу' }).click();
await page.waitForTimeout(1500);
await snap(page, '39_patient_voice_recording', false);
await page.getByRole('button', { name: 'Отправить голосовое' }).click();
await page.waitForTimeout(1200);
const audioCount = await page.locator('audio.voice-audio').count();
check('пациент: голосовое отправлено и проигрывается', audioCount > 0);
check('пациент: у голосового есть расшифровка', (await page.getByText(/меня беспокоит сон/).count()) > 0);
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${base}#/doctor/patient/p1?tab=messages`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const src = await page.locator('audio.voice-audio').last().getAttribute('src');
check('врач: голосовое в переписке', Boolean(src?.startsWith('data:audio/')), src?.slice(0, 24));
await page.locator('audio.voice-audio').last().scrollIntoViewIfNeeded();
await snap(page, '40_doctor_voice_message', false);

// 6. Бот у пациента: лента напоминаний и поддержки
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}#/patient/help?as=p6`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
check('пациент: лента Компас-бота', (await page.locator('#bot .bubble').count()) > 0);
await snap(page, '41_patient_bot', false);

// 7. Совместимость у пациента
await page.locator('#compat input').fill('Супрастин');
await page.locator('#compat button[type=submit]').click();
await page.waitForTimeout(200);
check('пациент: проверка совместимости «Супрастин» → предупреждение', (await page.locator('#compat').getByText(/ВНИМАНИЕ/).count()) > 0);

// 8. Врач: совместимость, анамнез, документы специалистов, защита данных
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${base}#/doctor/patient/p6?tab=therapy`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('#compat input').fill('Золофт');
await page.locator('#compat button[type=submit]').click();
await page.waitForTimeout(200);
check('врач: «Золофт» → сертралин, ВНИМАНИЕ', (await page.locator('#compat').getByText(/сертралин/).count()) > 0);
await page.getByRole('button', { name: /Скопировать анамнез/ }).click();
await page.waitForTimeout(300);
const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
check('врач: анамнез скопирован в буфер', /Анамнез заболевания:/.test(clip) && /Лекарственный анамнез:/.test(clip), clip.split('\n')[0]);

await page.goto(`${base}#/doctor/staff`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
check('сотрудники: есть статусы «истекает» и «на проверке»', (await page.getByText(/Аккредитация истекает/).count()) > 0 && (await page.getByText(/На проверке/).count()) > 0);
await snap(page, '42_doctor_staff');
const row = page.locator('tr', { hasText: 'Ковалёв' });
await row.getByRole('button', { name: /Проверить в реестре/ }).click();
await page.waitForTimeout(300);
check('сотрудники: после проверки в реестре — «Документы проверены»', (await row.getByText('Документы проверены').count()) > 0);

await page.goto(`${base}#/doctor/privacy`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const sample = await page.locator('pre[aria-label="Начало записи на диске"]').innerText();
check('защита данных: хранилище зашифровано', (await page.getByText('Зашифровано', { exact: true }).count()) > 0 && sample.startsWith('{"v":1,"alg":"AES-GCM-256"'));
const raw = await readStoredRaw(page);
check('на диске нет открытых медданных', raw.length > 0 && !/Морозова|сертралин|Авиандр|F41/.test(raw));
await snap(page, '43_doctor_privacy');

// 9. Фото документа с телефона: большое фото сжимается, врач распознаёт текст, после перезагрузки всё на месте
const jpeg = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 3000;
  c.height = 4000;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfaf5';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#222';
  g.font = 'bold 120px "Times New Roman", serif';
  g.fillText('ВЫПИСКА ИЗ КАРТЫ', 300, 520);
  g.font = '96px "Times New Roman", serif';
  ['Пациентка: Анна К.', 'Диагноз: тревожное расстройство.', 'Назначено: пароксетин 20 мг утром.', 'Контроль через 2 недели.'].forEach((l, i) => g.fillText(l, 300, 860 + i * 170));
  // «Шум камеры», как на настоящем фото: такой файл весит мегабайты (прежний предел загрузки был 1 МБ)
  const im = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < im.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    im.data[i] += n;
    im.data[i + 1] += n;
    im.data[i + 2] += n;
  }
  g.putImageData(im, 0, 0);
  const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
});
const photo = Buffer.from(jpeg, 'base64');
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${base}#/patient/me?as=p1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('#upload-patient').setInputFiles({ name: 'foto-vypiski.jpg', mimeType: 'image/jpeg', buffer: photo });
const photoCard = page.locator('.card-flat', { hasText: 'foto-vypiski.jpg' });
const uploaded = await photoCard
  .first()
  .waitFor({ timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
check('пациент: фото выписки загружено', uploaded);
const meta = (await photoCard.first().innerText()).match(/(\d+) КБ/);
const kb = meta ? Number(meta[1]) : 0;
check('фото с телефона больше 1 МБ сжато перед сохранением', photo.length > 1_000_000 && kb > 0 && kb * 1024 < photo.length, `${(photo.length / 1_048_576).toFixed(1)} МБ → ${kb} КБ`);
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${base}#/doctor/patient/p1?tab=documents`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const docCard = page.locator('.card-flat', { hasText: 'foto-vypiski.jpg' }).first();
await docCard.getByRole('button', { name: /Распознать текст/ }).click();
await page.getByRole('button', { name: /Сохранить в карточку/ }).waitFor({ timeout: 120_000 });
const photoText = await page.locator('.ocr-text').first().innerText();
check('врач: текст с фото распознан', /пароксетин/i.test(photoText), photoText.split('\n').slice(2, 4).join(' / '));
check('врач: найден препарат из группы взаимодействий', (await page.locator('.ocr-found').first().getByText(/пароксетин.*взаимодейств/).count()) > 0);
await page.getByRole('button', { name: /Сохранить в карточку/ }).click();
await page.waitForTimeout(800);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(800);
check('после перезагрузки: фото и печатная версия на месте', (await page.locator('.card-flat', { hasText: 'foto-vypiski.jpg' }).getByText('есть печатная версия').count()) > 0);

check('нет ошибок в консоли', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} проверок`);
process.exit(failed ? 1 : 0);
