// Рецепт (Rp./D.S., бланк 107-1/у), запас таблеток и сверка паспорта «Авиандра» со справочником AllMed PRO.
import { beforeEach, describe, expect, it } from 'vitest';
import { getDB, setDB, standNow } from './db';
import { activeRx, initialStand, issueRecipe, requestRecipe } from './api';
import { buildRecipe, gramsLatin, qtyForDays, tabletsPerDay } from '../core/dose';
import { aviandrRecipe, defaultQty, PACK_SIGNA, signaFor, supplyOf } from '../core/recipe';
import { answerQuestion } from '../core/text';
import { DAY } from '../core/time';
import aviandr from '../data/packs/aviandr.json';
import type { Prescription } from '../core/types';

beforeEach(() => {
  setDB(initialStand(), false);
});

describe('рецепт по образцу справочника', () => {
  it('Rp. и D.S. совпадают с образцом AllMed PRO буква в букву', () => {
    const r = aviandrRecipe(30, PACK_SIGNA);
    expect(`${r.rp}\n${r.ds}`).toBe(aviandr.prescription.example);
    expect(r.text).toContain('рецептурный бланк № 107-1/у');
    expect(r.days).toBe(15);
  });
  it('доза в граммах с запятой', () => {
    expect(gramsLatin(20)).toBe('0,02');
    expect(gramsLatin(2.5)).toBe('0,0025');
    expect(gramsLatin(500)).toBe('0,5');
  });
  it('таблеток в сутки по тексту D.S.', () => {
    expect(tabletsPerDay('Внутрь, по 1 таблетке 2 раза в сутки (утром и вечером)')).toBe(2);
    expect(tabletsPerDay('по 2 таблетки 1 раз в день')).toBe(2);
    expect(tabletsPerDay('по половине таблетки 2 раза в сутки')).toBe(1);
    expect(tabletsPerDay('Внутрь, 20 мг 1 раз в сутки утром.')).toBe(1);
    expect(tabletsPerDay('по необходимости')).toBeNull();
    expect(buildRecipe({ latinForm: 'Tab.', latinName: 'Maritupirdini', tabletMg: 20, qty: 30, signa: 'по необходимости', blank: '107-1/у' }).days).toBeNull();
  });
  it('количество кратно упаковке: на курс после COVID-19 (28 дней) и на месяц — № 60', () => {
    expect(qtyForDays(28, 2, 30)).toBe(60);
    expect(qtyForDays(45, 2, 30)).toBe(90);
    expect(qtyForDays(5, 2, 30)).toBe(30);
    expect(defaultQty(true)).toBe(60);
    expect(defaultQty(false)).toBe(60);
  });
  it('изменённый врачом режим попадает в D.S. как есть', () => {
    expect(signaFor({ regimen: aviandr.dosing.regimen })).toBe(PACK_SIGNA);
    expect(signaFor({ regimen: '20 мг 1 раз в сутки утром' })).toBe('Внутрь, 20 мг 1 раз в сутки утром.');
  });
});

