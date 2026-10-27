import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, KeyRound, Scale, ShieldCheck, Stethoscope, X } from 'lucide-react';
import { useDB } from '../store/db';
import { setSession } from '../store/session';
import { completeOnboarding, findInvite } from '../store/api';
import type { Patient, TrustedContact } from '../core/types';
import { CompassMark } from '../ui/Logo';
import { CONSENT_TEXT, REFUSAL_TEXT } from './Profile';
import { SCOPE_TEXT, TrustedForm } from './Trusted';
import { toast } from '../ui/Toasts';

export function PatientLogin() {
  const db = useDB();
  const [code, setCode] = useState('');
  const nav = useNavigate();
  const demo =db.patients.filter((p) => p.scenario && p.scenario !== 7);
  const enter = () => {
    const p = findInvite(code);
    if (!p) return toast('Код не найден', { sub: 'Проверьте код из приглашения врача' });
    setSession({ role: 'patient', patientId: p.id });
  };
  return (
    <div className="p-scroll stack" style={{ gap: 18, paddingTop: 34 }}>
      <div className="stack center" style={{ gap: 10, alignItems: 'center' }}>
        <CompassMark size={60} />
        <h2>Я пациент</h2>
        <p className="ink-2 small" style={{ maxWidth: 300 }}>
          Компас — помощник между приёмами у врача. Подключение — только по приглашению вашего лечащего врача.
        </p>
      </div>
      <div className="card card-pad stack" style={{ gap: 10 }}>
        <label className="label" htmlFor="code">
          Код приглашения
        </label>
        <div className="row" style={{ gap: 8 }}>
          <div className="grow" style={{ position: 'relative' }}>
            <KeyRound size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--ink-3)' }} />
            <input id="code" className="input" style={{ paddingLeft: 36 }} placeholder="KMP-0000" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && enter()} />
          </div>
          <button className="btn btn-primary" onClick={enter}>
            Войти
          </button>
        </div>
        <div className="xs muted">Врач выдаёт код или QR-код на приёме</div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="eyebrow" style={{ margin: '0 4px' }}>
          Демо: войти как пациент сценария
        </div>
        {demo.map((p) => (
          <button key={p.id} className="card card-interactive row" style={{ padding: '12px 14px', gap: 12, textAlign: 'left', border: '1px solid var(--border)' }} onClick={() => setSession({ role: 'patient', patientId: p.id })}>
            <div className="avatar avatar-sm">{p.name.slice(0, 1)}</div>
            <div className="grow">
              <div className="strong small">
                {p.name}, {p.age}
              </div>
              <div className="xs muted">Сценарий {p.scenario} · код {p.inviteCode}</div>
            </div>
            <ArrowRight size={16} color="var(--ink-3)" />
          </button>
        ))}
      </div>
      <button
        className="btn btn-ghost btn-block"
        onClick={() => {
          setSession({ role: 'doctor', userId: 'd1' });
          nav('/doctor');
        }}
      >
        <Stethoscope /> Я врач — войти в кабинет врача
      </button>
    </div>
  );
}

const CHANNELS: { v: Patient['reminderChannel']; label: string }[] = [
  { v: 'push', label: 'Push' },
  { v: 'sms', label: 'SMS' },
  { v: 'email', label: 'Почта' },
  { v: 'max', label: 'MAX' },
  { v: 'vk', label: 'VK' },
  { v: 'telegram', label: 'Telegram' },
];

