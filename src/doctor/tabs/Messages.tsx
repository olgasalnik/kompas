import { useEffect, useRef, useState } from 'react';
import { BookOpenCheck, CalendarDays, Send } from 'lucide-react';
import { useDB, standNow } from '../../store/db';
import { sendDoctorMessage, setTone } from '../../store/api';
import { DAY, fmtDate, fmtTime } from '../../core/time';
import { MISS_REASONS, pct } from '../../core/adherence';
import type { PatientView } from '../../ui/hooks';
import { openAlerts } from '../select';
import { THREAD_LABEL, threadStatus } from '../InboxPage';
import { DictateButton } from '../../ui/Dictate';
import { VoiceBubble, VoiceRecorder } from '../../ui/VoiceRecorder';
import { toast } from '../../ui/Toasts';
import { joinDictated } from '../../core/speech';

const INTENT_LABEL: Record<string, string> = {
  missed: 'пропуск приёма',
  how_to_take: 'как принимать',
  side_effects: 'нежелательные ощущения',
  alcohol: 'алкоголь',
  driving: 'вождение',
  interaction: 'сочетание препаратов',
  course: 'длительность курса',
  pregnancy: 'беременность',
  overdose: 'передозировка',
  safety: 'безопасность',
  telemed_request: 'просьба об онлайн-консультации',
  recipe_request: 'просьба выписать рецепт',
  supply: 'рецепт и запас таблеток',
  what_is: 'что за препарат',
  voice: 'голосовое без расшифровки — прослушайте',
};

const TEMPLATES = [
  'Спасибо, что написали. Я посмотрела ваши записи и позвоню вам сегодня.',
  'Продолжайте приём по плану. Если пропустили дозу — не принимайте двойную, следующую — в обычное время.',
  'Пожалуйста, пока не принимайте новое лекарство вместе с основным — обсудим на связи сегодня.',
  'Отметьте, пожалуйста, самочувствие в дневнике сегодня вечером — так мне будет проще оценить динамику.',
];

