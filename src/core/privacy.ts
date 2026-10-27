// Врачебная тайна в уведомлениях: SMS, push, письма и мессенджеры не должны раскрывать диагноз, препарат или шкалы.
import type { NotificationLog } from './types';

export const LEAK_WORDS = ['авиандр', 'маритупирдин', 'тревож', 'депресс', 'гтр', 'phq', 'gad', 'суицид', 'психиатр', 'f41', 'f32', 'f43', 'диагноз', 'сертралин'];

export function findLeaks(ns: NotificationLog[]): NotificationLog[] {
  return ns.filter((n) => LEAK_WORDS.some((w) => n.text.toLowerCase().includes(w)));
}
