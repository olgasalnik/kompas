// Единственная точка записи данных. Каждое действие: изменение → прогон правил → сигналы → журнал.
// Система САМА только: показывает безопасные сообщения, уведомляет врача, эскалирует, создаёт задачи
// и пишет журнал. Назначение, отмена, направление — только через решение врача (decide*/prescribe/confirm*).
import type {
  AdverseEvent,
  AiMode,
  Alert,
  AlertChannelLog,
  Checkin,
  DB,
  DoseStatus,
  Facts,
  MissReason,
  Patient,
  PatientFactors,
  RuleHit,
  ScaleId,
  Suggestion,
} from '../core/types';
import { buildFacts } from '../core/facts';
import { checkTherapy, evaluateAlerts, evaluateRouting, ORANGE_CHECKLIST, RED_CHECKLIST } from '../core/clinical';
import { scoreClinicianTotal, scoreScale } from '../core/scales';
import { answerQuestion, findMedsInText, type PackAnswer } from '../core/text';
import { SLOT_HOURS, slotKey } from '../core/adherence';
import { DAY, HOUR, MIN, at, startOfDay } from '../core/time';
import { getDB, mutate, setDB, standNow } from './db';
import { isWorking, replyText } from '../core/schedule';
import type { PatientDocument, RecipeRecord, TelemedRequest, TrustedContact } from '../core/types';
import { aviandrRecipe, RECIPE_BLANK } from '../core/recipe';
import type { BotMessage, VoiceAudio } from '../core/types';
import { BOT_NOTIFY, dueReminders, LATER_MS, notifyChannel, reminderText, SUPPORT, supportAfterCheckin, supportAfterDose, type SupportId } from '../core/bot';
import { defaultConsents, emptyDB, seedDB, answersFor } from './seed';
import { clamp, mulberry32, uid } from './rng';

// ───────── Тексты (утверждает клинический эксперт; раздел 5.8) ─────────
export const PATIENT_TEXTS = {
  red: 'Спасибо, что написали об этом. Ваша безопасность важна. Ваш врач уже уведомлён. Если вы в опасности прямо сейчас — позвоните 112. Вы можете позвонить врачу или нажать «Я в безопасности».',
  doctorNotified: 'Я сообщил вашему врачу — он посмотрит и при необходимости свяжется с вами. Пожалуйста, ничего не меняйте в приёме без разговора с врачом.',
  unknown: 'Этого нет в проверенных материалах, поэтому я не буду гадать. Передам вопрос врачу.',
  offHours: (reply: string) => `Сейчас нерабочее время врача. ${reply.replace('Нерабочее время — ответит', 'Врач ответит')}. Если вам плохо, воспользуйтесь кнопкой «Мне тяжело сейчас».`,
  waitForDoctor: 'Спасибо! Врачу нужно время, чтобы посмотреть ответы. Пока вы ждёте, на вопросы о препарате ответит помощник в разделе «Помощник».',
  planConfirmed: 'Врач утвердил план приёма. Он появился в разделе «Мой план». Напоминания будут приходить без медицинских подробностей.',
  voiceNoTranscript: 'Голосовое сообщение передано врачу — он прослушает его. Если вам очень тяжело прямо сейчас, нажмите «Мне тяжело сейчас» или позвоните 112.',
  recipeRequested: 'Просьба передана врачу. Рецепт выписывает врач — на приёме или онлайн; когда он будет готов, придёт уведомление.',
  recipeRequestText: 'Таблетки по рецепту заканчиваются — прошу выписать новый рецепт.',
};

// Уведомления: ни названия болезни, ни препарата (152-ФЗ, врачебная тайна)
export const NOTIFY_TEXTS = {
  pushRed: 'Компас: новый сигнал высокого приоритета. Откройте приложение.',
  smsRed: 'Компас: требуется ваше внимание в приложении.',
  emailRed: 'Компас: в приложении есть сигнал, требующий вашего внимания. Подробности — только после входа.',
  doctorMessage: 'Компас: новое сообщение от врача.',
  planUpdated: 'Компас: врач обновил ваш план.',
  recipe: 'Компас: врач выписал вам рецепт. Подробности — в приложении.',
  pushOrange: 'Компас: новый сигнал в приложении.',
  escalation: 'Компас: неподтверждённый сигнал высокого приоритета. Откройте приложение.',
  reminder: 'Компас: время сделать короткую запись.',
  repeat: 'Компас: сигнал ожидает реакции.',
};

const nowIso = (db: DB) => standNow(db).toISOString();

export function audit(db: DB, actor: string, action: string, patientId?: string, details?: string) {
  db.audit.push({ id: uid('au'), at: nowIso(db), actor, action, patientId, details });
}

function patientOf(db: DB, id: string): Patient {
  const p = db.patients.find((x) => x.id === id);
  if (!p) throw new Error(`Пациент ${id} не найден`);
  return p;
}

const doctorOf = (db: DB, p: Patient) => db.users.find((u) => u.id === p.doctorId);

/** Рабочее время лечащего врача пациента (у каждого врача свой график); без врача — общий график клиники */
const inWorkHours = (db: DB, d: Date, p?: Patient) => {
  const doc = p ? doctorOf(db, p) : undefined;
  if (doc) return isWorking(doc.schedule, d);
  const h = d.getHours();
  return h >= db.settings.workHours.start && h < db.settings.workHours.end;
};

/** Уведомление пациенту — по выбранному им каналу, без медицинских подробностей */
function notifyPatient(db: DB, p: Patient, text: string) {
  const channel = p.reminderChannel === 'email' ? 'email' : p.reminderChannel === 'sms' ? 'sms' : p.reminderChannel === 'push' ? 'push' : 'messenger';
  db.notifications.push({ id: uid('nt'), at: nowIso(db), channel, to: p.id, text });
}

function systemToPatient(db: DB, patientId: string, text: string, kind: 'safe_template' | 'auto_answer' | 'handoff', sourceRef?: string, intent?: string) {
  db.messages.push({ id: uid('msg'), patientId, from: 'system', text, at: nowIso(db), kind, sourceRef, intent, readByDoctor: true, readByPatient: false });
}

// ───────── Компас-бот: напоминания и поддержка ─────────

/** Пока открыт красный сигнал, бот молчит: с пациентом связывается врач, а не автоматические сообщения */
export function botSilenced(db: DB, patientId: string): boolean {
  return db.alerts.some((a) => a.patientId === patientId && a.level === 'red' && a.status !== 'closed');
}

function botPush(db: DB, p: Patient, m: Omit<BotMessage, 'id' | 'patientId' | 'channel'>, notify: boolean) {
  db.botFeed.push({ ...m, id: uid('bot'), patientId: p.id, channel: notify ? p.reminderChannel : 'приложение' });
  if (notify) db.notifications.push({ id: uid('nt'), at: m.at, channel: notifyChannel(p.reminderChannel), to: p.id, text: BOT_NOTIFY });
}

function botSupport(db: DB, p: Patient, id: SupportId | null, atIso: string) {
  if (!id || botSilenced(db, p.id)) return;
  const s = SUPPORT[id];
  botPush(db, p, { at: atIso, kind: 'support', template: id, text: s.text, link: s.link }, false);
}

/** Отправить напоминания, время которых наступило (вызывается из tick раз в секунду) */
function runBot(db: DB, now: Date): number {
  let sent = 0;
  for (const p of db.patients) {
    if (p.archived || !p.therapyStart || !isTherapyActiveDb(db, p.id) || botSilenced(db, p.id)) continue;
    const events = db.medEvents.filter((e) => e.patientId === p.id);
    const feed = db.botFeed.filter((m) => m.patientId === p.id);
    for (const r of dueReminders(new Date(p.therapyStart), events, feed, now)) {
      if (r.again) for (const m of db.botFeed) if (m.patientId === p.id && m.slotKey === r.key) m.remindAgainAt = null;
      botPush(db, p, { at: now.toISOString(), kind: 'reminder', template: r.again ? 'again' : r.slot, text: reminderText(r), slot: r.slot, slotKey: r.key, scheduledAt: r.scheduledAt.toISOString(), answer: null }, true);
      sent++;
    }
  }
  return sent;
}

