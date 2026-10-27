// Графики динамики (SVG). Правила dataviz: линии 2px, маркеры ≥ 8px с кольцом цвета поверхности,
// волосяные сетки, одна ось Y, легенда при ≥ 2 сериях, перекрестие с подсказкой, у каждого графика — таблица.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Table2, LineChart as LineIcon } from 'lucide-react';
import { fmtDate } from '../core/time';
import type { DoseSlot } from '../core/adherence';

export interface Series {
  id: string;
  label: string;
  color: string; // CSS-переменная серии
  points: { t: number; v: number }[];
}

export interface ChartEvent {
  t: number;
  label: string;
  kind: 'therapy' | 'visit' | 'alert' | 'miss';
}

export interface Band {
  min: number;
  max: number;
  label: string;
  tone: 'mint' | 'green' | 'yellow' | 'orange' | 'red';
}

const BAND_FILL: Record<Band['tone'], string> = {
  mint: 'rgba(31,157,120,0.07)',
  green: 'rgba(31,138,76,0.05)',
  yellow: 'rgba(201,154,6,0.07)',
  orange: 'rgba(212,98,28,0.07)',
  red: 'rgba(196,48,59,0.07)',
};

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(260, Math.floor(e[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function TimeChart({
  series,
  yMax,
  yMin = 0,
  bands,
  events = [],
  height = 220,
  from,
  to,
  unit = '',
  yTicks,
  title,
  caption,
}: {
  series: Series[];
  yMax: number;
  yMin?: number;
  bands?: Band[];
  events?: ChartEvent[];
  height?: number;
  from: number;
  to: number;
  unit?: string;
  yTicks?: number[];
  title?: ReactNode;
  caption?: ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const pad = { l: 34, r: bands ? 92 : 14, t: events.length ? 22 : 10, b: 26 };
  const W = width;
  const H = height;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const span = Math.max(1, to - from);
  const x = (t: number) => pad.l + ((t - from) / span) * iw;
  const y = (v: number) => pad.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

  const allT = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b), [series]);
  const ticksY = yTicks ?? [yMin, Math.round((yMin + yMax) / 2), yMax];
  const ticksX = useMemo(() => {
    const n = Math.max(2, Math.min(6, Math.floor(iw / 90)));
    return Array.from({ length: n + 1 }, (_, i) => from + (span * i) / n);
  }, [from, span, iw]);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left + pad.l;
    let best: number | null = null;
    let bd = Infinity;
    for (const t of allT) {
      const d = Math.abs(x(t) - px);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    setHover(bd < 40 ? best : null);
  };

  const near = (s: Series, t: number) => {
    let best: { t: number; v: number } | null = null;
    for (const p of s.points) if (Math.abs(p.t - t) < 12 * 3600_000 && (!best || Math.abs(p.t - t) < Math.abs(best.t - t))) best = p;
    return best;
  };

  const hasData = series.some((s) => s.points.length);

  return (
    <div className="chart">
      {(title || series.length > 1) && (
        <div className="chart-head">
          <div className="stack" style={{ gap: 2 }}>
            {title && <div className="chart-title">{title}</div>}
            {caption && <div className="chart-caption">{caption}</div>}
          </div>
          <div className="row" style={{ gap: 12 }}>
            {series.length > 1 && (
              <div className="chart-legend">
                {series.map((s) => (
                  <span key={s.id} className="legend-item">
                    <span className="legend-line" style={{ background: s.color }} />
                    {s.label}
                  </span>
                ))}
              </div>
            )}
            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setTable(!table)} title={table ? 'Показать график' : 'Показать таблицу'} aria-label={table ? 'Показать график' : 'Показать таблицу'}>
              {table ? <LineIcon /> : <Table2 />}
            </button>
          </div>
        </div>
      )}
      <div ref={ref} className="chart-body" style={{ height: table ? 'auto' : H }}>
        {table ? (
          <div className="table-wrap chart-table">
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  {series.map((s) => (
                    <th key={s.id} className="num">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allT.map((t) => (
                  <tr key={t}>
                    <td>{fmtDate(new Date(t))}</td>
                    {series.map((s) => {
                      const p = s.points.find((q) => q.t === t);
                      return (
                        <td key={s.id} className="num">
                          {p ? p.v : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <svg width={W} height={H} role="img" aria-label={typeof title === 'string' ? title : 'График динамики'}>
            {bands?.map((b) => (
              <g key={b.label}>
                <rect x={pad.l} y={y(Math.min(b.max, yMax))} width={iw} height={Math.max(0, y(b.min) - y(Math.min(b.max, yMax)))} fill={BAND_FILL[b.tone]} />
                {y(b.min) - y(Math.min(b.max, yMax)) >= 14 && (
                  <text x={W - pad.r + 8} y={(y(b.min) + y(Math.min(b.max, yMax))) / 2 + 4} className="chart-band-label">
                    {b.label.length > 13 && W < 520 ? b.label.split(' ')[0] + '…' : b.label}
                  </text>
                )}
              </g>
            ))}
            {ticksY.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={pad.l + iw} y1={y(v)} y2={y(v)} className="chart-grid" />
                <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" className="chart-tick">
                  {v}
                </text>
              </g>
            ))}
            <line x1={pad.l} x2={pad.l + iw} y1={y(yMin)} y2={y(yMin)} className="chart-axis" />
            {ticksX.map((t, i) => (
              <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? 'start' : i === ticksX.length - 1 ? 'end' : 'middle'} className="chart-tick">
                {fmtDate(new Date(t))}
              </text>
            ))}
            {events.map((ev, i) => (
              <g key={i} className={`chart-event chart-event-${ev.kind}`}>
                <line x1={x(ev.t)} x2={x(ev.t)} y1={pad.t - 6} y2={pad.t + ih} />
                <circle cx={x(ev.t)} cy={pad.t - 10} r={4} />
                <title>{`${fmtDate(new Date(ev.t))}: ${ev.label}`}</title>
              </g>
            ))}
            {series.map((s) => {
              const pts = [...s.points].sort((a, b) => a.t - b.t);
              if (!pts.length) return null;
              const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
              const area = `${d} L${x(pts[pts.length - 1].t).toFixed(1)},${y(yMin)} L${x(pts[0].t).toFixed(1)},${y(yMin)} Z`;
              const last = pts[pts.length - 1];
              return (
                <g key={s.id}>
                  {series.length === 1 && <path d={area} fill={s.color} opacity={0.08} />}
                  <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.length <= 16 && pts.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
                  <circle cx={x(last.t)} cy={y(last.v)} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  {series.length <= 2 && (
                    <text x={Math.min(x(last.t) + 8, pad.l + iw - 4)} y={y(last.v) - 9} textAnchor={x(last.t) + 30 > pad.l + iw ? 'end' : 'start'} className="chart-endlabel">
                      {last.v}
                      {unit}
                    </text>
                  )}
                </g>
              );
            })}
            {!hasData && (
              <text x={pad.l + iw / 2} y={pad.t + ih / 2} textAnchor="middle" className="chart-tick">
                Нет данных за период
              </text>
            )}
            {hover !== null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="chart-crosshair" />
                {series.map((s) => {
                  const p = near(s, hover);
                  return p ? <circle key={s.id} cx={x(p.t)} cy={y(p.v)} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null;
                })}
              </g>
            )}
            <rect x={pad.l} y={0} width={iw} height={H} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
          </svg>
        )}
        {!table && hover !== null && (
          <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover) - 70, 4), W - 150), top: 6 }}>
            <div className="chart-tip-date">{fmtDate(new Date(hover))}</div>
            {series.map((s) => {
              const p = near(s, hover);
              return (
                <div key={s.id} className="chart-tip-row">
                  <span className="legend-line" style={{ background: s.color }} />
                  <b>{p ? `${p.v}${unit}` : '—'}</b>
                  <span>{s.label}</span>
                </div>
              );
            })}
            {events
              .filter((e) => Math.abs(e.t - hover) < 12 * 3600_000)
              .map((e, i) => (
                <div key={i} className="chart-tip-event">
                  {e.label}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

const DOSE_LABEL: Record<DoseSlot['effective'], string> = {
  taken: 'Принял(а)',
  missed: 'Пропуск',
  pending: 'Позже — ждём отметку',
  unmarked: 'Нет отметки',
};

/** Полоса приёмов: каждая доза — отдельная ячейка (утро сверху, вечер снизу), статус — цвет + символ + подпись */
export function DoseStrip({ doses, days = 14, now }: { doses: DoseSlot[]; days?: number; now: Date }) {
  const [tip, setTip] = useState<{ d: DoseSlot; x: number } | null>(null);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const dayList = Array.from({ length: days }, (_, i) => new Date(start.getTime() - (days - 1 - i) * 86400000));
  const find = (day: Date, slot: 'morning' | 'evening') => doses.find((d) => d.slot === slot && d.at.toDateString() === day.toDateString());
  return (
    <div className="dose-strip">
      <div className="dose-grid" style={{ gridTemplateColumns: `52px repeat(${days}, minmax(0, 1fr))` }}>
        {(['morning', 'evening'] as const).map((slot) => (
          <div key={slot} style={{ display: 'contents' }}>
            <div className="dose-row-label">{slot === 'morning' ? 'Утро' : 'Вечер'}</div>
            {dayList.map((day, i) => {
              const d = find(day, slot);
              const eff = d?.effective ?? 'none';
              return (
                <div
                  key={i}
                  className={`dose-cell dose-${eff}`}
                  onPointerEnter={() => d && setTip({ d, x: i })}
                  onPointerLeave={() => setTip(null)}
                  tabIndex={d ? 0 : -1}
                  onFocus={() => d && setTip({ d, x: i })}
                  onBlur={() => setTip(null)}
                  aria-label={d ? `${fmtDate(day)}, ${slot === 'morning' ? 'утро' : 'вечер'}: ${DOSE_LABEL[d.effective]}` : undefined}
                >
                  {eff === 'taken' ? '✓' : eff === 'missed' ? '✕' : eff === 'pending' ? '…' : ''}
                </div>
              );
            })}
          </div>
        ))}
        <div />
        {dayList.map((day, i) => (
          <div key={i} className="dose-day">
            {i % 2 === (days - 1) % 2 ? day.getDate() : ''}
          </div>
        ))}
      </div>
      {tip && (
        <div className="dose-tip" style={{ left: `calc(52px + (100% - 52px) * ${(tip.x + 0.5) / days})` }}>
          <b>{DOSE_LABEL[tip.d.effective]}</b>
          <span>
            {fmtDate(tip.d.at)}, {tip.d.slot === 'morning' ? 'утро' : 'вечер'}
            {tip.d.reason ? ` · ${REASONS_SHORT[tip.d.reason] ?? ''}` : ''}
          </span>
        </div>
      )}
      <div className="dose-legend">
        <span>
          <i className="dose-cell dose-taken">✓</i> принял(а)
        </span>
        <span>
          <i className="dose-cell dose-missed">✕</i> пропуск
        </span>
        <span>
          <i className="dose-cell dose-pending">…</i> «позже»
        </span>
        <span>
          <i className="dose-cell dose-unmarked" /> нет отметки
        </span>
      </div>
    </div>
  );
}

const REASONS_SHORT: Record<string, string> = {
  forgot: 'забыл(а)',
  side_effects: 'нежелательные ощущения',
  no_drug: 'не было препарата',
  doubts: 'сомнения',
  routine: 'изменился распорядок',
  other: 'другая причина',
};

/** Мини-спарклайн для таблиц */
export function Spark({ values, color = 'var(--series-1)', width = 72, height = 24 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <span className="muted small">—</span>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (width - 6) + 3).toFixed(1)},${(height - 3 - ((v - min) / (max - min || 1)) * (height - 6)).toFixed(1)}`);
  const last = pts[pts.length - 1].split(',');
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}
