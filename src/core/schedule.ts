// График работы врача: когда врач отвечает и какой срок ответа честно показывать пациенту.
import type { WorkSchedule } from './types';
import { DAY, at, startOfDay } from './time';

const dow = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());
const DAY_NAMES = ['', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье'];

export function isWorking(s: WorkSchedule, d: Date): boolean {
  if (s.roundTheClock) return true;
  const h = d.getHours() + d.getMinutes() / 60;
  return s.days.includes(dow(d)) && h >= s.start && h < s.end;
}

/** Ближайшее начало рабочего времени (если сейчас рабочее время — сейчас) */
export function nextWorkStart(s: WorkSchedule, d: Date): Date {
  if (isWorking(s, d)) return d;
  for (let i = 0; i < 8; i++) {
    const day = startOfDay(new Date(d.getTime() + i * DAY));
    const start = at(day, s.start);
    if (s.days.includes(dow(day)) && start.getTime() > d.getTime()) return start;
  }
  return d;
}

/** «Ответит сегодня до 19:00» / «Ответит завтра в 10:00» / «Ответит в понедельник в 10:00» */
export function replyText(s: WorkSchedule, d: Date): string {
  if (s.roundTheClock) return 'Дежурная служба — на связи круглосуточно';
  if (isWorking(s, d)) return `Рабочее время — ответит сегодня до ${s.end}:00`;
  const n = nextWorkStart(s, d);
  const days = Math.round((startOfDay(n).getTime() - startOfDay(d).getTime()) / DAY);
  const when = days === 0 ? 'сегодня' : days === 1 ? 'завтра' : DAY_NAMES[dow(n)];
  return `Нерабочее время — ответит ${when} в ${s.start}:00`;
}