function isTherapyActiveDb(db: DB, patientId: string) {
  return db.prescriptions.some((r) => r.patientId === patientId && (r.status === 'confirmed' || r.status === 'modified'));
}

function botDue(db: DB, now: Date): boolean {
  return db.patients.some(
    (p) =>
      !p.archived &&
      p.therapyStart &&
      isTherapyActiveDb(db, p.id) &&
      !botSilenced(db, p.id) &&
      dueReminders(
        new Date(p.therapyStart),
        db.medEvents.filter((e) => e.patientId === p.id),
        db.botFeed.filter((m) => m.patientId === p.id),
        now,
      ).length > 0,
  );
}

/** История бота для стенда: напоминания за 3 дня с ответами пациента и поддержка по тем же правилам */
function seedBotHistory(db: DB, now: Date) {
  for (const p of db.patients) {
    if (!p.therapyStart || !isTherapyActiveDb(db, p.id) || botSilenced(db, p.id)) continue;
    const events = db.medEvents.filter((e) => e.patientId === p.id && Date.parse(e.scheduledAt) > now.getTime() - 3 * DAY).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    const all = db.medEvents.filter((e) => e.patientId === p.id);
    for (const e of events) {
      const when = new Date(e.scheduledAt);
      if (now.getTime() - when.getTime() < 3 * HOUR) continue; // текущее окно — пусть отправит tick
      const answeredAt = e.recordedAt;
      botPush(db, p, { at: e.scheduledAt, kind: 'reminder', template: e.slot, text: reminderText({ slot: e.slot, key: '', scheduledAt: when, again: false }), slot: e.slot, slotKey: slotKey(when, e.slot), scheduledAt: e.scheduledAt, answer: e.status, answeredAt }, true);
      const upTo = all.filter((x) => x.scheduledAt <= e.scheduledAt);
      botSupport(db, p, supportAfterDose(e.status, upTo, db.botFeed.filter((m) => m.patientId === p.id), new Date(answeredAt)), answeredAt);
    }
  }
  db.botFeed.sort((a, b) => a.at.localeCompare(b.at));
}

// ───────── Обработка событий: правила → сигналы ─────────

const TRIGGER_TIME_FACT: Record<string, string> = {
  'phq9.id': 'phq9.at',
  'text.lastId': 'text.lastAt',
  'meds.newInteractingKey': 'meds.newInteractingAt',
};

function triggerTime(hit: RuleHit, facts: Facts, fallback: string): string {
  if (hit.rule.anchor && TRIGGER_TIME_FACT[hit.rule.anchor]) return (facts[TRIGGER_TIME_FACT[hit.rule.anchor]] as string) ?? fallback;
  if (hit.rule.id.startsWith('ADH-')) return (facts['adherence.lastMissAt'] as string) ?? fallback;
  if (hit.rule.id.startsWith('AE-') || hit.rule.id.startsWith('SLEEP-')) return (facts['checkin.lastAt'] as string) ?? fallback;
  return fallback;
}

export interface ProcessOptions {
  trigger: string;
  seed?: boolean; // при создании стенда: сигналы считаются доставленными в момент события
}

export function processPatient(db: DB, patientId: string, opts: ProcessOptions): Alert[] {
  const p = patientOf(db, patientId);
  const now = standNow(db);
  const t0 = performance.now();
  const facts = buildFacts(db, p, now);
  const hits = evaluateAlerts(facts);
  const evalMs = performance.now() - t0;
  if (!opts.seed) db.metrics.push({ kind: 'rule_eval', ms: evalMs, at: now.toISOString(), note: opts.trigger });

  const created: Alert[] = [];
  for (const hit of hits) {
    const anchorVal = hit.rule.anchor ? facts[hit.rule.anchor] : null;
    const dedupKey = `${hit.rule.id}:${anchorVal ?? 'state'}`;
    const same = db.alerts.filter((a) => a.patientId === p.id && a.ruleId === hit.rule.id);
    if (anchorVal && same.some((a) => a.dedupKey === dedupKey)) continue; // это событие уже обработано
    if (same.some((a) => a.status !== 'closed' && a.status !== 'false_positive')) continue; // уже открыт
    if (!anchorVal && same.some((a) => a.closedAt && now.getTime() - Date.parse(a.closedAt) < DAY)) continue; // закрыт менее суток назад

    const level = hit.rule.level ?? 'yellow';
    const eventAt = triggerTime(hit, facts, now.toISOString());
    const createdAt = opts.seed ? new Date(Math.min(Date.parse(eventAt) + 40_000, now.getTime() - 60_000)) : now;
    const alert: Alert = {
      id: uid('al'),
      patientId: p.id,
      level,
      ruleId: hit.rule.id,
      ruleVersion: hit.rule.version,
      title: hit.rule.title,
      reason: hit.rule.messageDoctor,
      facts: hit.matched,
      triggerEventAt: eventAt,
      firstEventAt: hit.rule.id.startsWith('ADH-') ? ((facts['adherence.firstMissAt'] as string) ?? undefined) : undefined,
      dedupKey,
      createdAt: createdAt.toISOString(),
      createdAtMs: opts.seed ? Date.now() - (now.getTime() - createdAt.getTime()) : Date.now(),
      status: 'new',
      escalationStep: 0,
      escalations: [],
      channels: [],
      checklist: (level === 'red' ? RED_CHECKLIST : ORANGE_CHECKLIST).map((c) => ({ ...c, done: false })),
    };
    const ch = (channel: AlertChannelLog['channel'], text: string): AlertChannelLog => ({ channel, to: p.doctorId, at: alert.createdAt, text });
    alert.channels.push(ch('screen', level === 'yellow' ? 'Ежедневный дайджест и карточка пациента' : 'Панель сигналов врача'));
    if (level === 'red') {
      alert.channels.push(ch('push', NOTIFY_TEXTS.pushRed), ch('sms', NOTIFY_TEXTS.smsRed), ch('email', NOTIFY_TEXTS.emailRed));
    } else if (level === 'orange') {
      const doc = doctorOf(db, p);
      alert.channels.push(
        ch('push', inWorkHours(db, createdAt, p) ? NOTIFY_TEXTS.pushOrange : `${NOTIFY_TEXTS.pushOrange} (отложено до рабочего времени врача${doc ? `: ${doc.schedule.label}` : ''})`),
      );
    }
    for (const c of alert.channels.filter((c) => c.channel !== 'screen')) {
      db.notifications.push({ id: uid('nt'), at: c.at, channel: c.channel, to: c.to, text: c.text, alertId: alert.id });
    }
    if (opts.seed) {
      alert.deliveredAt = new Date(createdAt.getTime() + 1200).toISOString();
      alert.deliveryMs = 1200;
      alert.status = 'delivered';
    }
    db.alerts.push(alert);
    created.push(alert);

    // Действия на стороне пациента
    const actions = hit.rule.actions ?? [];
    if (!opts.seed) {
      // Доверенное лицо получает сигнал только если пациент сам выбрал это при назначении и согласие действует
      const tc = p.trustedPerson;
      const tcConsent = p.consents.some((c) => c.purpose === 'trusted_person' && c.signedAt && !c.revokedAt);
      if (hit.rule.id === 'SAFETY-SOS-UNSAFE' && tc && tc.scope === 'adherence_safety' && tcConsent) {
        db.notifications.push({ id: uid('nt'), at: now.toISOString(), channel: tc.channel, to: `Доверенное лицо (${p.code})`, text: 'Компас: вашему близкому сейчас может понадобиться поддержка. Пожалуйста, свяжитесь с ним.' });
      }
      if (actions.includes('patient_safe_screen')) systemToPatient(db, p.id, PATIENT_TEXTS.red, 'safe_template', undefined, 'safety');
      else if (actions.includes('patient_doctor_notified')) {
        const recentSame = db.messages.some((m) => m.patientId === p.id && m.from === 'system' && now.getTime() - Date.parse(m.at) < 2 * MIN);
        if (!recentSame) systemToPatient(db, p.id, hit.rule.messagePatient ?? PATIENT_TEXTS.doctorNotified, 'auto_answer');
      }
      if (actions.includes('patient_soft_reminder')) {
        db.notifications.push({ id: uid('nt'), at: now.toISOString(), channel: 'messenger', to: p.id, text: NOTIFY_TEXTS.reminder });
      }
    }

    // Предложения врачу (статус «Предложено» до решения)
    for (const text of hit.rule.suggest ?? []) {
      const exists = db.suggestions.some((s) => s.patientId === p.id && s.text === text && s.status === 'proposed');
      if (!exists) db.suggestions.push(newSuggestion(p.id, hit, text, 'safety', createdAt.toISOString()));
    }
    audit(db, 'system', `Сигнал «${LEVEL_WORD[level]}»: ${hit.rule.title}`, p.id, `Правило ${hit.rule.id} v${hit.rule.version}; каналы: ${alert.channels.map((c) => c.channel).join(', ')}`);
  }

  refreshTherapySuggestions(db, p, facts);
  return created;
}

