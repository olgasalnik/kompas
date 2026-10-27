// Модель данных «Компаса». Покрывает сущности из раздела 8.3 рабочего документа:
// пациент, связь с врачом, согласия, шкалы, чек-ин, приём, НЯ, назначения, правила, предложения,
// алерты, направления, сообщения, журнал аудита, уведомления (без ПДн).

export type ISO = string;

export type Role = 'doctor' | 'patient' | 'therapist' | 'duty' | 'head';
export type AiMode = 'mentor' | 'practice' | 'silent';

export interface WorkSchedule {
  days: number[]; // дни недели: 1 — понедельник … 7 — воскресенье
  start: number; // час начала
  end: number; // час окончания
  label: string; // «Пн–Пт, 10:00–19:00»
  roundTheClock?: boolean; // дежурная служба
}

export interface Credentials {
  education: string;
  diploma: string; // номер диплома (синтетический)
  accreditation: string;
  accreditationUntil: string; // ISO-дата окончания срока аккредитации
  experienceYears: number;
  registry: string; // где проверено (ФРМР)
  registryStatus: 'found' | 'not_found' | 'pending'; // запись в реестре: найдена / не найдена / запрос отправлен
  checkedAt: string;
  lastCheck?: string | null; // ISO последней проверки из стенда
}

export interface User {
  id: string;
  role: Role;
  specialty: 'psychotherapist' | 'psychiatrist' | 'gp' | 'head';
  name: string; // ФИО полностью
  title: string;
  initials: string;
  schedule: WorkSchedule;
  credentials: Credentials;
  email: string;
}

export interface TrustedContact {
  name: string;
  relation: 'родственник' | 'опекун' | 'законный представитель' | 'близкий человек';
  channel: 'sms' | 'email';
  contact: string;
  scope: 'adherence' | 'adherence_safety'; // что получает: статус приёма / + «не в безопасности»
}

export interface PatientFactors {
  pregnant: boolean;
  breastfeeding: boolean;
  epilepsy: boolean; // эпилепсия или органическое поражение головного мозга
  renalModerateSevere: boolean; // СКФ < 60 мл/мин
  hepaticImpairment: boolean; // Чайлд–Пью A, B или C
  maoi: boolean; // приём ингибиторов МАО или < 2 недель после отмены
  allergy: boolean; // аллергия на действующее/вспомогательные вещества
  drives: boolean; // управляет транспортом / работает с механизмами
  cardio: boolean;
  endocrine: boolean; // сахарный диабет и другие эндокринные заболевания
  substanceDependence: boolean; // алкогольная или наркотическая зависимость
  alcohol: 'none' | 'rare' | 'regular';
}

export type ConsentPurpose = 'treatment' | 'health_data' | 'reminders' | 'trusted_person' | 'research';

export interface Consent {
  purpose: ConsentPurpose;
  version: string;
  signedAt: ISO | null;
  revokedAt?: ISO | null;
}

export interface Diagnosis {
  code: string; // МКБ-10, как внёс врач
  label: string;
  postCovid?: boolean;
  severity?: 'mild' | 'moderate' | 'severe';
}

export interface Patient {
  id: string;
  code: string; // псевдоним «П-034»
  cardNo: string; // номер медицинской карты — история ведётся по номеру, а не по имени
  name: string; // синтетическое имя
  age: number;
  sex: 'f' | 'm';
  scenario?: number;
  doctorId: string;
  diagnosis: Diagnosis;
  complaints: string;
  meds: string[]; // МНН в нижнем регистре: «сертралин», «дифенгидрамин»
  medLog: { name: string; at: ISO; by: 'patient' | 'doctor'; note?: string }[];
  factors: PatientFactors;
  therapyStart: ISO | null; // начало «Авиандра» (если назначен)
  inviteCode: string;
  onboarded: boolean;
  consents: Consent[];
  reminderChannel: 'push' | 'sms' | 'email' | 'max' | 'vk' | 'telegram';
  trustedPerson: TrustedContact | null;
  tone: 'soft' | 'neutral' | 'brief';
  lastVisitAt: ISO | null;
  nextVisitAt: ISO | null;
  trajectory: 'improving' | 'partial' | 'worsening' | 'stable';
  archived?: { at: ISO; by: string; reason: string } | null;
  previsit?: { concerns: string; changes: string; questions: string; at: ISO } | null; // «К приёму» со слов пациента
}

export interface PatientDocument {
  id: string;
  patientId: string;
  name: string;
  kind: 'text' | 'image' | 'pdf' | 'other';
  size: number;
  dataUrl?: string;
  text?: string;
  uploadedBy: 'patient' | 'doctor';
  note?: string;
  at: ISO;
  viewedByDoctor?: boolean;
  /** Печатная версия скана или фото: распознана в браузере и проверена врачом */
  ocr?: { text: string; confidence: number | null; edited: boolean; at: ISO; by: string; engine: string } | null;
}

