// Бот-напоминания и поддержка, голосовые сообщения, шифрование хранилища, документы специалистов,
// «Скопировать анамнез», проверка совместимости.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDB, mutate, setDB, standNow } from './db';
import {
  activeRx,
  addPatientWords,
  botSilenced,
  initialStand,
  markDose,
  sendDoctorMessage,
  sendPatientMessage,
  tick,
  verifyCredentials,
} from './api';
import { dueReminders, notifyChannel, supportAfterCheckin, supportAfterDose, takenStreak } from '../core/bot';
import { credentialStatus } from '../core/credentials';
import { checkCompatibility } from '../core/compat';
import { findLeaks } from '../core/privacy';
import { findMedsInText } from '../core/text';
import { anamnesisText } from '../doctor/select';
import { isSealed, seal, setKeyForTests, unseal } from './vault';
import { at, DAY, MIN } from '../core/time';
import type { MedEvent, VoiceAudio } from '../core/types';

beforeEach(() => {
  setDB(initialStand(), false);
});

/** Перевести время стенда на завтра, 08:30 — утренний приём ещё не отмечен ни у кого */
function goTomorrowMorning(minutes = 30) {
  const target = at(new Date(Date.now() + DAY), 8, minutes).getTime();
  mutate((db) => {
    db.settings.timeOffsetMs = target - Date.now();
  });
}

const ev = (status: MedEvent['status'], hoursAgo: number): MedEvent => ({
  id: `e${hoursAgo}`,
  patientId: 'x',
  scheduledAt: new Date(Date.parse('2026-10-24T08:00:00') - hoursAgo * 3600_000).toISOString(),
  slot: 'morning',
  status,
  recordedAt: new Date().toISOString(),
});

describe('Компас-бот: напоминания', () => {
  it('напоминание приходит после времени приёма и не позже 3 часов; отмеченный приём не напоминается', () => {
    const start = new Date('2026-10-01T09:00:00');
    expect(dueReminders(start, [], [], new Date('2026-10-24T07:59:00'))).toHaveLength(0);
    expect(dueReminders(start, [], [], new Date('2026-10-24T08:05:00')).map((r) => r.slot)).toEqual(['morning']);
    expect(dueReminders(start, [], [], new Date('2026-10-24T11:30:00'))).toHaveLength(0);
    const taken = { ...ev('taken', 0), scheduledAt: at(new Date('2026-10-24T12:00:00'), 8).toISOString() };
    expect(dueReminders(start, [taken], [], new Date('2026-10-24T08:20:00'))).toHaveLength(0);
    expect(dueReminders(null, [], [], new Date('2026-10-24T08:20:00'))).toHaveLength(0);
  });
  it('стенд: бот отправляет напоминания, ответ «Принял(а)» закрывает напоминание; уведомление без медданных', () => {
    goTomorrowMorning();
    tick();
    const db = getDB();
    const pid = db.patients.find((p) => activeRx(db, p.id) && !botSilenced(db, p.id))!.id;
    const rem = db.botFeed.filter((m) => m.patientId === pid && m.kind === 'reminder' && !m.answer);
    expect(rem).toHaveLength(1);
    expect(rem[0].text).not.toMatch(/авиандр|маритупирдин/i);
    expect(findLeaks(getDB().notifications)).toHaveLength(0);
    tick(); // повторный вызов не дублирует
    expect(getDB().botFeed.filter((m) => m.patientId === pid && m.kind === 'reminder' && !m.answer)).toHaveLength(1);
    markDose(pid, 'morning', 'taken', undefined, standNow());
    expect(getDB().botFeed.find((m) => m.id === rem[0].id)!.answer).toBe('taken');
  });
  it('«Позже» — одно повторное напоминание через 30 минут', () => {
    goTomorrowMorning(5);
    tick();
    const db = getDB();
    const pid = db.patients.find((p) => activeRx(db, p.id) && !botSilenced(db, p.id))!.id;
    markDose(pid, 'morning', 'later', undefined, standNow());
    const first = getDB().botFeed.filter((m) => m.patientId === pid && m.kind === 'reminder' && m.slot === 'morning').pop()!;
    expect(first.remindAgainAt).toBeTruthy();
    mutate((d) => {
      d.settings.timeOffsetMs += 31 * MIN;
    });
    tick();
    tick();
    const again = getDB().botFeed.filter((m) => m.patientId === pid && m.template === 'again');
    expect(again).toHaveLength(1);
  });
  it('пока открыт красный сигнал, бот молчит', () => {
    const db = getDB();
    const pid = db.patients.find((p) => activeRx(db, p.id))!.id;
    mutate((d) => {
      d.alerts.push({ ...d.alerts[0], id: 'al_test', patientId: pid, level: 'red', status: 'new' } as never);
    });
    expect(botSilenced(getDB(), pid)).toBe(true);
    goTomorrowMorning();
    tick();
    expect(getDB().botFeed.some((m) => m.patientId === pid && Date.parse(m.at) >= standNow().getTime() - MIN)).toBe(false);
  });
  it('история бота на стенде: напоминания с ответами пациента', () => {
    const feed = getDB().botFeed;
    expect(feed.some((m) => m.kind === 'reminder' && m.answer === 'taken')).toBe(true);
  });
});

