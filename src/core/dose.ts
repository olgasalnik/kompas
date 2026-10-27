// Запись дозировок: миллиграммы с пересчётом в граммы, разовая и суточная доза (без ошибок порядка).
import type { Facts } from './types';
import type { TherapyCheck } from './clinical';
import { bandFor } from './scales';

export function fmtMg(mg: number): string {
  const g = mg / 1000;
  return `${mg.toLocaleString('ru-RU')} мг (${g.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} г)`;
}

export function doseSummary(singleMg: number, timesPerDay: number): { single: string; daily: string; line: string } {
  const single = fmtMg(singleMg);
  const daily = fmtMg(singleMg * timesPerDay);
  const times = timesPerDay === 1 ? '1 раз' : `${timesPerDay} раза`;
  return { single, daily, line: `Разовая доза ${single} × ${times} в сутки = ${daily} в сутки` };
}

// ───────── Рецепт ─────────
// Образец (справочник AllMed PRO): «Rp.: Tab. Maritupirdini 0,02 № 30 / D.S. Внутрь, по 1 таблетке 2 раза в сутки
// (утром и вечером), за 30 минут до еды». Бланк № 107-1/у. Дозу в рецепте пишут в граммах: 20 мг = 0,02.

export interface RecipeSpec {
  latinForm: string; // «Tab.»
  latinName: string; // МНН в родительном падеже: «Maritupirdini»
  tabletMg: number;
  qty: number; // количество таблеток (№)
  signa: string; // способ применения для пациента, без «D.S.»
  blank: string; // «107-1/у»
}

/** Доза в граммах для рецепта: 20 → «0,02», 2,5 → «0,0025» */
export function gramsLatin(mg: number): string {
  return (mg / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 4, useGrouping: false });
}

const TIMES_WORD: Record<number, string> = { 1: '1 раз в сутки', 2: '2 раза в сутки', 3: '3 раза в сутки', 4: '4 раза в сутки' };

/** Стандартная сигнатура по режиму: «Внутрь, по 1 таблетке 2 раза в сутки (утром и вечером), за 30 минут до еды.» */
export function standardSigna(tabsPerDose: number, timesPerDay: number, slots: string[], food: string): string {
  const tabs = tabsPerDose === 1 ? 'по 1 таблетке' : `по ${tabsPerDose.toLocaleString('ru-RU')} таблетки`;
  const when = slots.length === 2 && timesPerDay === 2 ? ' (утром и вечером)' : slots.length === 1 && timesPerDay === 1 ? (slots[0] === 'morning' ? ' (утром)' : ' (вечером)') : '';
  const meal = food.replace(/^принимать\s+внутрь\s+/i, '').replace(/\.$/, '');
  return `Внутрь, ${tabs} ${TIMES_WORD[timesPerDay] ?? `${timesPerDay} раз в сутки`}${when}, ${meal}.`;
}

/** Сколько таблеток в сутки по тексту сигнатуры: «по 1 таблетке 2 раза в сутки» → 2. Null, если не понять. */
export function tabletsPerDay(signa: string): number | null {
  const s = signa.toLowerCase().replace(',', '.');
  const per = /по\s+(\d+(?:\.\d+)?|одной|половине)\s+таблет/.exec(s);
  const times = /(\d+)\s+раз[а]?\s+в\s+(сутки|день)/.exec(s);
  if (!times) return null;
  const tabs = !per ? 1 : per[1] === 'одной' ? 1 : per[1] === 'половине' ? 0.5 : Number(per[1]);
  return tabs * Number(times[1]);
}

export interface Recipe {
  rp: string;
  ds: string;
  text: string; // для копирования в бланк или МИС
  days: number | null; // на сколько дней хватит
}

