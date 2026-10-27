// Доработки по замечаниям: график врача, дозировки, обоснование выбора, архив, поиск, документы,
// телемедконсультация, доверенное лицо, статусы переписки, уведомления пациенту.
import { beforeEach, describe, expect, it } from 'vitest';
import { getDB, setDB, standNow } from './db';
import {
  addDocument,
  archivePatient,
  createTelemed,
  initialStand,
  markDocumentsViewed,
  restorePatient,
  saveDocumentText,
  savePrevisit,
  sendDoctorMessage,
  sendPatientMessage,
  setTrustedContact,
  sosAnswer,
  sosOpen,
  viewPatient,
} from './api';
import { isWorking, nextWorkStart, replyText } from '../core/schedule';
import { aviandrRationale, doseSummary, fmtMg } from '../core/dose';
import { checkTherapy } from '../core/clinical';
import { buildFacts } from '../core/facts';
import { searchRecords, threadStatus, visiblePatients } from '../doctor/select';
import { USERS } from './seed';

beforeEach(() => {
  setDB(initialStand(), false);
});

const weekdays = USERS.find((u) => u.id === 'd1')!.schedule; // Пн–Пт 10–19
const duty = USERS.find((u) => u.id === 'd2')!.schedule;

describe('график врача и честный срок ответа', () => {
  it('рабочее время по дням недели и часам', () => {
    expect(isWorking(weekdays, new Date(2026, 9, 19, 11, 0))).toBe(true); // понедельник
    expect(isWorking(weekdays, new Date(2026, 9, 19, 19, 0))).toBe(false); // ровно конец смены
    expect(isWorking(weekdays, new Date(2026, 9, 18, 12, 0))).toBe(false); // воскресенье
    expect(isWorking(duty, new Date(2026, 9, 18, 3, 0))).toBe(true); // дежурство круглосуточно
  });
  it('в воскресенье — ответ в понедельник в 10:00; вечером в будни — завтра', () => {
    expect(replyText(weekdays, new Date(2026, 9, 18, 21, 0))).toBe('Нерабочее время — ответит завтра в 10:00');
    expect(replyText(weekdays, new Date(2026, 9, 17, 14, 0))).toBe('Нерабочее время — ответит в понедельник в 10:00'); // суббота
    expect(replyText(weekdays, new Date(2026, 9, 20, 8, 0))).toBe('Нерабочее время — ответит сегодня в 10:00');
    expect(replyText(weekdays, new Date(2026, 9, 20, 12, 0))).toBe('Рабочее время — ответит сегодня до 19:00');
    expect(nextWorkStart(weekdays, new Date(2026, 9, 23, 20, 0)).getDay()).toBe(1); // пятница вечер → понедельник
  });
});

describe('дозировка: мг и г, разовая и суточная', () => {
  it('перевод мг в г без ошибок порядка', () => {
    expect(fmtMg(20)).toBe('20 мг (0,02 г)');
    expect(fmtMg(1500)).toMatch(/^1\s500 мг \(1,5 г\)$/); // разделитель тысяч — неразрывный пробел
    const d = doseSummary(20, 2);
    expect(d.daily).toBe('40 мг (0,04 г)');
    expect(d.line).toBe('Разовая доза 20 мг (0,02 г) × 2 раза в сутки = 40 мг (0,04 г) в сутки');
  });
});

describe('обоснование выбора «Авиандра»', () => {
  const facts = (pid: string) => {
    const db = getDB();
    return buildFacts(db, db.patients.find((p) => p.id === pid)!, standNow(db));
  };
  it('сценарий 1: показание, профиль симптомов и противопоказания — соответствуют', () => {
    const f = facts('p1');
    const r = aviandrRationale(f, checkTherapy(f));
    expect(r[0].state).toBe('ok');
    expect(r.some((x) => x.state === 'ok' && x.text.startsWith('Ведущая тревожная'))).toBe(true);
    expect(r.some((x) => x.state === 'no')).toBe(false);
  });
  it('сценарий 2: вне показаний и преобладание депрессивных симптомов', () => {
    const f = facts('p2');
    const r = aviandrRationale(f, checkTherapy(f));
    expect(r[0].state).toBe('no');
    expect(r.some((x) => x.state === 'warn' && x.text.startsWith('Преобладают депрессивные'))).toBe(true);
  });
  it('сценарий 4: противопоказание отражено в обосновании', () => {
    const f = facts('p4');
    expect(aviandrRationale(f, checkTherapy(f)).some((x) => x.state === 'no' && x.text.includes('беременность'))).toBe(true);
  });
});