const LEVEL_WORD = { red: 'красный', orange: 'оранжевый', yellow: 'жёлтый' } as const;

function newSuggestion(patientId: string, hit: RuleHit, text: string, kind: Suggestion['kind'], at: string): Suggestion {
  return {
    id: uid('sg'),
    patientId,
    ruleId: hit.rule.id,
    ruleVersion: hit.rule.version,
    text,
    kind,
    status: 'proposed',
    createdAt: at,
    facts: hit.matched,
  };
}

function refreshTherapySuggestions(db: DB, p: Patient, facts: Facts) {
  const check = checkTherapy(facts);
  for (const s of check.suggestions) {
    const exists = db.suggestions.some((x) => x.patientId === p.id && x.ruleId === s.rule.id && (x.status === 'proposed' || x.decidedAt));
    if (!exists) db.suggestions.push(newSuggestion(p.id, s, s.rule.messageDoctor, 'therapy', standNow(db).toISOString()));
  }
}

// ───────── Сервер: эскалация и доставка ─────────

/** Вызывается раз в секунду в каждой открытой вкладке. Таймеры считаются от реального времени × скорость демо. */
export function tick() {
  const db = getDB();
  const nowMs = Date.now();
  const [m1, m2] = db.settings.escalationMinutes;
  const speed = db.settings.demoSpeed || 1;
  const due = db.alerts.filter((a) => {
    if (a.level !== 'red' || a.ackAt || !['new', 'delivered', 'viewed'].includes(a.status)) return false;
    const mins = ((nowMs - a.createdAtMs) / MIN) * speed;
    const target = mins >= m2 ? 2 : mins >= m1 ? 1 : 0;
    return target > a.escalationStep;
  });
  const repeat = db.alerts.filter(
    (a) => a.level === 'orange' && !a.viewedAt && !a.repeatedAt && a.status !== 'closed' && ((nowMs - a.createdAtMs) / MIN) * speed >= 24 * 60,
  );
  if (botDue(db, standNow(db))) mutate((d) => runBot(d, standNow(d)));
  if (!due.length && !repeat.length) return;
  mutate((d) => {
    for (const x of due) {
      const a = d.alerts.find((y) => y.id === x.id);
      if (!a || a.ackAt) continue;
      const mins = ((nowMs - a.createdAtMs) / MIN) * speed;
      const target = mins >= m2 ? 2 : mins >= m1 ? 1 : 0;
      while (a.escalationStep < target) {
        a.escalationStep++;
        const to = a.escalationStep === 1 ? 'd2' : 'h1';
        const atIso = standNow(d).toISOString();
        a.escalations.push({ step: a.escalationStep, at: atIso, to });
        for (const channel of ['push', 'sms'] as const) {
          a.channels.push({ channel, to, at: atIso, text: NOTIFY_TEXTS.escalation });
          d.notifications.push({ id: uid('nt'), at: atIso, channel, to, text: NOTIFY_TEXTS.escalation, alertId: a.id });
        }
        const u = d.users.find((x) => x.id === to);
        audit(d, 'system', `Эскалация сигнала: нет подтверждения ${a.escalationStep === 1 ? m1 : m2} мин → ${u?.title ?? to}`, a.patientId, `Сигнал ${a.ruleId}`);
      }
    }
    for (const x of repeat) {
      const a = d.alerts.find((y) => y.id === x.id);
      if (!a) continue;
      a.repeatedAt = standNow(d).toISOString();
      a.channels.push({ channel: 'push', to: a.patientId && d.patients.find((p) => p.id === a.patientId)!.doctorId, at: a.repeatedAt, text: NOTIFY_TEXTS.repeat });
      audit(d, 'system', 'Повтор уведомления: нет реакции 24 ч', a.patientId, a.ruleId);
    }
  });
}

/** Отметка доставки: вызывает вкладка врача, получившая новые сигналы (замер времени доставки) */
export function markDelivered(alertIds: string[]) {
  if (!alertIds.length) return;
  mutate((db) => {
    const t = Date.now();
    for (const id of alertIds) {
      const a = db.alerts.find((x) => x.id === id);
      if (!a || a.deliveredAt) continue;
      a.deliveredAt = standNow(db).toISOString();
      a.deliveryMs = Math.max(0, t - a.createdAtMs);
      if (a.status === 'new') a.status = 'delivered';
      db.metrics.push({ kind: 'alert_delivery', ms: a.deliveryMs, at: a.deliveredAt, note: `${a.level} · ${a.ruleId}` });
    }
  });
}

// ───────── Пациент ─────────

export interface CheckinInput {
  mood: number;
  anxiety: number;
  sleep: Checkin['sleep'];
  sleepDetail?: string[];
  sleepHours?: Checkin['sleepHours'];
  sideEffects: string[];
  note: string;
  taps: number;
  durationMs: number;
}

function upsertAE(db: DB, p: Patient, term: string, now: Date) {
  const severe = ['судороги', 'обморок', 'тяжёлая аллергическая реакция'].includes(term);
  const existing = db.adverseEvents.find((a) => a.patientId === p.id && a.term === term && a.status === 'active');
  if (existing) {
    existing.lastReportedAt = now.toISOString();
    const days = new Set(
      db.checkins.filter((c) => c.patientId === p.id && c.sideEffects.includes(term)).map((c) => startOfDay(new Date(c.at)).getTime()),
    ).size;
    if (severe) existing.severity = 'severe';
    else if (days >= 3 && existing.severity === 'mild') existing.severity = 'moderate';
    return;
  }
  const ae: AdverseEvent = {
    id: uid('ae'),
    patientId: p.id,
    term,
    severity: severe ? 'severe' : 'mild',
    onset: now.toISOString(),
    lastReportedAt: now.toISOString(),
    status: 'active',
  };
  db.adverseEvents.push(ae);
}

export function submitCheckin(patientId: string, input: CheckinInput, opts: { simulated?: boolean } = {}): Alert[] {
  return mutate((db) => {
    const p = patientOf(db, patientId);
    const now = standNow(db);
    const ci: Checkin = { id: uid('ci'), patientId, at: now.toISOString(), ...input };
    db.checkins.push(ci);
    for (const term of input.sideEffects) upsertAE(db, p, term, now);
    // В метрики попадают только настоящие замеры, не демо-кнопки
    if (!opts.simulated) db.metrics.push({ kind: 'checkin', ms: input.durationMs, taps: input.taps, at: ci.at });
    audit(db, patientId, 'Ежедневная запись (чек-ин)', patientId, `${input.taps} нажатий, ${(input.durationMs / 1000).toFixed(0)} с`);
    const meds = input.note ? findMedsInText(input.note).filter((m) => !p.meds.includes(m)) : [];
    for (const m of meds) addMedInternal(db, p, m, 'patient', 'Упомянут в заметке дневника');
    const alerts = processPatient(db, patientId, { trigger: 'checkin' });
    const therapyDay = p.therapyStart && isTherapyActiveDb(db, p.id) ? Math.floor((now.getTime() - Date.parse(p.therapyStart)) / DAY) + 1 : null;
    botSupport(db, p, supportAfterCheckin(input, therapyDay, db.botFeed.filter((m) => m.patientId === patientId), now), now.toISOString());
    return alerts;
  });
}