/** Сообщение Компас-бота: напоминание о приёме (с ответом пациента) или поддержка по шаблону */
export interface BotMessage {
  id: string;
  patientId: string;
  at: ISO;
  kind: 'reminder' | 'support';
  template: string;
  text: string;
  channel: string; // куда ушло уведомление: push, sms, email, telegram, max…
  slot?: 'morning' | 'evening';
  slotKey?: string;
  scheduledAt?: ISO;
  answer?: DoseStatus | null;
  answeredAt?: ISO;
  remindAgainAt?: ISO | null;
  link?: { to: string; label: string };
}

/** Слова пациента, записанные врачом на приёме (голосом или вручную) — дословно, без пересказа */
export interface PatientWords {
  id: string;
  patientId: string;
  text: string;
  at: ISO;
  by: string;
  voice: boolean;
}

export interface TelemedRequest {
  id: string;
  patientId: string;
  type: 'doctor_doctor' | 'doctor_patient' | 'patient_request';
  to: string;
  urgency: 'плановая' | 'неотложная';
  text: string;
  status: 'draft' | 'sent' | 'scheduled';
  createdBy: string;
  at: ISO;
}

export type ScaleId = 'PHQ9' | 'GAD7' | 'PHQ4' | 'HAMD' | 'HAMA' | 'MADRS';

export interface Assessment {
  id: string;
  patientId: string;
  scale: ScaleId;
  answers: number[] | null; // для шкал врача — только итог
  total: number;
  subscores?: Record<string, number>;
  band: string; // градация
  enteredBy: 'patient' | 'doctor' | 'curator';
  at: ISO;
}

export type SleepQuality = 'good' | 'ok' | 'bad' | 'none';

export interface Checkin {
  id: string;
  patientId: string;
  at: ISO;
  mood: number; // 0–10, 10 — отлично
  anxiety: number; // 0–10, 10 — очень сильная
  sleep: SleepQuality;
  sleepDetail?: string[]; // расшифровка плохого сна: трудно уснуть, ночные пробуждения…
  sleepHours?: '<4' | '4-6' | '6-8' | '>8';
  sideEffects: string[];
  note: string;
  taps?: number;
  durationMs?: number;
}

export type DoseStatus = 'taken' | 'missed' | 'later';
export type MissReason = 'forgot' | 'side_effects' | 'no_drug' | 'doubts' | 'routine' | 'other';

export interface MedEvent {
  id: string;
  patientId: string;
  scheduledAt: ISO;
  slot: 'morning' | 'evening';
  status: DoseStatus;
  reason?: MissReason;
  recordedAt: ISO;
}

export interface AdverseEvent {
  id: string;
  patientId: string;
  term: string;
  severity: 'mild' | 'moderate' | 'severe';
  onset: ISO;
  lastReportedAt: ISO;
  status: 'active' | 'resolved';
  reportDraft?: boolean;
}

export type DecisionStatus = 'proposed' | 'confirmed' | 'modified' | 'declined';

export interface Prescription {
  id: string;
  patientId: string;
  drug: string; // id пакета препарата
  regimen: string;
  status: DecisionStatus | 'stopped';
  offLabel: boolean;
  overrideReason?: string;
  decidedBy?: string;
  decidedAt?: ISO;
  createdAt: ISO;
  /** Выписанные рецепты (бланк 107-1/у): количество таблеток и сигнатура — для расчёта запаса */
  recipes?: RecipeRecord[];
}

export interface RecipeRecord {
  id: string;
  qty: number;
  signa: string;
  text: string;
  blank: string;
  at: ISO;
  by: string;
  days: number | null;
}

export interface Suggestion {
  id: string;
  patientId: string;
  ruleId: string;
  ruleVersion: string;
  text: string;
  kind: 'therapy' | 'safety' | 'monitoring' | 'routing' | 'communication';
  status: DecisionStatus;
  modifiedText?: string;
  comment?: string;
  decidedBy?: string;
  decidedAt?: ISO;
  createdAt: ISO;
  facts: FactMatch[];
}

export type AlertLevel = 'red' | 'orange' | 'yellow';
export type AlertStatus = 'new' | 'delivered' | 'viewed' | 'in_work' | 'closed' | 'false_positive';

export interface AlertChannelLog {
  channel: 'screen' | 'push' | 'sms' | 'email' | 'messenger';
  to: string; // userId
  at: ISO;
  text: string; // без медицинских данных
}

export interface Alert {
  id: string;
  patientId: string;
  level: AlertLevel;
  ruleId: string;
  ruleVersion: string;
  title: string;
  reason: string;
  facts: FactMatch[];
  triggerEventAt: ISO; // момент события, которое запустило правило (для T-detect)
  firstEventAt?: ISO; // первый пропуск в серии (для сигналов приверженности)
  dedupKey: string;
  patientSafeAt?: ISO; // пациент нажал «Я в безопасности»
  repeatedAt?: ISO;
  createdAt: ISO;
  createdAtMs: number; // настоящее время, для замера доставки
  deliveredAt?: ISO;
  deliveryMs?: number;
  viewedAt?: ISO;
  ackAt?: ISO;
  ackBy?: string;
  closedAt?: ISO;
  closeComment?: string;
  status: AlertStatus;
  escalationStep: number; // 0 — лечащий врач, 1 — дежурный, 2 — заведующий
  escalations: { step: number; at: ISO; to: string }[];
  channels: AlertChannelLog[];
  checklist: { id: string; label: string; done: boolean }[];
}

