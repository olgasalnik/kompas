import { Link } from 'react-router-dom';
import { ClipboardList, Moon, Pill } from 'lucide-react';
import { useDB, standNow } from '../store/db';
import { usePatientView } from '../ui/hooks';
import { TimeChart, DoseStrip } from '../ui/Charts';
import { DAY, fmtDate } from '../core/time';
import { pct } from '../core/adherence';
import { SCALES } from '../core/scales';

const SLEEP_LABEL = { good: 'хорошо', ok: 'нормально', bad: 'плохо', none: 'почти не спал(а)' } as const;

export function DiaryPage({ patientId }: { patientId: string }) {
  const db = useDB();
  const now = standNow(db);
  const v = usePatientView(patientId);
  if (!v) return null;
  const from = now.getTime() - 27 * DAY;
  const cis = db.checkins.filter((c) => c.patientId === patientId && Date.parse(c.at) >= from).sort((a, b) => a.at.localeCompare(b.at));
  const scales = db.assessments.filter((a) => a.patientId === patientId && a.enteredBy !== 'doctor').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  const sleepCounts = cis.reduce<Record<string, number>>((acc, c) => ((acc[c.sleep] = (acc[c.sleep] ?? 0) + 1), acc), {});
  const active = Boolean(v.facts['therapy.active']);

  return (
    <>
      <div className="p-header">
        <div className="stack" style={{ gap: 2 }}>
          <span className="p-title">Мой дневник</span>
          <span className="small muted">Последние 4 недели — простым языком</span>
        </div>
      </div>
      <div className="p-scroll stack" style={{ gap: 14 }}>
        <div className="card card-pad">
          <TimeChart
            title="Настроение и тревога"
            caption="0 — минимум, 10 — максимум. Тревога ниже — значит легче."
            from={from}
            to={now.getTime()}
            yMax={10}
            yTicks={[0, 5, 10]}
            height={190}
            series={[
              { id: 'mood', label: 'Настроение', color: 'var(--series-2)', points: cis.map((c) => ({ t: Date.parse(c.at), v: c.mood })) },
              { id: 'anx', label: 'Тревога', color: 'var(--series-1)', points: cis.map((c) => ({ t: Date.parse(c.at), v: c.anxiety })) },
            ]}
          />
        </div>

        {active && (
          <div className="card card-pad stack" style={{ gap: 12 }}>
            <div className="row spread">
              <div className="row strong" style={{ gap: 8 }}>
                <Pill size={18} color="var(--brand)" /> Приём препарата
              </div>
              <span className="badge badge-mint badge-lg">
                {v.adherence.taken7} из {v.adherence.due7} · {pct(v.adherence.rate7)}
              </span>
            </div>
            <DoseStrip doses={v.adherence.doses} days={14} now={now} />
            <div className="xs muted">Если пропустили приём — не принимайте двойную дозу; следующую примите в обычное время.</div>
          </div>
        )}

        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row strong" style={{ gap: 8 }}>
            <Moon size={18} color="var(--brand)" /> Сон за 4 недели
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {(['good', 'ok', 'bad', 'none'] as const).map((k) => (
              <span key={k} className="badge badge-lg badge-outline">
                {SLEEP_LABEL[k]}: {sleepCounts[k] ?? 0}
              </span>
            ))}
          </div>
        </div>

        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row spread">
            <div className="row strong" style={{ gap: 8 }}>
              <ClipboardList size={18} color="var(--brand)" /> Опросники
            </div>
            <Link to="/patient" className="link-btn small">
              Что заполнить
            </Link>
          </div>
          {scales.length ? (
            <ul className="list-plain stack" style={{ gap: 0 }}>
              {scales.map((a) => (
                <li key={a.id} className="row spread" style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="small">
                    {SCALES[a.scale].name} · {fmtDate(a.at)}
                  </span>
                  <span className="strong small">
                    {a.total} <span className="muted">из {SCALES[a.scale].max}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="small muted">Пока нет заполненных опросников</div>
          )}
          <div className="xs muted">Баллы — не диагноз. Их значение объяснит врач на приёме.</div>
        </div>
      </div>
    </>
  );
}