export function markDose(patientId: string, slot: 'morning' | 'evening', status: DoseStatus, reason?: MissReason, day?: Date): Alert[] {
  return mutate((db) => {
    const now = standNow(db);
    const d = day ?? now;
    const scheduled = at(d, SLOT_HOURS[slot]);
    const key = slotKey(scheduled, slot);
    db.medEvents = db.medEvents.filter((e) => !(e.patientId === patientId && slotKey(new Date(e.scheduledAt), e.slot) === key));
    db.medEvents.push({ id: uid('me'), patientId, scheduledAt: scheduled.toISOString(), slot, status, reason, recordedAt: now.toISOString() });
    const word = status === 'taken' ? 'Принял(а)' : status === 'missed' ? 'Пропустил(а)' : 'Позже';
    audit(db, patientId, `Отметка приёма: ${word}`, patientId, slot === 'morning' ? 'утро' : 'вечер');
    if (status === 'missed') {
      const p = patientOf(db, patientId);
      const ans = (p.tone === 'brief' ? 'Не принимайте двойную дозу. Следующую — в обычное время.' : 'Вы пропустили приём. Не принимайте двойную дозу: следующую таблетку примите в обычное время — так сказано в инструкции к препарату. Я отмечу это в дневнике, врач увидит.');
      systemToPatient(db, patientId, ans, 'auto_answer', 'S4 · Если вы забыли принять препарат', 'missed');
    }
    // Ответ на напоминание бота: отметка из ленты или с экрана «Сегодня» закрывает напоминание
    const reminders = db.botFeed.filter((m) => m.patientId === patientId && m.kind === 'reminder' && m.slotKey === key);
    for (const m of reminders) {
      m.answer = status;
      m.answeredAt = now.toISOString();
      m.remindAgainAt = null;
    }
    if (status === 'later' && reminders.length) reminders[reminders.length - 1].remindAgainAt = new Date(now.getTime() + LATER_MS).toISOString();
    const alerts = processPatient(db, patientId, { trigger: 'dose' });
    const p = patientOf(db, patientId);
    botSupport(db, p, supportAfterDose(status, db.medEvents.filter((e) => e.patientId === patientId), db.botFeed.filter((m) => m.patientId === patientId), now), now.toISOString());
    return alerts;
  });
}

export function submitScale(
  patientId: string,
  scale: ScaleId,
  answers: number[],
  durationMs: number | null,
  enteredBy: 'patient' | 'curator' = 'patient',
): { total: number; band: string; alerts: Alert[] } {
  return mutate((db) => {
    const s = scoreScale(scale, answers);
    const atIso = nowIso(db);
    db.assessments.push({ id: uid('as'), patientId, scale, answers, total: s.total, subscores: s.subscores, band: s.band, enteredBy, at: atIso });
    if (scale === 'PHQ9' && durationMs !== null) db.metrics.push({ kind: 'phq9_fill', ms: durationMs, at: atIso });
    audit(db, enteredBy === 'curator' ? 'curator' : patientId, `Шкала ${scale}: ${s.total} (${s.band})`, patientId, enteredBy === 'curator' ? 'Введено куратором' : 'Самоотчёт пациента');
    const alerts = processPatient(db, patientId, { trigger: `scale:${scale}` });
    return { total: s.total, band: s.band, alerts };
  });
}

export interface PatientMessageResult {
  answer: PackAnswer | null;
  crisis: boolean;
  handoff: boolean;
  alerts: Alert[];
}

export const MAX_AUDIO_CHARS = 1_500_000;

function checkAudio(a: VoiceAudio) {
  if (!a.dataUrl.startsWith('data:audio/')) throw new Error('Голосовое сообщение повреждено');
  if (a.dataUrl.length > MAX_AUDIO_CHARS) throw new Error('Голосовое слишком длинное — запишите до 1 минуты');
}

export function sendPatientMessage(patientId: string, text: string, opts: { voice?: boolean; audio?: VoiceAudio } = {}): PatientMessageResult {
  if (opts.audio) checkAudio(opts.audio);
  // Голосовое без расшифровки: содержание неизвестно — не отвечаем автоматически, передаём врачу прослушать
  if (opts.audio && !text.trim()) {
    return mutate((db) => {
      const p = patientOf(db, patientId);
      const now = standNow(db);
      db.messages.push({ id: uid('msg'), patientId, from: 'patient', text: '', at: now.toISOString(), kind: 'question', intent: 'voice', readByDoctor: false, readByPatient: true, voice: true, audio: opts.audio });
      audit(db, patientId, 'Голосовое сообщение врачу', patientId, `${Math.round(opts.audio!.durationMs / 1000)} с, без расшифровки`);
      systemToPatient(db, patientId, PATIENT_TEXTS.voiceNoTranscript, 'handoff');
      const doc = doctorOf(db, p);
      if (doc && !inWorkHours(db, now, p)) systemToPatient(db, patientId, PATIENT_TEXTS.offHours(replyText(doc.schedule, now)), 'handoff');
      return { answer: null, crisis: false, handoff: true, alerts: processPatient(db, patientId, { trigger: 'message' }) };
    });
  }
  return mutate((db) => {
    const p = patientOf(db, patientId);
    const now = standNow(db);
    const r = answerQuestion(text);
    const msgId = uid('msg');
    db.messages.push({
      id: msgId,
      patientId,
      from: 'patient',
      text,
      at: now.toISOString(),
      kind: 'question',
      intent: r.answer?.id,
      readByDoctor: false,
      readByPatient: true,
      ...(opts.voice || opts.audio ? { voice: true } : {}),
      ...(opts.audio ? { audio: opts.audio } : {}),
    });
    audit(db, patientId, 'Сообщение врачу', patientId);
    for (const m of r.meds.filter((m) => !p.meds.includes(m))) addMedInternal(db, p, m, 'patient', 'Упомянут в сообщении');
    let handoff = false;
    if (r.crisis.crisis || r.crisis.psychosis) {
      // Кризисные формулировки не «обсуждаются»: только шаблон и красный сигнал (создаётся правилом)
    } else if (r.answer) {
      systemToPatient(db, patientId, r.answer.answer, 'auto_answer', `S4 · ${r.answer.section}`, r.answer.id);
      handoff = r.answer.notifyDoctor;
    } else {
      systemToPatient(db, patientId, PATIENT_TEXTS.unknown, 'handoff');
      handoff = true;
    }
    const doc = doctorOf(db, p);
    if (doc && !inWorkHours(db, now, p) && !(r.crisis.crisis || r.crisis.psychosis)) systemToPatient(db, patientId, PATIENT_TEXTS.offHours(replyText(doc.schedule, now)), 'handoff');
    const alerts = processPatient(db, patientId, { trigger: 'message' });
    if (r.answer?.alertLevel === 'orange' && !alerts.length) {
      // беременность: отдельный оранжевый сигнал по вопросу пациента
      const rule = { id: 'Q-PREGNANCY', version: '1.0', title: 'Вопрос пациента о беременности / грудном вскармливании' };
      const a = manualAlert(db, p, 'orange', rule.id, rule.version, rule.title, 'Пациент спрашивает о беременности или грудном вскармливании (противопоказание по инструкции).', msgId);
      alerts.push(a);
    }
    return { answer: r.answer, crisis: r.crisis.crisis || r.crisis.psychosis, handoff, alerts };
  });
}

function manualAlert(db: DB, p: Patient, level: Alert['level'], ruleId: string, ruleVersion: string, title: string, reason: string, anchor: string): Alert {
  const now = standNow(db).toISOString();
  const a: Alert = {
    id: uid('al'),
    patientId: p.id,
    level,
    ruleId,
    ruleVersion,
    title,
    reason,
    facts: [],
    triggerEventAt: now,
    dedupKey: `${ruleId}:${anchor}`,
    createdAt: now,
    createdAtMs: Date.now(),
    status: 'new',
    escalationStep: 0,
    escalations: [],
    channels: [
      { channel: 'screen', to: p.doctorId, at: now, text: 'Панель сигналов врача' },
      { channel: 'push', to: p.doctorId, at: now, text: NOTIFY_TEXTS.pushOrange },
    ],
    checklist: ORANGE_CHECKLIST.map((c) => ({ ...c, done: false })),
  };
  db.alerts.push(a);
  db.notifications.push({ id: uid('nt'), at: now, channel: 'push', to: p.doctorId, text: NOTIFY_TEXTS.pushOrange, alertId: a.id });
  audit(db, 'system', `Сигнал «${LEVEL_WORD[level]}»: ${title}`, p.id, ruleId);
  return a;
}

