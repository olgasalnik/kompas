import { describe, expect, it } from 'vitest';
import { compare, evaluate, runRules } from './engine';
import { scoreScale, scoreClinicianTotal, ScaleInputError, bandFor } from './scales';
import { checkTherapy, evaluateAlerts, evaluateRouting, AVIANDR_RULES, ALERT_RULES, ROUTING_RULES } from './clinical';
import { computeAdherence } from './adherence';
import { classifyText, answerQuestion, findMedsInText } from './text';
import type { Facts, MedEvent, Rule } from './types';
import { at, DAY } from './time';
import sources from '../data/sources.json';

const baseFacts = (over: Facts = {}): Facts => ({
  'patient.age': 34,
  'patient.sex': 'f',
  'patient.pregnant': false,
  'patient.breastfeeding': false,
  'patient.epilepsy': false,
  'patient.renalModerateSevere': false,
  'patient.hepaticImpairment': false,
  'patient.maoi': false,
  'patient.allergy': false,
  'patient.drives': false,
  'patient.cardio': false,
  'patient.endocrine': false,
  'patient.substanceDependence': false,
  'patient.alcohol': 'none',
  'patient.meds': [],
  'diagnosis.code': 'F41.1',
  'diagnosis.postCovid': false,
  'diagnosis.severity': 'moderate',
  'therapy.active': false,
  'route.byPsychiatrist': true,
  ...over,
});

