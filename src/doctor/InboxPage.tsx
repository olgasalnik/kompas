import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Paperclip } from 'lucide-react';
import { useDB, standNow } from '../store/db';
import { fmtAgo } from '../core/time';
import { THREAD_LABEL, threadStatus, visiblePatients } from './select';

export { THREAD_LABEL, threadStatus };

export function InboxPage({ me }: { me: string }) {
  const db = useDB();
  const nav = useNavigate();
  const now = standNow(db);
  const [filter, setFilter] = useState<'all' | 'new' | 'waiting'>('all');
  const rows = visiblePatients(db, me)
    .map((p) => ({ p, t: threadStatus(db, p.id), docs: db.documents.filter((d) => d.patientId === p.id && !d.viewedByDoctor).length }))
    .filter((r) => r.t.status !== 'none')
    .filter((r) => filter === 'all' || r.t.status === filter)
    .sort((a, b) => (b.t.lastAt ?? '').localeCompare(a.t.lastAt ?? ''));
  return (
    <div className="stack fade-in" style={{ gap: 22 }}>
      <div className="page-head">
        <div>
          <h1>Сообщения</h1>
          <p>Переписка со всеми пациентами: что новое, что просмотрено и ждёт ответа, на что вы уже ответили.</p>
        </div>
        <div className="segmented">
          {(
            [
              ['all', 'Все'],
              ['new', 'Новые'],
              ['waiting', 'Ждут ответа'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Inbox /> Переписки ({rows.length})
          </div>
          <span className="xs muted">каждое сообщение приходит с карточкой контекста за 7 дней</span>
        </div>
        <div className="stack" style={{ gap: 0 }}>
          {rows.length === 0 && <div className="empty">Нет переписок в этом фильтре</div>}
          {rows.map(({ p, t, docs }) => (
            <button
              key={p.id}
              className="row"
              onClick={() => nav(`/doctor/patient/${p.id}?tab=messages`)}
              style={{ gap: 14, padding: '14px 20px', border: 0, borderBottom: '1px solid var(--border)', background: t.status === 'new' ? 'var(--surface-2)' : 'transparent', textAlign: 'left', width: '100%' }}
            >
              <div className="avatar avatar-sm">{p.name.slice(0, 1)}</div>
              <div className="grow stack" style={{ gap: 2 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="strong">{p.name}</span>
                  <span className="xs muted">
                    {p.code} · карта {p.cardNo}
                  </span>
                </div>
                <span className="small ink-2" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.lastText}
                </span>
              </div>
              {docs > 0 && (
                <span className="badge badge-outline" title="Новые документы">
                  <Paperclip /> {docs}
                </span>
              )}
              <span className={`badge ${THREAD_LABEL[t.status].cls}`}>
                {THREAD_LABEL[t.status].label}
                {t.unread > 1 ? ` · ${t.unread}` : ''}
              </span>
              <span className="xs muted nowrap" style={{ minWidth: 90, textAlign: 'right' }}>
                {t.lastAt ? fmtAgo(t.lastAt, now) : ''}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
