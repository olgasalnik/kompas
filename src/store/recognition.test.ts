// Распознавание текста со сканов и голосовой ввод: разбор текста, сохранение печатной версии,
// записи «со слов пациента», отметка «надиктовано» у сообщения. Само распознавание (tesseract.js, Web Speech API)
// работает в браузере и проверяется скриптом scripts/check-recognition.mjs.
import { beforeEach, describe, expect, it } from 'vitest';
import { getDB, setDB } from './db';
import { addPatientWords, initialStand, removePatientWords, saveDocumentText, sendPatientMessage } from './api';
import { cleanOcrText, extractFromDocument, lowConfidenceWords, meanConfidence } from '../core/ocrText';
import { joinDictated, speechErrorText } from '../core/speech';
import { searchRecords } from '../doctor/select';
import { dischargeScan } from './scans';

beforeEach(() => {
  setDB(initialStand(), false);
});

describe('разбор распознанного текста', () => {
  it('находит препарат с дозой, код МКБ-10 и дату; отмечает взаимодействие с «Авиандром»', () => {
    const f = extractFromDocument('Дата приёма: 19.09.2026\nДиагноз: F41.1 Генерализованное тревожное расстройство.\nНазначено: сертралин 50 мг 1 раз в сутки утром.');
    expect(f.meds).toEqual([{ name: 'сертралин', dose: '50 мг', interacting: true }]);
    expect(f.icd).toEqual(['F41.1']);
    expect(f.dates).toEqual(['19.09.2026']);
  });
  it('код с кириллической буквой-двойником распознаётся как латинский; неверные даты отбрасываются', () => {
    const f = extractFromDocument('Сопутствующий: Е11.9. Контроль 45.13.2026');
    expect(f.icd).toEqual(['E11.9']);
    expect(f.dates).toEqual([]);
  });
  it('«Авиандр» в тексте — не взаимодействие, а сам препарат', () => {
    const f = extractFromDocument('Принимает Авиандр 20 мг');
    expect(f.meds[0]).toMatchObject({ name: 'маритупирдин («Авиандр»)', interacting: false });
  });
  it('слова с низкой уверенностью и средняя уверенность', () => {
    const words = [
      { text: 'Назначено:', confidence: 95 },
      { text: 'сертралин', confidence: 62 },
      { text: '—', confidence: 10 },
      { text: 'сертралин', confidence: 55 },
    ];
    expect(lowConfidenceWords(words)).toEqual(['сертралин']);
    expect(meanConfidence(words)).toBe(71);
    expect(meanConfidence([])).toBeNull();
  });
  it('очистка текста: лишние пробелы и пустые строки', () => {
    expect(cleanOcrText('  Строка  один   \n\n\n\nСтрока два \r\n')).toBe('Строка один\n\nСтрока два');
  });
});

describe('печатная версия скана', () => {
  it('стенд содержит сканы-изображения для демонстрации распознавания', () => {
    const scans = getDB().documents.filter((d) => d.kind === 'image');
    expect(scans.map((d) => d.patientId).sort()).toEqual(['p1', 'p3']);
    expect(scans.every((d) => d.dataUrl?.startsWith('data:image/svg+xml'))).toBe(true);
    expect(decodeURIComponent(dischargeScan('2026-09-19T10:00:00Z'))).toContain('сертралин 50 мг');
  });
  it('врач сохраняет проверенный текст: он в карточке, в журнале и в поиске', () => {
    const scan = getDB().documents.find((d) => d.patientId === 'p3' && d.kind === 'image')!;
    saveDocumentText(scan.id, 'd1', '  Назначено: сертралин 50 мг  ', { confidence: 88, edited: true, engine: 'test' });
    const doc = getDB().documents.find((d) => d.id === scan.id)!;
    expect(doc.ocr).toMatchObject({ text: 'Назначено: сертралин 50 мг', confidence: 88, edited: true, by: 'd1' });
    expect(getDB().audit.some((a) => a.action === 'Распознан текст документа, исправлен врачом' && a.patientId === 'p3')).toBe(true);
    expect(searchRecords(getDB(), ['p3'], 'сертралин 50').some((h) => h.where.startsWith('Документ'))).toBe(true);
  });
  it('несуществующий документ — ошибка, а не тихий пропуск', () => {
    expect(() => saveDocumentText('doc_nope', 'd1', 'текст', { confidence: null, edited: false, engine: 'test' })).toThrow();
  });
});

describe('голосовой ввод', () => {
  it('надиктованные фрагменты склеиваются с пробелом, новое предложение — с заглавной', () => {
    expect(joinDictated('', 'плохо сплю')).toBe('Плохо сплю');
    expect(joinDictated('Плохо сплю', 'просыпаюсь в четыре')).toBe('Плохо сплю просыпаюсь в четыре');
    expect(joinDictated('Плохо сплю.', 'просыпаюсь в четыре')).toBe('Плохо сплю. Просыпаюсь в четыре');
    expect(joinDictated('Текст', '   ')).toBe('Текст');
  });
  it('понятные сообщения об ошибках микрофона', () => {
    expect(speechErrorText('not-allowed')).toMatch(/Разрешите микрофон/);
    expect(speechErrorText('not-allowed', true)).toMatch(/отдельной вкладке/);
    expect(speechErrorText('network')).toMatch(/интернет/);
    expect(speechErrorText('aborted')).toBe('');
  });
  it('сообщение пациента с отметкой «голосом»; кризисная фраза голосом обрабатывается так же, как текстом', () => {
    sendPatientMessage('p2', 'Можно ли бокал вина', { voice: true });
    expect(getDB().messages.filter((m) => m.patientId === 'p2' && m.from === 'patient').pop()?.voice).toBe(true);
    const r = sendPatientMessage('p2', 'не вижу смысла жить', { voice: true });
    expect(r.crisis).toBe(true);
    expect(r.alerts.some((a) => a.level === 'red')).toBe(true);
  });
  it('«со слов пациента»: запись дословно, в поиске, удаление фиксируется в журнале', () => {
    addPatientWords('p1', 'd1', '  Просыпаюсь в четыре утра и уже не могу уснуть ', true);
    addPatientWords('p1', 'd1', '   ', false); // пустое не сохраняется
    const words = getDB().patientWords.filter((w) => w.patientId === 'p1');
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({ text: 'Просыпаюсь в четыре утра и уже не могу уснуть', voice: true, by: 'd1' });
    expect(searchRecords(getDB(), ['p1'], 'четыре утра')[0].where).toBe('Со слов пациента (на приёме)');
    removePatientWords(words[0].id, 'd1');
    expect(getDB().patientWords).toHaveLength(0);
    expect(getDB().audit.some((a) => a.action === 'Удалена запись «со слов пациента»')).toBe(true);
  });
});
