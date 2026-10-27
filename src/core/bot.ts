// Компас-бот: напоминания о приёме по расписанию и поддерживающие сообщения из утверждённых шаблонов.
// Чистые функции: что и когда отправить. Отправку (лента бота + уведомление в выбранный канал) делает store/api.ts.
// Правила безопасности: в напоминаниях нет названия препарата; пока у пациента открыт красный сигнал, бот молчит —
// с пациентом связывается врач.
import templates from '../data/botTemplates.json';
import type { BotMessage, MedEvent } from './types';
import { SLOT_HOURS, slotKey } from './adherence';
import { at, DAY, HOUR, MIN } from './time';

export const BOT_STATUS = templates.status;
export const BOT_NOTIFY = templates.notify;
export type SupportId = 'streak_7' | 'after_miss' | 'hard_day' | 'early_weeks' | 'good_day';
export const SUPPORT = Object.fromEntries(templates.support.map((s) => [s.id, s])) as Record<SupportId, { id: string; text: string; link?: { to: string; label: string } }>;

/** Напоминание ждёт отметки 3 часа после времени приёма; «Позже» — повтор через 30 минут */
export const REMIND_WINDOW_MS = 3 * HOUR;
export const LATER_MS = 30 * MIN;

export interface DueReminder {
  slot: 'morning' | 'evening';
  key: string;
  scheduledAt: Date;
  again: boolean;
}

/** Какие напоминания пора отправить сейчас */
export function dueReminders(therapyStart: Date | null, events: MedEvent[], feed: BotMessage[], now: Date): DueReminder[] {
  if (!therapyStart) return [];
  const out: DueReminder[] = [];
  for (const slot of ['morning', 'evening'] as const) {
    const when = at(now, SLOT_HOURS[slot]);
    if (when < therapyStart || now < when || now.getTime() - when.getTime() > REMIND_WINDOW_MS) continue;
    const key = slotKey(when, slot);
    const ev = events.find((e) => slotKey(new Date(e.scheduledAt), e.slot) === key);
    const sent = feed.filter((m) => m.kind === 'reminder' && m.slotKey === key);
    if (!ev && !sent.length) out.push({ slot, key, scheduledAt: when, again: false });
    // «Позже»: одно повторное напоминание через 30 минут, если приём так и не отмечен «Принял(а)» / «Пропустил(а)»
    const later = sent.find((m) => m.remindAgainAt && Date.parse(m.remindAgainAt) <= now.getTime());
    if (later && (!ev || ev.status === 'later') && sent.length < 2) out.push({ slot, key, scheduledAt: when, again: true });
  }
  return out;
}

/** Серия подряд принятых доз (от последней отмеченной назад) */
export function takenStreak(events: MedEvent[]): number {
  const sorted = [...events].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  let n = 0;
  for (const e of sorted) {
    if (e.status !== 'taken') break;
    n++;
  }
  return n;
}

function sentRecently(feed: BotMessage[], template: string, now: Date, ms: number) {
  return feed.some((m) => m.template === template && now.getTime() - Date.parse(m.at) < ms);
}

/** Поддержка после отметки приёма */
export function supportAfterDose(status: 'taken' | 'missed' | 'later', events: MedEvent[], feed: BotMessage[], now: Date): SupportId | null {
  if (status === 'taken' && takenStreak(events) === 14 && !sentRecently(feed, 'streak_7', now, 7 * DAY)) return 'streak_7';
  if (status === 'missed' && !sentRecently(feed, 'after_miss', now, 2 * DAY)) return 'after_miss';
  return null;
}

/** Поддержка после ежедневной записи */
export function supportAfterCheckin(c: { mood: number; anxiety: number }, therapyDay: number | null, feed: BotMessage[], now: Date): SupportId | null {
  if ((c.mood <= 3 || c.anxiety >= 8) && !sentRecently(feed, 'hard_day', now, 20 * HOUR)) return 'hard_day';
  if (therapyDay !== null && therapyDay >= 1 && therapyDay <= 14 && !feed.some((m) => m.template === 'early_weeks')) return 'early_weeks';
  if (c.mood >= 7 && c.anxiety <= 3 && !sentRecently(feed, 'good_day', now, 3 * DAY)) return 'good_day';
  return null;
}

/** Канал уведомления по выбору пациента (мессенджеры — общий тип «messenger») */
export function notifyChannel(c: string): 'push' | 'sms' | 'email' | 'messenger' {
  return c === 'sms' || c === 'email' || c === 'push' ? c : 'messenger';
}

export function reminderText(r: DueReminder): string {
  return r.again ? templates.reminder.again : templates.reminder[r.slot];
}