export type RouteCategory = 'urgent' | 'mandatory' | 'desirable';

export interface Referral {
  id: string;
  patientId: string;
  category: RouteCategory;
  to: string;
  term: string;
  criteria: string[];
  ruleIds: string[];
  status: 'proposed' | 'confirmed' | 'postponed' | 'declined';
  comment?: string;
  decidedBy?: string;
  decidedAt?: ISO;
  createdAt: ISO;
}

export interface Message {
  id: string;
  patientId: string;
  from: 'patient' | 'doctor' | 'system';
  text: string;
  at: ISO;
  kind?: 'question' | 'auto_answer' | 'safe_template' | 'handoff';
  intent?: string; // распознанная тема вопроса (missed, interaction, overdose...)
  sourceRef?: string; // источник автоответа
  readByDoctor?: boolean;
  readByPatient?: boolean;
  voice?: boolean; // надиктовано голосом — возможны ошибки распознавания
  audio?: VoiceAudio; // голосовое сообщение
}

export interface VoiceAudio {
  dataUrl: string;
  durationMs: number;
  mime: string;
  transcript: string | null;
}

export interface SosEvent {
  id: string;
  patientId: string;
  at: ISO;
  safe: boolean | null; // ответ на «Вы в безопасности?»
  action?: 'breathing' | 'call_doctor' | 'call_112';
}

export interface AuditEntry {
  id: string;
  at: ISO;
  actor: string; // userId, patientId или 'system'
  action: string;
  patientId?: string;
  details?: string;
}

export interface NotificationLog {
  id: string;
  at: ISO;
  channel: 'push' | 'sms' | 'email' | 'messenger' | 'screen';
  to: string;
  text: string;
  alertId?: string;
}

export interface MetricSample {
  kind: 'alert_delivery' | 'rule_eval' | 'dossier_render' | 'checkin' | 'phq9_fill' | 'route_eval';
  ms: number;
  taps?: number;
  at: ISO;
  note?: string;
}

export interface Settings {
  aiMode: AiMode;
  demoSpeed: number; // множитель для таймеров эскалации: 60 → 1 секунда = 1 минута
  timeOffsetMs: number; // «перемотка» времени в симуляторе
  workHours: { start: number; end: number };
  escalationMinutes: [number, number]; // 10 → дежурный, 30 → заведующий
}

export interface DB {
  schema: number;
  rev?: number; // ревизия: растёт с каждым изменением, вкладки принимают более новую
  seededAt: ISO;
  users: User[];
  patients: Patient[];
  assessments: Assessment[];
  checkins: Checkin[];
  medEvents: MedEvent[];
  adverseEvents: AdverseEvent[];
  prescriptions: Prescription[];
  suggestions: Suggestion[];
  alerts: Alert[];
  referrals: Referral[];
  messages: Message[];
  sos: SosEvent[];
  documents: PatientDocument[];
  telemed: TelemedRequest[];
  patientWords: PatientWords[];
  botFeed: BotMessage[];
  notes: Record<string, { text: string; updatedAt: ISO }>;
  hypotheses: Record<string, { text: string; at: ISO }>;
  audit: AuditEntry[];
  notifications: NotificationLog[];
  metrics: MetricSample[];
  settings: Settings;
}

// ───────── Правила ─────────

export type Op = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'intersects' | 'truthy' | 'falsy' | 'between';

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { fact: string; op: Op; value?: unknown; label?: string };

export type RuleType = 'STOP' | 'WARN' | 'INDICATION' | 'OFF_LABEL' | 'SUGGEST' | 'ALERT' | 'ROUTE';

export interface SourceRef {
  id: string; // ID в реестре источников
  section: string;
  quote?: string;
}

export interface Rule {
  id: string;
  version: string;
  type: RuleType;
  pack: string;
  title: string;
  condition: Condition;
  messageDoctor: string;
  messagePatient?: string;
  level?: AlertLevel;
  category?: RouteCategory;
  to?: string;
  term?: string;
  kind?: Suggestion['kind'];
  actions?: string[];
  anchor?: string; // факт-«якорь» события для дедупликации сигнала
  suggest?: string[]; // предложения врачу при срабатывании
  allowOverride?: boolean;
  source: SourceRef;
  status: 'approved_demo' | 'draft';
  approvedBy: string;
  approvedAt: string;
  note?: string;
}

export interface FactMatch {
  fact: string;
  label: string;
  value: unknown;
  op: Op;
  expected?: unknown;
  negated?: boolean;
}

export interface RuleHit {
  rule: Rule;
  matched: FactMatch[];
}

export type Facts = Record<string, unknown>;
