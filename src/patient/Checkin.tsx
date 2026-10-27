import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Annoyed, ArrowLeft, Check, Frown, Laugh, Meh, MessageCircleQuestion, Pill, Smile, Timer, TriangleAlert } from 'lucide-react';
import type { SleepQuality } from '../core/types';
import { PATIENT_TEXTS, submitCheckin, type CheckinInput } from '../store/api';
import { toast } from '../ui/Toasts';
import { DictateButton } from '../ui/Dictate';
import { joinDictated } from '../core/speech';

const MOODS = [
  { v: 1, label: 'Очень плохо', icon: <Frown /> },
  { v: 3, label: 'Плохо', icon: <Annoyed /> },
  { v: 5, label: 'Так себе', icon: <Meh /> },
  { v: 7, label: 'Хорошо', icon: <Smile /> },
  { v: 9, label: 'Отлично', icon: <Laugh /> },
];
const ANX = [
  { v: 0, label: 'Нет' },
  { v: 3, label: 'Слабая' },
  { v: 5, label: 'Средняя' },
  { v: 7, label: 'Сильная' },
  { v: 9, label: 'Очень' },
];
const SLEEP: { v: SleepQuality; label: string }[] = [
  { v: 'good', label: 'Хорошо' },
  { v: 'ok', label: 'Нормально' },
  { v: 'bad', label: 'Плохо' },
  { v: 'none', label: 'Почти не спал(а)' },
];
// Если сон плохой — уточняем, что именно (врачу важна разница между трудным засыпанием и ранними пробуждениями)
const SLEEP_DETAIL = ['долго не мог(ла) уснуть', 'просыпался(ась) ночью', 'проснулся(ась) слишком рано', 'мешали тревожные мысли', 'тяжёлые сны', 'днём клонит в сон'];
const SLEEP_HOURS: { v: NonNullable<CheckinInput['sleepHours']>; label: string }[] = [
  { v: '<4', label: 'меньше 4 ч' },
  { v: '4-6', label: '4–6 ч' },
  { v: '6-8', label: '6–8 ч' },
  { v: '>8', label: 'больше 8 ч' },
];
// Перечень — из раздела «Побочное действие» инструкции (частые и нечастые реакции)
const AE = ['сонливость', 'головная боль', 'головокружение', 'слабость', 'тошнота', 'бессонница', 'усиление тревоги'];
const SEVERE = ['судороги', 'обморок', 'тяжёлая аллергическая реакция'];