export function MessagesTab({ v, me }: { v: PatientView; me: string }) {
  const db = useDB();
  const now = standNow(db);
  const { p, adherence, facts } = v;
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const msgs = db.messages.filter((m) => m.patientId === p.id).sort((a, b) => a.at.localeCompare(b.at));
  // Статус считается до того, как открытие вкладки отметит сообщения прочитанными
  const thread = threadStatus(db, p.id);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [msgs.length]);
  const week = db.checkins.filter((c) => c.patientId === p.id && Date.parse(c.at) > now.getTime() - 7 * DAY);
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1).replace('.', ',') : '—');
  const aes = db.adverseEvents.filter((a) => a.patientId === p.id && a.status === 'active');
  const alerts = openAlerts(db, p.id);
  const botWeek = db.botFeed.filter((m) => m.patientId === p.id && Date.parse(m.at) > now.getTime() - 7 * DAY);
  const bot = {
    reminders: botWeek.filter((m) => m.kind === 'reminder').length,
    taken: botWeek.filter((m) => m.kind === 'reminder' && m.answer === 'taken').length,
    support: botWeek.filter((m) => m.kind === 'support').length,
  };
  const send = (t: string) => {
    if (!t.trim()) return;
    sendDoctorMessage(p.id, me, t.trim());
    setText('');
  };
  return (
    <div className="dossier-grid">
      <section className="card">
        <div className="card-head">
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            Переписка с пациентом
          </div>
          <span className={`badge ${THREAD_LABEL[thread.status].cls}`}>{THREAD_LABEL[thread.status].label}</span>
        </div>
        <div className="card-body" style={{ maxHeight: 520, overflowY: 'auto', background: 'var(--surface-2)' }}>
          <div className="chat">
            {msgs.length === 0 && <div className="empty">Сообщений нет</div>}
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`bubble ${m.from === 'doctor' ? 'bubble-me' : m.from === 'patient' ? 'bubble-them' : m.kind === 'safe_template' ? 'bubble-safe' : 'bubble-system'}`}
              >
                {m.from === 'system' && <div className="xs strong" style={{ color: 'var(--brand-ink)', marginBottom: 2 }}>{m.kind === 'safe_template' ? 'Безопасный шаблон (автоматически)' : 'Автоответ пациенту'}</div>}
                {m.audio ? <VoiceBubble a={m.audio} /> : m.text}
                {m.sourceRef && (
                  <div className="bubble-src">
                    <BookOpenCheck /> {m.sourceRef}
                  </div>
                )}
                <div className="bubble-time">
                  {fmtDate(m.at)}, {fmtTime(m.at)}
                  {m.intent && INTENT_LABEL[m.intent] ? ` · тема: ${INTENT_LABEL[m.intent]}` : ''}
                  {m.voice && !m.audio ? ' · надиктовано голосом, возможны ошибки распознавания' : ''}
                  {m.from === 'patient' && !m.readByDoctor ? ' · новое' : ''}
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
        </div>
        <div className="card-body stack" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            {TEMPLATES.map((t) => (
              <button key={t} className="chip" style={{ minHeight: 32, fontSize: 12.5 }} onClick={() => setText(t)}>
                {t.slice(0, 42)}…
              </button>
            ))}
          </div>
          <div className="chat-input">
            <textarea className="textarea" placeholder="Ответ пациенту" value={text} onChange={(e) => setText(e.target.value)} />
            <span className="row" style={{ alignSelf: 'center', gap: 6 }}>
              <DictateButton label="Надиктовать ответ" onText={(t) => setText((prev) => joinDictated(prev, t))} />
              <VoiceRecorder
                label="Записать голосовое пациенту"
                onRecorded={(a) => {
                  try {
                    sendDoctorMessage(p.id, me, a.transcript ?? '', a);
                    toast('Голосовое отправлено', { tone: 'ok' });
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              />
            </span>
            <button className="btn btn-primary btn-icon" style={{ width: 46, minHeight: 46 }} onClick={() => send(text)} aria-label="Отправить">
              <Send />
            </button>
          </div>
        </div>
      </section>

      <div className="stack" style={{ gap: 18 }}>
        <section className="card card-pad stack" style={{ gap: 12 }}>
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            <CalendarDays /> Карточка контекста · 7 дней
          </div>
          <div className="xs muted">Приходит вместе с каждым сообщением — не нужно просить скриншоты</div>
          <ul className="list-plain stack small" style={{ gap: 8 }}>
            <li>
              <b>Приём:</b> {facts['therapy.active'] ? `${adherence.taken7}/${adherence.due7} (${pct(adherence.rate7)})` : 'не назначен'}
              {Object.keys(adherence.reasons).length > 0 && (
                <span className="muted">
                  {' '}
                  — {Object.keys(adherence.reasons).map((k) => MISS_REASONS[k as keyof typeof MISS_REASONS].toLowerCase()).join(', ')}
                </span>
              )}
            </li>
            <li>
              <b>Настроение / тревога (ср.):</b> {avg(week.map((c) => c.mood))} / {avg(week.map((c) => c.anxiety))}
            </li>
            <li>
              <b>Сон:</b> плохой {week.filter((c) => c.sleep === 'bad' || c.sleep === 'none').length} из {week.length} ночей
            </li>
            <li>
              <b>НЯ:</b> {aes.length ? aes.map((a) => a.term).join(', ') : 'нет'}
            </li>
            <li>
              <b>Шкалы:</b> GAD-7 {String(facts['gad7.total'] ?? '—')}, PHQ-9 {String(facts['phq9.total'] ?? '—')}
            </li>
            <li>
              <b>Препараты:</b> {p.meds.length ? p.meds.join(', ') : 'нет сопутствующих'}
            </li>
            <li>
              <b>Открытые сигналы:</b> {alerts.length ? alerts.map((a) => a.title).join('; ') : 'нет'}
            </li>
            <li>
              <b>Компас-бот:</b> {bot.reminders} напоминаний за 7 дней, ответ «Принял(а)» — {bot.taken}, поддержка — {bot.support}
              <span className="muted"> · канал: {p.reminderChannel}</span>
            </li>
          </ul>
        </section>
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <div className="strong">Тон автоматических сообщений пациенту</div>
          <div className="segmented">
            {(
              [
                ['soft', 'Мягкий'],
                ['neutral', 'Нейтральный'],
                ['brief', 'Краткий'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} aria-pressed={p.tone === k} onClick={() => setTone(p.id, me, k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="xs muted">Для тревожных пациентов по умолчанию — мягкий. Тексты утверждает клинический эксперт.</div>
          <div className="small ink-2">
            Рабочие часы: {db.settings.workHours.start}:00–{db.settings.workHours.end}:00. Вне их пациенту честно показывается срок ответа; красные сигналы идут по эскалации в любое время.
          </div>
        </section>
      </div>
    </div>
  );
}