export function sosOpen(patientId: string): string {
  return mutate((db) => {
    const id = uid('sos');
    db.sos.push({ id, patientId, at: nowIso(db), safe: null });
    audit(db, patientId, '«Мне тяжело сейчас»: открыт экран поддержки', patientId);
    return id;
  });
}

export function sosAnswer(patientId: string, sosId: string, safe: boolean): Alert[] {
  return mutate((db) => {
    const s = db.sos.find((x) => x.id === sosId);
    if (s) {
      s.safe = safe;
      s.at = nowIso(db);
    }
    audit(db, patientId, `«Вы в безопасности?» — ${safe ? 'да' : 'нет'}`, patientId);
    if (safe) return [];
    return processPatient(db, patientId, { trigger: 'sos' });
  });
}

export function sosAction(patientId: string, action: 'breathing' | 'call_doctor' | 'call_112') {
  mutate((db) => {
    const label = { breathing: 'Дыхательное упражнение', call_doctor: 'Позвонить врачу', call_112: 'Вызов 112' }[action];
    audit(db, patientId, `Экран поддержки: ${label}`, patientId);
  });
}

/** «Я в безопасности»: убирает экран поддержки у пациента, но НЕ закрывает сигнал — это делает только врач */
export function confirmSafe(patientId: string) {
  mutate((db) => {
    const t = nowIso(db);
    for (const a of db.alerts) if (a.patientId === patientId && a.level === 'red' && !a.patientSafeAt && a.status !== 'closed') a.patientSafeAt = t;
    audit(db, patientId, '«Я в безопасности»', patientId, 'Сигнал остаётся у врача до закрытия');
  });
}

function addMedInternal(db: DB, p: Patient, name: string, by: 'patient' | 'doctor', note?: string) {
  const n = name.trim().toLowerCase();
  if (!n) return;
  if (!p.meds.includes(n)) p.meds.push(n);
  p.medLog.push({ name: n, at: nowIso(db), by, note });
  audit(db, by === 'patient' ? p.id : p.doctorId, `Добавлен препарат: ${n}`, p.id, by === 'patient' ? 'Со слов пациента' : 'Внесено врачом');
}

export function reportMed(patientId: string, name: string, note?: string): Alert[] {
  return mutate((db) => {
    const p = patientOf(db, patientId);
    addMedInternal(db, p, name, 'patient', note);
    const alerts = processPatient(db, patientId, { trigger: 'med' });
    return alerts;
  });
}

// ───────── Подключение пациента ─────────

export function findInvite(code: string): Patient | undefined {
  const c = code.trim().toUpperCase();
  return getDB().patients.find((p) => p.inviteCode.toUpperCase() === c);
}

export function setTrustedContact(patientId: string, contact: TrustedContact | null) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    p.trustedPerson = contact;
    const c = p.consents.find((x) => x.purpose === 'trusted_person');
    if (c) {
      if (contact) {
        c.signedAt = nowIso(db);
        c.revokedAt = null;
      } else c.revokedAt = nowIso(db);
    }
    audit(db, patientId, contact ? `Доверенное лицо назначено: ${contact.relation}` : 'Доверенное лицо удалено', patientId, contact ? `Получает: ${contact.scope === 'adherence' ? 'статус приёма' : 'статус приёма и сигнал «не в безопасности»'}` : undefined);
  });
}

export function setReminderChannel(patientId: string, channel: Patient['reminderChannel']) {
  mutate((db) => {
    patientOf(db, patientId).reminderChannel = channel;
    audit(db, patientId, `Канал напоминаний: ${channel}`, patientId);
  });
}

/** «К приёму»: пациент заранее пишет, что беспокоит и что хочет обсудить — врач видит это в превью */
export function savePrevisit(patientId: string, data: { concerns: string; changes: string; questions: string }) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    p.previsit = { ...data, at: nowIso(db) };
    audit(db, patientId, 'Пациент заполнил «К приёму»', patientId);
  });
}

export function archivePatient(patientId: string, userId: string, reason: string) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    p.archived = { at: nowIso(db), by: userId, reason };
    audit(db, userId, 'Пациент переведён в архив', patientId, reason);
  });
}

export function restorePatient(patientId: string, userId: string) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    p.archived = null;
    audit(db, userId, 'Пациент возвращён из архива', patientId);
  });
}

/** Предел для PDF и файлов без сжатия; фото уменьшаются при загрузке (patient/Documents.tsx) */
export const MAX_DOC_BYTES = 5_000_000;

export function addDocument(doc: Omit<PatientDocument, 'id' | 'at'>) {
  mutate((db) => {
    db.documents.push({ ...doc, id: uid('doc'), at: nowIso(db) });
    audit(db, doc.uploadedBy === 'patient' ? doc.patientId : patientOf(db, doc.patientId).doctorId, `Прикреплён документ: ${doc.name}`, doc.patientId, `${Math.round(doc.size / 1024)} КБ`);
  });
}

/** Печатная версия скана: текст распознан в браузере, врач проверил (и при необходимости исправил) и сохранил */
export function saveDocumentText(docId: string, userId: string, text: string, meta: { confidence: number | null; edited: boolean; engine: string }) {
  mutate((db) => {
    const doc = db.documents.find((d) => d.id === docId);
    if (!doc) throw new Error(`Документ ${docId} не найден`);
    doc.ocr = { text: text.trim(), confidence: meta.confidence, edited: meta.edited, at: nowIso(db), by: userId, engine: meta.engine };
    audit(db, userId, meta.edited ? 'Распознан текст документа, исправлен врачом' : 'Распознан текст документа, проверен врачом', doc.patientId, doc.name);
  });
}

/** Дословная запись слов пациента на приёме («со слов пациента») — голосом или вручную */
export function addPatientWords(patientId: string, userId: string, text: string, voice: boolean) {
  const t = text.trim();
  if (!t) return;
  mutate((db) => {
    patientOf(db, patientId);
    db.patientWords.push({ id: uid('pw'), patientId, text: t, at: nowIso(db), by: userId, voice });
    audit(db, userId, voice ? 'Записано со слов пациента (голосом)' : 'Записано со слов пациента', patientId);
  });
}

export function removePatientWords(id: string, userId: string) {
  mutate((db) => {
    const w = db.patientWords.find((x) => x.id === id);
    if (!w) return;
    db.patientWords = db.patientWords.filter((x) => x.id !== id);
    audit(db, userId, 'Удалена запись «со слов пациента»', w.patientId);
  });
}

export function markDocumentsViewed(patientId: string, userId: string) {
  const db = getDB();
  if (!db.documents.some((d) => d.patientId === patientId && !d.viewedByDoctor)) return;
  mutate((d) => {
    for (const doc of d.documents) if (doc.patientId === patientId) doc.viewedByDoctor = true;
    audit(d, userId, 'Просмотрены прикреплённые документы', patientId);
  });
}

export function createTelemed(req: Omit<TelemedRequest, 'id' | 'at'>) {
  return mutate((db) => {
    const r: TelemedRequest = { ...req, id: uid('tm'), at: nowIso(db) };
    db.telemed.push(r);
    audit(db, req.createdBy, `Телемедицинская консультация: ${req.type === 'doctor_doctor' ? 'запрос врач — врач' : req.type === 'doctor_patient' ? 'онлайн-приём врач — пациент' : 'запрос пациента'}`, req.patientId, `${req.urgency}; ${req.to}`);
    if (req.type === 'doctor_patient') {
      const p = patientOf(db, req.patientId);
      systemToPatient(db, p.id, 'Врач предложил онлайн-консультацию. Время подтвердит клиника — ссылка придёт в приложение.', 'auto_answer');
      notifyPatient(db, p, 'Компас: у вас новое сообщение по записи.');
    }
    return r;
  });
}