describe('архив и поиск по истории', () => {
  it('пациент в архиве не виден в рабочем списке, но находится в архиве и поиске', () => {
    archivePatient('p8', 'd1', 'Курс завершён, наблюдение окончено');
    const db = getDB();
    expect(visiblePatients(db, 'd1').some((p) => p.id === 'p8')).toBe(false);
    expect(visiblePatients(db, 'd1', 'archived').map((p) => p.id)).toEqual(['p8']);
    restorePatient('p8', 'd1');
    expect(visiblePatients(getDB(), 'd1').some((p) => p.id === 'p8')).toBe(true);
  });
  it('поиск находит текст в документах и сообщениях, в том числе у архивного пациента', () => {
    // Скан выписки находится поиском после того, как врач сохранил его печатную версию
    const scan = getDB().documents.find((d) => d.patientId === 'p3' && d.kind === 'image')!;
    expect(searchRecords(getDB(), ['p3'], 'сертралин 50')).toHaveLength(0);
    saveDocumentText(scan.id, 'd1', 'Назначено: сертралин 50 мг 1 раз в сутки утром.', { confidence: 90, edited: false, engine: 'test' });
    archivePatient('p3', 'd1', 'Переведена к другому врачу');
    const db = getDB();
    const ids = [...visiblePatients(db, 'd1'), ...visiblePatients(db, 'd1', 'archived')].map((p) => p.id);
    const hits = searchRecords(db, ids, 'сертралин 50');
    expect(hits.some((h) => h.patientId === 'p3' && h.where.startsWith('Документ'))).toBe(true);
    expect(searchRecords(db, ids, 'дифенгидрамин').some((h) => h.where === 'Сообщение пациента')).toBe(true);
    expect(searchRecords(db, ids, 'ab')).toHaveLength(0); // слишком короткий запрос
  });
  it('у каждого пациента есть номер медицинской карты', () => {
    expect(getDB().patients.every((p) => /^МК-26-\d{5}$/.test(p.cardNo))).toBe(true);
  });
});

describe('переписка: новое → просмотрено → отвечено; уведомления пациенту', () => {
  it('статусы переписки и уведомление пациенту об ответе врача', () => {
    sendPatientMessage('p1', 'Здравствуйте, можно перенести приём?');
    expect(threadStatus(getDB(), 'p1').status).toBe('new');
    viewPatient('p1', 'd1');
    expect(threadStatus(getDB(), 'p1').status).toBe('waiting');
    const before = getDB().notifications.filter((n) => n.to === 'p1').length;
    sendDoctorMessage('p1', 'd1', 'Да, напишите удобное время.');
    expect(threadStatus(getDB(), 'p1').status).toBe('answered');
    const notes = getDB().notifications.filter((n) => n.to === 'p1');
    expect(notes.length).toBe(before + 1);
    expect(notes[notes.length - 1].text).toBe('Компас: новое сообщение от врача.');
  });
  it('при подключении у каждого пациента врача уже есть приветственное сообщение (переписка настроена)', () => {
    const db = getDB();
    for (const p of db.patients.filter((x) => x.doctorId === 'd1')) {
      expect(db.messages.some((m) => m.patientId === p.id && m.from === 'doctor')).toBe(true);
    }
  });
});

describe('доверенное лицо, «к приёму», документы, телемедконсультация', () => {
  it('доверенное лицо получает уведомление «не в безопасности» только если пациент это выбрал', () => {
    setTrustedContact('p1', { name: 'Мария К.', relation: 'родственник', channel: 'sms', contact: '+7 900 000-00-01', scope: 'adherence' });
    sosAnswer('p1', sosOpen('p1'), false);
    expect(getDB().notifications.some((n) => n.to.startsWith('Доверенное лицо'))).toBe(false);
    setDB(initialStand(), false);
    setTrustedContact('p1', { name: 'Мария К.', relation: 'опекун', channel: 'email', contact: 'maria@example.ru', scope: 'adherence_safety' });
    sosAnswer('p1', sosOpen('p1'), false);
    const n = getDB().notifications.find((x) => x.to.startsWith('Доверенное лицо'));
    expect(n?.channel).toBe('email');
    expect(n?.text).not.toMatch(/авиандр|тревог|депресс|суицид/i);
  });
  it('«к приёму» сохраняется у пациента и попадает в журнал', () => {
    savePrevisit('p1', { concerns: 'Тревога по утрам', changes: 'Сплю лучше', questions: 'Можно ли пить кофе?' });
    const p = getDB().patients.find((x) => x.id === 'p1')!;
    expect(p.previsit?.concerns).toBe('Тревога по утрам');
    expect(getDB().audit.some((a) => a.action === 'Пациент заполнил «К приёму»')).toBe(true);
  });
  it('документ пациента — новый для врача до просмотра', () => {
    addDocument({ patientId: 'p2', name: 'выписка.txt', kind: 'text', size: 120, text: 'Выписка', uploadedBy: 'patient' });
    expect(getDB().documents.some((d) => d.patientId === 'p2' && !d.viewedByDoctor)).toBe(true);
    markDocumentsViewed('p2', 'd1');
    expect(getDB().documents.filter((d) => d.patientId === 'p2').every((d) => d.viewedByDoctor)).toBe(true);
  });
  it('онлайн-консультация «врач — пациент»: запрос, сообщение и уведомление пациенту', () => {
    createTelemed({ patientId: 'p3', type: 'doctor_patient', to: 'Елена В.', urgency: 'плановая', text: 'Повторная консультация', status: 'sent', createdBy: 'd1' });
    const db = getDB();
    expect(db.telemed.filter((t) => t.patientId === 'p3')).toHaveLength(1);
    expect(db.messages.some((m) => m.patientId === 'p3' && m.text.includes('онлайн-консультацию'))).toBe(true);
    expect(db.notifications.some((n) => n.to === 'p3' && n.text === 'Компас: у вас новое сообщение по записи.')).toBe(true);
  });
});
