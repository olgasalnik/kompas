import { useSyncExternalStore, type ReactNode } from 'react';
import { BellRing, CheckCircle2, Info } from 'lucide-react';

interface Toast {
  id: number;
  title: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'red' | 'ok';
}

let toasts: Toast[] = [];
let n = 0;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());

export function toast(title: ReactNode, opts: { sub?: ReactNode; tone?: Toast['tone']; ms?: number } = {}) {
  const t: Toast = { id: ++n, title, sub: opts.sub, tone: opts.tone };
  toasts = [...toasts, t].slice(-4);
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, opts.ms ?? 4200);
}

export function ToastHost() {
  const list = useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.tone === 'red' ? 'toast-red' : t.tone === 'ok' ? 'toast-ok' : ''}`}>
          {t.tone === 'red' ? <BellRing /> : t.tone === 'ok' ? <CheckCircle2 /> : <Info />}
          <div className="stack" style={{ gap: 2 }}>
            <div className="strong">{t.title}</div>
            {t.sub && <div className="toast-sub">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
