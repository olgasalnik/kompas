// Эталонные сценарии как автотесты: 7 карточек сценариев → ожидаемое поведение системы.
import { beforeEach, describe, expect, it } from 'vitest';
import { getDB, setDB } from './db';
import { ackAlert, demoRedAlert, initialStand, markDose, prescribe, sendPatientMessage, sosAnswer, sosOpen, submitCheckin, tick, decideSuggestion, reportMed } from './api';
import { scenarioChecks } from './scenarioChecks';
import { NOTIFY_TEXTS } from './api';

beforeEach(() => {
  setDB(initialStand(), false);
});

describe('семь клинических сценариев: эталон', () => {
  for (const n of [1, 2, 3, 4, 6, 7]) {
    it(`сценарий ${n}: все эталонные проверки проходят на исходном стенде`, () => {
      const checks = scenarioChecks(getDB(), n);
      expect(checks.length).toBeGreaterThan(0);
      for (const c of checks) expect(c.ok, `${n}: ${c.label}`).toBe(true);
    });
  }

  it('сценарий 5: красный сигнал после ответа пациента; эталон выполняется полностью', () => {
    const before = scenarioChecks(getDB(), 5);
    expect(before.find((c) => c.label.startsWith('Красный'))?.ok).toBe(false);
    const created = demoRedAlert('p5');
    expect(created.some((a) => a.level === 'red')).toBe(true);
    for (const c of scenarioChecks(getDB(), 5)) expect(c.ok, c.label).toBe(true);
  });

  it('на исходном стенде нет ни одного красного сигнала (только по событию)', () => {
    expect(getDB().alerts.filter((a) => a.level === 'red')).toHaveLength(0);
  });
});

describe('петля безопасности', () => {
  it('повторная обработка того же ответа не создаёт дубликат сигнала', () => {
    demoRedAlert('p5');
    const n = getDB().alerts.length;
    markDose('p5', 'morning', 'taken');
    expect(getDB().alerts.length).toBe(n);
  });

  it('эскалация: без подтверждения 10 «минут» — дежурный, 30 — заведующая; после подтверждения — стоп', () => {
    demoRedAlert('p5');
    const db = getDB();
    const red = db.alerts.find((a) => a.level === 'red')!;
    // Сдвигаем «реальное» время создания: 11 минут назад
    red.createdAtMs = Date.now() - 11 * 60_000;
    db.settings.demoSpeed = 1;
    setDB(db, false);
    tick();
    expect(getDB().alerts.find((a) => a.id === red.id)!.escalationStep).toBe(1);
    const db2 = getDB();
    db2.alerts.find((a) => a.id === red.id)!.createdAtMs = Date.now() - 31 * 60_000;
    setDB(db2, false);
    tick();
    const esc = getDB().alerts.find((a) => a.id === red.id)!;
    expect(esc.escalationStep).toBe(2);
    expect(esc.escalations.map((e) => e.to)).toEqual(['d2', 'h1']);
    // Второй красный — подтверждён сразу, эскалации нет
    const other = getDB().alerts.find((a) => a.level === 'red' && a.id !== red.id)!;
    ackAlert(other.id, 'd1');
    const db3 = getDB();
    db3.alerts.find((a) => a.id === other.id)!.createdAtMs = Date.now() - 60 * 60_000;
    setDB(db3, false);
    tick();
    expect(getDB().alerts.find((a) => a.id === other.id)!.escalationStep).toBe(0);
  });

  it('уведомления не содержат медицинских данных', () => {
    demoRedAlert('p5');
    const words = ['авиандр', 'маритупирдин', 'тревог', 'депресс', 'суицид', 'phq', 'gad'];
    for (const n of getDB().notifications) for (const w of words) expect(n.text.toLowerCase()).not.toContain(w);
    expect(getDB().notifications.some((n) => n.text === NOTIFY_TEXTS.smsRed)).toBe(true);
  });

  it('«Мне тяжело сейчас» → «Нет» — красный сигнал; «Да» — нет сигнала', () => {
    const id = sosOpen('p1');
    expect(sosAnswer('p1', id, true)).toHaveLength(0);
    const id2 = sosOpen('p1');
    const a = sosAnswer('p1', id2, false);
    expect(a.map((x) => x.ruleId)).toContain('SAFETY-SOS-UNSAFE');
  });

  it('кризисная фраза в сообщении: ответа из корпуса нет, красный сигнал и безопасный шаблон', () => {
    const r = sendPatientMessage('p1', 'Мне кажется, лучше бы меня не было');
    expect(r.crisis).toBe(true);
    expect(r.answer).toBeNull();
    expect(r.alerts.some((a) => a.ruleId === 'SAFETY-CRISIS-TEXT')).toBe(true);
    expect(getDB().messages.some((m) => m.patientId === 'p1' && m.kind === 'safe_template')).toBe(true);
  });

  it('вопрос о пропуске — ответ из инструкции с источником; неизвестный вопрос — передаётся врачу', () => {
    const r = sendPatientMessage('p3', 'Забыла утреннюю таблетку, что делать?');
    expect(r.answer?.id).toBe('missed');
    const auto = getDB().messages.filter((m) => m.patientId === 'p3' && m.kind === 'auto_answer').pop();
    expect(auto?.sourceRef).toContain('S4');
    const u = sendPatientMessage('p3', 'Какой у вас адрес парковки?');
    expect(u.answer).toBeNull();
    expect(u.handoff).toBe(true);
  });

  it('новый препарат из списка взаимодействий на фоне терапии — оранжевый сигнал', () => {
    const a = reportMed('p8', 'кетоконазол', 'противогрибковое');
    expect(a.map((x) => x.ruleId)).toContain('IX-NEW-MED');
  });

  it('чек-ин с судорогами — красный сигнал', () => {
    const a = submitCheckin('p8', { mood: 5, anxiety: 5, sleep: 'ok', sideEffects: ['судороги'], note: '', taps: 5, durationMs: 20000 });
    expect(a.map((x) => x.ruleId)).toContain('SAFETY-SEVERE-AE');
  });
});

