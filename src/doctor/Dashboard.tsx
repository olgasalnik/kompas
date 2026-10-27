import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, CheckCircle2, ChevronDown, Clock, Inbox, Pill, Search, Timer, Users } from 'lucide-react';
import { useDB, standNow } from '../store/db';
import { ackAlert } from '../store/api';
import { LEVEL_RANK } from '../core/clinical';
import { fmtAgo, fmtDate, fmtDuration } from '../core/time';
import { pct } from '../core/adherence';
import { patientView, useTicker } from '../ui/hooks';
import { AlertSignal } from '../ui/Signals';
import { Spark } from '../ui/Charts';
import { useOpenAlert } from './DoctorApp';
import { bandTone, lastCheckin, openAlerts, scalePoints, searchRecords, therapyWeek, visiblePatients } from './select';
import { UpcomingVisits } from './Upcoming';

type Filter = 'all' | 'signals' | 'therapy' | 'new' | 'archive';

export function Dashboard({ me }: { me: string }) {
  const db = useDB();
  useTicker(15000);
  const now = standNow(db);
  const nav = useNavigate();
  const openAlert = useOpenAlert();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [digestOpen, setDigestOpen] = useState(false);
  const active = visiblePatients(db, me);
  const archived = visiblePatients(db, me, 'archived');
  const patients = filter === 'archive' ? archived : active;
  const ids = new Set(active.map((p) => p.id));
  const recordHits = q.trim().length >= 3 ? searchRecords(db, [...active, ...archived].map((p) => p.id), q) : [];
  const alerts = openAlerts(db).filter((a) => ids.has(a.patientId));
  const urgent = alerts.filter((a) => a.level !== 'yellow');
  const digest = alerts.filter((a) => a.level === 'yellow');
  const deliveries = db.metrics.filter((m) => m.kind === 'alert_delivery').map((m) => m.ms).sort((a, b) => a - b);
  const median = deliveries.length ? deliveries[Math.floor(deliveries.length / 2)] : null;

  const rows = useMemo(
    () =>
      patients
        .map((p) => {
          const v = patientView(db, p, now);
          const top = alerts.find((a) => a.patientId === p.id);
          return { p, v, top, n: alerts.filter((a) => a.patientId === p.id).length };
        })
        .filter(({ p, v, top }) => {
          if (q && !`${p.name} ${p.code} ${p.cardNo} ${p.diagnosis.code} ${p.diagnosis.label}`.toLowerCase().includes(q.toLowerCase())) return false;
          if (filter === 'signals') return Boolean(top);
          if (filter === 'therapy') return Boolean(v.facts['therapy.active']);
          if (filter === 'new') return !v.facts['therapy.active'];
          return true;
        })
        .sort((a, b) => (a.top ? LEVEL_RANK[a.top.level] : 9) - (b.top ? LEVEL_RANK[b.top.level] : 9) || a.p.name.localeCompare(b.p.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, q, filter, me, Math.floor(now.getTime() / 60000)],
  );

  // Плитки сверху считаются по всем активным пациентам, а не по результату поиска
  const allViews = useMemo(
    () => active.map((p) => patientView(db, p, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, me, Math.floor(now.getTime() / 60000)],
  );
  const onTherapy = allViews.filter((v) => v.facts['therapy.active']);
  const rates = onTherapy.map((v) => v.adherence.rate7).filter((x): x is number => x !== null);
  const avgAdh = rates.length ? rates.reduce((s, x) => s + x, 0) / rates.length : null;
  const dayAgo = now.getTime() - 86400000;
  const entries24 = db.checkins.filter((c) => ids.has(c.patientId) && Date.parse(c.at) > dayAgo).length;

  return (
    <div className="stack fade-in" style={{ gap: 22 }}>
      <div className="page-head">
        <div>
          <h1>Сигналы и пациенты</h1>
          <p>Сначала — то, что требует реакции. Ниже — все пациенты по срочности.</p>
        </div>
      </div>

      <div className="kpi-row">
        <div className="stat">
          <span className="stat-label">
            <Users /> На наблюдении
          </span>
          <span className="stat-value">{active.length}</span>
          <span className="stat-delta delta-flat">{onTherapy.length} на «Авиандре»</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <BellRing /> Требуют реакции
          </span>
          <span className="stat-value">{urgent.length}</span>
          <span className="stat-delta delta-flat">+ {digest.length} в дайджесте</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <Timer /> Доставка сигнала
          </span>
          <span className="stat-value">{median !== null ? fmtDuration(median) : '—'}</span>
          <span className="stat-delta delta-flat">медиана, {deliveries.length} замеров</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <Pill /> Приверженность, 7 дн
          </span>
          <span className="stat-value">{pct(avgAdh)}</span>
          <span className="stat-delta delta-flat">среднее по самоотчёту</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <Inbox /> Записей за сутки
          </span>
          <span className="stat-value">{entries24}</span>
          <span className="stat-delta delta-flat">чек-ины пациентов</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <BellRing /> Панель сигналов
          </div>
          <span className="small muted">Красные и оранжевые не скрываются настройками режима</span>
        </div>
        <div className="card-body stack" style={{ gap: 10 }}>
          {urgent.length === 0 && (
            <div className="empty">
              <CheckCircle2 />
              Сигналов, требующих реакции, нет
            </div>
          )}
          {urgent.map((a) => {
            const p = db.patients.find((x) => x.id === a.patientId)!;
            return (
              <AlertSignal
                key={a.id}
                alert={a}
                title={
                  <span>
                    {p.name} <span className="muted" style={{ fontWeight: 500 }}>· {p.code}</span> — {a.title}
                  </span>
                }
                meta={`${fmtAgo(a.createdAt, now)}${a.ackAt ? ' · в работе' : ''}${a.escalationStep ? ` · эскалация ${a.escalationStep}` : ''}`}
                actions={
                  <>
                    <button className="btn btn-sm" onClick={() => openAlert(a.id)}>
                      Подробнее
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => nav(`/doctor/patient/${p.id}`)}>
                      Досье
                    </button>
                    {!a.ackAt && (
                      <button className={`btn btn-sm ${a.level === 'red' ? 'btn-danger' : 'btn-soft'}`} onClick={() => ackAlert(a.id, me)}>
                        Принять в работу
                      </button>
                    )}
                  </>
                }
              />
            );
          })}
          {digest.length > 0 && (
            <div className="card card-soft" style={{ marginTop: 4 }}>
              <button className="row spread" style={{ width: '100%', padding: '12px 14px', border: 0, background: 'none', fontWeight: 650 }} onClick={() => setDigestOpen(!digestOpen)}>
                <span className="row" style={{ gap: 8 }}>
                  <Clock size={17} color="var(--yellow-ink)" /> Ежедневный дайджест: жёлтые сигналы наблюдения ({digest.length})
                </span>
                <ChevronDown size={18} style={{ transform: digestOpen ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
              </button>
              {digestOpen && (
                <div className="stack" style={{ gap: 8, padding: '0 12px 12px' }}>
                  {digest.map((a) => {
                    const p = db.patients.find((x) => x.id === a.patientId)!;
                    return (
                      <AlertSignal
                        key={a.id}
                        alert={a}
                        compact
                        title={`${p.name} — ${a.title}`}
                        meta={fmtAgo(a.createdAt, now)}
                        actions={
                          <button className="btn btn-sm btn-ghost" onClick={() => openAlert(a.id)}>
                            Подробнее
                          </button>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <UpcomingVisits patients={active} />

      <section className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div className="card-title">
            <Users /> Пациенты
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--ink-3)' }} />
              <input
                id="patient-search"
                className="input"
                style={{ paddingLeft: 32, minHeight: 38, width: 280, maxWidth: '100%' }}
                placeholder="Имя, код, № карты, МКБ или текст записей"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="segmented">
              {(
                [
                  ['all', 'Все'],
                  ['signals', 'С сигналами'],
                  ['therapy', 'На терапии'],
                  ['new', 'Без терапии'],
                  ['archive', `Архив${archived.length ? ` (${archived.length})` : ''}`],
                ] as [Filter, string][]
              ).map(([k, l]) => (
                <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Пациент</th>
                <th>Диагноз (врач)</th>
                <th>Терапия</th>
                <th>GAD-7</th>
                <th>PHQ-9</th>
                <th>Приём, 7 дн</th>
                <th>Последний приём · запись</th>
                <th>Сигнал</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, v, top, n }) => {
                const gad = scalePoints(db, p.id, 'GAD7');
                const phq = scalePoints(db, p.id, 'PHQ9');
                const lc = lastCheckin(db, p.id);
                const wk = therapyWeek(p, db, now);
                const g = gad[gad.length - 1]?.v;
                const ph = phq[phq.length - 1]?.v;
                return (
                  <tr key={p.id} className="is-clickable" onClick={() => nav(`/doctor/patient/${p.id}`)}>
                    <td style={{ minWidth: 230 }}>
                      <div className="row" style={{ gap: 10 }}>
                        <div className="avatar avatar-sm">{p.name.slice(0, 1)}</div>
                        <div>
                          <div className="strong nowrap">{p.name}</div>
                          <div className="xs muted nowrap">
                            {p.code} · {p.age} {p.sex === 'f' ? 'ж' : 'м'}
                            {p.scenario ? ` · сценарий ${p.scenario}` : ''}
                          </div>
                          <div className="xs muted nowrap">карта {p.cardNo}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-outline">{p.diagnosis.code}</span>
                    </td>
                    <td className="small">{wk ? `«Авиандр», ${wk}-я нед.` : <span className="muted">не назначена</span>}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <span className={`badge ${bandTone('GAD7', g)}`}>{g ?? '—'}</span>
                        <Spark values={gad.map((x) => x.v)} width={52} />
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${bandTone('PHQ9', ph)}`}>{ph ?? '—'}</span>
                    </td>
                    <td style={{ minWidth: 120 }}>
                      {v.facts['therapy.active'] ? (
                        <div className="stack" style={{ gap: 4 }}>
                          <span className="small strong">
                            {v.adherence.taken7}/{v.adherence.due7} · {pct(v.adherence.rate7)}
                          </span>
                          <div className="meter">
                            <span style={{ width: `${(v.adherence.rate7 ?? 0) * 100}%`, background: (v.adherence.rate7 ?? 1) < 0.8 ? 'var(--orange)' : 'var(--mint)' }} />
                          </div>
                        </div>
                      ) : (
                        <span className="muted small">—</span>
                      )}
                    </td>
                    <td className="small nowrap">
                      <div>приём {p.lastVisitAt ? fmtDate(p.lastVisitAt) : '—'}</div>
                      <div className="xs muted">запись {lc ? fmtAgo(lc.at, now) : '—'}</div>
                    </td>
                    <td>
                      {top ? (
                        <span className={`badge badge-${top.level}`}>
                          <span className="dot" />
                          {{ red: 'Красный', orange: 'Оранж.', yellow: 'Жёлтый' }[top.level]}
                          {n > 1 ? ` +${n - 1}` : ''}
                        </span>
                      ) : (
                        <span className="badge badge-mint">нет</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted small">
                    {filter === 'archive' ? 'В архиве пока нет пациентов. Перевести пациента в архив можно из его карточки.' : 'Никого не найдено по этим условиям.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {recordHits.length > 0 && (
          <div className="card-body stack" style={{ gap: 8, borderTop: '1px solid var(--border)' }}>
            <div className="eyebrow">Найдено в истории записей, включая архив ({recordHits.length})</div>
            {recordHits.map((h, i) => {
              const p = db.patients.find((x) => x.id === h.patientId)!;
              return (
                <button key={i} className="card card-flat row row-top" style={{ padding: '10px 12px', gap: 12, textAlign: 'left', border: '1px solid var(--border)' }} onClick={() => nav(`/doctor/patient/${p.id}${h.where.startsWith('Документ') ? '?tab=documents' : h.where.includes('ообщени') || h.where.includes('Ответ') ? '?tab=messages' : ''}`)}>
                  <span className="badge badge-outline" style={{ flex: 'none' }}>
                    {p.code}
                    {p.archived ? ' · архив' : ''}
                  </span>
                  <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                    <span className="xs muted">
                      {h.where} · {p.name} · {h.at ? fmtDate(h.at) : ''}
                    </span>
                    <span className="small">{h.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
