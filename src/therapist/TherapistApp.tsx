import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ClipboardList, HeartPulse, ListChecks, Pill, RotateCcw, Stethoscope, Timer, TriangleAlert, Waypoints } from 'lucide-react';
import { useDB } from '../store/db';
import { setSession, useSession } from '../store/session';
import { decideReferral, recordMetric } from '../store/api';
import { checkTherapy, evaluateRouting, EXCLUDE_CHECKLIST, OTHER_FLAGS, RED_FLAGS, ROUTE_CATEGORIES } from '../core/clinical';
import { scoreScale, SCALES } from '../core/scales';
import type { Facts } from '../core/types';
import { fmtDuration } from '../core/time';
import { Logo } from '../ui/Logo';
import { RouteHit, ROUTE_TEXT, Signal, TherapyHit } from '../ui/Signals';
import { toast } from '../ui/Toasts';
import { NO_FACTORS } from '../store/scenarios';
import { PromptButton } from '../ui/Inline';

const STEPS = ['Пациент', 'PHQ-4', 'Что исключить', 'PHQ-9 и GAD-7', 'Красные флаги', 'Маршрут'];
const COMPLAINTS = ['сердцебиение', 'повышенное давление', 'панические приступы', 'постоянное беспокойство', 'сниженное настроение', 'нарушения сна', 'утомляемость', 'боли без явной причины'];

interface Form {
  name: string;
  age: number;
  sex: 'f' | 'm';
  complaints: string[];
  phq4: (number | null)[];
  exclude: string[];
  phq9: number | null;
  item9: number | null;
  gad7: number | null;
  flags: string[];
  pregnant: boolean;
  cardio: boolean;
}

const SCENARIO7: Form = {
  name: 'Виктор Д. (П-052)',
  age: 52,
  sex: 'm',
  complaints: ['сердцебиение', 'повышенное давление', 'панические приступы'],
  phq4: [3, 2, 2, 2],
  exclude: [],
  phq9: 11,
  item9: 0,
  gad7: 14,
  flags: [],
  pregnant: false,
  cardio: true,
};

const EMPTY: Form = { name: 'Новый пациент', age: 40, sex: 'f', complaints: [], phq4: [null, null, null, null], exclude: [], phq9: null, item9: null, gad7: null, flags: [], pregnant: false, cardio: false };