describe('Компас-бот: поддержка', () => {
  it('неделя без пропусков, пропуск, трудный день, первые недели', () => {
    const now = new Date('2026-10-24T09:00:00');
    const streak = Array.from({ length: 14 }, (_, i) => ev('taken', i * 12));
    expect(takenStreak(streak)).toBe(14);
    expect(supportAfterDose('taken', streak, [], now)).toBe('streak_7');
    expect(supportAfterDose('missed', [ev('missed', 0)], [], now)).toBe('after_miss');
    expect(supportAfterDose('missed', [ev('missed', 0)], [{ template: 'after_miss', at: now.toISOString() } as never], now)).toBeNull();
    expect(supportAfterCheckin({ mood: 2, anxiety: 5 }, 20, [], now)).toBe('hard_day');
    expect(supportAfterCheckin({ mood: 5, anxiety: 5 }, 3, [], now)).toBe('early_weeks');
    expect(supportAfterCheckin({ mood: 8, anxiety: 2 }, null, [], now)).toBe('good_day');
    expect(notifyChannel('telegram')).toBe('messenger');
    expect(notifyChannel('sms')).toBe('sms');
  });
});

describe('голосовые сообщения', () => {
  const audio = (transcript: string | null, size = 2000): VoiceAudio => ({ dataUrl: `data:audio/webm;base64,${'A'.repeat(size)}`, durationMs: 7000, mime: 'audio/webm', transcript });
  it('без расшифровки: без автоответа, передаётся врачу прослушать', () => {
    const r = sendPatientMessage('p2', '', { audio: audio(null) });
    expect(r.answer).toBeNull();
    const msgs = getDB().messages.filter((m) => m.patientId === 'p2');
    expect(msgs.some((m) => m.from === 'patient' && m.audio && m.intent === 'voice' && !m.readByDoctor)).toBe(true);
    expect(msgs.some((m) => m.from === 'system' && /прослушает/.test(m.text))).toBe(true);
    expect(msgs.some((m) => m.from === 'system' && m.kind === 'auto_answer' && Date.parse(m.at) >= Date.now() - MIN && m.intent !== 'missed')).toBe(false);
  });
  it('с расшифровкой: кризисная фраза голосом даёт тот же красный сигнал', () => {
    const r = sendPatientMessage('p2', 'не вижу смысла жить', { audio: audio('не вижу смысла жить') });
    expect(r.crisis).toBe(true);
    expect(r.alerts.some((a) => a.level === 'red')).toBe(true);
  });
  it('повреждённое или слишком длинное голосовое не сохраняется', () => {
    expect(() => sendPatientMessage('p2', '', { audio: { ...audio(null), dataUrl: 'data:text/html,<b>' } })).toThrow(/повреждено/);
    expect(() => sendPatientMessage('p2', '', { audio: audio(null, 1_600_000) })).toThrow(/до 1 минуты/);
  });
  it('голосовое врача: пациенту приходит уведомление без медданных', () => {
    const before = getDB().notifications.length;
    sendDoctorMessage('p2', 'd1', 'Добрый день', audio('Добрый день'));
    const last = getDB().messages.filter((m) => m.patientId === 'p2').pop()!;
    expect(last.from).toBe('doctor');
    expect(last.audio?.durationMs).toBe(7000);
    expect(getDB().notifications.length).toBe(before + 1);
  });
});

