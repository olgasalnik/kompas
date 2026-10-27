import { useState } from 'react';
import { ClipboardCopy, ListChecks, Waypoints } from 'lucide-react';
import { copyText } from '../../ui/hooks';
import { useDB } from '../../store/db';
import { decideReferral } from '../../store/api';
import { evaluateRouting, EXCLUDE_CHECKLIST, ROUTE_CATEGORIES } from '../../core/clinical';
import { fmtDateTime } from '../../core/time';
import type { PatientView } from '../../ui/hooks';
import { RouteHit, ROUTE_TEXT, Signal } from '../../ui/Signals';
import { toast } from '../../ui/Toasts';

export function RoutingTab({ v, me }: { v: PatientView; me: string }) {
  const db = useDB();
  const { p, facts } = v;
  const r = evaluateRouting(facts);
  const [comment, setComment] = useState('');
  const history = db.referrals.filter((x) => x.patientId === p.id).reverse();
  return (
    <div className="dossier-grid">
      <div className="stack" style={{ gap: 18 }}>
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Waypoints /> Направление к психиатру
            </div>
            <span className="xs muted">расчёт {r.durationMs.toFixed(1)} мс · критерии — ПРЕДЛОЖЕНИЕ для подписи эксперта</span>
          </div>
          <div className="card-body stack" style={{ gap: 12 }}>
            {r.category ? (
              <>
                <Signal
                  variant={ROUTE_TEXT[r.category].variant}
                  kicker={`${ROUTE_CATEGORIES[r.category].label} · ${[...new Set(r.byCategory[r.category].map((h) => h.rule.to))].join('; ')}`}
                  meta={r.byCategory[r.category][0].rule.term}
                  title={r.category === 'desirable' ? 'Желательна консультация — можно отложить с комментарием' : 'Обязательная консультация — нельзя скрыть'}
                >
                  Система не направляет пациента сама: направление оформляется только после подтверждения врача.
                </Signal>
                <div className="eyebrow">Сработавшие критерии</div>
                {(['urgent', 'mandatory', 'desirable'] as const).flatMap((c) => r.byCategory[c].map((h) => <RouteHit key={h.rule.id} hit={h} compact />))}
                <textarea className="textarea" placeholder={r.category === 'desirable' ? 'Комментарий (обязателен, если откладываете)' : 'Комментарий к направлению'} value={comment} onChange={(e) => setComment(e.target.value)} style={{ minHeight: 64 }} />
                <div className="row wrap" style={{ gap: 8 }}>
                  <button
                    className={`btn ${r.category === 'desirable' ? 'btn-primary' : 'btn-danger'}`}
                    onClick={() => {
                      decideReferral(p.id, me, 'confirmed', comment || undefined, facts);
                      setComment('');
                      toast('Направление подтверждено врачом', { tone: 'ok' });
                    }}
                  >
                    Подтвердить направление
                  </button>
                  {r.category === 'desirable' && (
                    <button
                      className="btn"
                      disabled={comment.trim().length < 5}
                      onClick={() => {
                        decideReferral(p.id, me, 'postponed', comment, facts);
                        setComment('');
                        toast('Отложено с комментарием');
                      }}
                    >
                      Отложить с комментарием
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    onClick={async () => {
                      const cat = r.category!;
                      const hits = r.byCategory[cat];
                      const text = [
                        `Направление: ${ROUTE_CATEGORIES[cat].label} — ${[...new Set(hits.map((h) => h.rule.to))].join('; ')}, срок: ${hits[0].rule.term}`,
                        `Пациент: ${p.code}, медицинская карта ${p.cardNo}, ${p.age} лет. Диагноз (врач): ${p.diagnosis.code} ${p.diagnosis.label}.`,
                        `Критерии: ${hits.map((h) => h.rule.title).join('; ')}.`,
                        `Шкалы: PHQ-9 ${facts['phq9.total'] ?? '—'} (пункт 9: ${facts['phq9.item9'] ?? '—'}), GAD-7 ${facts['gad7.total'] ?? '—'}.`,
                        comment ? `Комментарий врача: ${comment}` : '',
                      ]
                        .filter(Boolean)
                        .join('\n');
                      const ok = await copyText(text);
                      toast(ok ? 'Текст направления скопирован' : 'Не удалось скопировать', { tone: ok ? 'ok' : 'default' });
                    }}
                  >
                    <ClipboardCopy /> Скопировать направление
                  </button>
                </div>
              </>
            ) : (
              <Signal variant="ok" kicker="Направление не требуется" title="Критерии «обязательно» и «желательно» не выполнены">
                Ведение у текущего специалиста. Критерии пересчитываются при каждой новой записи пациента.
              </Signal>
            )}
          </div>
        </section>

        {history.length > 0 && (
          <section className="card card-pad stack" style={{ gap: 10 }}>
            <div className="strong">История направлений</div>
            {history.map((h) => (
              <div key={h.id} className="row row-top small" style={{ gap: 10 }}>
                <span className={`badge ${h.category === 'desirable' ? 'badge-amber badge-dashed' : 'badge-red'}`}>{ROUTE_CATEGORIES[h.category].label}</span>
                <div className="stack" style={{ gap: 2 }}>
                  <span>
                    <b>{h.status === 'confirmed' ? 'Подтверждено' : h.status === 'postponed' ? 'Отложено' : 'Отклонено'}</b> · {h.to} · {h.term}
                  </span>
                  <span className="xs muted">
                    {fmtDateTime(h.decidedAt!)} · {db.users.find((u) => u.id === h.decidedBy)?.name}
                    {h.comment ? ` · «${h.comment}»` : ''}
                  </span>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>

      <section className="card card-pad stack" style={{ gap: 12 }}>
        <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
          <ListChecks /> Что стоит исключить
        </div>
        <div className="xs muted">{EXCLUDE_CHECKLIST.note}</div>
        <ul className="list-plain stack" style={{ gap: 8 }}>
          {EXCLUDE_CHECKLIST.items.map((i) => (
            <li key={i.id} className="small">
              <div className="xs muted">{i.group}</div>
              {i.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