export function Onboarding({ patient }: { patient: Patient }) {
  const db = useDB();
  const doctor = db.users.find((u) => u.id === patient.doctorId);
  const [step, setStep] = useState(0);
  const [consents, setConsents] = useState<string[]>(['treatment', 'health_data', 'reminders']);
  const [channel, setChannel] = useState<Patient['reminderChannel']>('push');
  const [trusted, setTrusted] = useState<TrustedContact | null>(null);
  const required = ['treatment', 'health_data'];
  const ok = required.every((r) => consents.includes(r));
  return (
    <div className="p-scroll stack" style={{ gap: 16, paddingTop: 26 }}>
      <div className="stepper">
        {['Знакомство', 'Согласия', 'Напоминания'].map((s, i) => (
          <span key={s} className={`step-pill ${i === step ? 'is-active' : i < step ? 'is-done' : ''}`}>
            <span className="n">{i < step ? <Check size={13} /> : i + 1}</span>
            {s}
          </span>
        ))}
      </div>
      {step === 0 && (
        <div className="stack" style={{ gap: 14 }}>
          <h2>Здравствуйте, {patient.name.split(' ')[0]}!</h2>
          <p className="ink-2">
            Вас пригласил(а) {doctor?.name}, {doctor?.title.toLowerCase()}. Ваши записи будут попадать прямо в вашу карточку у врача.
          </p>
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div className="strong row" style={{ gap: 8 }}>
              <Check size={18} color="var(--mint)" /> Что умеет Компас
            </div>
            <ul className="bullets small">
              <li>Напоминает о приёме и записи самочувствия — за минуту</li>
              <li>Отвечает на вопросы о вашем препарате по инструкции</li>
              <li>Передаёт врачу важное и помогает, когда тяжело</li>
            </ul>
            <div className="strong row" style={{ gap: 8, marginTop: 6 }}>
              <X size={18} color="var(--red)" /> Чем он не является
            </div>
            <ul className="bullets small">
              <li>Не врач: не ставит диагноз и не меняет лечение</li>
              <li>Не служба экстренной помощи — в опасности звоните 112</li>
              <li>Не передаёт ваши данные фармкомпании или в мессенджеры</li>
            </ul>
          </div>
          <button className="btn btn-primary btn-xl btn-block" onClick={() => setStep(1)}>
            Продолжить
          </button>
        </div>
      )}
      {step === 1 && (
        <div className="stack" style={{ gap: 12 }}>
          <h2>Информированное добровольное согласие</h2>
          <p className="small ink-2">Согласия даются отдельно по каждой цели. Любое можно отозвать в профиле.</p>
          {(Object.keys(CONSENT_TEXT) as (keyof typeof CONSENT_TEXT)[]).map((k) => (
            <div key={k} className="card card-pad stack" style={{ padding: 14, gap: 10 }}>
              <label className="check">
                <input type="checkbox" checked={consents.includes(k)} onChange={(e) => setConsents((xs) => (e.target.checked ? [...xs, k] : xs.filter((x) => x !== k)))} />
                <span className="stack" style={{ gap: 2 }}>
                  <span className="strong small">
                    {CONSENT_TEXT[k].title} {CONSENT_TEXT[k].required && <span className="badge" style={{ height: 18 }}>обязательно</span>}
                  </span>
                  <span className="xs muted">{CONSENT_TEXT[k].text}</span>
                </span>
              </label>
              {k === 'trusted_person' && consents.includes('trusted_person') && (
                <div className="fade-in" style={{ paddingLeft: 28 }}>
                  {trusted ? (
                    <div className="row spread small" style={{ gap: 8 }}>
                      <span>
                        <b>{trusted.name}</b> · {trusted.relation}
                        <span className="xs muted"> · {SCOPE_TEXT[trusted.scope]}</span>
                      </span>
                      <button className="btn btn-sm btn-ghost" onClick={() => setTrusted(null)}>
                        Изменить
                      </button>
                    </div>
                  ) : (
                    <TrustedForm initial={null} saveLabel="Указать" onSave={setTrusted} />
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="callout small">
            <Scale />
            <span>{REFUSAL_TEXT}</span>
          </div>
          <button className="btn btn-primary btn-xl btn-block" disabled={!ok || (consents.includes('trusted_person') && !trusted)} onClick={() => setStep(2)}>
            Подписать и продолжить
          </button>
          {consents.includes('trusted_person') && !trusted && <div className="xs muted center">Укажите доверенное лицо или снимите отметку</div>}
        </div>
      )}
      {step === 2 && (
        <div className="stack" style={{ gap: 14 }}>
          <h2>Куда присылать напоминания?</h2>
          <p className="small ink-2">Напоминания — без медицинских подробностей. Основной канал — это приложение.</p>
          <div className="row wrap" style={{ gap: 8 }}>
            {CHANNELS.map((c) => (
              <button key={c.v} className="chip" aria-pressed={channel === c.v} onClick={() => setChannel(c.v)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="callout small">
            <ShieldCheck />
            <span>Пример: «Компас: время сделать короткую запись». Ни названия болезни, ни препарата.</span>
          </div>
          <button
            className="btn btn-primary btn-xl btn-block"
            onClick={() => {
              completeOnboarding(patient.id, consents, channel, consents.includes('trusted_person') ? trusted : null);
              toast('Готово! Вы подключены к врачу', { tone: 'ok' });
            }}
          >
            Начать пользоваться
          </button>
        </div>
      )}
    </div>
  );
}
