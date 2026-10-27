// Рецепт на «Авиандр» по данным пакета препарата и расчёт запаса таблеток по выписанным рецептам.
import aviandr from '../data/packs/aviandr.json';
import { buildRecipe, qtyForDays, standardSigna, type Recipe } from './dose';
import type { Prescription, RecipeRecord } from './types';
import { DAY } from './time';

const P = aviandr.prescription;

/** Сигнатура по инструкции: «Внутрь, по 1 таблетке 2 раза в сутки (утром и вечером), за 30 минут до еды.» */
export const PACK_SIGNA = standardSigna(aviandr.dosing.singleMg / aviandr.tabletMg, aviandr.dosing.timesPerDay, aviandr.dosing.slots, aviandr.food);

/** Количество кратно упаковке (30 таблеток) */
export const QTY_OPTIONS = [aviandr.packSize, aviandr.packSize * 2, aviandr.packSize * 3];

export const RECIPE_BLANK = P.blank;

/** Сигнатура для назначения: по инструкции — стандартная; изменённый режим — со слов врача (можно поправить) */
export function signaFor(rx: Pick<Prescription, 'regimen'>): string {
  if (rx.regimen.trim() === aviandr.dosing.regimen) return PACK_SIGNA;
  const r = rx.regimen.trim().replace(/\.$/, '');
  return `Внутрь, ${r.charAt(0).toLocaleLowerCase('ru-RU')}${r.slice(1)}.`;
}

export function aviandrRecipe(qty: number, signa: string): Recipe {
  return buildRecipe({ latinForm: P.latinForm, latinName: P.latinInn, tabletMg: aviandr.tabletMg, qty, signa, blank: P.blank });
}

/** Количество по умолчанию: на курс после COVID-19 (4 недели) или на месяц при ГТР */
export function defaultQty(postCovid: boolean): number {
  const perDay = aviandr.dosing.timesPerDay * (aviandr.dosing.singleMg / aviandr.tabletMg);
  return qtyForDays(postCovid ? aviandr.dosing.courseDaysPostCovid : 30, perDay, aviandr.packSize);
}

export interface Supply {
  last: RecipeRecord;
  count: number;
  until: Date;
  daysLeft: number;
}

/** Запас таблеток: от первого рецепта текущего назначения на сумму дней всех рецептов (если пациент выкупил все) */
export function supplyOf(rx: Prescription | undefined, now: Date): Supply | null {
  const list = (rx?.recipes ?? []).filter((r) => r.days);
  if (!list.length) return null;
  const start = Date.parse(list[0].at);
  const until = new Date(start + list.reduce((s, r) => s + (r.days ?? 0), 0) * DAY);
  return { last: list[list.length - 1], count: list.length, until, daysLeft: Math.ceil((until.getTime() - now.getTime()) / DAY) };
}

/** Порог напоминания «таблетки заканчиваются» — за 5 дней */
export const SUPPLY_WARN_DAYS = 5;
