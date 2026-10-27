import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpenCheck, ChevronDown, MapPinned, Search, Send } from 'lucide-react';
import { PACK_ANSWERS, answerQuestion } from '../core/text';
import { reportMed, sendPatientMessage } from '../store/api';
import { CompatCheck } from '../ui/CompatCheck';
import { toast } from '../ui/Toasts';
import { DictateButton } from '../ui/Dictate';
import { joinDictated } from '../core/speech';
import { EmergencyInfo } from './HelpCenters';
import { BotFeed } from './Bot';

export function HelpPage({ patientId }: { patientId: string }) {
  const nav = useNavigate();
  const [open, setOpen] = useState<string | null>('missed');
  const [q, setQ] = useState('');
  const [voice, setVoice] = useState(false);
  const preview = q.trim().length > 3 ? answerQuestion(q) : null;
  const send = () => {
    const r = sendPatientMessage(patientId, q.trim(), { voice });
    setVoice(false);
    if (r.crisis) toast('Ваш врач уведомлён', { tone: 'red', sub: 'Откроется экран поддержки' });
    else if (r.handoff) toast('Вопрос передан врачу', { sub: 'Ответ появится в чате' });
    setQ('');
    nav('/patient/chat');
  };
  return (
    <>
      <div className="p-header">
        <div className="stack" style={{ gap: 2 }}>
          <span className="p-title">Помощник</span>
          <span className="small muted">Чат-бот: напоминает о приёме, поддерживает и отвечает по инструкции — остальное передаёт врачу</span>
        </div>
      </div>
      <div className="p-scroll stack" style={{ gap: 14 }}>
        <BotFeed patientId={patientId} />
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <label className="label" htmlFor="ask">
            Спросите своими словами
          </label>
          <div className="row" style={{ gap: 8 }}>
            <div className="grow" style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--ink-3)' }} />
              <input id="ask" className="input" style={{ paddingLeft: 36 }} placeholder="Например: можно ли с лекарством от простуды?" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <DictateButton
              label="Спросить голосом"
              place="below"
              onText={(t) => {
                setQ((prev) => joinDictated(prev, t));
                setVoice(true);
              }}
            />
          </div>
          {preview && (
            <div className="stack fade-in" style={{ gap: 8 }}>
              {preview.crisis.crisis || preview.crisis.psychosis ? (
                <div className="callout callout-red small">Похоже, вам сейчас очень тяжело. Отправьте сообщение — врач будет уведомлён сразу, и откроется экран поддержки.</div>
              ) : preview.answer ? (
                <div className="bubble bubble-system" style={{ maxWidth: 'none' }}>
                  {preview.answer.answer}
                  <div className="bubble-src">
                    <BookOpenCheck /> Инструкция «Авиандр» · {preview.answer.section}
                  </div>
                </div>
              ) : (
                <div className="callout small">Этого нет в проверенных материалах, поэтому я не буду гадать. Можно передать вопрос врачу.</div>
              )}
              <button className="btn btn-primary btn-block" onClick={send}>
                <Send /> Отправить врачу
              </button>
            </div>
          )}
        </div>

        <div className="card card-pad stack" style={{ gap: 8 }} id="compat">
          <span className="strong">Можно ли вместе с другим лекарством?</span>
          <span className="xs muted">Введите название — помощник сверит его с инструкцией вашего препарата.</span>
          <CompatCheck
            audience="patient"
            actLabel="Сообщить врачу об этом лекарстве"
            onAct={(r) => {
              reportMed(patientId, (r.inn ?? r.query).toLowerCase(), 'Сообщено через проверку совместимости');
              toast('Врач увидит новое лекарство в карточке', { tone: 'ok' });
            }}
          />
        </div>

        <div className="eyebrow" style={{ margin: '6px 4px 0' }}>
          Частые вопросы
        </div>
        {PACK_ANSWERS.map((a) => (
          <div key={a.id} className="card">
            <button className="row spread" style={{ width: '100%', padding: '14px 16px', border: 0, background: 'none', textAlign: 'left', fontWeight: 650 }} onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
              {a.title}
              <ChevronDown size={18} style={{ transform: open === a.id ? 'rotate(180deg)' : undefined, transition: 'transform .2s', color: 'var(--ink-3)', flex: 'none' }} />
            </button>
            {open === a.id && (
              <div className="stack fade-in" style={{ gap: 8, padding: '0 16px 14px' }}>
                <p className="ink-2" style={{ fontSize: 'var(--fs-md)' }}>
                  {a.answer}
                </p>
                <div className="bubble-src">
                  <BookOpenCheck /> Источник: инструкция «Авиандр» (ГРЛС), раздел «{a.section}»
                </div>
              </div>
            )}
          </div>
        ))}
        <EmergencyInfo compact />
        <Link to="/patient/centers" className="btn btn-soft btn-block">
          <MapPinned /> Куда обратиться, если нужна другая помощь
        </Link>
        <div className="xs muted center" style={{ padding: '0 10px' }}>
          Помощник не заменяет врача. Если ответа нет в проверенных материалах, вопрос передаётся вашему лечащему врачу.
        </div>
      </div>
    </>
  );
}
