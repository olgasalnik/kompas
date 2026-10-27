// Сбор «фактов» о пациенте из данных — вход для движка правил. Все ключи плоские («phq9.total»),
// чтобы правила в JSON ссылались на них без кода.
import type { Assessment, DB, Facts, Patient } from './types';
import { computeAdherence } from './adherence';
import { classifyText, KNOWN_INTERACTING } from './text';
import { DAY, HOUR, daysBetween } from './time';

const SEVERE_AE = ['судороги', 'обморок', 'тяжёлая аллергическая реакция'];

export function latest(list: Assessment[], scale: string): Assessment | undefined {
  let best: Assessment | undefined;
  for (const a of list) if (a.scale === scale && (!best || a.at > best.at)) best = a;
  return best;
}

export function patientAssessments(db: DB, patientId: string): Assessment[] {
  return db.assessments.filter((a) => a.patientId === patientId).sort((a, b) => a.at.localeCompare(b.at));
}

export function isTherapyActive(db: DB, p: Patient): boolean {
  return db.prescriptions.some((r) => r.patientId === p.id && r.drug === 'aviandr' && (r.status === 'confirmed' || r.status === 'modified'));
}

export function buildFacts(db: DB, p: Patient, now: Date, extra: Facts = {}): Facts {
  const f: Facts = {};
  const nowMs = now.getTime();

  // Профиль
  f['patient.age'] = p.age;
  f['patient.sex'] = p.sex;
  for (const [k, v] of Object.entries(p.factors)) f[`patient.${k}`] = v;
  f['patient.meds'] = p.meds;
  f['diagnosis.code'] = p.diagnosis.code;
  f['diagnosis.postCovid'] = Boolean(p.diagnosis.postCovid);
  f['diagnosis.severity'] = p.diagnosis.severity ?? 'moderate';
  const lead = db.users.find((u) => u.id === p.doctorId);
  f['route.byPsychiatrist'] = lead?.specialty === 'psychiatrist';

  // Терапия
  const active = isTherapyActive(db, p);
  f['therapy.active'] = active;
  const start = p.therapyStart ? new Date(p.therapyStart) : null;
  const tDays = start && active ? Math.max(0, daysBetween(start, now)) : null;
  f['therapy.days'] = tDays;
  f['therapy.week'] = tDays === null ? null : Math.floor(tDays / 7) + 1;
  f['course.daysLeft'] = p.diagnosis.postCovid && tDays !== null ? 28 - tDays : null;

  // Шкалы
  const as = patientAssessments(db, p.id);
  const phq9 = latest(as, 'PHQ9');
  const gad7 = latest(as, 'GAD7');
  const phq4 = latest(as, 'PHQ4');
  f['phq9.id'] = phq9?.id ?? null;
  f['phq9.at'] = phq9?.at ?? null;
  f['phq9.total'] = phq9?.total ?? null;
  f['phq9.item9'] = phq9?.answers ? phq9.answers[8] : null;
  f['phq9.item9Recent'] = phq9?.answers && nowMs - Date.parse(phq9.at) <= 14 * DAY ? phq9.answers[8] : null;
  if (phq9) {
    const t = Date.parse(phq9.at);
    const prior = as.filter((a) => a.scale === 'PHQ9' && a.id !== phq9.id && t - Date.parse(a.at) <= 15 * DAY && t - Date.parse(a.at) >= 0);
    const minPrior = prior.length ? Math.min(...prior.map((a) => a.total)) : null;
    f['phq9.rise14'] = minPrior === null ? null : phq9.total - minPrior;
  } else f['phq9.rise14'] = null;
  f['gad7.total'] = gad7?.total ?? null;
  const gadBaseline = start
    ? as.filter((a) => a.scale === 'GAD7' && Date.parse(a.at) <= start.getTime() + 2 * DAY).pop() ?? as.find((a) => a.scale === 'GAD7')
    : as.find((a) => a.scale === 'GAD7');
  f['gad7.baseline'] = gadBaseline?.total ?? null;
  f['gad7.reductionPct'] =
    gad7 && gadBaseline && gadBaseline.total > 0 && gad7.id !== gadBaseline.id
      ? Math.round(((gadBaseline.total - gad7.total) / gadBaseline.total) * 100)
      : null;
  f['phq4.total'] = phq4?.total ?? null;
  f['phq4.anxiety'] = phq4?.subscores?.anxiety ?? null;
  f['phq4.depression'] = phq4?.subscores?.depression ?? null;

  // Приверженность
  const meds = db.medEvents.filter((e) => e.patientId === p.id);
  const adh = computeAdherence(meds, active ? start : null, now);
  f['adherence.rate7'] = adh.rate7;
  f['adherence.rate28'] = adh.rate28;
  f['adherence.missedConsecutive'] = adh.missedConsecutive;
  f['adherence.missedLast7'] = adh.missedLast7;

  // Чек-ины
  const cis = db.checkins.filter((c) => c.patientId === p.id).sort((a, b) => a.at.localeCompare(b.at));
  const lastCi = cis[cis.length - 1];
  f['checkin.daysSinceLast'] = lastCi ? daysBetween(new Date(lastCi.at), now) : active && start ? daysBetween(start, now) : null;
  let streak = 0;
  for (let i = cis.length - 1; i >= 0; i--) {
    if (cis[i].sleep === 'none') streak++;
    else break;
  }
  f['checkin.insomniaStreak'] = streak;
  f['checkin.lastAt'] = lastCi?.at ?? null;

  // Свободный текст за 24 часа: заметки чек-ина и сообщения пациента
  const recentTexts = [
    ...cis.filter((c) => nowMs - Date.parse(c.at) <= 24 * HOUR).map((c) => ({ id: c.id, at: c.at, text: c.note })),
    ...db.messages
      .filter((m) => m.patientId === p.id && m.from === 'patient' && nowMs - Date.parse(m.at) <= 24 * HOUR)
      .map((m) => ({ id: m.id, at: m.at, text: m.text })),
  ]
    .filter((x) => x.text)
    .sort((a, b) => a.at.localeCompare(b.at));
  const cls = recentTexts.map((x) => ({ ...x, c: classifyText(x.text) }));
  const flagged = cls.filter((x) => x.c.crisis || x.c.psychosis);
  f['text.crisis'] = cls.some((x) => x.c.crisis);
  f['text.psychosis'] = cls.some((x) => x.c.psychosis);
  f['text.matches'] = cls.flatMap((x) => x.c.matches);
  f['text.lastId'] = flagged.length ? flagged[flagged.length - 1].id : null;
  f['text.lastAt'] = flagged.length ? flagged[flagged.length - 1].at : null;

  // SOS и сообщения о передозировке
  const unsafe = db.sos.filter((s) => s.patientId === p.id && s.safe === false && nowMs - Date.parse(s.at) <= 24 * HOUR);
  f['sos.unsafe'] = unsafe.length > 0;
  f['sos.lastId'] = unsafe.length ? unsafe[unsafe.length - 1].id : null;
  const od = db.messages.filter((m) => m.patientId === p.id && m.from === 'patient' && m.intent === 'overdose' && nowMs - Date.parse(m.at) <= 24 * HOUR);
  f['overdose.reported'] = od.length > 0;
  f['overdose.lastId'] = od.length ? od[od.length - 1].id : null;

  // Нежелательные явления
  const aes = db.adverseEvents.filter((a) => a.patientId === p.id && a.status === 'active');
  const severeCi = cis.filter((c) => nowMs - Date.parse(c.at) <= 24 * HOUR && c.sideEffects.some((s) => SEVERE_AE.includes(s)));
  f['ae.severe'] = severeCi.length > 0 || aes.some((a) => a.severity === 'severe');
  f['ae.severeKey'] = severeCi.length ? severeCi[severeCi.length - 1].id : aes.find((a) => a.severity === 'severe')?.id ?? null;
  f['ae.moderate'] = aes.some(
    (a) => a.severity === 'moderate' || (Date.parse(a.lastReportedAt) - Date.parse(a.onset) >= 3 * DAY && adh.reasons.side_effects),
  );
  f['ae.mildActive'] = aes.some((a) => a.severity === 'mild');
  f['ae.persist14'] = aes.some((a) => nowMs - Date.parse(a.onset) > 14 * DAY);
  f['ae.terms'] = aes.map((a) => a.term);

  // Новый препарат из списка взаимодействий (добавлен за 72 часа)
  const newIx = p.medLog.filter((m) => nowMs - Date.parse(m.at) <= 72 * HOUR && KNOWN_INTERACTING.includes(m.name) && p.meds.includes(m.name));
  f['meds.newInteracting'] = newIx.map((m) => m.name);
  f['meds.newInteractingKey'] = newIx.length ? newIx.map((m) => `${m.name}@${m.at}`).join('|') : null;
  f['meds.newInteractingAt'] = newIx.length ? newIx[newIx.length - 1].at : null;
  f['adherence.lastMissAt'] = [...adh.doses].reverse().find((d) => d.effective === 'missed')?.at.toISOString() ?? null;
  f['adherence.firstMissAt'] = adh.firstMissAt ? adh.firstMissAt.toISOString() : null;

  return { ...f, ...extra };
}
