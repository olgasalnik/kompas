import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, CircleAlert, HeartHandshake, Info, Phone, ShieldAlert, Siren } from 'lucide-react';
import help from '../data/help.json';

/** Что считается экстренной ситуацией — простыми словами (раздел 5.6 рабочего документа) */
export function EmergencyInfo({ compact }: { compact?: boolean }) {
  return (
    <div className="card card-pad stack" style={{ gap: 10, borderColor: 'var(--red-border)' }}>
      <div className="row strong" style={{ gap: 8, color: 'var(--red-ink)' }}>
        <ShieldAlert size={18} /> {help.emergency.title}
      </div>
      <ul className="bullets small" style={{ color: 'var(--ink-2)' }}>
        {help.emergency.signs.slice(0, compact ? 4 : undefined).map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <div className="callout callout-red small">
        <Siren />
        <span>{help.emergency.action}</span>
      </div>
    </div>
  );
}

const GROUP_ICON: Record<string, JSX.Element> = {
  Экстренно: <Siren size={16} />,
  'Ваш врач': <HeartHandshake size={16} />,
  Поддержка: <Phone size={16} />,
  'Специализированная помощь': <Building2 size={16} />,
};

export function HelpCentersList() {
  const groups = [...new Set(help.services.map((s) => s.group))];
  return (
    <div className="stack" style={{ gap: 14 }}>
      {groups.map((g) => (
        <section key={g} className="stack" style={{ gap: 8 }}>
          <div className="eyebrow row" style={{ gap: 6, margin: '0 4px' }}>
            {GROUP_ICON[g]} {g}
          </div>
          {help.services
            .filter((s) => s.group === g)
            .map((s) => (
              <div key={s.id} className="card card-pad row row-top" style={{ gap: 12, padding: 14 }}>
                <div className="stack grow" style={{ gap: 3 }}>
                  <div className="strong small">{s.title}</div>
                  <div className="xs muted">{s.desc}</div>
                  {!s.verified && (
                    <div className="xs row" style={{ gap: 4, color: 'var(--amber-ink)' }}>
                      <CircleAlert size={12} /> Контакт добавляет клиника вашего региона
                    </div>
                  )}
                </div>
                {s.phone && (
                  <span className="badge badge-lg badge-solid-red" style={{ fontSize: 16, height: 34, userSelect: 'all' }}>
                    {s.phone}
                  </span>
                )}
              </div>
            ))}
        </section>
      ))}
      <div className="callout small">
        <Info />
        <span>{help.limits}</span>
      </div>
    </div>
  );
}

export function HelpCentersPage() {
  const nav = useNavigate();
  return (
    <>
      <div className="p-header">
        <button className="btn btn-ghost btn-icon" onClick={() => nav(-1)} aria-label="Назад">
          <ArrowLeft />
        </button>
        <span className="strong">Куда обратиться</span>
        <span style={{ width: 40 }} />
      </div>
      <div className="p-scroll stack" style={{ gap: 14 }}>
        <EmergencyInfo />
        <div className="card card-soft card-pad stack" style={{ gap: 6 }}>
          <div className="strong small">Не экстренно, но тревожно</div>
          <ul className="bullets small">
            {help.notEmergency.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <HelpCentersList />
      </div>
    </>
  );
}
