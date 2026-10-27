import type { Alert, DB, Message, Patient, ScaleId } from '../core/types';
import { LEVEL_RANK } from '../core/clinical';
import { SCALES } from '../core/scales';
import { DAY, fmtDate, plural } from '../core/time';
import { computeAdherence, MISS_REASONS, pct } from '../core/adherence';
import { isTherapyActive } from '../core/facts';

export const isOpen = (a: Alert) => a.status !== 'closed' && a.status !== 'false_positive';

export function openAlerts(db: DB, patientId?: string): Alert[] {
  return db.alerts
    .filter((a) => isOpen(a) && (!patientId || a.patientId === patientId))
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.createdAt.localeCompare(a.createdAt));
}

export function topAlert(db: DB, patientId: string): Alert | undefined {
  return openAlerts(db, patientId)[0];
}

/** Пациенты, которых видит пользователь: лечащий врач — своих; дежурный и заведующая — пациентов отделения. Архив — отдельно. */
export function visiblePatients(db: DB, userId: string, archive: 'active' | 'archived' | 'all' = 'active'): Patient[] {
  const u = db.users.find((x) => x.id === userId);
  if (!u) return [];
  const mine =
    u.role === 'therapist' || u.role === 'doctor'
      ? db.patients.filter((p) => p.doctorId === u.id)
      : db.patients.filter((p) => db.users.find((x) => x.id === p.doctorId)?.role === 'doctor');
  return mine.filter((p) => (archive === 'all' ? true : archive === 'archived' ? Boolean(p.archived) : !p.archived));
}

export type ThreadStatus = 'new' | 'waiting' | 'answered' | 'none';

export const THREAD_LABEL: Record<ThreadStatus, { label: string; cls: string }> = {
  new: { label: 'Новое', cls: 'badge-brand' },
  waiting: { label: 'Просмотрено, ждёт ответа', cls: 'badge-amber' },
  answered: { label: 'Отвечено', cls: 'badge-mint' },
  none: { label: 'Нет сообщений', cls: '' },
};

/** Статус переписки с пациентом для врача: новое / просмотрено, ждёт ответа / отвечено */
export function threadStatus(db: DB, patientId: string): { status: ThreadStatus; unread: number; lastAt: string | null; lastText: string } {
  const msgs = db.messages.filter((m) => m.patientId === patientId).sort((a, b) => a.at.localeCompare(b.at));
  const fromPatient = msgs.filter((m) => m.from === 'patient');
  const lastDoctor = [...msgs].reverse().find((m) => m.from === 'doctor');
  const lastPatient = fromPatient[fromPatient.length - 1];
  const unread = fromPatient.filter((m) => !m.readByDoctor).length;
  const last = msgs[msgs.length - 1];
  let status: ThreadStatus = 'none';
  if (lastPatient) {
    if (unread) status = 'new';
    else if (!lastDoctor || lastDoctor.at < lastPatient.at) status = 'waiting';
    else status = 'answered';
  } else if (lastDoctor) status = 'answered';
  return { status, unread, lastAt: last?.at ?? null, lastText: last ? msgPreview(last) : '' };
}

/** Текст сообщения для превью: у голосового без расшифровки — пометка с длительностью */
export function msgPreview(m: Message): string {
  if (m.audio && !m.text) return `Голосовое сообщение, ${Math.max(1, Math.round(m.audio.durationMs / 1000))} с — без расшифровки`;
  return m.audio ? `Голосовое: ${m.text}` : m.text;
}

export interface RecordHit {
  patientId: string;
  where: string;
  text: string;
  at: string;
}

/** Поиск по истории: заметки врача, сообщения, заметки пациента, «к приёму», документы, журнал — включая архив */
export function searchRecords(db: DB, patientIds: string[], q: string): RecordHit[] {
  const s = q.trim().toLowerCase();
  if (s.length < 3) return [];
  const ids = new Set(patientIds);
  const hits: RecordHit[] = [];
  const add = (patientId: string, where: string, text: string, at: string) => {
    if (!ids.has(patientId) || !text) return;
    const i = text.toLowerCase().indexOf(s);
    if (i < 0) return;
    const from = Math.max(0, i - 40);
    hits.push({ patientId, where, text: `${from ? '…' : ''}${text.slice(from, i + s.length + 60)}${i + s.length + 60 < text.length ? '…' : ''}`, at });
  };
  for (const [pid, n] of Object.entries(db.notes)) add(pid, 'Заметка врача', n.text, n.updatedAt);
  for (const m of db.messages) add(m.patientId, m.from === 'patient' ? 'Сообщение пациента' : m.from === 'doctor' ? 'Ответ врача' : 'Автоответ', m.text, m.at);
  for (const c of db.checkins) add(c.patientId, 'Заметка в дневнике', c.note, c.at);
  for (const d of db.documents) add(d.patientId, `Документ «${d.name}»`, `${d.name}\n${d.text ?? ''}\n${d.ocr?.text ?? ''}`, d.at);
  for (const w of db.patientWords) add(w.patientId, 'Со слов пациента (на приёме)', w.text, w.at);
  for (const p of db.patients) {
    if (p.previsit) add(p.id, '«К приёму» со слов пациента', `${p.previsit.concerns} ${p.previsit.changes} ${p.previsit.questions}`, p.previsit.at);
    add(p.id, 'Жалобы', p.complaints, p.lastVisitAt ?? '');
  }
  return hits.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
}

