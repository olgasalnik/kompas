import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({
  title,
  sub,
  onClose,
  children,
  footer,
  wide,
  icon,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  icon?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="row row-top" style={{ gap: 12 }}>
            {icon}
            <div className="stack" style={{ gap: 4 }}>
              <h3>{title}</h3>
              {sub && <div className="small muted">{sub}</div>}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Закрыть">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