describe('выписка рецепта и запас таблеток', () => {
  it('на стенде у каждого пациента на терапии есть рецепты, запас не «в минусе»', () => {
    const db = getDB();
    const now = standNow(db);
    const onTherapy = db.patients.filter((p) => activeRx(db, p.id));
    expect(onTherapy.length).toBeGreaterThan(0);
    for (const p of onTherapy) {
      const s = supplyOf(activeRx(db, p.id), now)!;
      expect(s).not.toBeNull();
      expect(s.daysLeft).toBeGreaterThanOrEqual(0);
      expect(s.daysLeft).toBeLessThanOrEqual(31);
    }
  });
  it('запас считается по сумме рецептов от первого', () => {
    const t0 = Date.parse('2026-10-01T09:00:00Z');
    const rec = (d: number) => ({ id: `r${d}`, qty: 60, signa: PACK_SIGNA, text: '', blank: '107-1/у', at: new Date(t0 + d * DAY).toISOString(), by: 'd1', days: 30 });
    const rx = { recipes: [rec(0), rec(25)] } as Prescription;
    const s = supplyOf(rx, new Date(t0 + 40 * DAY))!;
    expect(s.until.toISOString()).toBe(new Date(t0 + 60 * DAY).toISOString());
    expect(s.daysLeft).toBe(20);
    expect(s.count).toBe(2);
  });
  it('врач выписывает рецепт: запись в назначении, журнал, уведомление без медицинских данных', () => {
    const pid = getDB().patients.find((p) => activeRx(getDB(), p.id))!.id;
    const before = activeRx(getDB(), pid)!.recipes!.length;
    const rec = issueRecipe(pid, 'd1', 90, PACK_SIGNA);
    expect(rec.days).toBe(45);
    expect(activeRx(getDB(), pid)!.recipes).toHaveLength(before + 1);
    expect(getDB().audit.some((a) => a.action === 'Выписан рецепт (бланк № 107-1/у)' && a.details?.includes('Rp.: Tab. Maritupirdini 0,02 № 90'))).toBe(true);
    const n = getDB().notifications.filter((x) => x.to === pid).pop()!;
    expect(n.text).toMatch(/рецепт/);
    expect(n.text).not.toMatch(/авиандр|маритупирдин|тревож/i);
  });
  it('без действующего назначения или с неверным количеством рецепт не выписывается', () => {
    const noRx = getDB().patients.find((p) => !activeRx(getDB(), p.id))!.id;
    expect(() => issueRecipe(noRx, 'd1', 60, PACK_SIGNA)).toThrow(/назначения/);
    const pid = getDB().patients.find((p) => activeRx(getDB(), p.id))!.id;
    expect(() => issueRecipe(pid, 'd1', 0, PACK_SIGNA)).toThrow(/Количество/);
    expect(() => issueRecipe(pid, 'd1', 30, 'коротко')).toThrow(/D\.S\./);
  });
  it('пациент просит рецепт: сообщение врачу с темой и ответ системы', () => {
    requestRecipe('p1');
    const msgs = getDB().messages.filter((m) => m.patientId === 'p1');
    expect(msgs.some((m) => m.from === 'patient' && m.intent === 'recipe_request' && !m.readByDoctor)).toBe(true);
    expect(msgs[msgs.length - 1].text).toMatch(/Просьба передана врачу/);
  });
});

describe('паспорт «Авиандра» сверен со справочником AllMed PRO', () => {
  const all = (xs: string[]) => xs.join(' | ').toLowerCase();
  it('противопоказания и «с осторожностью» — все пункты справочника', () => {
    const ci = all(aviandr.contraindications);
    for (const k of ['чувствительност', 'эпилепси', 'органическ', 'скф < 60', 'чайлд', 'мао', 'беременност', 'грудное', '18 лет', 'транспорт']) expect(ci).toContain(k);
    const c = all(aviandr.cautions);
    for (const k of ['сердечно-сосуд', 'диабет', 'зависимост']) expect(c).toContain(k);
  });
  it('взаимодействия: все препараты, перечисленные в справочнике', () => {
    const members = aviandr.interactionGroups.flatMap((g) => g.members);
    for (const m of ['сертралин', 'пароксетин', 'амитриптилин', 'суматриптан', 'золмитриптан', 'трамадол', 'тримеперидин', 'дифенгидрамин', 'кетоконазол', 'хинидин', 'гидроксихлорохин']) expect(members).toContain(m);
  });
  it('нежелательные реакции: «часто» и все системы органов', () => {
    expect(aviandr.adverseReactions.frequent).toEqual(['сонливость', 'головная боль', 'головокружение', 'астения', 'парестезии']);
    expect(aviandr.adverseReactions.bySystem.map((s) => s.system)).toEqual(['Нервная система', 'Пищеварительная система', 'Кожа и подкожные ткани', 'Костно-мышечная система', 'Прочие']);
  });
  it('режим, курс, передозировка и форма выпуска', () => {
    expect(aviandr.dosing.regimen).toBe('20 мг 2 раза в сутки, утром и вечером, за 30 минут до еды');
    expect([aviandr.dosing.courseDaysPostCovid, aviandr.dosing.courseMaxDaysPostCovid]).toEqual([28, 42]);
    expect(aviandr.overdose).toMatch(/1,5 часа.*активированный уголь/);
    expect(aviandr.packSize).toBe(30);
  });
  it('новые ответы помощника: что за препарат, рецепт и упаковка', () => {
    expect(answerQuestion('Что за препарат мне назначили?').answer?.id).toBe('what_is');
    expect(answerQuestion('На сколько хватит упаковки, нужен рецепт?').answer?.id).toBe('supply');
    expect(answerQuestion('Можно ли с лекарством от простуды?').answer?.id).toBe('interaction');
  });
});