export function scalePoints(db: DB, patientId: string, scale: ScaleId) {
  return db.assessments
    .filter((a) => a.patientId === patientId && a.scale === scale)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((a) => ({ t: Date.parse(a.at), v: a.total, id: a.id }));
}

export function lastCheckin(db: DB, patientId: string) {
  return db.checkins.filter((c) => c.patientId === patientId).sort((a, b) => b.at.localeCompare(a.at))[0];
}

export function therapyWeek(p: Patient, db: DB, now: Date): number | null {
  if (!p.therapyStart || !isTherapyActive(db, p)) return null;
  return Math.floor((now.getTime() - Date.parse(p.therapyStart)) / (7 * DAY)) + 1;
}

export function bandTone(scale: ScaleId, v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const b = SCALES[scale].bands.find((x) => v >= x.min && v <= x.max);
  return b ? `badge-${b.tone}` : '';
}

/** Текст «скопировать в МИС»: структурированная выписка без лишнего */
const FACTOR_WORD: Record<Exclude<keyof Patient['factors'], 'alcohol' | 'allergy'>, string> = {
  pregnant: 'беременность',
  breastfeeding: 'грудное вскармливание',
  epilepsy: 'эпилепсия / органическое поражение ГМ',
  renalModerateSevere: 'почечная недостаточность (СКФ < 60)',
  hepaticImpairment: 'печёночная недостаточность',
  maoi: 'приём ИМАО (< 2 недель)',
  drives: 'управляет транспортом / механизмами',
  cardio: 'сердечно-сосудистые заболевания',
  endocrine: 'сахарный диабет / эндокринные заболевания',
  substanceDependence: 'зависимость от алкоголя / ПАВ',
};

/** Анамнез в структуре медицинской записи — для вставки в карту одной кнопкой. Только данные карточки, без домыслов. */
export function anamnesisText(db: DB, p: Patient, now: Date): string {
  const rx = [...db.prescriptions].reverse().find((r) => r.patientId === p.id && (r.status === 'confirmed' || r.status === 'modified'));
  const adh = computeAdherence(db.medEvents.filter((e) => e.patientId === p.id), rx && p.therapyStart ? new Date(p.therapyStart) : null, now);
  const sc = (s: ScaleId) => scalePoints(db, p.id, s).map((x) => x.v);
  const gad = sc('GAD7');
  const phq = sc('PHQ9');
  const item9 = [...db.assessments].reverse().find((a) => a.patientId === p.id && a.scale === 'PHQ9')?.answers?.[8];
  const week = db.checkins.filter((c) => c.patientId === p.id && Date.parse(c.at) > now.getTime() - 7 * DAY);
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1).replace('.', ',') : '—');
  const words = db.patientWords.filter((w) => w.patientId === p.id).sort((a, b) => b.at.localeCompare(a.at))[0];
  const aes = db.adverseEvents.filter((a) => a.patientId === p.id);
  const docs = db.documents.filter((d) => d.patientId === p.id && (d.ocr?.text || d.text));
  const since = p.consents.find((c) => c.purpose === 'treatment')?.signedAt;
  const factors = (Object.keys(FACTOR_WORD) as (keyof typeof FACTOR_WORD)[]).filter((k) => p.factors[k]).map((k) => FACTOR_WORD[k]);
  const lines = [
    `АНАМНЕЗ (дистанционное наблюдение «Компас»), ${p.code}, карта ${p.cardNo}, ${p.age} ${plural(p.age, 'год', 'года', 'лет')}`,
    '',
    `Жалобы: ${[p.complaints, p.previsit?.concerns && `к приёму — ${p.previsit.concerns}`].filter(Boolean).join('; ') || 'не указаны'}.`,
    ...(words ? [`Со слов пациента (${fmtDate(words.at)}): «${words.text}».`] : []),
    '',
    `Анамнез заболевания: диагноз (внесён врачом) ${p.diagnosis.code} ${p.diagnosis.label}${p.diagnosis.postCovid ? ', после перенесённого COVID-19' : ''}. Наблюдение в «Компасе» с ${since ? fmtDate(since) : '—'}. ` +
      `Динамика: GAD-7 ${gad.join(' → ') || 'нет данных'}; PHQ-9 ${phq.join(' → ') || 'нет данных'}${item9 !== undefined ? ` (пункт 9 — ${item9})` : ''}. ` +
      `За 7 дней: настроение ${avg(week.map((c) => c.mood))}/10, тревога ${avg(week.map((c) => c.anxiety))}/10, плохой сон ${week.filter((c) => c.sleep === 'bad' || c.sleep === 'none').length} из ${week.length} ночей.`,
    '',
    `Лекарственный анамнез: ${rx ? `«Авиандр» (маритупирдин) ${rx.regimen} с ${fmtDate(rx.decidedAt!)}${rx.offLabel ? ' (вне инструкции, решение врача)' : ''}; приверженность за 7 дн. — ${pct(adh.rate7)}, за 28 дн. — ${pct(adh.rate28)}` : 'препараты по поводу основного заболевания не назначены'}. ` +
      `Сопутствующие препараты: ${p.meds.join(', ') || 'нет'}. Нежелательные явления: ${aes.length ? aes.map((a) => `${a.term} (${a.status === 'active' ? 'сохраняется' : 'прошло'})`).join(', ') : 'не отмечены'}.`,
    `Аллергологический анамнез: ${p.factors.allergy ? 'отмечена повышенная чувствительность к компонентам «Авиандра»' : 'аллергия на компоненты «Авиандра» не отмечена (по данным карточки)'}.`,
    `Факторы риска: ${factors.join(', ') || 'не отмечены'}; алкоголь — ${{ none: 'не употребляет', rare: 'редко', regular: 'регулярно' }[p.factors.alcohol]}.`,
    ...(docs.length ? [`Документы: ${docs.map((d) => `«${d.name}»${d.ocr ? ' (печатная версия проверена врачом)' : ''}`).join('; ')}.`] : []),
    '',
    `Сформировано ${now.toLocaleString('ru-RU')} из данных карточки: жалобы — со слов пациента, шкалы и дневник — самоотчёт. Проверьте перед вставкой в медицинскую карту.`,
  ];
  return lines.join('\n');
}

