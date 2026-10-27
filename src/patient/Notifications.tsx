import { useState } from 'react';
import { AtSign, Bell, MessageSquareText, Smartphone } from 'lucide-react';
import { useDB } from '../store/db';
import { fmtDateTime } from '../core/time';

const ICON = { push: <Smartphone size={14} />, sms: <MessageSquareText size={14} />, email: <AtSign size={14} />, messenger: <MessageSquareText size={14} />, screen: <Bell size={14} /> };
const LABEL = { push: 'Push', sms: 'SMS', email: 'Почта', messenger: 'Мессенджер', screen: 'Экран' };

/** Колокольчик: уведомления, которые получил пациент (без медицинских подробностей) */
export function NotificationsBell({ patientId }: { patientId: string }) {
  const db = useDB();
  const [open, setOpen] = useState(false);
  const list = db.notifications.filter((n) => n.to === patientId).sort((a, b) => b.at.localeCompare(a.at));
  const [seen, setSeen] = useState(() => list.length);
  const fresh = Math.max(0, list.length - seen);
  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-icon"
        aria-label={`Уведомления${fresh ? `: новых ${fresh}` : ''}`}
        onClick={() => {
          setOpen(!open);
          setSeen(list.length);
        }}
      >
        <Bell />
        {fresh > 0 && <span className="nav-dot" style={{ position: 'absolute', top: 6, right: 6, width: 9, height: 9, borderRadius: '50%', background: 'var(--red)', border: '2px solid #fff' }} />}
      </button>
      {open && (
        <div className="card fade-in" style={{ position: 'absolute', right: 0, top: 46, width: 300, maxWidth: 'calc(100vw - 32px)', zIndex: 30, boxShadow: 'var(--shadow-lg)' }}>
          <div className="card-head" style={{ padding: '12px 14px' }}>
            <span className="strong small">Уведомления</span>
            <span className="xs muted">без медицинских данных</span>
          </div>
          <div className="stack" style={{ gap: 0, maxHeight: 320, overflowY: 'auto' }}>
            {list.length === 0 && <div className="empty small">Уведомлений пока нет</div>}
            {list.slice(0, 20).map((n) => (
              <div key={n.id} className="row row-top small" style={{ gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                <span className="badge badge-outline" style={{ flex: 'none' }}>
                  {ICON[n.channel]} {LABEL[n.channel]}
                </span>
                <span className="stack" style={{ gap: 2 }}>
                  <span>{n.text}</span>
                  <span className="xs muted">{fmtDateTime(n.at)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
