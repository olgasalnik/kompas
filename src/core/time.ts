// Дата и время: всё считается от «текущего времени стенда» (с учётом перемотки симулятора).
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);
}

export function at(d: Date, h: number, m = 0): Date {
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}

const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const monthsFull = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const weekdays = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

export const pad = (n: number) => String(n).padStart(2, '0');

export function fmtTime(iso: string | Date): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtTimeSec(iso: string | Date): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fmtDate(iso: string | Date): string {
  const d = new Date(iso);
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export function fmtDateLong(iso: string | Date): string {
  const d = new Date(iso);
  return `${d.getDate()} ${monthsFull[d.getMonth()]}, ${weekdays[d.getDay()]}`;
}

export function fmtDateTime(iso: string | Date): string {
  return `${fmtDate(iso)}, ${fmtTime(iso)}`;
}

/** «5 мин назад», «вчера в 21:40», «3 дня назад» */
export function fmtAgo(iso: string | Date, now: Date): string {
  const d = new Date(iso);
  const diff = now.getTime() - d.getTime();
  if (diff < 45_000) return 'только что';
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MIN))} мин назад`;
  const days = daysBetween(d, now);
  if (days === 0) return `сегодня в ${fmtTime(d)}`;
  if (days === 1) return `вчера в ${fmtTime(d)}`;
  if (days < 7) return `${days} ${plural(days, 'день', 'дня', 'дней')} назад`;
  return fmtDate(d);
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} мс`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0).replace('.', ',')} с`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m} мин ${pad(r)} с`;
}

export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
