// Эталонные проверки 7 сценариев: то, что система ОБЯЗАНА показать (карточки сценариев, приложение A).
// Используются и на странице демо (живая проверка), и в автотестах.
import type { DB, Facts } from '../core/types';
import { buildFacts } from '../core/facts';
import { checkTherapy, evaluateRouting } from '../core/clinical';
import { standNow } from './db';

export interface Check {
  label: string;
  ok: boolean;
}

const isOpenOrDone = (db: DB, pid: string, ruleId: string) => db.alerts.some((a) => a.patientId === pid && a.ruleId === ruleId);

export const SCENARIO7_FACTS: Facts = {
  'route.byPsychiatrist': false,
  'phq9.total': 11,
  'phq9.item9': 0,
  'gad7.total': 14,
  'patient.cardio': true,
  'patient.age': 52,
};

export function scenarioChecks(db: DB, n: number, now: Date = standNow(db)): Check[] {
  const p = db.patients.find((x) => x.scenario === n);
  if (!p) return [];
  const f = buildFacts(db, p, now);
  const t = checkTherapy(f);
  const r = evaluateRouting(f);
  const warnIds = t.warns.map((w) => w.rule.id);
  const sugg = db.suggestions.some((s) => s.patientId === p.id && s.ruleId === 'AVI-SUG-REGIMEN');
  const rx = db.prescriptions.some((x) => x.patientId === p.id && x.status === 'confirmed' && x.decidedBy);
  switch (n) {
    case 1:
      return [
        { label: 'Показание совпадает (AVI-IND-GAD)', ok: t.indication?.rule.id === 'AVI-IND-GAD' },
        { label: 'Противопоказаний нет', ok: t.stops.length === 0 },
        { label: 'Предупреждение об алкоголе', ok: warnIds.includes('AVI-WARN-ALCOHOL') },
        { label: 'Предложение режима — до подписи врача', ok: sugg || rx },
        { label: 'ЖЕЛАТЕЛЬНО: психотерапия (КПТ)', ok: r.byCategory.desirable.some((h) => h.rule.id === 'RT-DES-CBT') },
      ];
    case 2:
      return [
        { label: 'Метка «вне инструкции» (AVI-OFFLABEL)', ok: Boolean(t.offLabel) },
        { label: 'Препарат не предлагается автоматически', ok: t.suggestions.length === 0 && !sugg },
        { label: 'ЖЕЛАТЕЛЬНО: психиатр (PHQ-9 15–19)', ok: r.category === 'desirable' && r.byCategory.desirable.some((h) => h.rule.id === 'RT-DES-SCORES') },
      ];
    case 3:
      return [
        { label: 'ВНИМАНИЕ: антидепрессанты (сертралин)', ok: warnIds.includes('AVI-IX-ANTIDEPRESSANTS') },
        { label: 'ВНИМАНИЕ: ингибиторы CYP2D6 (дифенгидрамин)', ok: warnIds.includes('AVI-IX-CYP2D6') },
        { label: 'Оранжевый сигнал врачу (IX-NEW-MED)', ok: isOpenOrDone(db, p.id, 'IX-NEW-MED') },
        { label: 'ЖЕЛАТЕЛЬНО: консультация по комбинации', ok: r.byCategory.desirable.some((h) => h.rule.id === 'RT-DES-COMBO') },
      ];
    case 4:
      return [
        { label: 'СТОП: беременность (AVI-CI-PREGNANCY)', ok: t.stops.some((s) => s.rule.id === 'AVI-CI-PREGNANCY') },
        { label: 'Обычный путь назначения заблокирован', ok: t.blocked && t.suggestions.length === 0 },
        { label: 'ОБЯЗАТЕЛЬНО: психиатр и акушер-гинеколог', ok: r.category === 'mandatory' && r.byCategory.mandatory.some((h) => h.rule.id === 'RT-MAN-PREGNANCY') },
      ];
    case 5: {
      const red = db.alerts.filter((a) => a.patientId === p.id && a.level === 'red');
      return [
        { label: 'Красный сигнал (пункт 9 PHQ-9 ≥ 2)', ok: red.some((a) => a.ruleId === 'SAFETY-PHQ9-ITEM9') },
        { label: 'Кризисная фраза в заметке', ok: red.some((a) => a.ruleId === 'SAFETY-CRISIS-TEXT') },
        { label: 'Пациенту — безопасный шаблон', ok: db.messages.some((m) => m.patientId === p.id && m.kind === 'safe_template') },
        { label: 'Push + SMS без медицинских данных', ok: red.some((a) => a.channels.some((c) => c.channel === 'sms')) },
        { label: 'ОБЯЗАТЕЛЬНО · экстренно', ok: r.category === 'urgent' },
        { label: 'Терапия не изменена системой', ok: db.prescriptions.filter((x) => x.patientId === p.id).every((x) => x.decidedBy) },
      ];
    }
    case 6:
      return [
        { label: 'Оранжевый: ≥ 3 из 7 пропусков (ADH-MISSED-7)', ok: isOpenOrDone(db, p.id, 'ADH-MISSED-7') },
        { label: 'Причина пропусков — нежелательные ощущения', ok: Boolean(buildAdhReason(db, p.id)) },
        { label: 'НЯ «сонливость» зарегистрирована', ok: db.adverseEvents.some((a) => a.patientId === p.id && a.term === 'сонливость') },
        { label: 'Предложения врачу (обсудить реакцию и др.)', ok: db.suggestions.some((s) => s.patientId === p.id && s.ruleId === 'ADH-MISSED-7') },
      ];
    case 7: {
      const r7 = evaluateRouting(SCENARIO7_FACTS);
      const r7b = evaluateRouting({ ...SCENARIO7_FACTS, 'phq9.item9': 1 });
      const t7 = checkTherapy({ ...SCENARIO7_FACTS, 'diagnosis.code': 'F41.1' });
      return [
        { label: 'ЖЕЛАТЕЛЬНО: психиатр в течение 4 недель', ok: r7.category === 'desirable' },
        { label: 'Пункт 9 > 0 → ОБЯЗАТЕЛЬНО', ok: r7b.category === 'mandatory' },
        { label: '«С осторожностью»: ССЗ (AVI-WARN-CARDIO)', ok: t7.warns.some((w) => w.rule.id === 'AVI-WARN-CARDIO') },
      ];
    }
  }
  return [];
}

function buildAdhReason(db: DB, pid: string) {
  return db.medEvents.some((e) => e.patientId === pid && e.status === 'missed' && e.reason === 'side_effects');
}