export function requestTelemedByPatient(patientId: string, text: string) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    db.telemed.push({ id: uid('tm'), patientId, type: 'patient_request', to: doctorOf(db, p)?.name ?? '', urgency: 'плановая', text, status: 'sent', createdBy: patientId, at: nowIso(db) });
    db.messages.push({ id: uid('msg'), patientId, from: 'patient', text: `Прошу онлайн-консультацию. ${text}`.trim(), at: nowIso(db), kind: 'question', intent: 'telemed_request', readByDoctor: false, readByPatient: true });
    audit(db, patientId, 'Пациент запросил онлайн-консультацию', patientId);
  });
}

export function completeOnboarding(patientId: string, purposes: string[], channel: Patient['reminderChannel'], trusted: TrustedContact | null) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    const t = nowIso(db);
    p.consents = defaultConsents(null).map((c) => ({ ...c, signedAt: purposes.includes(c.purpose) ? t : null }));
    p.onboarded = true;
    p.reminderChannel = channel;
    p.trustedPerson = trusted;
    audit(db, patientId, 'Онбординг завершён: согласия подписаны', patientId, purposes.join(', '));
  });
}

export function setConsent(patientId: string, purpose: string, value: boolean) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    const c = p.consents.find((x) => x.purpose === purpose);
    if (!c) return;
    if (value) {
      c.signedAt = nowIso(db);
      c.revokedAt = null;
    } else c.revokedAt = nowIso(db);
    audit(db, patientId, `${value ? 'Дано' : 'Отозвано'} согласие: ${purpose}`, patientId);
  });
}

// ───────── Врач ─────────

export function viewPatient(patientId: string, userId: string) {
  const db = getDB();
  const last = [...db.audit].reverse().find((a) => a.patientId === patientId && a.actor === userId && a.action === 'Просмотр карточки');
  if (last && standNow(db).getTime() - Date.parse(last.at) < 5 * MIN) return;
  mutate((d) => {
    audit(d, userId, 'Просмотр карточки', patientId);
    for (const m of d.messages) if (m.patientId === patientId && !m.readByDoctor) m.readByDoctor = true;
  });
}

export function viewAlert(alertId: string, userId: string) {
  mutate((db) => {
    const a = db.alerts.find((x) => x.id === alertId);
    if (!a || a.viewedAt) return;
    a.viewedAt = nowIso(db);
    if (a.status === 'new' || a.status === 'delivered') a.status = 'viewed';
    audit(db, userId, 'Открыт сигнал', a.patientId, a.ruleId);
  });
}

export function ackAlert(alertId: string, userId: string) {
  mutate((db) => {
    const a = db.alerts.find((x) => x.id === alertId);
    if (!a || a.ackAt) return;
    const t = nowIso(db);
    if (!a.viewedAt) a.viewedAt = t;
    a.ackAt = t;
    a.ackBy = userId;
    a.status = 'in_work';
    audit(db, userId, 'Сигнал принят в работу', a.patientId, `${a.ruleId}; через ${Math.round((Date.now() - a.createdAtMs) / 1000)} с после создания`);
  });
}

export function toggleChecklist(alertId: string, itemId: string, userId: string) {
  mutate((db) => {
    const a = db.alerts.find((x) => x.id === alertId);
    const it = a?.checklist.find((c) => c.id === itemId);
    if (!a || !it) return;
    it.done = !it.done;
    audit(db, userId, `Чек-лист: ${it.label} — ${it.done ? 'выполнено' : 'снята отметка'}`, a.patientId);
  });
}

export function closeAlert(alertId: string, userId: string, comment: string, falsePositive = false) {
  mutate((db) => {
    const a = db.alerts.find((x) => x.id === alertId);
    if (!a) return;
    const t = nowIso(db);
    if (!a.ackAt) {
      a.ackAt = t;
      a.ackBy = userId;
    }
    if (!a.viewedAt) a.viewedAt = t;
    a.closedAt = t;
    a.closeComment = comment;
    a.status = falsePositive ? 'false_positive' : 'closed';
    audit(db, userId, falsePositive ? 'Сигнал отмечен как ложное срабатывание' : 'Сигнал закрыт', a.patientId, comment || a.ruleId);
  });
}

export function decideSuggestion(suggestionId: string, userId: string, decision: 'confirmed' | 'modified' | 'declined', text?: string, comment?: string) {
  mutate((db) => {
    const s = db.suggestions.find((x) => x.id === suggestionId);
    if (!s) return;
    s.status = decision;
    s.decidedBy = userId;
    s.decidedAt = nowIso(db);
    if (decision === 'modified') s.modifiedText = text;
    s.comment = comment;
    const word = { confirmed: 'Принято', modified: 'Изменено', declined: 'Отклонено' }[decision];
    audit(db, userId, `Предложение: ${word}`, s.patientId, `${s.ruleId}${decision === 'modified' ? `; исходный и изменённый варианты сохранены` : ''}${comment ? `; ${comment}` : ''}`);
    if (s.ruleId === 'AVI-SUG-REGIMEN' && decision !== 'declined') {
      prescribeInternal(db, s.patientId, userId, decision === 'modified' && text ? text : '20 мг 2 раза в сутки, утром и вечером, за 30 минут до еды', false);
    }
  });
}

function prescribeInternal(db: DB, patientId: string, userId: string, regimen: string, offLabel: boolean, overrideReason?: string, ackWarnings: string[] = []) {
  const p = patientOf(db, patientId);
  const t = standNow(db);
  for (const r of db.prescriptions) if (r.patientId === patientId && r.drug === 'aviandr' && (r.status === 'confirmed' || r.status === 'modified')) r.status = 'stopped';
  db.prescriptions.push({
    id: uid('rx'),
    patientId,
    drug: 'aviandr',
    regimen,
    status: 'confirmed',
    offLabel,
    overrideReason,
    decidedBy: userId,
    decidedAt: t.toISOString(),
    createdAt: t.toISOString(),
  });
  p.therapyStart = t.toISOString();
  p.lastVisitAt = t.toISOString();
  for (const s of db.suggestions) if (s.patientId === patientId && s.ruleId === 'AVI-SUG-REGIMEN' && s.status === 'proposed') {
    s.status = 'confirmed';
    s.decidedBy = userId;
    s.decidedAt = t.toISOString();
  }
  audit(
    db,
    userId,
    offLabel ? 'Назначение ВНЕ ИНСТРУКЦИИ подписано врачом' : 'Назначение подписано врачом',
    patientId,
    `«Авиандр»: ${regimen}${overrideReason ? `; обоснование: ${overrideReason}` : ''}${ackWarnings.length ? `; ознакомлен с предупреждениями: ${ackWarnings.join(', ')}` : ''}`,
  );
  systemToPatient(db, patientId, PATIENT_TEXTS.planConfirmed, 'auto_answer');
  notifyPatient(db, p, NOTIFY_TEXTS.planUpdated);
}

export function prescribe(patientId: string, userId: string, opts: { regimen: string; offLabel: boolean; overrideReason?: string; ackWarnings: string[] }) {
  mutate((db) => prescribeInternal(db, patientId, userId, opts.regimen, opts.offLabel, opts.overrideReason, opts.ackWarnings));
}

/** Проверка документов специалиста в реестре. В прототипе — имитация: запрос «на проверке» подтверждается,
 *  остальные записи перепроверяются. В пилоте — запрос к ФРМР через ЕГИСЗ (доступ медицинской организации). */
export function verifyCredentials(userId: string, actorId: string) {
  mutate((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new Error(`Сотрудник ${userId} не найден`);
    const now = standNow(db);
    if (u.credentials.registryStatus === 'pending') u.credentials.registryStatus = 'found';
    u.credentials.lastCheck = now.toISOString();
    u.credentials.checkedAt = now.toLocaleDateString('ru-RU');
    audit(db, actorId, `Проверка документов специалиста в реестре (имитация): ${u.name}`, undefined, `${u.credentials.registry}; запись ${u.credentials.registryStatus === 'found' ? 'найдена' : 'не найдена'}; аккредитация до ${u.credentials.accreditationUntil}`);
  });
}

/** Действующее назначение «Авиандра» */
export function activeRx(db: DB, patientId: string) {
  return [...db.prescriptions].reverse().find((r) => r.patientId === patientId && r.drug === 'aviandr' && (r.status === 'confirmed' || r.status === 'modified'));
}

