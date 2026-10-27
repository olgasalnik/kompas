// Статус документов специалиста: запись в реестре (ФРМР) и срок аккредитации.
// За 90 дней до окончания аккредитации — предупреждение заведующей.
import type { Credentials } from './types';
import { DAY } from './time';

export type CredStatus = 'verified' | 'expiring' | 'expired' | 'not_found' | 'pending';
export const EXPIRY_WARN_DAYS = 90;

export interface CredInfo {
  status: CredStatus;
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'info';
  daysLeft: number;
}

export function credentialStatus(c: Credentials, now: Date): CredInfo {
  const until = Date.parse(`${c.accreditationUntil}T23:59:59`);
  const daysLeft = Math.ceil((until - now.getTime()) / DAY);
  if (c.registryStatus === 'not_found') return { status: 'not_found', label: 'Не найден в реестре', tone: 'bad', daysLeft };
  if (c.registryStatus === 'pending') return { status: 'pending', label: 'На проверке: запрос в реестр отправлен', tone: 'info', daysLeft };
  if (daysLeft < 0) return { status: 'expired', label: 'Аккредитация истекла', tone: 'bad', daysLeft };
  if (daysLeft <= EXPIRY_WARN_DAYS) return { status: 'expiring', label: `Аккредитация истекает через ${daysLeft} дн.`, tone: 'warn', daysLeft };
  return { status: 'verified', label: 'Документы проверены', tone: 'ok', daysLeft };
}

/** Нужна ли реакция заведующей */
export const needsAttention = (s: CredStatus) => s !== 'verified';

export const fmtUntil = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};
