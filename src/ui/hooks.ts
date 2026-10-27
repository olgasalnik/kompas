import { useEffect, useMemo, useState } from 'react';
import { standNow, useDB } from '../store/db';
import type { DB, Patient } from '../core/types';
import { buildFacts } from '../core/facts';
import { computeAdherence } from '../core/adherence';

/** Перерисовка раз в interval мс — для часов стенда и обратных отсчётов эскалации */
export function useTicker(interval = 1000): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return t;
}

export function useStandNow(interval = 1000): Date {
  const db = useDB();
  useTicker(interval);
  return standNow(db);
}

export interface PatientView {
  p: Patient;
  facts: ReturnType<typeof buildFacts>;
  adherence: ReturnType<typeof computeAdherence>;
}

export function patientView(db: DB, p: Patient, now: Date): PatientView {
  const facts = buildFacts(db, p, now);
  const active = Boolean(facts['therapy.active']);
  const adherence = computeAdherence(
    db.medEvents.filter((e) => e.patientId === p.id),
    active && p.therapyStart ? new Date(p.therapyStart) : null,
    now,
  );
  return { p, facts, adherence };
}

export function usePatientView(patientId: string | undefined): PatientView | null {
  const db = useDB();
  const now = standNow(db);
  const minute = Math.floor(now.getTime() / 60000);
  return useMemo(() => {
    const p = db.patients.find((x) => x.id === patientId);
    return p ? patientView(db, p, standNow(db)) : null;
  }, [db, patientId, minute]);
}

export function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
