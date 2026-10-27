import { useState } from 'react';
import { Pill } from 'lucide-react';
import { useDB, standNow } from '../../store/db';
import { DAY, fmtDate } from '../../core/time';
import { MISS_REASONS, pct } from '../../core/adherence';
import { SCALES } from '../../core/scales';
import type { PatientView } from '../../ui/hooks';
import { DoseStrip, TimeChart, type ChartEvent } from '../../ui/Charts';
import { scalePoints } from '../select';

const RANGES = [
  { id: 28, label: '4 недели' },
  { id: 56, label: '8 недель' },
  { id: 0, label: 'Всё время' },
];

export function DynamicsTab({ v }: { v: PatientView }) {
  const db = useDB();
  const now = standNow(db);
  const { p, adherence, facts } = v;
  const [range, setRange] = useState(56);
  const all = [...db.checkins.filter((c) => c.patientId === p.id).map((c) => Date.parse(c.at)), ...db.assessments.filter((a) => a.patientId === p.id).map((a) => Date.parse(a.at))];
  const earliest = all.length ? Math.min(...all) : now.getTime() - 28 * DAY;
  const from = range ? Math.max(earliest - DAY, now.getTime() - range * DAY) : earliest - DAY;
  const to = now.getTime();
  const inRange = (t: number) => t >= from && t <= to;
  const events: ChartEvent[] = [];
  if (p.therapyStart && facts['therapy.active']) events.push({ t: Date.parse(p.therapyStart), label: 'Начало «Авиандра»', kind: 'therapy' });
  for (const a of db.alerts.filter((x) => x.patientId === p.id && x.level !== 'yellow')) events.push({ t: Date.parse(a.createdAt), label: `Сигнал: ${a.title}`, kind: 'alert' });
  if (p.lastVisitAt && (!p.therapyStart || Math.abs(Date.parse(p.lastVisitAt) - Date.parse(p.therapyStart)) > DAY)) events.push({ t: Date.parse(p.lastVisitAt), label: 'Визит', kind: 'visit' });
  const ev = events.filter((e) => inRange(e.t));
  const gad = scalePoints(db, p.id, 'GAD7').filter((x) => inRange(x.t));
  const phq = scalePoints(db, p.id, 'PHQ9').filter((x) => inRange(x.t));
  const cis = db.checkins.filter((c) => c.patientId === p.id && inRange(Date.parse(c.at))).sort((a, b) => a.at.localeCompare(b.at));
  const sleepScore = { good: 3, ok: 2, bad: 1, none: 0 } as const;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="segmented" role="group" aria-label="Период">
          {RANGES.map((r) => (
            <button key={r.id} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="small muted">Период применяется ко всем графикам · отметки: ● начало терапии, ○ визит, ● сигнал</span>
      </div>

      <div className="grid-2">
        <section className="card card-pad">
          <TimeChart
            title="GAD-7 — выраженность тревоги"
            caption={`Исходно ${facts['gad7.baseline'] ?? '—'} · сейчас ${facts['gad7.total'] ?? '—'}${facts['gad7.reductionPct'] !== null ? ` · снижение ${facts['gad7.reductionPct']}%` : ''}`}
            from={from}
            to={to}
            yMax={21}
            yTicks={[0, 5, 10, 15, 21]}
            bands={SCALES.GAD7.bands}
            series={[{ id: 'gad', label: 'GAD-7', color: 'var(--series-1)', points: gad }]}
            events={ev}
          />
        </section>
        <section className="card card-pad">
          <TimeChart
            title="PHQ-9 — выраженность депрессивных симптомов"
            caption={`Сейчас ${facts['phq9.total'] ?? '—'} · пункт 9: ${facts['phq9.item9'] ?? '—'}`}
            from={from}
            to={to}
            yMax={27}
            yTicks={[0, 5, 10, 15, 20, 27]}
            bands={SCALES.PHQ9.bands}
            series={[{ id: 'phq', label: 'PHQ-9', color: 'var(--series-2)', points: phq }]}
            events={ev}
          />
        </section>
      </div>

      <section className="card card-pad">
        <TimeChart
          title="Ежедневный чек-ин: настроение и тревога"
          caption="Самоотчёт пациента, 0–10"
          from={from}
          to={to}
          yMax={10}
          yTicks={[0, 5, 10]}
          height={200}
          series={[
            { id: 'mood', label: 'Настроение', color: 'var(--series-2)', points: cis.map((c) => ({ t: Date.parse(c.at), v: c.mood })) },
            { id: 'anx', label: 'Тревога', color: 'var(--series-1)', points: cis.map((c) => ({ t: Date.parse(c.at), v: c.anxiety })) },
          ]}
          events={ev}
        />
      </section>

      <div className="grid-2">
        <section className="card card-pad stack" style={{ gap: 12 }}>
          <div className="row spread wrap" style={{ gap: 8 }}>
            <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
              <Pill /> Приверженность (самоотчёт)
            </div>
            <div className="row" style={{ gap: 6 }}>
              <span className="badge badge-lg badge-outline">
                7 дн: {adherence.taken7}/{adherence.due7} · {pct(adherence.rate7)}
              </span>
              <span className="badge badge-lg badge-outline">
                28 дн: {adherence.taken28}/{adherence.due28} · {pct(adherence.rate28)}
              </span>
            </div>
          </div>
          {facts['therapy.active'] ? (
            <>
              <DoseStrip doses={adherence.doses} days={14} now={now} />
              {Object.keys(adherence.reasons).length > 0 && (
                <div className="small ink-2">
                  Причины пропусков:{' '}
                  {Object.entries(adherence.reasons)
                    .map(([k, n]) => `${MISS_REASONS[k as keyof typeof MISS_REASONS]} — ${n}`)
                    .join('; ')}
                </div>
              )}
            </>
          ) : (
            <div className="small muted">Терапия не назначена</div>
          )}
        </section>
        <section className="card card-pad">
          <TimeChart
            title="Сон"
            caption="3 — хорошо, 2 — нормально, 1 — плохо, 0 — почти не спал(а)"
            from={from}
            to={to}
            yMax={3}
            yTicks={[0, 1, 2, 3]}
            height={170}
            series={[{ id: 'sleep', label: 'Сон', color: 'var(--series-3)', points: cis.map((c) => ({ t: Date.parse(c.at), v: sleepScore[c.sleep] })) }]}
          />
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            Все измерения
          </div>
          <span className="xs muted">самоотчёт и оценка врача — раздельно</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Шкала</th>
                <th className="num">Балл</th>
                <th>Градация</th>
                <th>Кто ввёл</th>
              </tr>
            </thead>
            <tbody>
              {[...db.assessments.filter((a) => a.patientId === p.id)]
                .sort((a, b) => b.at.localeCompare(a.at))
                .map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap">{fmtDate(a.at)}</td>
                    <td>{SCALES[a.scale].name}</td>
                    <td className="num strong">
                      {a.total}
                      <span className="muted"> / {SCALES[a.scale].max}</span>
                    </td>
                    <td className="small">{a.band}{a.scale === 'PHQ9' && a.answers ? ` · пункт 9: ${a.answers[8]}` : ''}{a.scale === 'PHQ4' && a.subscores ? ` · GAD-2 ${a.subscores.anxiety}, PHQ-2 ${a.subscores.depression}` : ''}</td>
                    <td className="small">{a.enteredBy === 'doctor' ? 'врач' : a.enteredBy === 'curator' ? 'куратор' : 'пациент'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
