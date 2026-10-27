// Приверженность: индекс за 7 и 28 дней = подтверждённые пациентом приёмы / назначенные (самоотчёт).
import type { DoseStatus, MedEvent, MissReason } from './types';
import { DAY, HOUR, at, startOfDay } from './time';

export const SLOT_HOURS: Record<'morning' | 'evening', number> = { morning: 8, evening: 20 };
export const SLOT_LABEL: Record<'morning' | 'evening', string> = { morning: 'Утро', evening: 'Вечер' };

export const MISS_REASONS: Record<MissReason, string> = {
  forgot: 'Забыл(а)',
  side_effects: 'Нежелательные ощущения',
  no_drug: 'Не было препарата',
  doubts: 'Сомнения',
  routine: 'Изменился распорядок',
  other: 'Другая причина',
};

export interface DoseSlot {
  key: string;
  at: Date;
  slot: 'morning' | 'evening';
  status: DoseStatus | 'unmarked';
  reason?: MissReason;
  /** «Позже» без подтверждения дольше 12 часов считается пропуском */
  effective: 'taken' | 'missed' | 'pending' | 'unmarked';
}

export interface AdherenceSummary {
  due7: number;
  taken7: number;
  rate7: number | null;
  due28: number;
  taken28: number;
  rate28: number | null;
  missedConsecutive: number;
  missedLast7: number;
  firstMissAt: Date | null; // первый пропуск в текущей серии (для T-detect)
  reasons: Partial<Record<MissReason, number>>;
  doses: DoseSlot[]; // все наступившие дозы за 28 дней, по времени
}

export function slotKey(d: Date, slot: 'morning' | 'evening'): string {
  const s = startOfDay(d);
  return `${s.getFullYear()}-${s.getMonth() + 1}-${s.getDate()}-${slot}`;
}

/** Все дозы, время которых уже наступило, начиная с начала терапии */
export function dueDoses(therapyStart: Date, now: Date, fromDays = 28): { at: Date; slot: 'morning' | 'evening' }[] {
  const res: { at: Date; slot: 'morning' | 'evening' }[] = [];
  const from = Math.max(startOfDay(therapyStart).getTime(), startOfDay(now).getTime() - (fromDays - 1) * DAY);
  for (let t = from; t <= now.getTime(); t += DAY) {
    const day = new Date(t);
    for (const slot of ['morning', 'evening'] as const) {
      const when = at(day, SLOT_HOURS[slot]);
      if (when.getTime() < therapyStart.getTime()) continue;
      if (when.getTime() > now.getTime()) continue;
      res.push({ at: when, slot });
    }
  }
  return res;
}

export function computeAdherence(events: MedEvent[], therapyStart: Date | null, now: Date): AdherenceSummary {
  const empty: AdherenceSummary = {
    due7: 0,
    taken7: 0,
    rate7: null,
    due28: 0,
    taken28: 0,
    rate28: null,
    missedConsecutive: 0,
    missedLast7: 0,
    firstMissAt: null,
    reasons: {},
    doses: [],
  };
  if (!therapyStart) return empty;

  const byKey = new Map<string, MedEvent>();
  for (const e of events) {
    const k = slotKey(new Date(e.scheduledAt), e.slot);
    const prev = byKey.get(k);
    if (!prev || prev.recordedAt < e.recordedAt) byKey.set(k, e);
  }

  const doses: DoseSlot[] = dueDoses(therapyStart, now, 28).map(({ at: when, slot }) => {
    const k = slotKey(when, slot);
    const ev = byKey.get(k);
    const status: DoseSlot['status'] = ev ? ev.status : 'unmarked';
    let effective: DoseSlot['effective'] = 'unmarked';
    if (status === 'taken') effective = 'taken';
    else if (status === 'missed') effective = 'missed';
    else if (status === 'later') effective = now.getTime() - when.getTime() > 12 * HOUR ? 'missed' : 'pending';
    return { key: k, at: when, slot, status, reason: ev?.reason, effective };
  });

  const since7 = startOfDay(now).getTime() - 6 * DAY;
  const last7days = doses.filter((d) => d.at.getTime() >= since7);
  const taken7 = last7days.filter((d) => d.effective === 'taken').length;
  const taken28 = doses.filter((d) => d.effective === 'taken').length;

  // Серия пропусков с конца (неотмеченные и «позже» в ожидании не прерывают и не продлевают серию)
  let missedConsecutive = 0;
  let firstMissAt: Date | null = null;
  for (let i = doses.length - 1; i >= 0; i--) {
    const d = doses[i];
    if (d.effective === 'missed') {
      missedConsecutive++;
      firstMissAt = d.at;
    } else if (d.effective === 'taken') break;
  }

  const lastSeven = doses.slice(-7);
  const missedLast7 = lastSeven.filter((d) => d.effective === 'missed').length;
  if (!firstMissAt) {
    const firstInWindow = lastSeven.find((d) => d.effective === 'missed');
    firstMissAt = firstInWindow ? firstInWindow.at : null;
  }

  const reasons: AdherenceSummary['reasons'] = {};
  for (const d of doses) if (d.effective === 'missed' && d.reason) reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;

  return {
    due7: last7days.length,
    taken7,
    rate7: last7days.length ? taken7 / last7days.length : null,
    due28: doses.length,
    taken28,
    rate28: doses.length ? taken28 / doses.length : null,
    missedConsecutive,
    missedLast7,
    firstMissAt,
    reasons,
    doses,
  };
}

export function pct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}