/** Рецепт (бланк 107-1/у) по действующему назначению. Возвращает запись или ошибку, если назначения нет. */
export function issueRecipe(patientId: string, userId: string, qty: number, signa: string): RecipeRecord {
  return mutate((db) => {
    const p = patientOf(db, patientId);
    const rx = activeRx(db, patientId);
    if (!rx) throw new Error('Нет действующего назначения — рецепт не выписывается');
    if (!Number.isInteger(qty) || qty <= 0) throw new Error('Количество таблеток должно быть целым положительным числом');
    if (signa.trim().length < 10) throw new Error('Укажите способ применения (D.S.)');
    const r = aviandrRecipe(qty, signa);
    const rec: RecipeRecord = { id: uid('rc'), qty, signa: signa.trim(), text: r.text, blank: RECIPE_BLANK, at: nowIso(db), by: userId, days: r.days };
    (rx.recipes ??= []).push(rec);
    audit(db, userId, `Выписан рецепт (бланк № ${RECIPE_BLANK})`, patientId, `${r.rp}; ${r.ds}`);
    notifyPatient(db, p, NOTIFY_TEXTS.recipe);
    return rec;
  });
}

/** Пациент просит новый рецепт: сообщение врачу с темой «рецепт» */
export function requestRecipe(patientId: string) {
  mutate((db) => {
    patientOf(db, patientId);
    db.messages.push({ id: uid('msg'), patientId, from: 'patient', text: PATIENT_TEXTS.recipeRequestText, at: nowIso(db), kind: 'question', intent: 'recipe_request', readByDoctor: false, readByPatient: true });
    systemToPatient(db, patientId, PATIENT_TEXTS.recipeRequested, 'handoff');
    audit(db, patientId, 'Пациент попросил новый рецепт', patientId);
  });
}

export function stopTherapy(patientId: string, userId: string, reason: string) {
  mutate((db) => {
    for (const r of db.prescriptions) if (r.patientId === patientId && (r.status === 'confirmed' || r.status === 'modified')) r.status = 'stopped';
    audit(db, userId, 'Терапия остановлена врачом', patientId, reason);
  });
}

export function logStopBlocked(patientId: string, userId: string, ruleIds: string[]) {
  mutate((db) => audit(db, userId, 'СТОП: обычный путь назначения заблокирован', patientId, ruleIds.join(', ')));
}

export function decideReferral(patientId: string, userId: string, decision: 'confirmed' | 'postponed' | 'declined', comment?: string, facts?: Facts) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    const f = facts ?? buildFacts(db, p, standNow(db));
    const r = evaluateRouting(f);
    if (!r.category) return;
    const hits = r.byCategory[r.category];
    db.referrals.push({
      id: uid('rf'),
      patientId,
      category: r.category,
      to: [...new Set(hits.map((h) => h.rule.to ?? 'психиатр'))].join('; '),
      term: hits[0].rule.term ?? '',
      criteria: hits.map((h) => h.rule.title),
      ruleIds: hits.map((h) => h.rule.id),
      status: decision,
      comment,
      decidedBy: userId,
      decidedAt: nowIso(db),
      createdAt: nowIso(db),
    });
    const word = { confirmed: 'подтверждено', postponed: 'отложено', declined: 'отклонено' }[decision];
    audit(db, userId, `Направление ${word}: ${r.category === 'urgent' ? 'ОБЯЗАТЕЛЬНО · экстренно' : r.category === 'mandatory' ? 'ОБЯЗАТЕЛЬНО' : 'ЖЕЛАТЕЛЬНО'}`, patientId, comment);
    if (decision === 'confirmed' && p.onboarded) {
      // Пациенту — нейтральная формулировка «консультация специалиста», без стигматизирующих слов
      systemToPatient(db, patientId, `Ваш врач рекомендовал консультацию специалиста (${hits[0].rule.term?.toLowerCase() ?? 'в ближайшее время'}). Подробности врач обсудит с вами; запись поможет оформить клиника.`, 'auto_answer');
      notifyPatient(db, p, 'Компас: у вас новое сообщение от врача.');
    }
  });
}

export function sendDoctorMessage(patientId: string, userId: string, text: string, audio?: VoiceAudio) {
  if (audio) checkAudio(audio);
  mutate((db) => {
    db.messages.push({ id: uid('msg'), patientId, from: 'doctor', text, at: nowIso(db), readByDoctor: true, readByPatient: false, ...(audio ? { voice: true, audio } : {}) });
    for (const m of db.messages) if (m.patientId === patientId) m.readByDoctor = true;
    notifyPatient(db, patientOf(db, patientId), NOTIFY_TEXTS.doctorMessage);
    audit(db, userId, 'Ответ пациенту в чате', patientId);
  });
}

export function markPatientRead(patientId: string) {
  const db = getDB();
  if (!db.messages.some((m) => m.patientId === patientId && !m.readByPatient)) return;
  mutate((d) => {
    for (const m of d.messages) if (m.patientId === patientId) m.readByPatient = true;
  });
}

export function saveNote(patientId: string, userId: string, text: string) {
  mutate((db) => {
    db.notes[patientId] = { text, updatedAt: nowIso(db) };
    audit(db, userId, 'Заметка врача сохранена', patientId);
  });
}

export function saveHypothesis(patientId: string, userId: string, text: string) {
  mutate((db) => {
    db.hypotheses[patientId] = { text, at: nowIso(db) };
    audit(db, userId, 'Режим «Наставник»: собственная гипотеза врача зафиксирована', patientId);
  });
}

export function updateFactors(patientId: string, userId: string, patch: Partial<PatientFactors>) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    p.factors = { ...p.factors, ...patch };
    audit(db, userId, 'Изменены факторы риска', patientId, Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', '));
    processPatient(db, patientId, { trigger: 'factors' });
  });
}

export function setMeds(patientId: string, userId: string, meds: string[]) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    const added = meds.filter((m) => !p.meds.includes(m));
    p.meds = meds;
    for (const m of added) p.medLog.push({ name: m, at: nowIso(db), by: 'doctor' });
    audit(db, userId, 'Обновлён список препаратов', patientId, meds.join(', ') || '—');
  });
}

export function setDiagnosis(patientId: string, userId: string, dx: Patient['diagnosis']) {
  mutate((db) => {
    const p = patientOf(db, patientId);
    p.diagnosis = dx;
    audit(db, userId, `Диагноз внесён врачом: ${dx.code} ${dx.label}`, patientId);
  });
}

export function enterClinicianScale(patientId: string, userId: string, scale: ScaleId, total: number) {
  mutate((db) => {
    const s = scoreClinicianTotal(scale, total);
    db.assessments.push({ id: uid('as'), patientId, scale, answers: null, total: s.total, band: s.band, enteredBy: 'doctor', at: nowIso(db) });
    audit(db, userId, `Клиническая шкала ${scale}: ${total}`, patientId, 'Оценка врача (не смешивается с самоотчётом)');
  });
}

export function setAeReportDraft(aeId: string, userId: string) {
  mutate((db) => {
    const ae = db.adverseEvents.find((a) => a.id === aeId);
    if (!ae) return;
    ae.reportDraft = true;
    audit(db, userId, 'Черновик извещения о нежелательной реакции подготовлен (отправляет врач)', ae.patientId, ae.term);
  });
}

export function setAiMode(mode: AiMode, userId: string) {
  mutate((db) => {
    db.settings.aiMode = mode;
    audit(db, userId, `Режим ИИ: ${{ mentor: 'Наставник', practice: 'Практик', silent: 'Тихий' }[mode]}`);
  });
}

export function setTone(patientId: string, userId: string, tone: Patient['tone']) {
  mutate((db) => {
    patientOf(db, patientId).tone = tone;
    audit(db, userId, `Тон сообщений пациенту: ${tone}`, patientId);
  });
}

