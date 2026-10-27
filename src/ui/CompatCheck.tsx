// Форма «Проверить совместимость с «Авиандром»» — для врача (с правилом и источником) и для пациента (простыми словами).
import { useState } from 'react';
import { OctagonX, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import { checkCompatibility, type CompatResult } from '../core/compat';

const TONE: Record<CompatResult['level'], { cls: string; icon: JSX.Element; kicker: string }> = {
  stop: { cls: 'callout-red', icon: <OctagonX />, kicker: 'СТОП — противопоказано' },
  warn: { cls: 'callout-amber', icon: <TriangleAlert />, kicker: 'ВНИМАНИЕ — с осторожностью' },
  alcohol: { cls: 'callout-amber', icon: <TriangleAlert />, kicker: 'ВНИМАНИЕ' },
  self: { cls: '', icon: <ShieldCheck />, kicker: 'Это сам препарат' },
  none: { cls: '', icon: <Search />, kicker: 'Не упомянут в инструкции' },
};

export function CompatCheck({
  audience,
  onAct,
  actLabel,
}: {
  audience: 'doctor' | 'patient';
  /** действие с найденным препаратом: врач — добавить в список, пациент — сообщить врачу */
  onAct?: (r: CompatResult) => void;
  actLabel?: string;
}) {
  const [q, setQ] = useState('');
  const [r, setR] = useState<CompatResult | null>(null);
  const run = () => q.trim().length >= 3 && setR(checkCompatibility(q));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <form
        className="row"
        style={{ gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <input
          className="input"
          aria-label="Название лекарства"
          placeholder={audience === 'doctor' ? 'МНН или торговое название: «золофт», «трамадол»…' : 'Название лекарства, например «Супрастин»'}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setR(null);
          }}
          style={{ minHeight: 38 }}
        />
        <button className="btn btn-soft" type="submit" disabled={q.trim().length < 3}>
          Проверить
        </button>
      </form>
      {r && (
        <div className={`callout small ${TONE[r.level].cls} fade-in`}>
          {TONE[r.level].icon}
          <span className="stack" style={{ gap: 4 }}>
            <span className="strong">
              {TONE[r.level].kicker}
              {r.inn ? ` · ${r.inn}` : ''}
              {r.viaTrade ? ` (по торговому названию «${r.viaTrade}»)` : ''}
            </span>
            <span>{audience === 'doctor' ? r.doctorText : r.patientText}</span>
            {audience === 'doctor' && r.ruleId && <span className="xs muted">Правило {r.ruleId} · источник S4 — инструкция «Авиандр», раздел «Взаимодействие»</span>}
            {onAct && actLabel && r.level !== 'self' && r.level !== 'alcohol' && (
              <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onAct(r)}>
                {actLabel}
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
