// Сессия вкладки: кто сейчас работает в этом окне (врач в одном окне, пациент в другом).
import { useSyncExternalStore } from 'react';

export interface Session {
  role: 'doctor' | 'patient' | 'therapist' | null;
  userId?: string; // врач: d1 / d2 / h1; терапевт: t1
  patientId?: string;
}

const KEY = 'kompas.session';
const listeners = new Set<() => void>();
let current: Session = read();

function read(): Session {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Session;
  } catch {
    /* нет доступа к sessionStorage */
  }
  return { role: null };
}

export function getSession(): Session {
  return current;
}

export function setSession(s: Session) {
  current = s;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function useSession(): Session {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => current,
  );
}

export const isClinicianTab = () => current.role === 'doctor';
