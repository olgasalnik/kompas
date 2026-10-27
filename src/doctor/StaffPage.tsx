// Сотрудники и документы: диплом, аккредитация (срок), запись в реестре, последняя проверка.
// Заведующая видит, у кого истекает аккредитация (за 90 дней) или документы ещё на проверке.
import { BadgeCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { useDB, standNow } from '../store/db';
import { verifyCredentials } from '../store/api';
import { credentialStatus, EXPIRY_WARN_DAYS, fmtUntil, needsAttention } from '../core/credentials';
import { fmtDateTime } from '../core/time';
import { toast } from '../ui/Toasts';

const TONE = { ok: 'badge-mint', warn: 'badge-amber', bad: 'badge-red', info: 'badge-brand' } as const;

export function StaffPage({ me }: { me: string }) {
  const db = useDB();
  const now = standNow(db);
  const rows = db.users.map((u) => ({ u, s: credentialStatus(u.credentials, now) }));
  const attention = rows.filter((r) => needsAttention(r.s.status));
  return (
    <div className="stack fade-in" style={{ gap: 22 }}>
      <div className="page-head">
        <div>
          <h1>Сотрудники и документы</h1>
          <p>Диплом, аккредитация и запись в Федеральном регистре медицинских работников. Данные синтетические.</p>
        </div>
      </div>

      {attention.length > 0 && (
        <div className="callout callout-amber small">
          <ShieldAlert />
          <span>
            Требуют внимания заведующей: {attention.map((r) => `${r.u.name} — ${r.s.label.toLowerCase()}`).join('; ')}. Предупреждение приходит за {EXPIRY_WARN_DAYS} дней до окончания
            аккредитации.
          </span>
        </div>
      )}

      <section className="card">
        <div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Диплом и образование</th>
                  <th>Аккредитация</th>
                  <th>Статус</th>
                  <th>Проверка</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ u, s }) => (
                  <tr key={u.id}>
                    <td style={{ minWidth: 190 }}>
                      <div className="strong">{u.name}</div>
                      <div className="xs muted">
                        {u.title} · стаж {u.credentials.experienceYears} лет
                      </div>
                    </td>
                    <td className="small" style={{ minWidth: 220 }}>
                      <div>{u.credentials.diploma}</div>
                      <div className="xs muted">{u.credentials.education}</div>
                    </td>
                    <td className="small" style={{ minWidth: 200 }}>
                      {u.credentials.accreditation}
                      <div className="xs muted">действует до {fmtUntil(u.credentials.accreditationUntil)}</div>
                    </td>
                    <td>
                      <span className={`badge ${TONE[s.tone]}`}>
                        {s.status === 'verified' && <BadgeCheck />} {s.label}
                      </span>
                    </td>
                    <td className="small" style={{ minWidth: 170 }}>
                      <div className="xs muted">{u.credentials.lastCheck ? fmtDateTime(u.credentials.lastCheck) : u.credentials.checkedAt}</div>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          verifyCredentials(u.id, me);
                          toast('Проверка в реестре выполнена', { tone: 'ok', sub: 'Имитация: в пилоте — запрос к ФРМР через ЕГИСЗ' });
                        }}
                      >
                        <RefreshCw /> Проверить в реестре
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="strong">Как это работает</div>
        <ul className="bullets small">
          <li>Клиника вносит диплом и свидетельство об аккредитации; запись сверяется с Федеральным регистром медицинских работников (ФРМР).</li>
          <li>Статусы: «Документы проверены», «Аккредитация истекает» (за {EXPIRY_WARN_DAYS} дней), «Аккредитация истекла», «На проверке», «Не найден в реестре».</li>
          <li>Пациент видит в карточке врача образование, аккредитацию и дату проверки клиникой.</li>
          <li>В прототипе кнопка «Проверить в реестре» — имитация. В пилоте — запрос к ФРМР через ЕГИСЗ (доступ медицинской организации) и задача заведующей при истечении срока.</li>
        </ul>
      </section>
    </div>
  );
}

/** Счётчик для меню: сколько сотрудников требуют внимания */
export function StaffCount() {
  const db = useDB();
  const now = standNow(db);
  const n = db.users.filter((u) => needsAttention(credentialStatus(u.credentials, now).status)).length;
  return n ? <span className="badge badge-amber">{n}</span> : null;
}
