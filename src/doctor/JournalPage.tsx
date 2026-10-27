import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useDB } from '../store/db';
import { fmtDateTime } from '../core/time';

export function JournalPage() {
  const db = useDB();
  const [q, setQ] = useState('');
  const [actor, setActor] = useState<'all' | 'system' | 'doctor' | 'patient'>('all');
  const name = (id: string) => db.users.find((u) => u.id === id)?.name ?? (id === 'system' ? 'Система' : db.patients.find((p) => p.id === id)?.code ?? id);
  const rows = [...db.audit]
    .reverse()
    .filter((a) => {
      if (actor === 'system' && a.actor !== 'system') return false;
      if (actor === 'doctor' && !db.users.some((u) => u.id === a.actor)) return false;
      if (actor === 'patient' && !db.patients.some((p) => p.id === a.actor)) return false;
      if (q && !`${a.action} ${a.details ?? ''} ${db.patients.find((p) => p.id === a.patientId)?.code ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    })
    .slice(0, 400);
  const notifs = [...db.notifications].reverse().slice(0, 30);
  return (
    <div className="stack fade-in" style={{ gap: 22 }}>
      <div className="page-head">
        <div>
          <h1>Журнал аудита</h1>
          <p>Неизменяемая запись действий: кто, что, над чем и когда. Содержимое чатов руководителю не показывается.</p>
        </div>
      </div>
      <section className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div className="card-title">
            <ScrollText /> События ({db.audit.length})
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input" placeholder="Поиск по действию или коду пациента" value={q} onChange={(e) => setQ(e.target.value)} style={{ minHeight: 38, width: 260 }} />
            <div className="segmented">
              {(
                [
                  ['all', 'Все'],
                  ['system', 'Система'],
                  ['doctor', 'Врачи'],
                  ['patient', 'Пациенты'],
                ] as const
              ).map(([k, l]) => (
                <button key={k} aria-pressed={actor === k} onClick={() => setActor(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 560 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Кто</th>
                <th>Пациент</th>
                <th>Действие</th>
                <th>Подробности</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap small">{fmtDateTime(a.at)}</td>
                  <td className="small nowrap">{name(a.actor)}</td>
                  <td className="small">{db.patients.find((p) => p.id === a.patientId)?.code ?? '—'}</td>
                  <td className="small">{a.action}</td>
                  <td className="xs muted">{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <div className="card-title">Отправленные уведомления</div>
          <span className="xs muted">проверка: ни в одном нет диагноза или названия препарата</span>
        </div>
        <div className="table-wrap" style={{ maxHeight: 360 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Канал</th>
                <th>Кому</th>
                <th>Текст</th>
              </tr>
            </thead>
            <tbody>
              {notifs.map((n) => (
                <tr key={n.id}>
                  <td className="nowrap small">{fmtDateTime(n.at)}</td>
                  <td className="small">{n.channel}</td>
                  <td className="small">{name(n.to)}</td>
                  <td className="small">«{n.text}»</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
