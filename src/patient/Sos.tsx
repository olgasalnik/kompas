import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPinned, Phone, ShieldCheck, Siren, Volume2 } from 'lucide-react';
import { sosAction, sosAnswer, sosOpen, confirmSafe } from '../store/api';
import { EmergencyInfo } from './HelpCenters';

const PHASES = [
  { label: 'Вдох', ms: 4000, scale: 1.25 },
  { label: 'Пауза', ms: 2000, scale: 1.25 },
  { label: 'Выдох', ms: 6000, scale: 0.8 },
];

export function SosPage({ patientId }: { patientId: string }) {
  const nav = useNavigate();
  const sosId = useRef<string | null>(null);
  const [phase, setPhase] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [safe, setSafe] = useState<boolean | null>(null);
  const [calling, setCalling] = useState<string | null>(null);

  useEffect(() => {
    if (!sosId.current) sosId.current = sosOpen(patientId);
  }, [patientId]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPhase((p) => (p + 1) % PHASES.length);
      if (phase === PHASES.length - 1) setCycles((c) => c + 1);
    }, PHASES[phase].ms);
    return () => clearTimeout(t);
  }, [phase]);

  const answer = (v: boolean) => {
    setSafe(v);
    if (sosId.current) sosAnswer(patientId, sosId.current, v);
    if (v) confirmSafe(patientId);
  };

  const call = (who: 'call_doctor' | 'call_112') => {
    sosAction(patientId, who);
    setCalling(who === 'call_112' ? '112' : 'врачу');
  };

  return (
    <div className="sos-screen">
      <div className="row spread">
        <button className="btn btn-ghost btn-icon" onClick={() => nav('/patient')} aria-label="Назад">
          <ArrowLeft />
        </button>
        <span className="small muted">Экран поддержки</span>
        <span style={{ width: 40 }} />
      </div>
      <div className="stack center" style={{ gap: 8, marginTop: 8 }}>
        <h2 style={{ fontSize: 24 }}>Вам сейчас тяжело, и это можно пережить</h2>
        <p className="ink-2">Давайте вместе замедлим дыхание. Следите за кругом.</p>
      </div>
      <div className="breath">
        <div className="breath-ring" style={{ transform: `scale(${PHASES[phase].scale})`, transitionDuration: `${PHASES[phase].ms}ms` }} />
        <div className="breath-core">
          {PHASES[phase].label}
          <div className="xs muted" style={{ fontWeight: 500, fontFamily: 'var(--font-body)' }}>
            {PHASES[phase].ms / 1000} с
          </div>
        </div>
      </div>
      <div className="row xs muted" style={{ gap: 6, justifyContent: 'center' }}>
        <Volume2 size={14} /> Голосовое сопровождение записывает живой специалист · циклов: {cycles}
      </div>

      <div className="card card-pad stack" style={{ gap: 12, marginTop: 18 }}>
        {safe === null && (
          <>
            <div className="strong">Вы сейчас в безопасности?</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <button className="btn btn-success btn-lg" onClick={() => answer(true)}>
                Да
              </button>
              <button className="btn btn-outline-danger btn-lg" onClick={() => answer(false)}>
                Нет
              </button>
            </div>
          </>
        )}
        {safe === true && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row strong" style={{ gap: 8, color: 'var(--mint-ink)' }}>
              <ShieldCheck size={18} /> Хорошо, что вы в безопасности
            </div>
            <p className="small ink-2">Продолжайте дышать в своём темпе. Если станет хуже, кнопки помощи ниже всегда доступны.</p>
          </div>
        )}
        {safe === false && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="strong" style={{ color: 'var(--red-ink)' }}>
              Спасибо, что сказали. Ваш врач уже уведомлён.
            </div>
            <p className="small ink-2">Если вы в опасности прямо сейчас — позвоните 112.</p>
          </div>
        )}
        <button className={`btn btn-xl btn-block ${safe === false ? 'btn-danger' : 'btn-outline-danger'}`} onClick={() => call('call_112')}>
          <Siren /> Позвонить 112
        </button>
        <button className="btn btn-lg btn-block" onClick={() => call('call_doctor')}>
          <Phone /> Позвонить врачу
        </button>
        {calling && <div className="callout small">В демонстрации звонок не совершается. В приложении откроется набор номера ({calling}); экстренные номера настраивает клиника под регион.</div>}
        <button className="btn btn-soft btn-block" onClick={() => nav('/patient/centers')}>
          <MapPinned /> Куда ещё обратиться
        </button>
        <div className="xs muted">Упражнение не заменяет экстренную помощь.</div>
      </div>
      <div style={{ marginTop: 14 }}>
        <EmergencyInfo compact />
      </div>
    </div>
  );
}
