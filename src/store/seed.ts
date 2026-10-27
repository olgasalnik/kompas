// Генерация синтетического стенда: пользователи, 10 пациентов и их история (приёмы, чек-ины, шкалы, НЯ, сообщения).
import type { Assessment, Checkin, Consent, DB, MedEvent, Patient, SleepQuality, User } from '../core/types';
import { scoreScale } from '../core/scales';
import { dueDoses } from '../core/adherence';
import { DAY, HOUR, MIN, at, startOfDay } from '../core/time';
import { SCENARIOS, type ScenarioDef } from './scenarios';
import { clamp, mulberry32 } from './rng';
import { dischargeScan, labScan } from './scans';
import { aviandrRecipe, PACK_SIGNA, RECIPE_BLANK } from '../core/recipe';

export const SCHEMA = 8;

// Все сотрудники и их документы — СИНТЕТИЧЕСКИЕ (номера свидетельств вымышлены)
const WEEKDAYS = [1, 2, 3, 4, 5];
export const USERS: User[] = [
  {
    id: 'd1',
    role: 'doctor',
    specialty: 'psychotherapist',
    name: 'Морозова Елена Андреевна',
    title: 'Врач-психотерапевт, лечащий врач',
    initials: 'ЕМ',
    schedule: { days: WEEKDAYS, start: 10, end: 19, label: 'Пн–Пт, 10:00–19:00' },
    credentials: {
      education: 'Высшее медицинское (лечебное дело), 2012; ординатура «Психиатрия», 2014; специализация «Психотерапия», 2016',
      diploma: 'Диплом специалиста № 0000-ДЕМО-1012 (синтетический), 2012',
      accreditation: 'Свидетельство об аккредитации специалиста «Психотерапия» № 0000-ДЕМО-1021 (синтетическое)',
      accreditationUntil: '2030-06-30',
      experienceYears: 12,
      registry: 'Федеральный регистр медицинских работников (ФРМР)',
      registryStatus: 'found',
      checkedAt: '01.10.2026',
    },
    email: 'e.morozova@clinic.example',
  },
  {
    id: 'd2',
    role: 'duty',
    specialty: 'psychiatrist',
    name: 'Лебедев Игорь Валентинович',
    title: 'Дежурный врач-психиатр',
    initials: 'ИЛ',
    schedule: { days: [1, 2, 3, 4, 5, 6, 7], start: 0, end: 24, label: 'Дежурства по графику клиники, круглосуточно', roundTheClock: true },
    credentials: {
      education: 'Высшее медицинское (лечебное дело), 2009; ординатура «Психиатрия», 2011',
      diploma: 'Диплом специалиста № 0000-ДЕМО-2009 (синтетический), 2009',
      accreditation: 'Свидетельство об аккредитации специалиста «Психиатрия» № 0000-ДЕМО-2044 (синтетическое)',
      accreditationUntil: '2026-12-08',
      experienceYears: 15,
      registry: 'Федеральный регистр медицинских работников (ФРМР)',
      registryStatus: 'found',
      checkedAt: '01.10.2026',
    },
    email: 'duty.psy@clinic.example',
  },
  {
    id: 'h1',
    role: 'head',
    specialty: 'head',
    name: 'Орлова Наталья Сергеевна',
    title: 'Заведующая отделением',
    initials: 'НО',
    schedule: { days: WEEKDAYS, start: 9, end: 18, label: 'Пн–Пт, 9:00–18:00; по эскалации — круглосуточно' },
    credentials: {
      education: 'Высшее медицинское (лечебное дело), 2003; ординатура «Психиатрия», 2005; «Организация здравоохранения», 2015',
      diploma: 'Диплом специалиста № 0000-ДЕМО-0303 (синтетический), 2003',
      accreditation: 'Свидетельство об аккредитации «Психиатрия» № 0000-ДЕМО-0307 (синтетическое)',
      accreditationUntil: '2028-03-15',
      experienceYears: 21,
      registry: 'Федеральный регистр медицинских работников (ФРМР)',
      registryStatus: 'found',
      checkedAt: '01.10.2026',
    },
    email: 'head.dept@clinic.example',
  },
  {
    id: 't1',
    role: 'therapist',
    specialty: 'gp',
    name: 'Ковалёв Павел Аркадьевич',
    title: 'Врач-терапевт участковый',
    initials: 'ПК',
    schedule: { days: WEEKDAYS, start: 8, end: 20, label: 'Пн–Пт, 8:00–20:00 (сменами)' },
    credentials: {
      education: 'Высшее медицинское (лечебное дело), 2017; ординатура «Терапия», 2019',
      diploma: 'Диплом специалиста № 0000-ДЕМО-1717 (синтетический), 2017',
      accreditation: 'Свидетельство об аккредитации «Терапия» № 0000-ДЕМО-5518 (синтетическое)',
      accreditationUntil: '2029-07-01',
      experienceYears: 7,
      registry: 'Федеральный регистр медицинских работников (ФРМР)',
      registryStatus: 'pending',
      checkedAt: '01.10.2026',
    },
    email: 'p.kovalev@polyclinic.example',
  },
];

