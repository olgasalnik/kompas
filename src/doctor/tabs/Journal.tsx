import { useDB } from '../../store/db';
import { fmtDateTime, fmtDuration } from '../../core/time';
import type { PatientView } from '../../ui/hooks';
import { STATUS_LABEL } from '../../ui/Signals';
import { useOpenAlert } from '../DoctorApp';

export function JournalTab({ v }: { v: PatientView }) {
  const db = useDB();
  const openAlert = useOpenAlert();
  const alerts = db.alerts.filter((a) => a.patientId === v.p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const audit = db.audit.filter((a) => a.patientId === v.p.id).sort((a, b) => b.at.localeCompare(a.at));
  const who = (id: string) => db.users.find((u) => u.id === id)?.name ?? (id === 'system' ? 'Система' : id === v.p.id ? 'Пациент' : id);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card">
        <div className="card-head">
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            Сигналы и время реакции
          </div>
          <span className="xs muted">T-detect — от события у пациента до просмотра врачом</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Создан</th>
                <th>Уровень</th>
                <th>Сигнал</th>
                <th className="num">Доставка</th>
                <th className="num">T-detect</th>
                <th>Эскалация</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {alerts.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    Сигналов не было
                  </td>
                </tr>
              )}
              {alerts.map((a) => (
                <tr key={a.id} className="is-clickable" onClick={() => openAlert(a.id)}>
                  <td className="nowrap small">{fmtDateTime(a.createdAt)}</td>
                  <td>
                    <span className={`badge badge-${a.level}`}>{{ red: 'Красный', orange: 'Оранжевый', yellow: 'Жёлтый' }[a.level]}</span>
                  </td>
                  <td className="small">
                    {a.title}
                    <div className="xs muted">
                      {a.ruleId} v{a.ruleVersion}
                    </div>
                  </td>
                  <td className="num small">{a.deliveryMs !== undefined ? fmtDuration(a.deliveryMs) : '—'}</td>
                  <td className="num small">{a.viewedAt ? fmtDuration(Date.parse(a.viewedAt) - Date.parse(a.firstEventAt ?? a.triggerEventAt)) : '—'}</td>
                  <td className="small">{a.escalationStep ? `${a.escalationStep} ур.` : '—'}</td>
                  <td>
                    <span className="badge badge-outline">{STATUS_LABEL[a.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            Журнал аудита пациента
          </div>
          <span className="xs muted">неизменяемый: кто, что, когда · чтение карточки тоже журналируется</span>
        </div>
        <div className="table-wrap" style={{ maxHeight: 460 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Время</th>
                <th>Кто</th>
                <th>Действие</th>
                <th>Подробности</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap small">{fmtDateTime(a.at)}</td>
                  <td className="small nowrap">{who(a.actor)}</td>
                  <td className="small">{a.action}</td>
                  <td className="xs muted">{a.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
