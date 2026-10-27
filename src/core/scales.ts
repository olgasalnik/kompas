// Подсчёт шкал по ключу из data/scales.json — детерминированно, с проверкой входа.
import scalesJson from '../data/scales.json';
import type { ScaleId } from './types';

export interface ScaleBand {
  min: number;
  max: number;
  label: string;
  tone: 'mint' | 'green' | 'yellow' | 'orange' | 'red';
}

export interface ScaleDef {
  id: ScaleId;
  name: string;
  full: string;
  purpose: string;
  version: string;
  source: string;
  filledBy: 'patient' | 'doctor';
  intro?: string;
  options?: { value: number; label: string }[];
  items?: string[];
  subscales?: Record<string, { label: string; items: number[]; positiveFrom: number }>;
  criticalItems?: number[];
  max: number;
  bands: ScaleBand[];
  note: string;
}

export const SCALES = scalesJson as unknown as Record<ScaleId, ScaleDef>;

export interface ScaleScore {
  scale: ScaleId;
  total: number;
  band: string;
  tone: ScaleBand['tone'] | 'neutral';
  subscores?: Record<string, number>;
  positive?: string[]; // положительные подшкалы PHQ-4
  item9?: number;
}

export class ScaleInputError extends Error {}

export function bandFor(scale: ScaleId, total: number): { label: string; tone: ScaleScore['tone'] } {
  const def = SCALES[scale];
  const b = def.bands.find((x) => total >= x.min && total <= x.max);
  return b ? { label: b.label, tone: b.tone } : { label: 'без градации', tone: 'neutral' };
}

/** Подсчёт самоотчётной шкалы по ответам. Бросает ошибку на неполный или некорректный ввод. */
export function scoreScale(scale: ScaleId, answers: number[]): ScaleScore {
  const def = SCALES[scale];
  if (!def || !def.items || !def.options) throw new ScaleInputError(`Шкала ${scale} не заполняется по пунктам`);
  if (!Array.isArray(answers) || answers.length !== def.items.length) {
    throw new ScaleInputError(`${def.name}: ожидается ${def.items.length} ответов, получено ${answers?.length ?? 0}`);
  }
  const allowed = new Set(def.options.map((o) => o.value));
  answers.forEach((a, i) => {
    if (!Number.isInteger(a) || !allowed.has(a)) throw new ScaleInputError(`${def.name}: недопустимый ответ в пункте ${i + 1}`);
  });
  const total = answers.reduce((s, a) => s + a, 0);
  const { label, tone } = bandFor(scale, total);
  const res: ScaleScore = { scale, total, band: label, tone };
  if (def.subscales) {
    res.subscores = {};
    res.positive = [];
    for (const [key, sub] of Object.entries(def.subscales)) {
      const v = sub.items.reduce((s, i) => s + answers[i], 0);
      res.subscores[key] = v;
      if (v >= sub.positiveFrom) res.positive.push(key);
    }
  }
  if (scale === 'PHQ9') res.item9 = answers[8];
  return res;
}

/** Ввод итогового балла клинической шкалы врачом (HAM-D, HAM-A, MADRS). */
export function scoreClinicianTotal(scale: ScaleId, total: number): ScaleScore {
  const def = SCALES[scale];
  if (!Number.isInteger(total) || total < 0 || total > def.max) {
    throw new ScaleInputError(`${def.name}: балл должен быть целым числом от 0 до ${def.max}`);
  }
  const { label, tone } = bandFor(scale, total);
  return { scale, total, band: label, tone };
}

export const TONE_BADGE: Record<ScaleScore['tone'], string> = {
  mint: 'badge-mint',
  green: 'badge-green',
  yellow: 'badge-yellow',
  orange: 'badge-orange',
  red: 'badge-red',
  neutral: '',
};
