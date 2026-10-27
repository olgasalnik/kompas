import { useState, type Dispatch, type SetStateAction } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Check, Mic } from 'lucide-react';
import { useDB } from '../store/db';
import { savePrevisit } from '../store/api';
import { fmtDate, fmtDateTime, fmtTime } from '../core/time';
import { joinDictated } from '../core/speech';
import { toast } from '../ui/Toasts';
import { DictateButton } from '../ui/Dictate';

function VoiceField({ id, label, value, set, placeholder }: { id: string; label: string; value: string; set: Dispatch<SetStateAction<string>>; placeholder: string }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="field-with-mic">
        <textarea id={id} className="textarea" value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} />
        <DictateButton label={`Надиктовать: ${label.toLowerCase()}`} place="below" onText={(t) => set((prev) => joinDictated(prev, t))} />
      </div>
    </div>
  );
}

/** «К приёму»: заключение со слов пациента — врач видит его в превью перед визитом */
export function PrevisitPage({ patientId }: { patientId: string }) {
  const db = useDB();
  const nav = useNavigate();
  const p = db.patients.find((x) => x.id === patientId)!;
  const [concerns, setConcerns] = useState(p.previsit?.concerns ?? '');
  const [changes, setChanges] = useState(p.previsit?.changes ?? '');
  const [questions, setQuestions] = useState(p.previsit?.questions ?? '');
  const ok = (concerns + changes + questions).trim().length >= 5;
  return (
    <>
      <div className="p-header">
        <button className="btn btn-ghost btn-icon" onClick={() => nav(-1)} aria-label="Назад">
          <ArrowLeft />
        </button>
        <span className="strong">К приёму</span>
        <span style={{ width: 40 }} />
      </div>
      <div className="p-scroll stack" style={{ gap: 14 }}>
        <div className="callout small">
          <CalendarClock />
          <span>
            {p.nextVisitAt ? `Приём ${fmtDate(p.nextVisitAt)} в ${fmtTime(p.nextVisitAt)}. ` : ''}Напишите заранее своими словами — врач прочитает перед приёмом и успеет подготовиться.
          </span>
        </div>
        <div className="xs muted row" style={{ gap: 6 }}>
          <Mic size={13} /> Можно не печатать: нажмите на микрофон и расскажите своими словами
        </div>
        <VoiceField id="pv-concerns" label="Что беспокоит сейчас" value={concerns} set={setConcerns} placeholder="Например: тревога по утрам, трудно сосредоточиться на работе" />
        <VoiceField id="pv-changes" label="Что изменилось с прошлого приёма" value={changes} set={setChanges} placeholder="Сон, самочувствие, события, другие лекарства" />
        <VoiceField id="pv-questions" label="Вопросы врачу" value={questions} set={setQuestions} placeholder="Что хотите обсудить" />
        <button
          className="btn btn-primary btn-xl btn-block"
          disabled={!ok}
          onClick={() => {
            savePrevisit(patientId, { concerns: concerns.trim(), changes: changes.trim(), questions: questions.trim() });
            toast('Отправлено врачу', { tone: 'ok', sub: 'Врач увидит это перед приёмом' });
            nav('/patient');
          }}
        >
          <Check /> Отправить врачу
        </button>
        {p.previsit && <div className="xs muted center">Последний раз отправлено {fmtDateTime(p.previsit.at)}</div>}
      </div>
    </>
  );
}
