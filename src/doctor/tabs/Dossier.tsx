import { useRef, useState } from 'react';
import {
  Activity,
  BedDouble,
  BrainCircuit,
  CheckCircle2,
  ClipboardCopy,
  ClipboardList,
  GraduationCap,
  MessageSquareQuote,
  MessagesSquare,
  Mic,
  Moon,
  NotebookPen,
  Pill,
  Quote,
  Sparkles,
  Stethoscope,
  Pencil,
  XCircle,
  Check,
} from 'lucide-react';
import { copyText } from '../../ui/hooks';
import type { Suggestion } from '../../core/types';
import { useDB, standNow } from '../../store/db';
import { ackAlert, addPatientWords, decideSuggestion, removePatientWords, saveHypothesis, saveNote } from '../../store/api';
import { DictateButton } from '../../ui/Dictate';
import { ConfirmButton } from '../../ui/Inline';
import { joinDictated } from '../../core/speech';
import { checkTherapy, evaluateRouting } from '../../core/clinical';
import { MISS_REASONS, pct } from '../../core/adherence';
import { DAY, fmtAgo, fmtDate, fmtDateTime } from '../../core/time';
import type { PatientView } from '../../ui/hooks';
import { AlertSignal, RouteHit, Signal, TherapyHit } from '../../ui/Signals';
import { TimeChart } from '../../ui/Charts';
import { WhyButton } from '../../ui/Why';
import { toast } from '../../ui/Toasts';
import { useOpenAlert } from '../DoctorApp';
import { msgPreview, openAlerts, scalePoints } from '../select';
import { VoiceBubble } from '../../ui/VoiceRecorder';
import { SCALES } from '../../core/scales';
import type { TabId } from '../PatientPage';

