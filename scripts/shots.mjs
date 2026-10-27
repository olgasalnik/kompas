// Скриншоты ключевых экранов для презентации, постера и проверки вёрстки.
// Использует установленный Microsoft Edge (или Chrome) — браузеры не скачиваются.
//   npm run dev            (в другом окне)
//   npm run shots -- --out=docs/screens [--base=http://localhost:5180/] [--only=doctor]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const base = arg('base', 'http://localhost:5180/');
const out = resolve(arg('out', 'docs/screens'));
const only = arg('only', '');
const scale = Number(arg('scale', '1'));
mkdirSync(out, { recursive: true });

const channel = arg('channel', 'msedge');
const browser = await chromium.launch({ channel, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: scale, locale: 'ru-RU' });
const errors = [];

async function shot(name, url, { width = 1440, height = 900, full = false, before } = {}) {
  if (only && !name.includes(only)) return;
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
  await page.setViewportSize({ width, height });
  await page.goto(base + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  if (before) await before(page);
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(out, `${name}.png`), fullPage: full });
  console.log('✓', name);
  await page.close();
}

const phone = { width: 390, height: 844 };

await shot('01_landing', '', { full: true });
await shot('02_doctor_dashboard', '#/doctor', { full: true });
await shot('03_doctor_dossier_s6', '#/doctor/patient/p6', { full: true });
await shot('04_doctor_therapy_s4_stop', '#/doctor/patient/p4?tab=therapy', { full: true });
await shot('05_doctor_therapy_s2_offlabel', '#/doctor/patient/p2?tab=therapy', { full: true });
await shot('06_doctor_therapy_s3_warn', '#/doctor/patient/p3?tab=therapy', { full: true });
await shot('07_doctor_therapy_s1_onlabel', '#/doctor/patient/p1?tab=therapy', { full: true });
await shot('08_doctor_dynamics_b1', '#/doctor/patient/p8?tab=dynamics', { full: true });
await shot('09_doctor_routing_s4', '#/doctor/patient/p4?tab=routing', { full: true });
await shot('10_doctor_messages_s3', '#/doctor/patient/p3?tab=messages', { full: true });
await shot('11_doctor_sources', '#/doctor/sources', { full: true });
await shot('12_therapist_s7', '#/therapist', {
  full: true,
  before: async (p) => {
    for (let i = 0; i < 5; i++) {
      await p.getByRole('button', { name: /Далее/ }).click();
      await p.waitForTimeout(150);
    }
  },
});
await shot('13_case', '#/case', { full: true });
await shot('14_patient_today_s6', '#/patient?as=p6', phone);
await shot('15_patient_checkin', '#/patient/checkin?as=p6', phone);
await shot('16_patient_help', '#/patient/help?as=p3', phone);
await shot('17_patient_chat_s3', '#/patient/chat?as=p3', phone);
await shot('18_patient_diary_b1', '#/patient/diary?as=p8', phone);
await shot('19_patient_sos', '#/patient/sos?as=p1', phone);
await shot('20_patient_login', '#/patient', phone);
// Сценарий 5: пациент отправляет PHQ-9 с пунктом 9 = 2 → красный сигнал у врача и безопасный экран у пациента
await shot('21_demo_page', '#/demo', {
  full: true,
  before: async (p) => {
    await p.getByRole('button', { name: /Запустить сигнал/ }).click();
    await p.waitForTimeout(400);
  },
});
await shot('22_doctor_red_banner', '#/doctor');
await shot('23_doctor_red_alert_modal', '#/doctor', {
  before: async (p) => {
    await p.getByRole('button', { name: 'Открыть', exact: true }).click();
    await p.waitForTimeout(300);
  },
});
await shot('24_patient_safe_screen_s5', '#/patient?as=p5', phone);
await shot('25_doctor_metrics', '#/doctor/metrics', { full: true });
await shot('26_mobile_doctor_dashboard', '#/doctor', { width: 390, height: 844, full: true });
await shot('27_doctor_inbox', '#/doctor/messages', { full: true });
await shot('28_doctor_documents_s3', '#/doctor/patient/p3?tab=documents', { full: true });
await shot('29_doctor_telemed_s3', '#/doctor/patient/p3', {
  before: async (p) => {
    await p.getByRole('button', { name: /Телемедконсультация/ }).click();
    await p.waitForTimeout(300);
  },
});
await shot('30_patient_centers', '#/patient/centers?as=p1', { ...phone, full: true });
await shot('31_patient_profile', '#/patient/me?as=p1', phone);
await shot('32_patient_previsit', '#/patient/previsit?as=p1', phone);
await shot('33_doctor_search', '#/doctor', {
  full: true,
  before: async (p) => {
    await p.locator('#patient-search').fill('сертралин');
    await p.waitForTimeout(300);
  },
});
// 34–36 — распознавание и голос (npm run check:recognition -- --shots=docs/screens)
await shot('37_doctor_recipe_s6', '#/doctor/patient/p6?tab=therapy', { full: true });
await shot('38_patient_supply', '#/patient?as=p9', phone);

await browser.close();
if (errors.length) {
  console.log('\nОшибки в консоли страниц:');
  for (const e of [...new Set(errors)]) console.log(' ✗', e);
  process.exitCode = 1;
} else console.log('\nОшибок в консоли нет. Скриншоты:', out);