export function misSummary(db: DB, p: Patient, now: Date): string {
  const adh = computeAdherence(db.medEvents.filter((e) => e.patientId === p.id), isTherapyActive(db, p) && p.therapyStart ? new Date(p.therapyStart) : null, now);
  const sc = (s: ScaleId) => scalePoints(db, p.id, s);
  const fmtScale = (s: ScaleId) => {
    const pts = sc(s);
    if (!pts.length) return 'нет данных';
    return pts.length > 1 ? `${pts[0].v} (${fmtDate(new Date(pts[0].t))}) → ${pts[pts.length - 1].v} (${fmtDate(new Date(pts[pts.length - 1].t))})` : `${pts[0].v} (${fmtDate(new Date(pts[0].t))})`;
  };
  const rx = [...db.prescriptions].reverse().find((r) => r.patientId === p.id && (r.status === 'confirmed' || r.status === 'modified'));
  const lastRecipe = rx?.recipes?.[rx.recipes.length - 1];
  const aes = db.adverseEvents.filter((a) => a.patientId === p.id);
  const alerts = db.alerts.filter((a) => a.patientId === p.id && Date.parse(a.createdAt) > now.getTime() - 28 * DAY);
  const reasons = Object.entries(adh.reasons)
    .map(([k, v]) => `${MISS_REASONS[k as keyof typeof MISS_REASONS]} — ${v}`)
    .join('; ');
  return [
    `Дистанционное наблюдение (Компас), сформировано ${now.toLocaleString('ru-RU')}`,
    `Пациент: ${p.code}, ${p.age} лет. Диагноз (внесён врачом): ${p.diagnosis.code} ${p.diagnosis.label}.`,
    `Терапия: ${rx ? `«Авиандр» ${rx.regimen}${rx.offLabel ? ' (вне инструкции, решение врача)' : ''}, с ${fmtDate(rx.decidedAt!)}` : 'не назначена'}.`,
    ...(lastRecipe ? [`Рецепт от ${fmtDate(lastRecipe.at)} (бланк № ${lastRecipe.blank}): ${lastRecipe.text.split('\n').slice(0, 2).join(' ')}`] : []),
    `Приверженность (самоотчёт): 7 дн — ${adh.taken7}/${adh.due7} (${pct(adh.rate7)}); 28 дн — ${adh.taken28}/${adh.due28} (${pct(adh.rate28)})${reasons ? `. Причины пропусков: ${reasons}` : ''}.`,
    `GAD-7: ${fmtScale('GAD7')}. PHQ-9: ${fmtScale('PHQ9')}.`,
    `Нежелательные явления: ${aes.length ? aes.map((a) => `${a.term} (${a.status === 'active' ? 'сохраняется' : 'прошло'})`).join(', ') : 'не отмечены'}.`,
    `Сигналы за 28 дн: ${alerts.length ? alerts.map((a) => `${a.title} [${a.status === 'closed' ? 'закрыт' : 'открыт'}]`).join('; ') : 'нет'}.`,
    'Шкалы — скрининг и оценка тяжести, не диагноз. Решения принимает лечащий врач.',
  ].join('\n');
}