export function CheckinPage({ patientId }: { patientId: string }) {
  const nav = useNavigate();
  const t0 = useRef(performance.now());
  const taps = useRef(0);
  const [mood, setMood] = useState<number | null>(null);
  const [anx, setAnx] = useState<number | null>(null);
  const [sleep, setSleep] = useState<SleepQuality | null>(null);
  const [sleepDetail, setSleepDetail] = useState<string[]>([]);
  const [sleepHours, setSleepHours] = useState<CheckinInput['sleepHours']>(undefined);
  const badSleep = sleep === 'bad' || sleep === 'none';
  const [ae, setAe] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [done, setDone] = useState<{ ms: number; taps: number; alerts: number } | null>(null);

  const tap = <T,>(fn: (v: T) => void) => (v: T) => {
    taps.current++;
    fn(v);
  };
  const toggleAe = tap((term: string) => setAe((xs) => (xs.includes(term) ? xs.filter((x) => x !== term) : [...xs, term])));
  const ready = mood !== null && anx !== null && sleep !== null;

  const submit = () => {
    taps.current++;
    const ms = performance.now() - t0.current;
    const alerts = submitCheckin(patientId, {
      mood: mood!,
      anxiety: anx!,
      sleep: sleep!,
      sleepDetail: badSleep ? sleepDetail : undefined,
      sleepHours: badSleep ? sleepHours : undefined,
      sideEffects: ae,
      note: note.trim(),
      taps: taps.current,
      durationMs: Math.round(ms),
    });
    setDone({ ms, taps: taps.current, alerts: alerts.length });
    if (alerts.some((a) => a.level === 'orange')) toast('Врач уведомлён', { sub: 'Он посмотрит запись и при необходимости свяжется с вами' });
  };

  if (done)
    return (
      <div className="p-scroll fade-in" style={{ paddingTop: 40 }}>
        <div className="stack center" style={{ gap: 14, alignItems: 'center' }}>
          <div className="role-icon" style={{ width: 72, height: 72, borderRadius: 24, background: 'var(--mint-soft)', color: 'var(--mint)' }}>
            <Check size={36} />
          </div>
          <h2>Спасибо!</h2>
          <p className="ink-2">Запись отправлена в вашу карточку у врача.</p>
          <div className="badge badge-brand badge-lg">
            <Timer /> {(done.ms / 1000).toFixed(0)} с · {done.taps} нажатий
          </div>
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

  return (
    <>
      <div className="p-header">
        <button className="btn btn-ghost btn-icon" onClick={() => nav(-1)} aria-label="Назад">
          <ArrowLeft />
        </button>
        <span className="strong">Запись за сегодня</span>
        <span className="badge badge-outline">
          <Timer /> ≤ 1 мин
        </span>
      </div>
      <div className="p-scroll stack" style={{ gap: 20 }}>
        <section className="stack" style={{ gap: 10 }}>
          <div className="strong">Как настроение?</div>
          <div className="face-row">
            {MOODS.map((m) => (
              <button key={m.v} className="face-btn" aria-pressed={mood === m.v} onClick={() => tap(setMood)(m.v)}>
                <span className="face" style={{ color: mood === m.v ? 'var(--brand)' : 'var(--ink-3)' }}>
                  {m.icon}
                </span>
                {m.label}
              </button>
            ))}
          </div>
        </section>
        <section className="stack" style={{ gap: 10 }}>
          <div className="strong">Насколько сильна тревога?</div>
          <div className="face-row">
            {ANX.map((a) => (
              <button key={a.v} className="face-btn" aria-pressed={anx === a.v} onClick={() => tap(setAnx)(a.v)} style={{ padding: '12px 2px', fontSize: 12 }}>
                {a.label}
              </button>
            ))}
          </div>
        </section>
        <section className="stack" style={{ gap: 10 }}>
          <div className="strong">Как спали?</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {SLEEP.map((s) => (
              <button key={s.v} className="chip" aria-pressed={sleep === s.v} onClick={() => tap(setSleep)(s.v)}>
                {s.label}
              </button>
            ))}
          </div>
          {badSleep && (
            <div className="card card-soft stack fade-in" style={{ gap: 8, padding: 12 }}>
              <div className="small strong">Что мешало? Это поможет врачу</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {SLEEP_DETAIL.map((d) => (
                  <button key={d} className="chip" style={{ minHeight: 32, fontSize: 13 }} aria-pressed={sleepDetail.includes(d)} onClick={() => setSleepDetail((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d]))}>
                    {d}
                  </button>
                ))}
              </div>
              <div className="small strong">Сколько примерно спали</div>
              <div className="row wrap" style={{ gap: 6 }}>
                {SLEEP_HOURS.map((h) => (
                  <button key={h.v} className="chip" style={{ minHeight: 32, fontSize: 13 }} aria-pressed={sleepHours === h.v} onClick={() => setSleepHours(h.v)}>
                    {h.label}
                  </button>
                ))}
              </div>
              <div className="xs muted">Необязательно. Если плохой сон 3 ночи подряд — врач получит сигнал.</div>
            </div>
          )}
        </section>
        <section className="stack" style={{ gap: 10 }}>
          <div className="row spread">
            <div className="strong">Необычные ощущения</div>
            <span className="xs muted">если были</span>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {AE.map((t) => (
              <button key={t} className="chip" aria-pressed={ae.includes(t)} onClick={() => toggleAe(t)}>
                {t}
              </button>
            ))}
          </div>
          {!showMore ? (
            <button className="link-btn small" onClick={() => setShowMore(true)}>
              Ещё: судороги, обморок, отёк…
            </button>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                {SEVERE.map((t) => (
                  <button key={t} className="chip" aria-pressed={ae.includes(t)} onClick={() => toggleAe(t)}>
                    {t}
                  </button>
                ))}
              </div>
              {ae.some((t) => SEVERE.includes(t)) && (
                <div className="callout callout-red small">
                  <TriangleAlert />
                  <span>Если это происходит сейчас — позвоните 112. Врач будет уведомлён сразу после отправки.</span>
                </div>
              )}
            </div>
          )}
        </section>
        <section className="stack" style={{ gap: 8 }}>
          <div className="row spread">
            <div className="strong">Заметка для врача</div>
            <span className="xs muted">необязательно</span>
          </div>
          <div className="field-with-mic">
            <textarea className="textarea" placeholder="Что важно рассказать врачу? Можно надиктовать голосом" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 80 }} />
            <DictateButton label="Надиктовать заметку" onText={(t) => setNote((prev) => joinDictated(prev, t))} />
          </div>
          <div className="row xs muted" style={{ gap: 6 }}>
            <Pill size={13} /> Новое лекарство можно добавить в «Профиль → Мои лекарства»
          </div>
        </section>
        <button className="btn btn-primary btn-xl btn-block" disabled={!ready} onClick={submit}>
          Отправить врачу
        </button>
        <div className="xs muted center">Нажатий: {taps.current} · запись увидит только ваш лечащий врач</div>
      </div>
    </>
  );
}