describe('решения только за врачом', () => {
  it('предложение режима не превращается в назначение без решения врача', () => {
    const db = getDB();
    expect(db.prescriptions.some((r) => r.patientId === 'p1')).toBe(false);
    const s = db.suggestions.find((x) => x.patientId === 'p1' && x.ruleId === 'AVI-SUG-REGIMEN')!;
    expect(s.status).toBe('proposed');
    decideSuggestion(s.id, 'd1', 'confirmed');
    const rx = getDB().prescriptions.find((r) => r.patientId === 'p1')!;
    expect(rx.status).toBe('confirmed');
    expect(rx.decidedBy).toBe('d1');
    expect(getDB().audit.some((a) => a.action === 'Назначение подписано врачом' && a.patientId === 'p1')).toBe(true);
  });

  it('«изменено»: сохраняются исходный и изменённый варианты', () => {
    const s = getDB().suggestions.find((x) => x.patientId === 'p1' && x.ruleId === 'AVI-SUG-REGIMEN')!;
    decideSuggestion(s.id, 'd1', 'modified', '20 мг 2 раза в сутки, начать с вечернего приёма');
    const after = getDB().suggestions.find((x) => x.id === s.id)!;
    expect(after.text).toContain('Рассмотреть режим');
    expect(after.modifiedText).toContain('вечернего');
  });

  it('назначение вне инструкции фиксируется с обоснованием', () => {
    prescribe('p2', 'd1', { regimen: '20 мг 2 раза в сутки', offLabel: true, overrideReason: 'Тревожный компонент выражен, альтернативы обсуждены с пациентом', ackWarnings: [] });
    const rx = getDB().prescriptions.find((r) => r.patientId === 'p2')!;
    expect(rx.offLabel).toBe(true);
    expect(rx.overrideReason).toContain('альтернативы');
    expect(getDB().audit.some((a) => a.action.includes('ВНЕ ИНСТРУКЦИИ'))).toBe(true);
  });
});
