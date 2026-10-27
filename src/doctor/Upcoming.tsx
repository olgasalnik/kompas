// «Ближайшие приёмы»: превью по каждому пациенту собирается заранее — врач читает его перед приёмом.
import { useNavigate } from 'react-router-dom';
import { CalendarClock, ClipboardCopy, MessageSquareQuote } from 'lucide-react';
import type { Patient } from '../core/types';
import { getDB, useDB, standNow } from '../store/db';
import { DAY, fmtDate, fmtTime } from '../core/time';
import { pct } from '../core/adherence';
import { patientView, copyText } from '../ui/hooks';
import { toast } from '../ui/Toasts';
import { openAlerts, scalePoints } from './select';
import type { DB } from '../core/types';

export function previewLines(db: DB, p: Patient, now: Date): string[] {
  const v = patientView(db, p, now);
  const gad = scalePoints(db, p.id, 'GAD7');
  const phq = scalePoints(db, p.id, 'PHQ9');
  const alerts = openAlerts(db, p.id);
  const aes = db.adverseEvents.filter((a) => a.patientId === p.id && a.status === 'active');
  const lines: string[] = [];
  lines.push(
    v.facts['therapy.active']
      ? `Приём за 7 дней: ${v.adherence.taken7}/${v.adherence.due7} (${pct(v.adherence.rate7)})`
      : 'Терапия не назначена — первичное наблюдение',
  );
  if (gad.length) lines.push(`GAD-7: ${gad.length > 1 ? `${gad[0].v} → ${gad[gad.length - 1].v}` : gad[0].v}${phq.length ? ` · PHQ-9: ${phq[phq.length - 1].v}` : ''}`);
  if (aes.length) lines.push(`НЯ: ${aes.map((a) => a.term).join(', ')}`);
  lines.push(alerts.length ? `Открытые сигналы: ${alerts.map((a) => a.title).join('; ')}` : 'Открытых сигналов нет');
  return lines;
}

export function UpcomingVisits({ patients }: { patients: Patient[] }) {
  const db = useDB();
  const nav = useNavigate();
  const now = standNow(db);
  const soon = patients
    .filter((p) => p.nextVisitAt && Date.parse(p.nextVisitAt) >= now.getTime() - DAY && Date.parse(p.nextVisitAt) <= now.getTime() + 14 * DAY)
    .sort((a, b) => a.nextVisitAt!.localeCompare(b.nextVisitAt!))
    .slice(0, 6);
  if (!soon.length) return null;
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <CalendarClock /> Ближайшие приёмы
        </div>
        <span className="xs muted">превью собрано заранее из дневника, шкал и сообщений</span>
      </div>
      <div className="card-body grid-3" style={{ gap: 12 }}>
        {soon.map((p) => {
          const lines = previewLines(db, p, now);
          return (
            <div key={p.id} className="card card-flat card-pad stack" style={{ gap: 8 }}>
              <div className="row spread" style={{ gap: 8 }}>
                <div className="stack" style={{ gap: 1 }}>
                  <span className="strong">{p.name}</span>
                  <span className="xs muted">
                    {p.code} · последний приём {p.lastVisitAt ? fmtDate(p.lastVisitAt) : '—'}
                  </span>
                </div>
                <span className="badge badge-brand">
                  {fmtDate(p.nextVisitAt!)}, {fmtTime(p.nextVisitAt!)}
                </span>
              </div>
              <ul className="bullets xs" style={{ color: 'var(--ink-2)' }}>
                {lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {p.previsit && (
                <div className="quote xs" style={{ fontStyle: 'normal' }}>
                  <MessageSquareQuote size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
                  Со слов пациента: {p.previsit.concerns || p.previsit.questions}
                </div>
              )}
              <div className="row" style={{ gap: 6, marginTop: 'auto' }}>
                <button className="btn btn-sm btn-soft" onClick={() => nav(`/doctor/patient/${p.id}`)}>
                  Досье
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={async () => {
                    const d = getDB();
                    const text = [`Превью к приёму ${fmtDate(p.nextVisitAt!)} — ${p.code} (карта ${p.cardNo})`, ...previewLines(d, p, standNow(d)), p.previsit ? `Со слов пациента: ${p.previsit.concerns} ${p.previsit.questions}`.trim() : ''].filter(Boolean).join('\n');
                    const ok = await copyText(text);
                    toast(ok ? 'Превью скопировано' : 'Не удалось скопировать', { tone: ok ? 'ok' : 'default' });
                  }}
                >
                  <ClipboardCopy /> Копировать
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