describe('шифрование хранилища', () => {
  afterEach(() => setKeyForTests(null));
  it('AES-GCM: шифротекст не содержит данных, расшифровка возвращает исходное', async () => {
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    setKeyForTests(k);
    const plain = JSON.stringify({ name: 'Морозова Елена Андреевна', drug: 'сертралин' });
    const sealed = await seal(plain);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toMatch(/Морозова|сертралин/);
    expect(await unseal(sealed)).toBe(plain);
    expect(await seal(plain)).not.toBe(sealed); // новый вектор инициализации на каждую запись
  });
  it('чужой ключ или подделанный шифротекст — не расшифровываются; старая открытая запись читается', async () => {
    const k1 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const k2 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    setKeyForTests(k1);
    const sealed = await seal('секрет');
    const tampered = sealed.replace(/"ct":"(.)/, (_m, c) => `"ct":"${c === 'A' ? 'B' : 'A'}`);
    expect(await unseal(tampered)).toBeNull();
    setKeyForTests(k2);
    expect(await unseal(sealed)).toBeNull();
    expect(await unseal('{"schema":8}')).toBe('{"schema":8}');
  });
});

describe('документы специалистов', () => {
  const now = new Date('2026-10-24T12:00:00');
  it('статусы: проверено, истекает (за 90 дней), на проверке, истекла, не найден', () => {
    const u = (id: string) => getDB().users.find((x) => x.id === id)!.credentials;
    expect(credentialStatus(u('d1'), now).status).toBe('verified');
    expect(credentialStatus(u('d2'), now)).toMatchObject({ status: 'expiring', tone: 'warn' });
    expect(credentialStatus(u('t1'), now).status).toBe('pending');
    expect(credentialStatus({ ...u('d1'), accreditationUntil: '2026-01-01' }, now).status).toBe('expired');
    expect(credentialStatus({ ...u('d1'), registryStatus: 'not_found' }, now).status).toBe('not_found');
  });
  it('проверка в реестре: запрос «на проверке» подтверждается и пишется в журнал', () => {
    verifyCredentials('t1', 'h1');
    const c = getDB().users.find((x) => x.id === 't1')!.credentials;
    expect(c.registryStatus).toBe('found');
    expect(c.lastCheck).toBeTruthy();
    expect(getDB().audit.some((a) => a.actor === 'h1' && a.action.startsWith('Проверка документов специалиста'))).toBe(true);
  });
});

describe('анамнез и совместимость', () => {
  it('«Скопировать анамнез»: структура медицинской записи и слова пациента', () => {
    addPatientWords('p3', 'd1', 'Тревога с утра, сердце колотится', false);
    const t = anamnesisText(getDB(), getDB().patients.find((p) => p.id === 'p3')!, standNow());
    for (const s of ['Жалобы:', 'Со слов пациента', 'Анамнез заболевания:', 'Лекарственный анамнез:', 'Аллергологический анамнез:', 'Факторы риска:']) expect(t).toContain(s);
    expect(t).toContain('сертралин');
    expect(t).toContain('Тревога с утра, сердце колотится');
  });
  it('совместимость: торговое название, ИМАО, опиоиды, неизвестный препарат, алкоголь', () => {
    expect(checkCompatibility('Золофт')).toMatchObject({ level: 'warn', inn: 'сертралин', viaTrade: 'золофт', ruleId: 'AVI-IX-ANTIDEPRESSANTS' });
    expect(checkCompatibility('пиразидол')).toMatchObject({ level: 'stop', inn: 'пирлиндол', ruleId: 'AVI-CI-MAOI' });
    expect(checkCompatibility('трамадол 50 мг')).toMatchObject({ level: 'warn', ruleId: 'AVI-IX-OPIOIDS' });
    expect(checkCompatibility('Супрастин от аллергии')).toMatchObject({ level: 'warn', inn: 'хлоропирамин' });
    const unknown = checkCompatibility('парацетамол');
    expect(unknown.level).toBe('none');
    expect(unknown.patientText).toMatch(/не значит, что сочетание безопасно/);
    expect(checkCompatibility('бокал вина').level).toBe('alcohol');
    expect(checkCompatibility('винпоцетин').level).toBe('none');
    expect(checkCompatibility('Авиандр').level).toBe('self');
  });
  it('торговое название в сообщении пациента: «димедрол» узнаётся как дифенгидрамин, «Оксана» — не «Ксанакс»', () => {
    expect(findMedsInText('пью Димедрол на ночь')).toEqual(['дифенгидрамин']);
    expect(findMedsInText('сестра Оксана посоветовала чай')).toEqual([]);
    sendPatientMessage('p2', 'Начинаю пить димедрол от простуды');
    expect(getDB().patients.find((p) => p.id === 'p2')!.meds).toContain('дифенгидрамин');
  });
});