export function invitePatient(userId: string, name: string, age: number, sex: 'f' | 'm'): Patient {
  return mutate((db) => {
    const n = db.patients.length + 1;
    const code = `KMP-${(7000 + Math.floor(Math.random() * 2900)).toString()}`;
    const p: Patient = {
      id: `p${n}_${Date.now().toString(36)}`,
      code: `П-${(100 + n).toString()}`,
      cardNo: `МК-26-${String(5000 + n).padStart(5, '0')}`,
      name: name || 'Новый пациент',
      age,
      sex,
      doctorId: userId,
      diagnosis: { code: 'F41.1', label: 'Генерализованное тревожное расстройство' },
      complaints: '',
      meds: [],
      medLog: [],
      factors: { pregnant: false, breastfeeding: false, epilepsy: false, renalModerateSevere: false, hepaticImpairment: false, maoi: false, allergy: false, drives: false, cardio: false, endocrine: false, substanceDependence: false, alcohol: 'none' },
      therapyStart: null,
      inviteCode: code,
      onboarded: false,
      consents: defaultConsents(null),
      reminderChannel: 'push',
      trustedPerson: null,
      tone: 'soft',
      lastVisitAt: nowIso(db),
      nextVisitAt: null,
      trajectory: 'improving',
      archived: null,
      previsit: null,
    };
    db.patients.push(p);
    const doc = doctorOf(db, p);
    db.messages.push({
      id: uid('msg'),
      patientId: p.id,
      from: 'doctor',
      text: `Здравствуйте! Это ${doc?.name ?? 'ваш врач'}. Здесь можно написать мне между приёмами — я отвечаю в рабочее время (${doc?.schedule.label ?? ''}).`,
      at: nowIso(db),
      readByDoctor: true,
      readByPatient: false,
    });
    audit(db, userId, `Приглашение создано: код ${code}`, p.id);
    return p;
  });
}

// ───────── Демо-стенд ─────────

export function initialStand(): DB {
  const db = seedDB(new Date());
  for (const p of db.patients) processPatient(db, p.id, { trigger: 'seed', seed: true });
  // Сообщения из истории уже «отвечены» корпусом
  for (const m of db.messages.filter((x) => x.from === 'patient')) {
    const r = answerQuestion(m.text);
    if (r.answer) db.messages.push({ id: uid('msg'), patientId: m.patientId, from: 'system', text: r.answer.answer, at: new Date(Date.parse(m.at) + 1500).toISOString(), kind: 'auto_answer', sourceRef: `S4 · ${r.answer.section}`, intent: r.answer.id, readByDoctor: true, readByPatient: true });
  }
  db.messages.sort((a, b) => a.at.localeCompare(b.at));
  seedBotHistory(db, standNow(db));
  return db;
}

export function resetStand() {
  setDB(initialStand());
}

export function recordMetric(kind: 'dossier_render' | 'route_eval', ms: number, note?: string) {
  mutate((db) => {
    db.metrics.push({ kind, ms, at: nowIso(db), note });
  });
}

export function setDemoSpeed(speed: number) {
  mutate((db) => {
    db.settings.demoSpeed = speed;
  });
}

/** Сценарий 5 одной кнопкой: пациент отправляет PHQ-9 с пунктом 9 = 2 и заметку «не вижу смысла» */
export function demoRedAlert(patientId = 'p5'): Alert[] {
  const db = getDB();
  const p = db.patients.find((x) => x.id === patientId);
  if (!p) return [];
  const rnd = mulberry32(Date.now() & 0xffff);
  const answers = answersFor(9, 16, { 8: 2 }, rnd);
  const r = submitScale(patientId, 'PHQ9', answers, null);
  const more = submitCheckin(patientId, { mood: 2, anxiety: 8, sleep: 'bad', sideEffects: [], note: 'Тяжело. Не вижу смысла.', taps: 0, durationMs: 0 }, { simulated: true });
  return [...r.alerts, ...more];
}

const TRAJ: Record<Patient['trajectory'], { gad: number; phq: number; adh: number }> = {
  improving: { gad: 0.48, phq: 0.5, adh: 0.95 },
  partial: { gad: 0.82, phq: 0.85, adh: 0.9 },
  worsening: { gad: 1.25, phq: 1.3, adh: 0.85 },
  stable: { gad: 1, phq: 1, adh: 0.93 },
};

/** Симулятор времени: «перемотать N дней» — генерирует записи по траектории пациента и сдвигает время стенда */
export function timeTravel(days: number) {
  mutate((db) => {
    const rnd = mulberry32(db.settings.timeOffsetMs / HOUR + 7);
    const from = standNow(db);
    const to = new Date(from.getTime() + days * DAY);
    for (const p of db.patients) {
      if (p.scenario === 7 || p.code === 'П-055') continue;
      const active = db.prescriptions.some((r) => r.patientId === p.id && r.status === 'confirmed');
      const tr = TRAJ[p.trajectory];
      const lastOf = (s: ScaleId) => [...db.assessments].reverse().find((a) => a.patientId === p.id && a.scale === s);
      const g0 = lastOf('GAD7')?.total ?? 10;
      const q0 = lastOf('PHQ9')?.total ?? 8;
      const gTarget = active ? clamp(Math.round(g0 * tr.gad), 2, 21) : g0;
      const qTarget = active ? clamp(Math.round(q0 * tr.phq), 1, 26) : q0;
      const start = p.therapyStart ? new Date(p.therapyStart) : null;
      for (let d = 1; d <= days; d++) {
        const day = startOfDay(new Date(from.getTime() + d * DAY));
        const x = d / days;
        const g = Math.round(g0 + (gTarget - g0) * (1 - Math.pow(1 - x, 1.6)));
        const q = Math.round(q0 + (qTarget - q0) * (1 - Math.pow(1 - x, 1.6)));
        const anxiety = clamp(Math.round((g / 21) * 10 + (rnd() * 2 - 1)), 0, 10);
        const mood = clamp(Math.round(10 - (q / 27) * 10 + (rnd() * 2 - 1)), 0, 10);
        const tDay = start ? Math.floor((day.getTime() - start.getTime()) / DAY) : -1;
        const side = active && tDay >= 1 && tDay <= 4 && rnd() < 0.7 ? ['сонливость'] : [];
        if (rnd() > 0.05) {
          db.checkins.push({
            id: uid('ci'),
            patientId: p.id,
            at: at(day, 21, Math.floor(rnd() * 40)).toISOString(),
            mood,
            anxiety,
            sleep: anxiety >= 8 ? 'bad' : anxiety >= 5 ? 'ok' : 'good',
            sideEffects: side,
            note: '',
            taps: 4 + Math.floor(rnd() * 2),
            durationMs: 25000 + Math.floor(rnd() * 25000),
          });
        }
        if (active) {
          for (const slot of ['morning', 'evening'] as const) {
            const when = at(day, SLOT_HOURS[slot]);
            if (start && when < start) continue;
            const taken = rnd() < tr.adh;
            db.medEvents.push({ id: uid('me'), patientId: p.id, scheduledAt: when.toISOString(), slot, status: taken ? 'taken' : 'missed', reason: taken ? undefined : 'forgot', recordedAt: new Date(when.getTime() + 20 * MIN).toISOString() });
          }
          if (start && [14, 28, 42, 56].includes(tDay)) {
            const pa = answersFor(9, q, { 8: 0 }, rnd);
            const ga = answersFor(7, g, {}, rnd);
            const w = at(day, 20, 15);
            const s1 = scoreScale('PHQ9', pa);
            const s2 = scoreScale('GAD7', ga);
            db.assessments.push({ id: uid('as'), patientId: p.id, scale: 'PHQ9', answers: pa, total: s1.total, band: s1.band, enteredBy: 'patient', at: w.toISOString() });
            db.assessments.push({ id: uid('as'), patientId: p.id, scale: 'GAD7', answers: ga, total: s2.total, band: s2.band, enteredBy: 'patient', at: new Date(w.getTime() + 3 * MIN).toISOString() });
          }
        }
      }
      for (const ae of db.adverseEvents) if (ae.patientId === p.id && ae.status === 'active' && ae.severity !== 'severe') {
        ae.status = 'resolved';
        ae.lastReportedAt = new Date(from.getTime() + Math.min(days, 5) * DAY).toISOString();
      }
    }
    db.settings.timeOffsetMs += days * DAY;
    audit(db, 'system', `Симулятор времени: +${days} дн.`, undefined, `Стенд: ${to.toLocaleDateString('ru-RU')}`);
    for (const p of db.patients) processPatient(db, p.id, { trigger: 'time_travel', seed: true });
  });
}

export function resetTime() {
  resetStand();
}

export { emptyDB };