export const CONSENT_VERSION = 'v1.0 от 18.10.2026';

export function defaultConsents(signedAt: string | null, extra: Partial<Record<Consent['purpose'], boolean>> = {}): Consent[] {
  const base: Consent['purpose'][] = ['treatment', 'health_data', 'reminders'];
  const opt: Consent['purpose'][] = ['trusted_person', 'research'];
  return [
    ...base.map((purpose) => ({ purpose, version: CONSENT_VERSION, signedAt })),
    ...opt.map((purpose) => ({ purpose, version: CONSENT_VERSION, signedAt: extra[purpose] ? signedAt : null })),
  ];
}

/** Ответы по пунктам, дающие нужную сумму (пункт 9 PHQ-9 задаётся отдельно) */
export function answersFor(items: number, total: number, fixed: Record<number, number>, rnd: () => number): number[] {
  const a = new Array(items).fill(0);
  let rest = total;
  for (const [i, v] of Object.entries(fixed)) {
    a[Number(i)] = v;
    rest -= v;
  }
  const free = [...Array(items).keys()].filter((i) => !(i in fixed));
  rest = clamp(rest, 0, free.length * 3);
  let guard = 0;
  while (rest > 0 && guard++ < 500) {
    const i = free[Math.floor(rnd() * free.length)];
    if (a[i] < 3) {
      a[i]++;
      rest--;
    }
  }
  return a;
}

const ease = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 1.6);

function lerp(range: [number, number], x: number) {
  return Math.round(range[0] + (range[1] - range[0]) * ease(x));
}

const SLEEP_BY_ANX = (anx: number, r: number): SleepQuality => {
  const s = anx + r * 3 - 1.5;
  if (s >= 8.5) return 'bad';
  if (s >= 5.5) return 'ok';
  return 'good';
};

let seq = 0;
const sid = (p: string) => `${p}_${(++seq).toString(36)}`;

