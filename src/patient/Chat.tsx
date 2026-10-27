import { useEffect, useRef, useState } from 'react';
import { BookOpenCheck, Clock, Lock, Send, ShieldAlert } from 'lucide-react';
import { useDB, standNow } from '../store/db';
import { markPatientRead, sendPatientMessage } from '../store/api';
import { fmtDate, fmtTime } from '../core/time';
import { replyText } from '../core/schedule';
import { toast } from '../ui/Toasts';
import { DictateButton } from '../ui/Dictate';
import { VoiceBubble, VoiceRecorder } from '../ui/VoiceRecorder';
import { joinDictated } from '../core/speech';

const QUICK = ['Пропустил(а) приём, что делать?', 'Можно ли с лекарством от простуды?', 'Клонит в сон после таблетки', 'Можно ли бокал вина?'];

export function ChatPage({ patientId }: { patientId: string }) {
  const db = useDB();
  const now = standNow(db);
  const p = db.patients.find((x) => x.id === patientId)!;
  const doctor = db.users.find((u) => u.id === p.doctorId);
  const msgs = db.messages.filter((m) => m.patientId === patientId).sort((a, b) => a.at.localeCompare(b.at));
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const reply = doctor ? replyText(doctor.schedule, now) : '';
  // Статус сообщения пациента: отвечено, если после него есть ответ врача; иначе просмотрено/доставлено
  const answeredUpTo = [...msgs].reverse().find((m) => m.from === 'doctor')?.at ?? '';
  const status = (m: (typeof msgs)[number]) => (m.at < answeredUpTo ? 'Врач ответил' : m.readByDoctor ? 'Просмотрено врачом' : 'Доставлено');

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
    markPatientRead(patientId);
  }, [msgs.length, patientId]);

  const [voice, setVoice] = useState(false);
  const [recording, setRecording] = useState(false);
  const send = (t: string, viaVoice = false) => {
    const v = t.trim();
    if (!v) return;
    const r = sendPatientMessage(patientId, v, { voice: viaVoice });
    setText('');
    setVoice(false);
    if (r.alerts.some((a) => a.level !== 'yellow') && !r.crisis) toast('Врач уведомлён');
  };

  let lastDay = '';
  return (
    <>
      <div className="p-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="avatar avatar-sm">{doctor?.initials}</div>
          <div>
            <div className="strong small">{doctor?.name}</div>
            <div className="xs muted row" style={{ gap: 4 }}>
              <Clock size={12} />
              {reply}
            </div>
          </div>
        </div>
        <span className="badge badge-outline" title="Сообщения видит только ваш лечащий врач">
          <Lock /> Защищено
        </span>
      </div>
      <div className="p-scroll" style={{ paddingTop: 14, paddingBottom: 190 }}>
        <div className="chat">
          <div className="callout small" style={{ marginBottom: 6 }}>
            <ShieldAlert />
            <span>
              На вопросы о препарате сначала отвечает справка — только по инструкции, с источником. Если ответа нет, вопрос сразу передаётся врачу. Это не служба экстренной помощи: в опасности звоните 112.
            </span>
          </div>
          {msgs.map((m) => {
            const day = fmtDate(m.at);
            const sep = day !== lastDay;
            lastDay = day;
            const cls =
              m.from === 'patient' ? 'bubble-me' : m.from === 'doctor' ? 'bubble-them' : m.kind === 'safe_template' ? 'bubble-safe' : 'bubble-system';
            return (
              <div key={m.id} style={{ display: 'contents' }}>
                {sep && <div className="xs muted center" style={{ margin: '6px 0' }}>{day}</div>}
                <div className={`bubble ${cls}`}>
                  {m.from === 'system' && m.kind !== 'safe_template' && <div className="xs strong" style={{ color: 'var(--brand-ink)', marginBottom: 2 }}>Компас · справка</div>}
                  {m.from === 'doctor' && <div className="xs strong" style={{ color: 'var(--mint-ink)', marginBottom: 2 }}>Врач</div>}
                  {m.audio ? <VoiceBubble a={m.audio} /> : m.text}
                  {m.sourceRef && (
                    <div className="bubble-src">
                      <BookOpenCheck /> Инструкция «Авиандр» · {m.sourceRef.replace(/^S4 · /, '')}
                    </div>
                  )}
                  <div className="bubble-time">
                    {fmtTime(m.at)}
                    {m.voice && !m.audio && ' · голосом'}
                    {m.from === 'patient' && ` · ${status(m)}`}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={end} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 84, zIndex: 11 }} className="stack">
        <div className="row" style={{ gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
          {QUICK.map((q) => (
            <button key={q} className="chip" style={{ flex: 'none', minHeight: 32, fontSize: 12.5, background: 'rgba(255,255,255,.95)' }} onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>
        <div className="chat-input card" style={{ padding: 6, borderRadius: 20, alignItems: 'center' }}>
          {!recording && (
            <textarea
              className="textarea"
              style={{ border: 0, boxShadow: 'none' }}
              placeholder="Сообщение врачу"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(text, voice);
                }
              }}
            />
          )}
          <span className="row" style={{ gap: 4, flex: recording ? 1 : 'none', justifyContent: recording ? 'center' : undefined }}>
            {!recording && (
              <DictateButton
                label="Надиктовать сообщение"
                onText={(t) => {
                  setText((prev) => joinDictated(prev, t));
                  setVoice(true);
                }}
              />
            )}
            <VoiceRecorder
              label="Записать голосовое врачу"
              onRecording={setRecording}
              onRecorded={(a) => {
                try {
                  const r = sendPatientMessage(patientId, a.transcript ?? '', { audio: a });
                  toast(r.alerts.some((x) => x.level !== 'yellow') && !r.crisis ? 'Врач уведомлён' : 'Голосовое отправлено', { tone: 'ok' });
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            />
          </span>
          {!recording && (
            <button className="btn btn-primary btn-icon" style={{ borderRadius: 14, width: 46, minHeight: 46 }} onClick={() => send(text, voice)} aria-label="Отправить">
              <Send />
            </button>
          )}
        </div>
      </div>
    </>
  );
}
