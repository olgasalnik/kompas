import { useState } from 'react';
import { Activity, BellRing, Cpu, FileSearch, Gauge, MousePointerClick, ShieldCheck, Timer } from 'lucide-react';
import { useDB, getDB, standNow } from '../store/db';
import { buildFacts } from '../core/facts';
import { checkTherapy, evaluateAlerts, evaluateRouting } from '../core/clinical';
import { fmtDuration } from '../core/time';
import type { MetricSample } from '../core/types';
import { findLeaks } from '../core/privacy';

const quant = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};


export function MetricsPanel() {
  const db = useDB();
  const [bench, setBench] = useState<{ n: number; ms: number; per: number } | null>(null);
  const by = (k: MetricSample['kind']) => db.metrics.filter((m) => m.kind === k);
  const delivery = by('alert_delivery').map((m) => m.ms);
  const rules = by('rule_eval').map((m) => m.ms);
  const dossier = by('dossier_render').map((m) => m.ms);
  const checkins = by('checkin');
  const phq = by('phq9_fill').map((m) => m.ms);
  const leaks = findLeaks(db.notifications);

  const runBench = () => {
    const d = getDB();
    const now = standNow(d);
    const N = 1000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const p = d.patients[i % d.patients.length];
      const f = buildFacts(d, p, now);
      evaluateAlerts(f);
      checkTherapy(f);
      evaluateRouting(f);
    }
    const ms = performance.now() - t0;
    setBench({ n: N, ms, per: ms / N });
  };

  const tiles = [
    { icon: <BellRing />, label: 'Доставка сигнала врачу', v: quant(delivery, 0.5), p95: quant(delivery, 0.95), n: delivery.length, target: 'цель: push ≤ 10 с' },
    { icon: <Cpu />, label: 'Проверка правил на событие', v: quant(rules, 0.5), p95: quant(rules, 0.95), n: rules.length, target: 'цель: p95 < 1 с' },
    { icon: <Gauge />, label: 'Открытие досье', v: quant(dossier, 0.5), p95: quant(dossier, 0.95), n: dossier.length, target: 'цель: < 2 с' },
    { icon: <Timer />, label: 'Ежедневный чек-ин', v: quant(checkins.map((c) => c.ms), 0.5), p95: quant(checkins.map((c) => c.ms), 0.95), n: checkins.length, target: 'цель: ≤ 60 с' },
    { icon: <Activity />, label: 'Заполнение PHQ-9', v: quant(phq, 0.5), p95: quant(phq, 0.95), n: phq.length, target: 'цель: ≤ 2 мин' },
  ];
  const taps = checkins.map((c) => c.taps ?? 0);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="grid-3">
        {tiles.map((t) => (
          <div key={t.label} className="stat">
            <span className="stat-label">
              {t.icon} {t.label}
            </span>
            <span className="stat-value">{t.v !== null ? fmtDuration(t.v) : '—'}</span>
            <span className="stat-delta delta-flat">
              медиана · p95 {t.p95 !== null ? fmtDuration(t.p95) : '—'} · {t.n} замеров · {t.target}
            </span>
          </div>
        ))}
        <div className="stat">
          <span className="stat-label">
            <MousePointerClick /> Нажатий на чек-ин
          </span>
          <span className="stat-value">{taps.length ? quant(taps, 0.5) : '—'}</span>
          <span className="stat-delta delta-flat">медиана · максимум {taps.length ? Math.max(...taps) : '—'} · цель: ≤ 5</span>
        </div>
      </div>
      <div className="grid-2">
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            <Cpu /> Нагрузочный прогон движка правил
          </div>
          <p className="small ink-2">Сбор фактов + сигналы + проверка препарата + маршрутизация для 1000 пациентов подряд в этом браузере.</p>
          <button className="btn btn-soft" onClick={runBench} style={{ alignSelf: 'flex-start' }}>
            Запустить прогон
          </button>
          {bench && (
            <div className="badge badge-brand badge-lg" style={{ alignSelf: 'flex-start' }}>
              {bench.n} пациентов за {fmtDuration(bench.ms)} · {bench.per.toFixed(2)} мс на пациента
            </div>
          )}
          <div className="xs muted">На сервере (вариант B) — k6: 500 одновременных пользователей, цель — деградация p95 не более чем в 2 раза.</div>
        </div>
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            <ShieldCheck /> Утечки в уведомлениях
          </div>
          <p className="small ink-2">Автопроверка всех отправленных уведомлений на диагнозы, названия препаратов и шкал.</p>
          <div className={`badge badge-lg ${leaks.length ? 'badge-red' : 'badge-mint'}`} style={{ alignSelf: 'flex-start' }}>
            <FileSearch /> {leaks.length ? `Найдено: ${leaks.length}` : `0 утечек в ${db.notifications.length} уведомлениях`}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MetricsPage() {
  return (
    <div className="stack fade-in" style={{ gap: 22 }}>
      <div className="page-head">
        <div>
          <h1>Метрики стенда</h1>
          <p>Числа измеряются на этом стенде во время работы, а не задаются. Пройдите сценарии — замеры появятся здесь.</p>
        </div>
      </div>
      <MetricsPanel />
    </div>
  );
}