export function buildPatient(def: ScenarioDef, index: number, now: Date, rnd: () => number): { patient: Patient; records: Partial<DB> } {
  const h = def.history;
  const id = `p${index + 1}`;
  const therapyStart = h.therapyDaysAgo === null ? null : at(new Date(now.getTime() - h.therapyDaysAgo * DAY), 7, 30);
  const monitorStart = startOfDay(new Date(now.getTime() - h.monitorDaysAgo * DAY));
  const signedAt = new Date(monitorStart.getTime() + 10 * HOUR).toISOString();

  const patient: Patient = {
    ...def.patient,
    id,
    tone: def.patient.tone ?? 'soft',
    inviteCode: `KMP-${(4200 + index * 37).toString()}`,
    onboarded: true,
    cardNo: `МК-26-${String(4100 + index * 17).padStart(5, '0')}`,
    consents: defaultConsents(signedAt, { trusted_person: index % 3 === 0 }),
    reminderChannel: (['push', 'email', 'sms', 'telegram', 'max'] as const)[index % 5],
    trustedPerson:
      index % 3 === 0
        ? { name: index === 0 ? 'Мария К. (сестра)' : 'Близкий человек', relation: 'родственник', channel: 'sms', contact: '+7 900 000-00-0' + (index % 10), scope: 'adherence' }
        : null,
    archived: null,
    previsit: null,
    therapyStart: therapyStart ? therapyStart.toISOString() : null,
    medLog: (h.medLog ?? []).map((m) => ({ name: m.name, at: new Date(now.getTime() - m.daysAgo * DAY - 2 * HOUR).toISOString(), by: m.by, note: m.note })),
    lastVisitAt: therapyStart ? therapyStart.toISOString() : new Date(now.getTime() - 1 * HOUR).toISOString(),
    nextVisitAt: new Date(startOfDay(now).getTime() + (1 + (index % 6)) * DAY + (10 + ((index * 3) % 8)) * HOUR).toISOString(),
  };

  const assessments: Assessment[] = [];
  const checkins: Checkin[] = [];
  const medEvents: MedEvent[] = [];
  const adverseEvents: DB['adverseEvents'] = [];
  const messages: DB['messages'] = [];

  const span = h.therapyDaysAgo ?? h.monitorDaysAgo;
  const dayX = (t: number) => (span > 0 ? clamp((t - (therapyStart ?? monitorStart).getTime()) / (span * DAY), 0, 1) : 1);
  const item9 = h.item9 ?? [0, 0];

  const addScale = (scale: 'PHQ9' | 'GAD7' | 'PHQ4', when: Date, x: number) => {
    let answers: number[];
    if (scale === 'PHQ9') answers = answersFor(9, lerp(h.phq9, x), { 8: Math.round(item9[0] + (item9[1] - item9[0]) * x) }, rnd);
    else if (scale === 'GAD7') answers = answersFor(7, lerp(h.gad7, x), {}, rnd);
    else {
      const g = lerp(h.gad7, x);
      const p = lerp(h.phq9, x);
      answers = [...answersFor(2, Math.round((g / 21) * 6), {}, rnd), ...answersFor(2, Math.round((p / 27) * 6), {}, rnd)];
    }
    const s = scoreScale(scale, answers);
    assessments.push({ id: sid('as'), patientId: id, scale, answers, total: s.total, subscores: s.subscores, band: s.band, enteredBy: 'patient', at: when.toISOString() });
  };

  if (therapyStart) {
    // Исходно перед началом терапии, далее 2, 4, 6 недель; PHQ-4 — на 1, 3, 5 неделях
    const base = new Date(therapyStart.getTime() - 50 * MIN);
    addScale('PHQ9', base, 0);
    addScale('GAD7', new Date(base.getTime() + 4 * MIN), 0);
    for (const d of [14, 28, 42]) {
      if (d > h.therapyDaysAgo!) break;
      const when = at(new Date(therapyStart.getTime() + d * DAY), 20, 10);
      if (when > now) break;
      addScale('PHQ9', when, dayX(when.getTime()));
      addScale('GAD7', new Date(when.getTime() + 3 * MIN), dayX(when.getTime()));
    }
    for (const d of [7, 21, 35]) {
      if (d > h.therapyDaysAgo!) break;
      const when = at(new Date(therapyStart.getTime() + d * DAY), 20, 30);
      if (when < now) addScale('PHQ4', when, dayX(when.getTime()));
    }
  } else if (def.n !== 7) {
    // Первичный визит сегодня: PHQ-4 неделю назад по приглашению, PHQ-9 и GAD-7 сегодня
    if (h.monitorDaysAgo >= 4) addScale('PHQ4', at(new Date(monitorStart.getTime() + 0.5 * DAY), 20, 0), 1);
    addScale('PHQ9', new Date(now.getTime() - 70 * MIN), 1);
    addScale('GAD7', new Date(now.getTime() - 66 * MIN), 1);
  }

  // Ежедневные чек-ины
  const lastCiDay = h.noEntriesLastDays ? h.noEntriesLastDays : 0;
  // Пациент терапевта (сценарий 7) приложением ещё не пользуется
  for (let d = h.monitorDaysAgo; def.n !== 7 && d >= lastCiDay; d--) {
    const day = startOfDay(new Date(now.getTime() - d * DAY));
    const when = at(day, 21, Math.floor(rnd() * 40));
    if (when > now) continue;
    if (rnd() < 0.08 && d > 1) continue; // иногда пропускает запись
    const x = dayX(when.getTime());
    const g = lerp(h.gad7, x);
    const p = lerp(h.phq9, x);
    const anxiety = clamp(Math.round((g / 21) * 10 + (rnd() * 2 - 1)), 0, 10);
    const mood = clamp(Math.round(10 - (p / 27) * 10 - 0.6 + (rnd() * 2 - 1)), 0, 10);
    const therapyDay = therapyStart ? Math.floor((when.getTime() - therapyStart.getTime()) / DAY) : -1;
    const sideEffects = (h.aes ?? [])
      .filter((a) => therapyDay >= a.fromDay && (a.toDay === undefined || therapyDay <= a.toDay))
      .map((a) => a.term);
    checkins.push({
      id: sid('ci'),
      patientId: id,
      at: when.toISOString(),
      mood,
      anxiety,
      sleep: SLEEP_BY_ANX(anxiety, rnd()),
      sideEffects,
      note: '',
      taps: 4 + Math.floor(rnd() * 2),
      durationMs: 28000 + Math.floor(rnd() * 25000),
    });
  }

  // Приёмы препарата
  if (therapyStart) {
    const doses = dueDoses(therapyStart, now, 60);
    const forced = new Map<number, true>();
    if (h.forcedMisses) for (const i of h.forcedMisses.missed) forced.set(doses.length - 1 - i, true);
    const noMarkFrom = h.noEntriesLastDays ? startOfDay(now).getTime() - (h.noEntriesLastDays - 1) * DAY : Infinity;
    doses.forEach((d, i) => {
      if (d.at.getTime() >= noMarkFrom) return;
      const isForced = forced.has(i);
      const taken = !isForced && rnd() < h.adherence;
      medEvents.push({
        id: sid('me'),
        patientId: id,
        scheduledAt: d.at.toISOString(),
        slot: d.slot,
        status: taken ? 'taken' : 'missed',
        reason: taken ? undefined : isForced ? h.forcedMisses!.reason : rnd() < 0.6 ? 'forgot' : 'routine',
        recordedAt: new Date(d.at.getTime() + (5 + Math.floor(rnd() * 50)) * MIN).toISOString(),
      });
    });
  }

  // Нежелательные явления
  for (const a of h.aes ?? []) {
    if (!therapyStart) continue;
    const onset = at(new Date(therapyStart.getTime() + a.fromDay * DAY), 21);
    const ended = a.toDay !== undefined ? at(new Date(therapyStart.getTime() + a.toDay * DAY), 21) : null;
    adverseEvents.push({
      id: sid('ae'),
      patientId: id,
      term: a.term,
      severity: a.severity,
      onset: onset.toISOString(),
      lastReportedAt: (ended ?? new Date(now.getTime() - 2 * HOUR)).toISOString(),
      status: ended && ended < now ? 'resolved' : 'active',
    });
  }

  for (const m of h.messages ?? []) {
    const when = at(new Date(now.getTime() - m.daysAgo * DAY), m.hour, 12);
    messages.push({ id: sid('msg'), patientId: id, from: m.from, text: m.text, at: when.toISOString(), kind: 'question', readByDoctor: false, readByPatient: true });
  }

  const prescriptions: DB['prescriptions'] = therapyStart
    ? [
        {
          id: sid('rx'),
          patientId: id,
          drug: 'aviandr',
          regimen: '20 мг 2 раза в сутки, утром и вечером, за 30 минут до еды',
          status: 'confirmed',
          offLabel: false,
          decidedBy: patient.doctorId,
          decidedAt: therapyStart.toISOString(),
          createdAt: new Date(therapyStart.getTime() - 20 * MIN).toISOString(),
        },
      ]
    : [];
  // Рецепты № 60 (на 30 дней) с начала терапии: новый — когда заканчивается предыдущий
  for (const rx of prescriptions) {
    const r = aviandrRecipe(60, PACK_SIGNA);
    rx.recipes = [];
    for (let t = therapyStart!.getTime(), n = 1; t <= now.getTime(); t += (r.days ?? 30) * DAY, n++) {
      rx.recipes.push({ id: `${rx.id}_rc${n}`, qty: 60, signa: PACK_SIGNA, text: r.text, blank: RECIPE_BLANK, at: new Date(t).toISOString(), by: patient.doctorId, days: r.days });
    }
  }

  return { patient, records: { assessments, checkins, medEvents, adverseEvents, messages, prescriptions } };
}