describe('движок правил', () => {
  it('операторы сравнения', () => {
    expect(compare('gte', 2, 2)).toBe(true);
    expect(compare('gt', 2, 2)).toBe(false);
    expect(compare('in', 'F41.1', ['F41.1'])).toBe(true);
    expect(compare('intersects', ['сертралин'], ['сертралин', 'пароксетин'])).toBe(true);
    expect(compare('intersects', [], ['сертралин'])).toBe(false);
    expect(compare('between', 15, [10, 19])).toBe(true);
    expect(compare('between', 20, [10, 19])).toBe(false);
    expect(compare('truthy', [], undefined)).toBe(false);
    expect(compare('gte', null, 2)).toBe(false); // нет данных — не срабатывает
  });

  it('all / any / not и сбор совпавших фактов', () => {
    const r = evaluate({ all: [{ fact: 'a', op: 'eq', value: 1 }, { any: [{ fact: 'b', op: 'gt', value: 5 }, { fact: 'c', op: 'truthy' }] }] }, { a: 1, b: 2, c: true });
    expect(r.ok).toBe(true);
    expect(r.matched.map((m) => m.fact)).toEqual(['a', 'c']);
    const n = evaluate({ not: { fact: 'a', op: 'eq', value: 1 } }, { a: 2 });
    expect(n.ok).toBe(true);
    expect(n.matched[0].negated).toBe(true);
  });

  it('черновики правил не исполняются', () => {
    const draft: Rule = { ...AVIANDR_RULES[0], status: 'draft' };
    expect(runRules([draft], baseFacts())).toHaveLength(0);
  });

  it('у каждого правила есть источник из реестра, версия и статус', () => {
    const ids = new Set(sources.sources.map((s) => s.id));
    for (const r of [...AVIANDR_RULES, ...ALERT_RULES, ...ROUTING_RULES]) {
      expect(r.version, r.id).toBeTruthy();
      expect(ids.has(r.source.id), `${r.id}: источник ${r.source.id}`).toBe(true);
      expect(r.source.section, r.id).toBeTruthy();
    }
  });

  it('идентификаторы правил уникальны', () => {
    const all = [...AVIANDR_RULES, ...ALERT_RULES, ...ROUTING_RULES].map((r) => r.id);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('шкалы: подсчёт по ключу', () => {
  it('PHQ-9: суммы и градации на границах', () => {
    const cases: [number[], number, string][] = [
      [[0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 'минимальная'],
      [[1, 1, 1, 1, 0, 0, 0, 0, 0], 4, 'минимальная'],
      [[1, 1, 1, 1, 1, 0, 0, 0, 0], 5, 'лёгкая'],
      [[2, 2, 2, 2, 1, 0, 0, 0, 0], 9, 'лёгкая'],
      [[2, 2, 2, 2, 2, 0, 0, 0, 0], 10, 'умеренная'],
      [[2, 2, 2, 2, 2, 2, 2, 0, 0], 14, 'умеренная'],
      [[3, 3, 3, 2, 2, 2, 0, 0, 0], 15, 'умеренно тяжёлая'],
      [[3, 3, 3, 3, 3, 3, 1, 0, 0], 19, 'умеренно тяжёлая'],
      [[3, 3, 3, 3, 3, 3, 2, 0, 0], 20, 'тяжёлая'],
      [[3, 3, 3, 3, 3, 3, 3, 3, 3], 27, 'тяжёлая'],
    ];
    for (const [ans, total, band] of cases) {
      const s = scoreScale('PHQ9', ans);
      expect(s.total).toBe(total);
      expect(s.band).toBe(band);
    }
    expect(scoreScale('PHQ9', [0, 0, 0, 0, 0, 0, 0, 0, 2]).item9).toBe(2);
  });

  it('GAD-7: суммы и градации', () => {
    expect(scoreScale('GAD7', [0, 1, 0, 1, 0, 1, 1]).band).toBe('минимальная');
    expect(scoreScale('GAD7', [1, 1, 1, 1, 1, 0, 0]).band).toBe('лёгкая');
    expect(scoreScale('GAD7', [2, 2, 2, 2, 2, 0, 0]).band).toBe('умеренная');
    expect(scoreScale('GAD7', [3, 2, 2, 2, 2, 2, 1]).total).toBe(14);
    expect(scoreScale('GAD7', [3, 2, 2, 2, 2, 2, 2]).band).toBe('тяжёлая');
    expect(scoreScale('GAD7', [3, 3, 3, 3, 3, 3, 3]).total).toBe(21);
  });

  it('PHQ-4: подшкалы GAD-2 и PHQ-2, положительный скрининг с 3', () => {
    const s = scoreScale('PHQ4', [2, 1, 1, 1]);
    expect(s.total).toBe(5);
    expect(s.subscores).toEqual({ anxiety: 3, depression: 2 });
    expect(s.positive).toEqual(['anxiety']);
    expect(bandFor('PHQ4', 9).label).toBe('тяжёлая');
  });

  it('некорректный ввод отклоняется', () => {
    expect(() => scoreScale('PHQ9', [1, 2, 3])).toThrow(ScaleInputError);
    expect(() => scoreScale('GAD7', [0, 0, 0, 0, 0, 0, 4])).toThrow(ScaleInputError);
    expect(() => scoreScale('GAD7', [0, 0, 0, 0, 0, 0, 1.5])).toThrow(ScaleInputError);
    expect(() => scoreClinicianTotal('HAMD', 60)).toThrow(ScaleInputError);
    expect(scoreClinicianTotal('HAMA', 18).total).toBe(18);
  });
});

describe('паспорт «Авиандра»: показания, СТОП, ВНИМАНИЕ', () => {
  it('сценарий 1 — ГТР: показание совпадает, СТОП нет, предлагается режим по инструкции', () => {
    const c = checkTherapy(baseFacts({ 'patient.alcohol': 'rare' }));
    expect(c.indication?.rule.id).toBe('AVI-IND-GAD');
    expect(c.offLabel).toBeNull();
    expect(c.stops).toHaveLength(0);
    expect(c.onLabel).toBe(true);
    expect(c.suggestions.map((s) => s.rule.id)).toEqual(['AVI-SUG-REGIMEN']);
    expect(c.warns.map((w) => w.rule.id)).toContain('AVI-WARN-ALCOHOL');
  });

  it('сценарий 2 — депрессивный эпизод: «вне инструкции», препарат не предлагается', () => {
    const c = checkTherapy(baseFacts({ 'diagnosis.code': 'F32.1', 'patient.age': 41, 'patient.sex': 'm' }));
    expect(c.offLabel?.rule.id).toBe('AVI-OFFLABEL');
    expect(c.indication).toBeNull();
    expect(c.onLabel).toBe(false);
    expect(c.suggestions).toHaveLength(0);
    expect(c.offLabel?.matched[0].fact).toBe('diagnosis.code');
  });

  it('сценарий 3 — сертралин + дифенгидрамин: два ВНИМАНИЕ', () => {
    const c = checkTherapy(baseFacts({ 'patient.meds': ['сертралин', 'дифенгидрамин'] }));
    const ids = c.warns.map((w) => w.rule.id);
    expect(ids).toContain('AVI-IX-ANTIDEPRESSANTS');
    expect(ids).toContain('AVI-IX-CYP2D6');
    expect(c.stops).toHaveLength(0);
  });

  it('сценарий 4 — беременность: СТОП, путь назначения заблокирован (исключение — только решение врача)', () => {
    const c = checkTherapy(baseFacts({ 'patient.pregnant': true, 'patient.age': 29 }));
    expect(c.stops.map((s) => s.rule.id)).toEqual(['AVI-CI-PREGNANCY']);
    expect(c.blocked).toBe(true);
    expect(c.hardBlocked).toBe(false);
    expect(c.suggestions).toHaveLength(0);
  });

  it('каждое противопоказание инструкции вызывает СТОП (положительный и отрицательный случай)', () => {
    const cases: [Facts, string][] = [
      [{ 'patient.breastfeeding': true }, 'AVI-CI-PREGNANCY'],
      [{ 'patient.epilepsy': true }, 'AVI-CI-EPILEPSY'],
      [{ 'patient.maoi': true }, 'AVI-CI-MAOI'],
      [{ 'patient.meds': ['моклобемид'] }, 'AVI-CI-MAOI'],
      [{ 'patient.renalModerateSevere': true }, 'AVI-CI-RENAL'],
      [{ 'patient.hepaticImpairment': true }, 'AVI-CI-HEPATIC'],
      [{ 'patient.allergy': true }, 'AVI-CI-ALLERGY'],
      [{ 'patient.age': 17 }, 'AVI-CI-AGE'],
    ];
    for (const [over, id] of cases) {
      const c = checkTherapy(baseFacts(over));
      expect(c.stops.map((s) => s.rule.id), id).toContain(id);
      expect(c.onLabel).toBe(false);
    }
    expect(checkTherapy(baseFacts()).stops).toHaveLength(0);
    // граница возраста: 18 — можно
    expect(checkTherapy(baseFacts({ 'patient.age': 18 })).stops).toHaveLength(0);
  });

  it('ИМАО, аллергия и возраст до 18 — жёсткая блокировка без исключения', () => {
    expect(checkTherapy(baseFacts({ 'patient.maoi': true })).hardBlocked).toBe(true);
    expect(checkTherapy(baseFacts({ 'patient.age': 16 })).hardBlocked).toBe(true);
  });

  it('все группы взаимодействий из инструкции покрыты правилами', () => {
    const groups: [string, string][] = [
      ['феназепам', 'AVI-IX-SEDATIVES'],
      ['пароксетин', 'AVI-IX-ANTIDEPRESSANTS'],
      ['суматриптан', 'AVI-IX-TRIPTANS'],
      ['трамадол', 'AVI-IX-OPIOIDS'],
      ['кетоконазол', 'AVI-IX-CYP2D6'],
    ];
    for (const [med, id] of groups) {
      expect(checkTherapy(baseFacts({ 'patient.meds': [med] })).warns.map((w) => w.rule.id), med).toContain(id);
    }
  });

  it('«С осторожностью»: ССЗ, эндокринные, зависимость — ВНИМАНИЕ', () => {
    const c = checkTherapy(baseFacts({ 'patient.cardio': true, 'patient.endocrine': true, 'patient.substanceDependence': true }));
    expect(c.warns.map((w) => w.rule.id)).toEqual(expect.arrayContaining(['AVI-WARN-CARDIO', 'AVI-WARN-ENDOCRINE', 'AVI-WARN-SUBSTANCE']));
  });

  it('тревожное состояние после COVID-19: показание, только лёгкая и средняя степень', () => {
    const ok = checkTherapy(baseFacts({ 'diagnosis.code': 'F43.2', 'diagnosis.postCovid': true, 'diagnosis.severity': 'mild' }));
    expect(ok.indication?.rule.id).toBe('AVI-IND-POSTCOVID');
    const severe = checkTherapy(baseFacts({ 'diagnosis.code': 'F43.2', 'diagnosis.postCovid': true, 'diagnosis.severity': 'severe' }));
    expect(severe.offLabel).not.toBeNull();
    const noCovid = checkTherapy(baseFacts({ 'diagnosis.code': 'F43.2', 'diagnosis.postCovid': false }));
    expect(noCovid.offLabel).not.toBeNull();
  });
});

describe('алертинг', () => {
  const ids = (f: Facts) => evaluateAlerts(f).map((h) => h.rule.id);

  it('сценарий 5 — пункт 9 = 2 и «не вижу смысла»: красный', () => {
    const hits = evaluateAlerts({ 'phq9.item9Recent': 2, 'text.crisis': true });
    expect(hits.map((h) => h.rule.id)).toEqual(expect.arrayContaining(['SAFETY-PHQ9-ITEM9', 'SAFETY-CRISIS-TEXT']));
    expect(hits.every((h) => h.rule.level === 'red')).toBe(true);
  });

  it('пункт 9 = 1 — оранжевый, не красный', () => {
    const hits = evaluateAlerts({ 'phq9.item9Recent': 1 });
    expect(hits.map((h) => h.rule.id)).toEqual(['PHQ9-ITEM9-ONE']);
    expect(hits[0].rule.level).toBe('orange');
  });

  it('сценарий 6 — пропуски: 3 из 7 и 3 подряд — оранжевый', () => {
    expect(ids({ 'adherence.missedLast7': 4 })).toContain('ADH-MISSED-7');
    expect(ids({ 'adherence.missedConsecutive': 3 })).toContain('ADH-MISSED-CONSEC');
    expect(ids({ 'adherence.missedLast7': 2, 'adherence.missedConsecutive': 2 })).toHaveLength(0);
  });

  it('сценарий 3 — новый препарат из списка взаимодействий на фоне терапии — оранжевый', () => {
    expect(ids({ 'therapy.active': true, 'meds.newInteracting': ['дифенгидрамин'] })).toContain('IX-NEW-MED');
    expect(ids({ 'therapy.active': false, 'meds.newInteracting': ['дифенгидрамин'] })).not.toContain('IX-NEW-MED');
  });

  it('PHQ-9 ≥ 20 и рост на 5 за 2 недели — оранжевый; 19 — нет', () => {
    expect(ids({ 'phq9.total': 20 })).toContain('PHQ9-SEVERE');
    expect(ids({ 'phq9.total': 19 })).not.toContain('PHQ9-SEVERE');
    expect(ids({ 'phq9.rise14': 5 })).toContain('PHQ9-RISE');
    expect(ids({ 'phq9.rise14': 4 })).not.toContain('PHQ9-RISE');
  });

  it('жёлтые: нет ответа к 4-й неделе, нет записей 3 дня', () => {
    expect(ids({ 'therapy.week': 4, 'gad7.reductionPct': 10 })).toContain('GAD7-NO-RESPONSE-W4');
    expect(ids({ 'therapy.week': 4, 'gad7.reductionPct': 25 })).not.toContain('GAD7-NO-RESPONSE-W4');
    expect(ids({ 'therapy.week': 3, 'gad7.reductionPct': 0 })).not.toContain('GAD7-NO-RESPONSE-W4');
    expect(ids({ 'checkin.daysSinceLast': 3 })).toContain('NO-ENTRIES-3D');
  });

  it('SOS «не в безопасности», передозировка, тяжёлые НЯ — красный', () => {
    expect(ids({ 'sos.unsafe': true })).toEqual(['SAFETY-SOS-UNSAFE']);
    expect(ids({ 'overdose.reported': true })).toEqual(['SAFETY-OVERDOSE']);
    expect(ids({ 'ae.severe': true })).toEqual(['SAFETY-SEVERE-AE']);
  });

  it('пустые данные — ни одного сигнала (устойчивость к неполному вводу)', () => {
    expect(evaluateAlerts({})).toHaveLength(0);
  });
});

describe('маршрутизация «ОБЯЗАТЕЛЬНО / ЖЕЛАТЕЛЬНО»', () => {
  const route = (f: Facts) => evaluateRouting(f).category;

  it('сценарий 7 — терапевт: GAD-7 14, PHQ-9 11, пункт 9 = 0 → ЖЕЛАТЕЛЬНО', () => {
    expect(route({ 'route.byPsychiatrist': false, 'gad7.total': 14, 'phq9.total': 11, 'phq9.item9': 0 })).toBe('desirable');
  });

  it('сценарий 7 с пунктом 9 > 0 → ОБЯЗАТЕЛЬНО', () => {
    expect(route({ 'route.byPsychiatrist': false, 'gad7.total': 14, 'phq9.total': 11, 'phq9.item9': 1 })).toBe('mandatory');
    expect(route({ 'route.byPsychiatrist': false, 'gad7.total': 14, 'phq9.total': 11, 'phq9.item9': 2 })).toBe('urgent');
  });

  it('сценарий 2 — PHQ-9 17: ЖЕЛАТЕЛЬНО; при подозрении на биполярность или PHQ-9 ≥ 20 — ОБЯЗАТЕЛЬНО', () => {
    expect(route({ 'route.byPsychiatrist': false, 'phq9.total': 17, 'gad7.total': 11 })).toBe('desirable');
    expect(route({ 'route.byPsychiatrist': false, 'phq9.total': 17, 'flags.bipolar': true })).toBe('mandatory');
    expect(route({ 'route.byPsychiatrist': false, 'phq9.total': 20 })).toBe('mandatory');
  });

  it('сценарий 4 — беременность → ОБЯЗАТЕЛЬНО (психиатр и акушер-гинеколог)', () => {
    const r = evaluateRouting({ 'patient.pregnant': true, 'gad7.total': 14, 'phq9.total': 9, 'route.byPsychiatrist': true });
    expect(r.category).toBe('mandatory');
    expect(r.byCategory.mandatory[0].rule.to).toContain('акушер');
  });

  it('сценарий 5 — пункт 9 = 2 → ОБЯЗАТЕЛЬНО · экстренно, в тот же день', () => {
    const r = evaluateRouting({ 'phq9.item9': 2 });
    expect(r.category).toBe('urgent');
    expect(r.byCategory.urgent[0].rule.term).toBe('В тот же день');
  });

  it('GAD-7 15 и PHQ-9 15 вместе → ОБЯЗАТЕЛЬНО', () => {
    expect(route({ 'gad7.total': 15, 'phq9.total': 15, 'route.byPsychiatrist': false })).toBe('mandatory');
  });

  it('нет данных и флагов — направления нет', () => {
    expect(route({ 'route.byPsychiatrist': false, 'phq9.total': 6, 'gad7.total': 5 })).toBeNull();
  });
});

describe('приверженность', () => {
  const start = new Date(2026, 9, 1, 7, 0);
  const now = new Date(2026, 9, 14, 22, 0);
  const ev = (dayOffset: number, slot: 'morning' | 'evening', status: MedEvent['status'], reason?: MedEvent['reason']): MedEvent => {
    const d = at(new Date(start.getTime() + dayOffset * DAY), slot === 'morning' ? 8 : 20);
    return { id: `${dayOffset}${slot}`, patientId: 'p', scheduledAt: d.toISOString(), slot, status, reason, recordedAt: d.toISOString() };
  };

  it('индекс за 7 и 28 дней считается корректно', () => {
    const events: MedEvent[] = [];
    for (let d = 0; d < 14; d++) {
      events.push(ev(d, 'morning', 'taken'));
      events.push(ev(d, 'evening', d >= 11 ? 'missed' : 'taken', d >= 11 ? 'side_effects' : undefined));
    }
    const a = computeAdherence(events, start, now);
    expect(a.due28).toBe(28);
    expect(a.taken28).toBe(25);
    expect(a.due7).toBe(14);
    expect(a.taken7).toBe(11);
    expect(Math.round((a.rate7 ?? 0) * 100)).toBe(79);
    expect(a.missedLast7).toBe(3);
    expect(a.missedConsecutive).toBe(1);
    expect(a.reasons.side_effects).toBe(3);
  });

  it('серия пропусков подряд и первый пропуск для T-detect', () => {
    const events: MedEvent[] = [ev(11, 'evening', 'taken'), ev(12, 'morning', 'missed', 'forgot'), ev(12, 'evening', 'missed', 'forgot'), ev(13, 'morning', 'missed', 'forgot')];
    const a = computeAdherence(events, start, now);
    // вечерняя доза 14 октября ещё не отмечена — серию не прерывает
    expect(a.missedConsecutive).toBe(3);
    expect(a.firstMissAt?.getDate()).toBe(13);
  });

  it('«Позже» без подтверждения дольше 12 часов считается пропуском', () => {
    const a = computeAdherence([ev(13, 'morning', 'later')], start, now);
    const d = a.doses.find((x) => x.key.endsWith('morning') && x.at.getDate() === 14);
    expect(d?.effective).toBe('missed');
  });

  it('без начала терапии индекс не считается', () => {
    expect(computeAdherence([], null, now).rate7).toBeNull();
  });
});

describe('свободный текст и справка по препарату', () => {
  it('классификатор ловит кризисные формулировки (полнота) и не путает обычный текст', () => {
    expect(classifyText('Устал, не вижу смысла во всём этом').crisis).toBe(true);
    expect(classifyText('Иногда думаю, что ЛУЧШЕ БЫ МЕНЯ НЕ БЫЛО').crisis).toBe(true);
    expect(classifyText('Слышу голоса по ночам').psychosis).toBe(true);
    expect(classifyText('Сегодня хорошо спала, тревога меньше').crisis).toBe(false);
  });

  it('ответы только из корпуса инструкции, с разделом-источником', () => {
    expect(answerQuestion('Я забыла выпить утреннюю таблетку, что делать?').answer?.id).toBe('missed');
    expect(answerQuestion('Можно ли бокал вина вечером?').answer?.id).toBe('alcohol');
    expect(answerQuestion('Меня клонит в сон после таблетки').answer?.id).toBe('side_effects');
    expect(answerQuestion('Выпил лишнюю таблетку, это опасно?').answer?.id).toBe('overdose');
    expect(answerQuestion('Можно ли вместе с лекарством от простуды?').answer?.id).toBe('interaction');
  });

  it('неизвестный вопрос — нет ответа (передаётся врачу)', () => {
    expect(answerQuestion('Какая погода будет завтра?').answer).toBeNull();
  });

  it('кризисный текст не «обсуждается»: ответа из корпуса нет, возвращается признак кризиса', () => {
    const r = answerQuestion('не хочу жить, можно ли пропустить таблетку');
    expect(r.answer).toBeNull();
    expect(r.crisis.crisis).toBe(true);
  });

  it('распознаёт препараты из списка взаимодействий в тексте', () => {
    expect(findMedsInText('пью средство от простуды с дифенгидрамином')).toContain('дифенгидрамин');
  });
});
