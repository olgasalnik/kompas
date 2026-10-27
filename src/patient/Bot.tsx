// Лента Компас-бота у пациента: напоминания о приёме с ответом в одно нажатие и поддерживающие сообщения.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Check, Clock, X } from 'lucide-react';
import type { BotMessage, MissReason } from '../core/types';
import { useDB, standNow } from '../store/db';
import { botSilenced, markDose } from '../store/api';
import { MISS_REASONS } from '../core/adherence';
import { REMIND_WINDOW_MS } from '../core/bot';
import { fmtDate, fmtTime } from '../core/time';
import { CHANNEL } from './Profile';
import { toast } from '../ui/Toasts';

const ANSWER: Record<string, string> = { taken: 'Принял(а)', missed: 'Пропустил(а)', later: 'Позже' };

function ReminderActions({ m }: { m: BotMessage }) {
  const [why, setWhy] = useState(false);
  const day = new Date(m.scheduledAt!);
  const mark = (status: 'taken' | 'missed' | 'later', reason?: MissReason) => {
    markDose(m.patientId, m.slot!, status, reason, day);
    toast(status === 'taken' ? 'Отмечено: принял(а)' : status === 'later' ? 'Напомню через 30 минут' : 'Пропуск отмечен', { tone: status === 'taken' ? 'ok' : 'default' });
  };
  if (why)
    return (
      <div className="stack" style={{ gap: 6, marginTop: 8 }}>
        <span className="xs strong">Что помешало?</span>
        <div className="row wrap" style={{ gap: 6 }}>
          {(Object.keys(MISS_REASONS) as MissReason[]).map((r) => (
            <button key={r} className="chip" style={{ minHeight: 30, fontSize: 12.5 }} onClick={() => mark('missed', r)}>
              {MISS_REASONS[r]}
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
      <button className="btn btn-sm btn-primary" onClick={() => mark('taken')}>
        <Check /> Принял(а)
      </button>
      <button className="btn btn-sm" onClick={() => mark('later')}>
        <Clock /> Позже
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => setWhy(true)}>
        <X /> Пропустил(а)
      </button>
    </div>
  );
}

export function BotFeed({ patientId }: { patientId: string }) {
  const db = useDB();
  const now = standNow(db);
  const p = db.patients.find((x) => x.id === patientId)!;
  const [all, setAll] = useState(false);
  const feed = db.botFeed.filter((m) => m.patientId === patientId).sort((a, b) => a.at.localeCompare(b.at));
  const shown = all ? feed : feed.slice(-4);
  const onTherapy = db.prescriptions.some((r) => r.patientId === patientId && (r.status === 'confirmed' || r.status === 'modified'));
  const silenced = botSilenced(db, patientId);
  let lastDay = '';
  return (
    <section className="card card-pad stack" style={{ gap: 10 }} id="bot">
      <div className="row" style={{ gap: 10 }}>
        <div className="role-icon" style={{ width: 38, height: 38, borderRadius: 12 }}>
          <Bot />
        </div>
        <div className="stack" style={{ gap: 1 }}>
          <span className="strong">Компас-бот</span>
          <span className="xs muted">Напоминания о приёме и поддержка</span>
        </div>
      </div>
      <div className="xs ink-2">
        {onTherapy
          ? `Напоминания приходят в 08:00 и 20:00 — ${CHANNEL[p.reminderChannel]}. В уведомлении нет названия препарата. Канал можно сменить в профиле.`
          : 'Бот начнёт напоминать о приёме, когда врач утвердит план лечения.'}
      </div>
      {silenced && (
        <div className="callout small">
          <Bot />
          <span>Сейчас с вами связывается врач, поэтому бот не присылает автоматических сообщений.</span>
        </div>
      )}
      {feed.length > 4 && !all && (
        <button className="link-btn xs" style={{ alignSelf: 'center' }} onClick={() => setAll(true)}>
          Показать все ({feed.length})
        </button>
      )}
      <div className="chat" style={{ gap: 8 }}>
        {shown.map((m) => {
          const day = fmtDate(m.at);
          const sep = day !== lastDay;
          lastDay = day;
          const open = m.kind === 'reminder' && (!m.answer || m.answer === 'later') && now.getTime() - Date.parse(m.scheduledAt!) < REMIND_WINDOW_MS + 2 * 3600_000;
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {sep && <div className="xs muted center">{day}</div>}
              <div className="bubble bubble-system" style={{ maxWidth: 'none' }}>
                {m.text}
                {m.kind === 'reminder' && m.answer && (
                  <div className={`xs strong ${m.answer === 'taken' ? 'ok-ink' : ''}`} style={{ marginTop: 6 }}>
                    {m.answer === 'taken' ? '✓ ' : ''}
                    {ANSWER[m.answer]}
                    {m.answeredAt ? ` · ${fmtTime(m.answeredAt)}` : ''}
                    {m.answer === 'later' && m.remindAgainAt ? ` — напомню в ${fmtTime(m.remindAgainAt)}` : ''}
                  </div>
                )}
                {open && <ReminderActions m={m} />}
                {m.link && (
                  <Link to={m.link.to} className="btn btn-sm btn-soft" style={{ marginTop: 8 }}>
                    {m.link.label}
                  </Link>
                )}
                <div className="bubble-time">{fmtTime(m.at)}</div>
              </div>
            </div>
          );
        })}
        {!feed.length && onTherapy && <div className="xs muted center">Сообщений пока нет — первое напоминание придёт во время приёма.</div>}
      </div>
    </section>
  );
}