export function emptyDB(now: Date): DB {
  return {
    schema: SCHEMA,
    seededAt: now.toISOString(),
    users: USERS,
    patients: [],
    assessments: [],
    checkins: [],
    medEvents: [],
    adverseEvents: [],
    prescriptions: [],
    suggestions: [],
    alerts: [],
    referrals: [],
    messages: [],
    sos: [],
    documents: [],
    telemed: [],
    patientWords: [],
    botFeed: [],
    notes: {},
    hypotheses: {},
    audit: [],
    notifications: [],
    metrics: [],
    settings: {
      aiMode: 'practice',
      demoSpeed: 60,
      timeOffsetMs: 0,
      workHours: { start: 10, end: 19 },
      escalationMinutes: [10, 30],
    },
  };
}

/** Собирает стенд. Алерты и предложения потом создаёт сам движок (api.processPatient), а не seed. */
export function seedDB(now: Date): DB {
  seq = 0;
  const db = emptyDB(now);
  const rnd = mulberry32(20261018);
  SCENARIOS.forEach((def, i) => {
    const { patient, records } = buildPatient(def, i, now, rnd);
    db.patients.push(patient);
    for (const [k, v] of Object.entries(records)) (db as unknown as Record<string, unknown[]>)[k].push(...(v as unknown[]));
  });
  // Прикреплённые документы (синтетические) — для демонстрации «посмотреть прикреплённые документы»
  const docAt = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const txt = (s: string) => `data:text/plain;charset=utf-8,${encodeURIComponent(s)}`;
  const docs: [string, string, string, number, 'patient' | 'doctor'][] = [
    ['p7', 'ЭКГ и давление (синтетический).txt', 'ЭКГ: синусовая тахикардия, ЧСС 96 в минуту.\nАД 148/92 мм рт. ст. (повторно 142/90).\nРекомендована консультация кардиолога.\n\nСИНТЕТИЧЕСКИЙ ДОКУМЕНТ ДЛЯ ДЕМОНСТРАЦИИ', 2, 'doctor'],
  ];
  for (const [pid, name, text, days, by] of docs) {
    db.documents.push({ id: sid('doc'), patientId: pid, name, kind: 'text', size: text.length, text, dataUrl: txt(text), uploadedBy: by, at: docAt(days), viewedByDoctor: by === 'doctor' });
  }
  // Сканы (изображения без текстового слоя) — текст из них достаёт распознавание во вкладке «Документы»
  const scans: [string, string, (iso: string) => string, number][] = [
    ['p3', 'Скан: выписка другого врача (синтетическая)', dischargeScan, 30],
    ['p1', 'Скан: анализы крови (синтетический)', labScan, 6],
  ];
  for (const [pid, name, make, days] of scans) {
    const dataUrl = make(docAt(days + 1));
    db.documents.push({ id: sid('doc'), patientId: pid, name, kind: 'image', size: dataUrl.length, dataUrl, uploadedBy: 'patient', at: docAt(days), viewedByDoctor: false });
  }
  // Приветственное сообщение врача: переписка настроена с момента подключения
  for (const p of db.patients.filter((x) => x.doctorId === 'd1')) {
    const doctorUser = USERS.find((u) => u.id === p.doctorId)!;
    const when = new Date(Math.max(Date.parse(p.consents[0].signedAt ?? now.toISOString()), now.getTime() - 40 * DAY) + 15 * 60_000).toISOString();
    db.messages.push({
      id: sid('msg'),
      patientId: p.id,
      from: 'doctor',
      text: `Здравствуйте! Это ${doctorUser.name}. Здесь можно написать мне между приёмами — я отвечаю в рабочее время (${doctorUser.schedule.label}). Если станет очень тяжело, нажмите «Мне тяжело сейчас».`,
      at: when,
      readByDoctor: true,
      readByPatient: true,
    });
    db.notifications.push({ id: sid('nt'), at: when, channel: p.reminderChannel === 'email' ? 'email' : 'push', to: p.id, text: 'Компас: новое сообщение от врача.' });
  }
  db.audit.push({ id: 'au_seed', at: now.toISOString(), actor: 'system', action: 'Стенд создан: синтетические данные, 10 пациентов' });
  return db;
}
