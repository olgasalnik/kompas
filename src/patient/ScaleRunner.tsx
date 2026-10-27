import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ClipboardList, HeartPulse, MessageCircleQuestion, ShieldCheck } from 'lucide-react';
import { SCALES } from '../core/scales';
import type { ScaleId } from '../core/types';
import { PATIENT_TEXTS, submitScale } from '../store/api';
import { sourceById } from '../ui/Why';
import { SCALE_TIME, SCALE_TITLE } from './util';

export function ScaleRunner({ patientId }: { patientId: string }) {
  const { scale = 'PHQ9' } = useParams();
  const def = SCALES[scale as ScaleId];
  const nav = useNavigate();
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<(number | null)[]>(() => new Array(def?.items?.length ?? 0).fill(null));
  const [result, setResult] = useState<{ total: number; item9?: number } | null>(null);
  const t0 = useRef(0);

  if (!def?.items || !def.options) return <div className="p-scroll">Опросник не найден</div>;
  const n = def.items.length;
  const src = sourceById(def.source);

  const choose = (v: number) => {
    const next = [...answers];
    next[step] = v;
    setAnswers(next);
    if (step < n - 1) setTimeout(() => setStep(step + 1), 160);
    else {
      const r = submitScale(patientId, def.id, next as number[], performance.now() - t0.current);
      setResult({ total: r.total, item9: def.id === 'PHQ9' ? next[8]! : undefined });
    }
  };

  if (result)
    return (
      <div className="p-scroll fade-in" style={{ paddingTop: 36 }}>
        <div className="stack" style={{ gap: 16, alignItems: 'center', textAlign: 'center' }}>
          <div className="role-icon" style={{ width: 72, height: 72, borderRadius: 24, background: 'var(--mint-soft)', color: 'var(--mint)' }}>
            <Check size={36} />
          </div>
          <h2>Ответы отправлены</h2>
          <div className="card card-pad stack" style={{ gap: 6, width: '100%' }}>
            <div className="small muted">{def.name}</div>
            <div className="stat-value">
              {result.total} <small>из {def.max}</small>
            </div>
            <div className="small ink-2">Это не диагноз. Результат увидит ваш врач и обсудит с вами на приёме.</div>
          </div>
          {result.item9 === 1 && (
            <div className="callout small" style={{ textAlign: 'left' }}>
              <HeartPulse />
              <span>Спасибо, что ответили честно. Ваш врач увидит ответ. Если станет тяжелее — нажмите «Мне тяжело сейчас» на главном экране.</span>
            </div>
          )}
          <div className="callout small" style={{ textAlign: 'left' }}>
            <MessageCircleQuestion />
            <span>{PATIENT_TEXTS.waitForDoctor}</span>
          </div>
          <div className="row wrap" style={{ gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-primary btn-lg" onClick={() => nav('/patient')}>
              На главную
            </button>
            <button className="btn btn-lg" onClick={() => nav('/patient/help')}>
              Спросить помощника
            </button>
          </div>
        </div>
      </div>
    );

  if (step < 0)
    return (
      <>
        <div className="p-header">
          <button className="btn btn-ghost btn-icon" onClick={() => nav(-1)} aria-label="Назад">
            <ArrowLeft />
          </button>
          <span className="strong">{SCALE_TITLE[def.id] ?? def.name}</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="p-scroll stack" style={{ gap: 16 }}>
          <div className="card card-pad-lg stack" style={{ gap: 12 }}>
            <div className="role-icon">
              <ClipboardList />
            </div>
            <h2>
              {def.name}: {def.purpose.toLowerCase()}
            </h2>
            <p className="ink-2">{def.intro}</p>
            <div className="badge badge-brand badge-lg">{SCALE_TIME[def.id]}</div>
            <ul className="bullets small">
              <li>Один вопрос на экране, можно вернуться назад</li>
              <li>Нет правильных или неправильных ответов</li>
              <li>Ответы попадут в вашу карточку у лечащего врача</li>
            </ul>
          </div>
          <div className="row xs muted" style={{ gap: 6 }}>
            <ShieldCheck size={14} /> Русскоязычная версия: {src?.org.split(';')[0]}
          </div>
          <button
            className="btn btn-primary btn-xl btn-block"
            onClick={() => {
              t0.current = performance.now();
              setStep(0);
            }}
          >
            Начать
          </button>
        </div>
      </>
    );

  return (
    <>
      <div className="p-header">
        <button className="btn btn-ghost btn-icon" onClick={() => (step === 0 ? setStep(-1) : setStep(step - 1))} aria-label="Назад">
          <ArrowLeft />
        </button>
        <span className="small strong">
          Вопрос {step + 1} из {n}
        </span>
        <span className="xs muted">{def.name}</span>
      </div>
      <div className="p-scroll stack" style={{ gap: 18 }}>
        <div className="progress">
          <span style={{ width: `${(step / n) * 100}%` }} />
        </div>
        <div className="small muted">{def.intro}</div>
        <h3 key={step} className="rise-in" style={{ fontSize: 21, lineHeight: 1.35 }}>
          {def.items[step]}
        </h3>
        <div className="scale-step">
          {def.options.map((o) => (
            <button key={o.value} className="answer-btn" aria-pressed={answers[step] === o.value} onClick={() => choose(o.value)}>
              {o.label}
              <span className="num">{o.value}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
