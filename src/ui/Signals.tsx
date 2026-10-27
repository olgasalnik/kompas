// Визуальный язык сигналов (раздел 4.6): различие по форме рамки, толщине полосы, иконке и тексту —
// не только по цвету, чтобы категории читались и в оттенках серого.
import type { ReactNode } from 'react';
import { BadgeCheck, BellRing, Eye, FileWarning, Info, ShieldX, Siren, TriangleAlert } from 'lucide-react';
import type { Alert, RouteCategory, RuleHit } from '../core/types';
import { WhyButton } from './Why';

export function RouteArrow({ dashed }: { dashed?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h14" strokeDasharray={dashed ? '3.2 3.2' : undefined} />
      <path d="M13 6l6 6-6 6" />
      <circle cx="21" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

type Variant = 'stop' | 'warn' | 'must' | 'should' | 'red' | 'orange' | 'yellow' | 'info' | 'ok';

const ICON: Record<Variant, ReactNode> = {
  stop: <ShieldX />,
  warn: <TriangleAlert />,
  must: <RouteArrow />,
  should: <RouteArrow dashed />,
  red: <Siren />,
  orange: <BellRing />,
  yellow: <Eye />,
  info: <Info />,
  ok: <BadgeCheck />,
};

export function Signal({
  variant,
  kicker,
  title,
  children,
  actions,
  meta,
  compact,
  resolved,
  icon,
}: {
  variant: Variant;
  kicker: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  compact?: boolean;
  resolved?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div className={`signal signal-${variant} ${compact ? 'signal-compact' : ''} ${resolved ? 'is-resolved' : ''}`}>
      <div className="signal-icon">{icon ?? ICON[variant]}</div>
      <div className="signal-kicker">
        {kicker}
        {meta && <span className="signal-meta">{meta}</span>}
      </div>
      <div className="signal-title">{title}</div>
      {children && <div className="signal-body">{children}</div>}
      {actions && <div className="signal-actions">{actions}</div>}
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function TherapyHit({ hit, actions, compact }: { hit: RuleHit; actions?: ReactNode; compact?: boolean }) {
  const r = hit.rule;
  if (r.type === 'STOP')
    return (
      <Signal variant="stop" kicker="СТОП · противопоказано по инструкции" title={r.title} compact={compact} actions={<><WhyButton ruleId={r.id} facts={hit.matched} />{actions}</>}>
        {r.messageDoctor}
      </Signal>
    );
  if (r.type === 'WARN')
    return (
      <Signal
        variant="warn"
        kicker={r.title.startsWith('ПРОВЕРЬТЕ') ? 'ВНИМАНИЕ · проверьте сочетание' : 'ВНИМАНИЕ · с осторожностью'}
        title={cap(r.title.replace('ПРОВЕРЬТЕ СОЧЕТАНИЕ: ', 'Сочетание: ').replace('С осторожностью: ', ''))}
        compact={compact}
        actions={<><WhyButton ruleId={r.id} facts={hit.matched} />{actions}</>}
      >
        {r.messageDoctor}
      </Signal>
    );
  if (r.type === 'OFF_LABEL')
    return (
      <Signal variant="should" icon={<FileWarning />} kicker="ВНЕ ИНСТРУКЦИИ — решение врача" title="Диагноз не входит в зарегистрированные показания" compact={compact} actions={<><WhyButton ruleId={r.id} facts={hit.matched} />{actions}</>}>
        {r.messageDoctor}
      </Signal>
    );
  return (
    <Signal variant="ok" kicker="Показание совпадает" title={cap(r.title.replace('Показание совпадает: ', ''))} compact={compact} actions={<><WhyButton ruleId={r.id} facts={hit.matched} />{actions}</>}>
      {r.messageDoctor}
    </Signal>
  );
}

export const ROUTE_TEXT: Record<RouteCategory, { kicker: string; variant: Variant }> = {
  urgent: { kicker: 'ОБЯЗАТЕЛЬНО · экстренно', variant: 'must' },
  mandatory: { kicker: 'ОБЯЗАТЕЛЬНО', variant: 'must' },
  desirable: { kicker: 'ЖЕЛАТЕЛЬНО', variant: 'should' },
};

export function RouteHit({ hit, compact }: { hit: RuleHit; compact?: boolean }) {
  const cat = hit.rule.category ?? 'desirable';
  const t = ROUTE_TEXT[cat];
  return (
    <Signal variant={t.variant} kicker={`${t.kicker}: ${hit.rule.to}`} meta={hit.rule.term} title={hit.rule.title} compact={compact} actions={<WhyButton ruleId={hit.rule.id} facts={hit.matched} />} />
  );
}

export const LEVEL_KICKER = { red: 'Красный · критический', orange: 'Оранжевый · существенный', yellow: 'Жёлтый · наблюдение' } as const;

export function AlertSignal({ alert, title, meta, actions, children, compact }: { alert: Alert; title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children?: ReactNode; compact?: boolean }) {
  const resolved = alert.status === 'closed' || alert.status === 'false_positive';
  return (
    <Signal
      variant={alert.level}
      kicker={LEVEL_KICKER[alert.level]}
      meta={meta}
      title={title ?? alert.title}
      compact={compact}
      resolved={resolved}
      actions={
        <>
          <WhyButton ruleId={alert.ruleId} facts={alert.facts} />
          {actions}
        </>
      }
    >
      {children}
    </Signal>
  );
}

export const STATUS_LABEL: Record<Alert['status'], string> = {
  new: 'Новый',
  delivered: 'Доставлен',
  viewed: 'Просмотрен',
  in_work: 'В работе',
  closed: 'Закрыт',
  false_positive: 'Ложное срабатывание',
};