export function DossierTab({ v, me, goTab }: { v: PatientView; me: string; goTab: (t: TabId) => void }) {
  const db = useDB();
  const now = standNow(db);
  const { p, facts, adherence } = v;
  const openAlert = useOpenAlert();
  const mode = db.settings.aiMode;
  const alerts = openAlerts(db, p.id);
  const therapy = checkTherapy(facts);
  const routing = evaluateRouting(facts);
  const gad = scalePoints(db, p.id, 'GAD7');
  const phq = scalePoints(db, p.id, 'PHQ9');
  const since = p.therapyStart && facts['therapy.active'] ? Date.parse(p.therapyStart) - 2 * DAY : now.getTime() - 14 * DAY;
  const from = Math.min(since, now.getTime() - 14 * DAY);
  const week = db.checkins.filter((c) => c.patientId === p.id && Date.parse(c.at) > now.getTime() - 7 * DAY);
  const prevWeek = db.checkins.filter((c) => c.patientId === p.id && Date.parse(c.at) <= now.getTime() - 7 * DAY && Date.parse(c.at) > now.getTime() - 14 * DAY);
  const avg = (xs: number[]) => (xs.length ? (Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10).toLocaleString('ru-RU') : null);
  const aes = db.adverseEvents.filter((a) => a.patientId === p.id && a.status === 'active');
  const suggestions = db.suggestions.filter((s) => s.patientId === p.id && s.status === 'proposed');
  const decided = db.suggestions.filter((s) => s.patientId === p.id && s.status !== 'proposed').slice(-4).reverse();
  const hypothesis = db.hypotheses[p.id];
  const msgs7 = db.messages.filter((m) => m.patientId === p.id && m.from === 'patient' && Date.parse(m.at) > now.getTime() - 7 * DAY);
  const reasons = Object.entries(adherence.reasons)
    .map(([k, n]) => `${MISS_REASONS[k as keyof typeof MISS_REASONS].toLowerCase()} — ${n}`)
    .join(', ');
  const scaleDelta = (pts: { v: number }[]) => (pts.length > 1 ? `${pts[0].v} → ${pts[pts.length - 1].v}` : pts.length ? `${pts[0].v}` : '—');
  const deltaClass = (pts: { v: number }[]) => (pts.length > 1 ? (pts[pts.length - 1].v < pts[0].v ? 'delta-good' : pts[pts.length - 1].v > pts[0].v ? 'delta-bad' : 'delta-flat') : 'delta-flat');
  const badNights = week.filter((c) => c.sleep === 'bad' || c.sleep === 'none').length;
  // Расшифровка плохого сна: что именно мешало (по ответам пациента за неделю)
  const sleepCounts = week.flatMap((c) => c.sleepDetail ?? []).reduce<Record<string, number>>((acc, d) => ((acc[d] = (acc[d] ?? 0) + 1), acc), {});
  const sleepDecoded = Object.entries(sleepCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => `${d} — ${n}`)
    .join(', ');
  const shortNights = week.filter((c) => c.sleepHours === '<4').length;

  const changes = [
    {
      icon: <Pill />,
      label: 'Приём препарата, 7 дней',
      value: facts['therapy.active'] ? `${adherence.taken7} из ${adherence.due7} (${pct(adherence.rate7)})` : 'терапия не назначена',
      detail: reasons ? `Причины пропусков: ${reasons}` : facts['therapy.active'] ? 'Пропусков с указанной причиной нет' : '',
      tone: (adherence.rate7 ?? 1) < 0.8 ? 'delta-bad' : 'delta-flat',
      src: 'Дневник приёма (самоотчёт)',
    },
    {
      icon: <ClipboardList />,
      label: 'Шкалы с начала наблюдения',
      value: `GAD-7: ${scaleDelta(gad)} · PHQ-9: ${scaleDelta(phq)}`,
      detail: facts['phq9.item9'] !== null ? `Пункт 9 PHQ-9 (последний): ${facts['phq9.item9']}` : '',
      tone: deltaClass(gad),
      src: 'PHQ-9, GAD-7 — самоотчёт пациента',
    },
    {
      icon: <Activity />,
      label: 'Нежелательные явления',
      value: aes.length ? aes.map((a) => `${a.term} (${a.severity === 'moderate' ? 'средняя' : a.severity === 'severe' ? 'тяжёлая' : 'лёгкая'})`).join(', ') : 'не отмечены',
      detail: aes.length ? `С ${fmtDate(aes[0].onset)}; в инструкции: ${aes.some((a) => ['сонливость', 'головная боль', 'головокружение'].includes(a.term)) ? 'частая реакция, обычно первые 2 недели' : 'см. раздел «Побочное действие»'}` : '',
      tone: aes.some((a) => a.severity !== 'mild') ? 'delta-bad' : 'delta-flat',
      src: 'Чек-ины пациента + перечень из инструкции',
    },
    {
      icon: <BedDouble />,
      label: 'Сон за неделю',
      value: week.length ? `плохой сон ${badNights} из ${week.length} ночей` : 'нет записей',
      detail: [
        facts['checkin.insomniaStreak'] ? `Без сна подряд: ${facts['checkin.insomniaStreak']}` : '',
        sleepDecoded ? `Что мешало: ${sleepDecoded}` : '',
        shortNights ? `Меньше 4 часов: ${shortNights} ноч.` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      tone: badNights >= 3 ? 'delta-bad' : 'delta-flat',
      src: 'Чек-ины пациента',
    },
    {
      icon: <Moon />,
      label: 'Настроение / тревога (0–10), неделя к неделе',
      value: `${avg(prevWeek.map((c) => c.mood)) ?? '—'} → ${avg(week.map((c) => c.mood)) ?? '—'} / ${avg(prevWeek.map((c) => c.anxiety)) ?? '—'} → ${avg(week.map((c) => c.anxiety)) ?? '—'}`,
      detail: `Записей за 7 дней: ${week.length}${facts['checkin.daysSinceLast'] !== null ? ` · последняя ${facts['checkin.daysSinceLast'] === 0 ? 'сегодня' : `${facts['checkin.daysSinceLast']} дн. назад`}` : ''}`,
      tone: 'delta-flat',
      src: 'Чек-ины пациента',
    },
  ];

  return (
    <div className="dossier-grid">
      <div className="stack" style={{ gap: 18 }}>
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Stethoscope /> Сигналы и безопасность
            </div>
            <span className="xs muted">не скрываются в любом режиме</span>
          </div>
          <div className="card-body stack" style={{ gap: 10 }}>
            {alerts.map((a) => (
              <AlertSignal
                key={a.id}
                alert={a}
                meta={fmtAgo(a.createdAt, now)}
                actions={
                  <>
                    <button className="btn btn-sm" onClick={() => openAlert(a.id)}>
                      Подробнее
                    </button>
                    {!a.ackAt && (
                      <button className={`btn btn-sm ${a.level === 'red' ? 'btn-danger' : 'btn-soft'}`} onClick={() => ackAlert(a.id, me)}>
                        Принять в работу
                      </button>
                    )}
                  </>
                }
              >
                {a.reason}
              </AlertSignal>
            ))}
            {therapy.stops.map((h) => (
              <TherapyHit key={h.rule.id} hit={h} compact />
            ))}
            {therapy.offLabel && <TherapyHit hit={therapy.offLabel} compact />}
            {routing.category && routing.category !== 'desirable' && routing.byCategory[routing.category].map((h) => <RouteHit key={h.rule.id} hit={h} compact />)}
            {!alerts.length && !therapy.stops.length && !therapy.offLabel && (!routing.category || routing.category === 'desirable') && (
              <Signal variant="ok" compact kicker="Сигналов нет" title="Открытых сигналов и противопоказаний нет" />
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Sparkles /> Что изменилось
            </div>
            <span className="xs muted">с начала наблюдения · каждая строка — со ссылкой на источник</span>
          </div>
          <div className="card-body" style={{ paddingTop: 6, paddingBottom: 6 }}>
            {changes.map((c, i) => (
              <div key={i} className="change-row">
                <div className="change-icon">{c.icon}</div>
                <div className="stack" style={{ gap: 1 }}>
                  <span className="change-label">{c.label}</span>
                  <span className={`change-value ${c.tone}`}>{c.value}</span>
                  {c.detail && <span className="xs muted">{c.detail}</span>}
                </div>
                <span className="xs muted" style={{ textAlign: 'right', maxWidth: 150 }}>
                  {c.src}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <CheckCircle2 /> Требует решения
            </div>
            <span className="badge badge-brand">{suggestions.length}</span>
          </div>
          <div className="card-body stack" style={{ gap: 10 }}>
            {mode === 'silent' ? (
              <div className="callout small">
                <Moon />
                <span>Режим «Тихий»: предложения и черновики отключены. Сигналы, противопоказания и взаимодействия продолжают работать.</span>
              </div>
            ) : mode === 'mentor' && !hypothesis ? (
              <MentorGate patientId={p.id} me={me} />
            ) : suggestions.length ? (
              suggestions.map((s) => <SuggestionRow key={s.id} s={s} me={me} mentor={mode === 'mentor'} goTab={goTab} />)
            ) : (
              <div className="empty" style={{ padding: 14 }}>
                Нет предложений, ожидающих решения
              </div>
            )}
            {mode === 'mentor' && hypothesis && (
              <div className="callout small">
                <GraduationCap />
                <span>
                  Ваша гипотеза ({fmtDateTime(hypothesis.at)}): «{hypothesis.text}». Решения ординатора проходят подтверждение супервизора — Орлова Н. С.
                </span>
              </div>
            )}
            {decided.length > 0 && (
              <details>
                <summary className="small muted" style={{ cursor: 'pointer' }}>
                  Решения врача ({decided.length})
                </summary>
                <ul className="list-plain stack" style={{ gap: 6, marginTop: 8 }}>
                  {decided.map((s) => (
                    <li key={s.id} className="small row row-top" style={{ gap: 8 }}>
                      <span className={`badge ${s.status === 'declined' ? 'badge-red' : s.status === 'modified' ? 'badge-amber' : 'badge-mint'}`}>
                        {{ confirmed: 'Подтверждено', modified: 'Изменено', declined: 'Отклонено', proposed: '' }[s.status]}
                      </span>
                      <span className="ink-2">
                        {s.modifiedText ?? s.text}
                        {s.comment ? ` — ${s.comment}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </section>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        <section className="card card-pad stack" style={{ gap: 16 }}>
          <TimeChart
            title="GAD-7"
            caption="Тревога · 0–21 · основной показатель для «Авиандра»"
            from={from}
            to={now.getTime()}
            yMax={21}
            yTicks={[0, 10, 15, 21]}
            height={150}
            bands={SCALES.GAD7.bands}
            series={[{ id: 'gad', label: 'GAD-7', color: 'var(--series-1)', points: gad }]}
            events={p.therapyStart && facts['therapy.active'] ? [{ t: Date.parse(p.therapyStart), label: 'Начало «Авиандра»', kind: 'therapy' }] : []}
          />
          <TimeChart
            title="PHQ-9"
            caption="Депрессия · 0–27"
            from={from}
            to={now.getTime()}
            yMax={27}
            yTicks={[0, 10, 20, 27]}
            height={150}
            bands={SCALES.PHQ9.bands}
            series={[{ id: 'phq', label: 'PHQ-9', color: 'var(--series-2)', points: phq }]}
          />
          <button className="link-btn small" onClick={() => goTab('dynamics')} style={{ alignSelf: 'flex-start' }}>
            Вся динамика →
          </button>
        </section>

        {p.previsit && (
          <section className="card card-pad stack" style={{ gap: 10 }}>
            <div className="row spread">
              <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
                <MessageSquareQuote /> К приёму — со слов пациента
              </div>
              <span className="xs muted">{fmtDateTime(p.previsit.at)}</span>
            </div>
            {p.previsit.concerns && (
              <div className="small">
                <span className="muted">Беспокоит: </span>
                {p.previsit.concerns}
              </div>
            )}
            {p.previsit.changes && (
              <div className="small">
                <span className="muted">Изменилось: </span>
                {p.previsit.changes}
              </div>
            )}
            {p.previsit.questions && (
              <div className="small">
                <span className="muted">Вопросы врачу: </span>
                {p.previsit.questions}
              </div>
            )}
          </section>
        )}

        <PatientWordsCard patientId={p.id} me={me} />

        {mode !== 'silent' && <DraftCard v={v} />}

        <NoteCard patientId={p.id} me={me} />

        <section className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row spread">
            <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
              <MessagesSquare /> Сообщения за 7 дней
            </div>
            <button className="link-btn small" onClick={() => goTab('messages')}>
              Открыть чат →
            </button>
          </div>
          {msgs7.length ? (
            msgs7.slice(-3).map((m) => (
              <div key={m.id} className="bubble bubble-them" style={{ maxWidth: 'none' }}>
                {m.audio ? <VoiceBubble a={m.audio} /> : m.text}
                <div className="bubble-time">{fmtDateTime(m.at)}</div>
              </div>
            ))
          ) : (
            <div className="small muted">Сообщений нет</div>
          )}
        </section>
      </div>
    </div>
  );
}

function SuggestionRow({ s, me, mentor, goTab }: { s: Suggestion; me: string; mentor: boolean; goTab: (t: TabId) => void }) {
  const [edit, setEdit] = useState<null | 'modify' | 'decline'>(null);
  const [text, setText] = useState(s.text);
  const isRx = s.ruleId === 'AVI-SUG-REGIMEN';
  return (
    <div className="card card-flat" style={{ padding: 14 }}>
      <div className="row row-top spread" style={{ gap: 10 }}>
        <div className="stack" style={{ gap: 4 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="badge badge-ai">Предложено системой</span>
            <span className="badge badge-outline">{{ therapy: 'терапия', safety: 'безопасность', monitoring: 'мониторинг', routing: 'маршрут', communication: 'связь' }[s.kind]}</span>
          </div>
          <div className="strong" style={{ fontSize: 'var(--fs-md)' }}>
            {s.text}
          </div>
          {mentor && <div className="xs muted">Обоснование: правило {s.ruleId}; источник и пороги — по кнопке «Почему?»</div>}
        </div>
        <WhyButton ruleId={s.ruleId} facts={s.facts} />
      </div>
      {edit && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={edit === 'decline' ? 'Причина отклонения (по правилам организации)' : ''} style={{ minHeight: 64 }} />
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => {
                if (edit === 'modify') decideSuggestion(s.id, me, 'modified', text);
                else decideSuggestion(s.id, me, 'declined', undefined, text === s.text ? '' : text);
                toast(edit === 'modify' ? 'Изменено врачом: сохранены исходный и изменённый варианты' : 'Отклонено врачом', { tone: 'ok' });
              }}
            >
              Сохранить решение
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setEdit(null)}>
              Отмена
            </button>
          </div>
        </div>
      )}
      {!edit && (
        <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
          {isRx ? (
            <button className="btn btn-sm btn-primary" onClick={() => goTab('therapy')}>
              <Check /> Перейти к назначению (проверка безопасности)
            </button>
          ) : (
            <button
              className="btn btn-sm btn-success"
              onClick={() => {
                decideSuggestion(s.id, me, 'confirmed');
                toast('Принято врачом', { tone: 'ok', sub: 'Решение зафиксировано в журнале' });
              }}
            >
              <Check /> Принять
            </button>
          )}
          <button className="btn btn-sm" onClick={() => setEdit('modify')}>
            <Pencil /> Изменить
          </button>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              setText('');
              setEdit('decline');
            }}
          >
            <XCircle /> Отклонить
          </button>
        </div>
      )}
    </div>
  );
}

function MentorGate({ patientId, me }: { patientId: string; me: string }) {
  const [t, setT] = useState('');
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="callout small">
        <GraduationCap />
        <span>Режим «Наставник»: сначала сформулируйте собственную гипотезу и план — затем система покажет свои предложения с обоснованием и ссылками на КР.</span>
      </div>
      <textarea className="textarea" placeholder="Ваша гипотеза: что происходит с пациентом и что вы планируете" value={t} onChange={(e) => setT(e.target.value)} />
      <button className="btn btn-primary btn-sm" disabled={t.trim().length < 10} onClick={() => saveHypothesis(patientId, me, t.trim())} style={{ alignSelf: 'flex-start' }}>
        Зафиксировать и показать подсказки
      </button>
    </div>
  );
}

function DraftCard({ v }: { v: PatientView }) {
  const db = useDB();
  const now = standNow(db);
  const { p, facts, adherence } = v;
  const [hidden, setHidden] = useState(false);
  const draftRef = useRef<HTMLParagraphElement>(null);
  const gad = scalePoints(db, p.id, 'GAD7');
  const phq = scalePoints(db, p.id, 'PHQ9');
  const aes = db.adverseEvents.filter((a) => a.patientId === p.id && a.status === 'active');
  const msgs = db.messages.filter((m) => m.patientId === p.id && m.from === 'patient' && Date.parse(m.at) > now.getTime() - 7 * DAY);
  const words = db.patientWords.filter((w) => w.patientId === p.id).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (hidden)
    return (
      <button className="btn btn-sm btn-ghost" onClick={() => setHidden(false)} style={{ alignSelf: 'flex-start' }}>
        <BrainCircuit /> Показать черновик досье
      </button>
    );
  return (
    <section className="ai-draft stack" style={{ gap: 10 }}>
      <div className="row spread">
        <span className="badge badge-ai">
          <BrainCircuit /> Черновик досье · проверьте источники
        </span>
        <span className="row" style={{ gap: 4 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              const ok = await copyText(draftRef.current?.innerText ?? '');
              toast(ok ? 'Черновик скопирован' : 'Не удалось скопировать', { tone: ok ? 'ok' : 'default' });
            }}
          >
            <ClipboardCopy /> Копировать
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setHidden(true)}>
            Скрыть
          </button>
        </span>
      </div>
      <p ref={draftRef} style={{ fontSize: 'var(--fs-md)', lineHeight: 1.6 }}>
        {facts['therapy.active'] ? (
          <>
            Пациент{p.sex === 'f' ? 'ка' : ''} на {String(facts['therapy.week'])}-й неделе «Авиандра».{' '}
            <mark title="Источник: дневник приёма (самоотчёт), последние 7 дней">
              За 7 дней отмечено {adherence.taken7} из {adherence.due7} приёмов ({pct(adherence.rate7)})
            </mark>
            {Object.keys(adherence.reasons).length > 0 && <> — пропуски по причине «{Object.keys(adherence.reasons).map((k) => MISS_REASONS[k as keyof typeof MISS_REASONS].toLowerCase()).join('», «')}»</>}.{' '}
          </>
        ) : (
          <>Терапия не назначена; пациент ведёт дневник. </>
        )}
        {gad.length > 0 && (
          <mark title={`Источник: GAD-7, ${gad.length} измерений`}>
            GAD-7 {gad.length > 1 ? `${gad[0].v} → ${gad[gad.length - 1].v}` : gad[0].v}
          </mark>
        )}
        {phq.length > 0 && (
          <>
            ,{' '}
            <mark title={`Источник: PHQ-9, ${phq.length} измерений`}>
              PHQ-9 {phq.length > 1 ? `${phq[0].v} → ${phq[phq.length - 1].v}` : phq[0].v}
            </mark>
            {facts['phq9.item9'] !== null && <> (пункт 9 — {String(facts['phq9.item9'])})</>}
          </>
        )}
        .{' '}
        {aes.length > 0 && (
          <>
            <mark title="Источник: чек-ины пациента">Отмечает {aes.map((a) => a.term).join(', ')} с {fmtDate(aes[0].onset)}</mark>.{' '}
          </>
        )}
        {msgs.length > 0 && (
          <>
            <mark title="Источник: сообщения пациента за 7 дней">Сообщений за неделю: {msgs.length}</mark>, последнее: «{msgPreview(msgs[msgs.length - 1]).slice(0, 80)}
            {msgPreview(msgs[msgs.length - 1]).length > 80 ? '…' : ''}».
          </>
        )}
        {words && (
          <>
            {' '}
            Со слов пациента ({fmtDate(words.at)}): <mark title="Источник: запись врача на приёме, дословно">«{words.text}»</mark>.
          </>
        )}
      </p>
      <div className="xs muted">
        Черновик собирается из данных пациента без внешних языковых моделей (персональные данные не покидают контур). В пилоте ИИ-слой подключается внутри контура РФ, каждая фраза
        подсвечивает источник. В заметку врача вставляется только по кнопке.
      </div>
    </section>
  );
}

/** «Со слов пациента»: дословная запись жалоб на приёме — голосом или вручную, без пересказа */
function PatientWordsCard({ patientId, me }: { patientId: string; me: string }) {
  const db = useDB();
  const words = db.patientWords.filter((w) => w.patientId === patientId).sort((a, b) => b.at.localeCompare(a.at));
  const [text, setText] = useState('');
  const [voice, setVoice] = useState(false);
  return (
    <section className="card card-pad stack" style={{ gap: 10 }} id="patient-words">
      <div className="row spread">
        <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
          <Quote /> Со слов пациента
        </div>
        <span className="xs muted">дословно, на приёме</span>
      </div>
      <div className="xs muted">
        Нажмите на микрофон и надиктуйте жалобы так, как их сформулировал пациент, — или включите запись, пока пациент рассказывает сам (с его согласия). Компас не пересказывает и не
        сокращает текст.
      </div>
      <div className="field-with-mic">
        <textarea className="textarea" placeholder="Например: «Просыпаюсь в четыре утра и не могу уснуть»" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 70 }} aria-label="Со слов пациента" />
        <DictateButton
          label="Записать голосом"
          onText={(t) => {
            setText((prev) => joinDictated(prev, t));
            setVoice(true);
          }}
        />
      </div>
      <button
        className="btn btn-sm btn-primary"
        disabled={!text.trim()}
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          addPatientWords(patientId, me, text, voice);
          setText('');
          setVoice(false);
          toast('Записано со слов пациента', { tone: 'ok', sub: 'Попадёт в поиск и в запрос телемедконсультации' });
        }}
      >
        <Check /> Записать
      </button>
      {words.slice(0, 4).map((w) => (
        <div key={w.id} className="quote small stack" style={{ gap: 4 }}>
          <span>«{w.text}»</span>
          <span className="row wrap xs muted" style={{ gap: 6 }}>
            {fmtDateTime(w.at)}
            {w.voice && (
              <span className="voice-mark">
                · <Mic /> голосом
              </span>
            )}
            <button
              className="link-btn xs"
              onClick={async () => {
                const ok = await copyText(`Со слов пациента (${fmtDate(w.at)}): «${w.text}»`);
                toast(ok ? 'Скопировано' : 'Не удалось скопировать', { tone: ok ? 'ok' : 'default' });
              }}
            >
              Копировать
            </button>
            <ConfirmButton label="Удалить" className="link-btn xs" question="Удалить запись?" confirmLabel="Удалить" onConfirm={() => removePatientWords(w.id, me)} />
          </span>
        </div>
      ))}
    </section>
  );
}

function NoteCard({ patientId, me }: { patientId: string; me: string }) {
  const db = useDB();
  const saved = db.notes[patientId];
  const [text, setText] = useState(saved?.text ?? '');
  const dirty = text !== (saved?.text ?? '');
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row spread">
        <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
          <NotebookPen /> Заметка врача
        </div>
        <span className="xs muted">{saved ? `сохранено ${fmtDateTime(saved.updatedAt)}` : 'без автозаполнения'}</span>
      </div>
      <div className="field-with-mic">
        <textarea className="textarea" placeholder="Свободный текст. Система не дописывает и не переписывает заметку." value={text} onChange={(e) => setText(e.target.value)} aria-label="Заметка врача" />
        <DictateButton label="Надиктовать заметку" onText={(t) => setText((prev) => joinDictated(prev, t))} />
      </div>
      <button
        className="btn btn-sm btn-primary"
        disabled={!dirty}
        style={{ alignSelf: 'flex-start' }}
        onClick={() => {
          saveNote(patientId, me, text);
          toast('Заметка сохранена', { tone: 'ok' });
        }}
      >
        Сохранить
      </button>
    </section>
  );
}