export function TherapistApp() {
  const db = useDB();
  const s = useSession();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(SCENARIO7);
  const [done, setDone] = useState<string | null>(null);
  const t0 = useRef(performance.now());
  const doctor = db.users.find((u) => u.id === 't1')!;
  useEffect(() => {
    if (s.role !== 'therapist') setSession({ role: 'therapist', userId: 't1' });
  }, [s.role]);

  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const phq4Score = f.phq4.every((x) => x !== null) ? scoreScale('PHQ4', f.phq4 as number[]) : null;
  const facts: Facts = useMemo(() => {
    const fx: Facts = {
      'route.byPsychiatrist': false,
      'phq9.total': f.phq9,
      'phq9.item9': f.item9,
      'gad7.total': f.gad7,
      'patient.age': f.age,
      'patient.pregnant': f.pregnant,
      'patient.breastfeeding': false,
      'patient.meds': f.name.startsWith('Виктор') ? ['амлодипин'] : [],
      'diagnosis.code': '',
    };
    for (const k of Object.keys(NO_FACTORS)) if (!(`patient.${k}` in fx)) fx[`patient.${k}`] = (NO_FACTORS as unknown as Record<string, unknown>)[k];
    fx['patient.cardio'] = f.cardio;
    fx['patient.substanceDependence'] = f.flags.includes('substance');
    for (const fl of [...RED_FLAGS, ...OTHER_FLAGS]) fx[`flags.${fl.id}`] = f.flags.includes(fl.id);
    return fx;
  }, [f]);
  const routing = evaluateRouting(facts);
  const drug = checkTherapy({ ...facts, 'diagnosis.code': 'F41.1' });
  const scalesValid = f.phq9 !== null && f.gad7 !== null && f.item9 !== null && f.phq9 <= 27 && f.gad7 <= 21 && f.item9 <= f.phq9;
  const canNext = step === 1 ? phq4Score !== null : step === 3 ? scalesValid : true;

  const decide = (decision: 'confirmed' | 'postponed', comment?: string) => {
    const pid = f.name.startsWith('Виктор') ? 'p7' : undefined;
    const ms = performance.now() - t0.current;
    recordMetric('route_eval', ms, `Терапевт: скрининг за ${fmtDuration(ms)}`);
    if (pid) decideReferral(pid, 't1', decision, comment, facts);
    setDone(decision === 'confirmed' ? 'Направление подтверждено врачом и записано в карточку' : 'Направление отложено с комментарием');
    toast(decision === 'confirmed' ? 'Направление подтверждено' : 'Отложено с комментарием', { tone: 'ok', sub: `Скрининг занял ${fmtDuration(ms)}` });
  };

  return (
    <div className="landing" style={{ maxWidth: 1080 }}>
      <header className="landing-top">
        <Logo sub="Режим «Терапевт» · первичное звено" />
        <div className="row" style={{ gap: 8 }}>
          <span className="user-chip" style={{ padding: '6px 10px' }}>
            <span className="avatar avatar-sm">{doctor.initials}</span>
            <span className="small strong">{doctor.name}</span>
          </span>
          <Link to="/" className="btn btn-ghost btn-sm">
            На главную
          </Link>
        </div>
      </header>

      <div className="stack" style={{ gap: 18 }}>
        <div className="row spread wrap" style={{ gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 'var(--fs-3xl)' }}>Нужно ли направить к психиатру?</h1>
            <p className="ink-2" style={{ marginTop: 6 }}>
              Скрининг → что исключить → шкалы → красные флаги → маршрут с критериями и сроком. Скрининг — не диагноз.
            </p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                setF(SCENARIO7);
                setStep(0);
                setDone(null);
                t0.current = performance.now();
              }}
            >
              Сценарий 7
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setF(EMPTY);
                setStep(0);
                setDone(null);
                t0.current = performance.now();
              }}
            >
              <RotateCcw /> Новый пациент
            </button>
          </div>
        </div>

        <div className="stepper">
          {STEPS.map((st, i) => (
            <button key={st} className={`step-pill ${i === step ? 'is-active' : i < step ? 'is-done' : ''}`} onClick={() => i <= step && setStep(i)} style={{ cursor: i <= step ? 'pointer' : 'default' }}>
              <span className="n">{i < step ? <Check size={13} /> : i + 1}</span>
              {st}
            </button>
          ))}
        </div>

        <div className="card card-pad-lg rise-in" key={step}>
          {step === 0 && (
            <div className="stack" style={{ gap: 16 }}>
              <h3 className="row" style={{ gap: 8 }}>
                <Stethoscope size={20} color="var(--brand)" /> Пациент на приёме у терапевта
              </h3>
              <div className="grid-3">
                <label className="field">
                  <span className="label">Пациент (синтетический)</span>
                  <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} />
                </label>
                <label className="field">
                  <span className="label">Возраст</span>
                  <input className="input" inputMode="numeric" value={f.age} onChange={(e) => set({ age: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                </label>
                <label className="field">
                  <span className="label">Пол</span>
                  <select className="select" value={f.sex} onChange={(e) => set({ sex: e.target.value as 'f' | 'm' })}>
                    <option value="f">женский</option>
                    <option value="m">мужской</option>
                  </select>
                </label>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                <span className="label">Жалобы</span>
                <div className="row wrap" style={{ gap: 8 }}>
                  {COMPLAINTS.map((c) => (
                    <button key={c} className="chip" aria-pressed={f.complaints.includes(c)} onClick={() => set({ complaints: f.complaints.includes(c) ? f.complaints.filter((x) => x !== c) : [...f.complaints, c] })}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="row wrap" style={{ gap: 18 }}>
                <label className="check small">
                  <input type="checkbox" checked={f.cardio} onChange={(e) => set({ cardio: e.target.checked })} /> Сердечно-сосудистые заболевания
                </label>
                {f.sex === 'f' && (
                  <label className="check small">
                    <input type="checkbox" checked={f.pregnant} onChange={(e) => set({ pregnant: e.target.checked })} /> Беременность
                  </label>
                )}
              </div>
              {f.age < 18 && <div className="callout callout-red small">Пациенты младше 18 лет не входят в MVP — нужен подростковый режим с законными представителями.</div>}
            </div>
          )}

          {step === 1 && (
            <div className="stack" style={{ gap: 16 }}>
              <h3 className="row" style={{ gap: 8 }}>
                <ClipboardList size={20} color="var(--brand)" /> PHQ-4 — ультракороткий скрининг
              </h3>
              <p className="small ink-2">{SCALES.PHQ4.intro}</p>
              {SCALES.PHQ4.items!.map((it, i) => (
                <div key={i} className="stack" style={{ gap: 8 }}>
                  <div className="strong small">
                    {i + 1}. {it}
                  </div>
                  <div className="segmented" style={{ alignSelf: 'flex-start', flexWrap: 'wrap' }}>
                    {SCALES.PHQ4.options!.map((o) => (
                      <button key={o.value} aria-pressed={f.phq4[i] === o.value} onClick={() => set({ phq4: f.phq4.map((x, j) => (j === i ? o.value : x)) })}>
                        {o.label} · {o.value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {phq4Score && (
                <Signal
                  variant={phq4Score.positive?.length ? 'warn' : 'ok'}
                  compact
                  kicker={`PHQ-4: ${phq4Score.total} из 12 · ${phq4Score.band}`}
                  title={phq4Score.positive?.length ? `Положительный скрининг: ${phq4Score.positive.map((x) => (x === 'anxiety' ? 'тревога (GAD-2 ≥ 3)' : 'депрессия (PHQ-2 ≥ 3)')).join(', ')} → полные шкалы` : 'Скрининг отрицательный: GAD-2 и PHQ-2 < 3'}
                >
                  GAD-2: {phq4Score.subscores?.anxiety} · PHQ-2: {phq4Score.subscores?.depression}. Источник: {SCALES.PHQ4.source}.
                </Signal>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="stack" style={{ gap: 14 }}>
              <h3 className="row" style={{ gap: 8 }}>
                <ListChecks size={20} color="var(--brand)" /> Что стоит исключить — до психиатрических выводов
              </h3>
              <div className="callout small">
                <HeartPulse />
                <span>У тревоги и депрессии много соматических «масок». Формулировка — «рассмотреть», а не диагноз. Отметьте, что проверено или назначено.</span>
              </div>
              <div className="grid-2" style={{ gap: 8 }}>
                {EXCLUDE_CHECKLIST.items.map((i) => (
                  <label key={i.id} className="check card card-flat" style={{ padding: '12px 14px' }}>
                    <input type="checkbox" checked={f.exclude.includes(i.id)} onChange={(e) => set({ exclude: e.target.checked ? [...f.exclude, i.id] : f.exclude.filter((x) => x !== i.id) })} />
                    <span className="stack" style={{ gap: 2 }}>
                      <span className="xs muted">{i.group}</span>
                      <span className="small">{i.label}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="stack" style={{ gap: 16 }}>
              <h3 className="row" style={{ gap: 8 }}>
                <ClipboardList size={20} color="var(--brand)" /> Полные шкалы
              </h3>
              <p className="small ink-2">Введите суммы по результатам заполнения пациентом (бумага или планшет). Пункт 9 PHQ-9 обрабатывается отдельно.</p>
              <div className="grid-3">
                <label className="field">
                  <span className="label">PHQ-9, сумма (0–27)</span>
                  <input className="input" inputMode="numeric" value={f.phq9 ?? ''} onChange={(e) => set({ phq9: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })} />
                </label>
                <div className="field">
                  <span className="label">PHQ-9, пункт 9 (0–3)</span>
                  <div className="segmented" style={{ alignSelf: 'flex-start' }}>
                    {[0, 1, 2, 3].map((v) => (
                      <button key={v} aria-pressed={f.item9 === v} onClick={() => set({ item9: v })}>
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="field">
                  <span className="label">GAD-7, сумма (0–21)</span>
                  <input className="input" inputMode="numeric" value={f.gad7 ?? ''} onChange={(e) => set({ gad7: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })} />
                </label>
              </div>
              {!scalesValid && f.phq9 !== null && f.gad7 !== null && <div className="callout callout-red small">Проверьте значения: PHQ-9 ≤ 27, GAD-7 ≤ 21, пункт 9 не больше суммы.</div>}
              {scalesValid && (
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className="badge badge-lg badge-outline">
                    PHQ-9 {f.phq9}: {SCALES.PHQ9.bands.find((b) => f.phq9! >= b.min && f.phq9! <= b.max)?.label}
                  </span>
                  <span className="badge badge-lg badge-outline">
                    GAD-7 {f.gad7}: {SCALES.GAD7.bands.find((b) => f.gad7! >= b.min && f.gad7! <= b.max)?.label}
                  </span>
                  {f.item9! > 0 && <span className="badge badge-lg badge-red">Пункт 9 = {f.item9}</span>}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="stack" style={{ gap: 14 }}>
              <h3 className="row" style={{ gap: 8 }}>
                <TriangleAlert size={20} color="var(--red)" /> Красные флаги
              </h3>
              <div className="grid-2" style={{ gap: 8 }}>
                {RED_FLAGS.map((fl) => (
                  <label key={fl.id} className="check card card-flat" style={{ padding: '12px 14px', borderColor: f.flags.includes(fl.id) ? 'var(--red)' : undefined }}>
                    <input type="checkbox" checked={f.flags.includes(fl.id)} onChange={(e) => set({ flags: e.target.checked ? [...f.flags, fl.id] : f.flags.filter((x) => x !== fl.id) })} />
                    <span className="small">{fl.label}</span>
                  </label>
                ))}
              </div>
              <div className="eyebrow" style={{ marginTop: 6 }}>
                Другие основания
              </div>
              <div className="grid-2" style={{ gap: 8 }}>
                {OTHER_FLAGS.map((fl) => (
                  <label key={fl.id} className="check card card-flat" style={{ padding: '12px 14px' }}>
                    <input type="checkbox" checked={f.flags.includes(fl.id)} onChange={(e) => set({ flags: e.target.checked ? [...f.flags, fl.id] : f.flags.filter((x) => x !== fl.id) })} />
                    <span className="small">{fl.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="stack" style={{ gap: 16 }}>
              <h3 className="row" style={{ gap: 8 }}>
                <Waypoints size={20} color="var(--brand)" /> Маршрутизация
              </h3>
              {f.exclude.length < 3 && (
                <div className="callout callout-amber small">
                  <TriangleAlert />
                  <span>Соматические причины проверены не полностью ({f.exclude.length} из {EXCLUDE_CHECKLIST.items.length}). Рекомендуется завершить чек-лист «что исключить».</span>
                </div>
              )}
              {routing.category ? (
                <>
                  <Signal
                    variant={ROUTE_TEXT[routing.category].variant}
                    kicker={`${ROUTE_CATEGORIES[routing.category].label} · ${[...new Set(routing.byCategory[routing.category].map((h) => h.rule.to))].join('; ')}`}
                    meta={routing.byCategory[routing.category][0].rule.term}
                    title={routing.category === 'desirable' ? 'Желательна консультация психиатра' : routing.category === 'urgent' ? 'Экстренная консультация психиатра в тот же день' : 'Обязательная консультация психиатра'}
                  >
                    {routing.category === 'desirable' ? 'Можно отложить с комментарием. ' : 'Нельзя скрыть. '}Направление оформляется только после подтверждения врача.
                  </Signal>
                  <div className="eyebrow">Критерии и источники</div>
                  {(['urgent', 'mandatory', 'desirable'] as const).flatMap((c) => routing.byCategory[c].map((h) => <RouteHit key={h.rule.id} hit={h} compact />))}
                </>
              ) : (
                <Signal variant="ok" kicker="Направление не требуется" title="Критерии «обязательно» и «желательно» не выполнены">
                  Наблюдение у терапевта; повторный скрининг при сохранении жалоб.
                </Signal>
              )}

              <div className="card card-soft card-pad stack" style={{ gap: 10 }}>
                <div className="strong row" style={{ gap: 8 }}>
                  <Pill size={18} color="var(--brand)" /> Если рассматривается «Авиандр» (решение врача)
                </div>
                <div className="xs muted">Показание определяется после установления диагноза специалистом. Ниже — проверка противопоказаний и предостережений по инструкции для этого пациента.</div>
                {drug.stops.map((h) => (
                  <TherapyHit key={h.rule.id} hit={h} compact />
                ))}
                {drug.warns.map((h) => (
                  <TherapyHit key={h.rule.id} hit={h} compact />
                ))}
                {!drug.stops.length && !drug.warns.length && <div className="small ink-2">Противопоказаний и предостережений по введённым данным не найдено.</div>}
              </div>

              {done ? (
                <Signal variant="ok" kicker="Готово" title={done}>
                  Запись в журнале аудита; маршрут виден в карточке пациента.
                </Signal>
              ) : (
                routing.category && (
                  <div className="row wrap" style={{ gap: 8 }}>
                    <button className={`btn btn-lg ${routing.category === 'desirable' ? 'btn-primary' : 'btn-danger'}`} onClick={() => decide('confirmed')}>
                      <Check /> Подтвердить направление
                    </button>
                    {routing.category === 'desirable' && (
                      <PromptButton
                        className="btn btn-lg"
                        label="Отложить с комментарием"
                        placeholder="Почему откладываете направление?"
                        minLength={5}
                        submitLabel="Отложить"
                        onSubmit={(c) => decide('postponed', c)}
                      />
                    )}
                  </div>
                )
              )}
              <div className="row xs muted" style={{ gap: 6 }}>
                <Timer size={14} /> Время скрининга: {fmtDuration(performance.now() - t0.current)} · расчёт маршрута {routing.durationMs.toFixed(1)} мс
              </div>
            </div>
          )}
        </div>

        <div className="row spread">
          <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ArrowLeft /> Назад
          </button>
          {step < STEPS.length - 1 && (
            <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Далее <ArrowRight />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