export function buildRecipe(r: RecipeSpec): Recipe {
  const rp = `Rp.: ${r.latinForm} ${r.latinName} ${gramsLatin(r.tabletMg)} № ${r.qty}`;
  const ds = `D.S. ${r.signa.trim()}`;
  const perDay = tabletsPerDay(r.signa);
  const days = perDay ? Math.floor(r.qty / perDay) : null;
  return { rp, ds, text: `${rp}\n${ds}\n(рецептурный бланк № ${r.blank})`, days };
}

/** Сколько таблеток выписать: количество кратно упаковке и покрывает нужное число дней */
export function qtyForDays(days: number, perDay: number, packSize: number): number {
  return Math.max(packSize, Math.ceil((days * perDay) / packSize) * packSize);
}

export interface RationaleItem {
  state: 'ok' | 'warn' | 'no' | 'info';
  text: string;
}

/** Обоснование для врача: почему «Авиандр» уместно рассматривать (или нет) у этого пациента — по инструкции и данным */
export function aviandrRationale(facts: Facts, check: TherapyCheck): RationaleItem[] {
  const items: RationaleItem[] = [];
  const code = String(facts['diagnosis.code'] ?? '—');
  items.push(
    check.indication
      ? { state: 'ok', text: `Диагноз ${code} входит в зарегистрированные показания (${check.indication.rule.id === 'AVI-IND-POSTCOVID' ? 'тревожные состояния после COVID-19' : 'генерализованное тревожное расстройство'})` }
      : { state: 'no', text: `Диагноз ${code} вне зарегистрированных показаний — применение только как решение врача вне инструкции` },
  );
  const age = Number(facts['patient.age']);
  items.push(age >= 18 ? { state: 'ok', text: `Возраст ${age} — препарат разрешён с 18 лет` } : { state: 'no', text: `Возраст ${age} — противопоказан до 18 лет` });
  const g = facts['gad7.total'] as number | null;
  const p = facts['phq9.total'] as number | null;
  if (g !== null && p !== null && g !== undefined && p !== undefined) {
    const anxietyLeads = g / 21 >= p / 27;
    items.push(
      anxietyLeads
        ? { state: 'ok', text: `Ведущая тревожная симптоматика: GAD-7 ${g} (${bandFor('GAD7', g).label}), PHQ-9 ${p} (${bandFor('PHQ9', p).label}) — профиль соответствует показанию` }
        : { state: 'warn', text: `Преобладают депрессивные симптомы: PHQ-9 ${p} (${bandFor('PHQ9', p).label}) при GAD-7 ${g} — рассмотрите варианты по КР «Депрессивный эпизод»` },
    );
  } else items.push({ state: 'info', text: 'Нет свежих PHQ-9 и GAD-7 — профиль симптомов не оценён' });
  const item9 = facts['phq9.item9'] as number | null;
  if (item9) items.push({ state: 'warn', text: `Пункт 9 PHQ-9 = ${item9}: сначала оценка суицидального риска врачом` });
  items.push(
    check.stops.length
      ? { state: 'no', text: `Противопоказания по инструкции: ${check.stops.map((s) => s.rule.title.toLowerCase()).join('; ')}` }
      : { state: 'ok', text: 'Противопоказаний по инструкции по введённым данным не найдено' },
  );
  if (check.warns.length) items.push({ state: 'warn', text: `Требуют внимания (${check.warns.length}): ${check.warns.map((w) => w.rule.title.replace('ПРОВЕРЬТЕ СОЧЕТАНИЕ: ', '').replace('С осторожностью: ', '').toLowerCase()).join('; ')}` });
  const rate = facts['adherence.rate7'] as number | null;
  items.push({ state: 'info', text: `Режим — 2 приёма в сутки за 30 минут до еды${rate !== null && rate !== undefined ? `; текущая приверженность за 7 дней ${Math.round(rate * 100)}%` : ''}` });
  items.push({ state: 'info', text: 'В инструкции указана противотревожная и антидепрессивная активность; варианты по КР показаны ниже независимо от спонсора. Окончательный выбор — за врачом.' });
  return items;
}
