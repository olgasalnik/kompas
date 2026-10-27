// Разбор текста, распознанного со скана или фото документа. Само распознавание (tesseract.js) идёт в браузере,
// здесь — чистые функции: очистка текста, слова, в которых распознаватель не уверен, и что найдено в документе.
import { findMedsInText } from './text';

export interface OcrWord {
  text: string;
  confidence: number; // 0–100
}

/** Ниже этой уверенности слово подсвечивается: врачу стоит сверить его с изображением */
export const LOW_CONFIDENCE = 70;

export function cleanOcrText(s: string): string {
  return s
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Уникальные слова с низкой уверенностью (только содержательные: есть буква или цифра) */
export function lowConfidenceWords(words: OcrWord[], threshold = LOW_CONFIDENCE): string[] {
  const out: string[] = [];
  for (const w of words) {
    const t = w.text.trim();
    if (!t || w.confidence >= threshold || !/[\p{L}\d]/u.test(t) || out.includes(t)) continue;
    out.push(t);
  }
  return out;
}

export function meanConfidence(words: OcrWord[]): number | null {
  const ws = words.filter((w) => /[\p{L}\d]/u.test(w.text));
  if (!ws.length) return null;
  return Math.round(ws.reduce((s, w) => s + w.confidence, 0) / ws.length);
}

export interface FoundMed {
  name: string;
  dose: string | null; // «50 мг», если доза написана рядом с названием
  interacting: boolean; // есть в группах взаимодействия «Авиандра»
}

export interface Extracted {
  meds: FoundMed[];
  icd: string[];
  dates: string[];
}

// Кириллические буквы, которые распознаватель путает с латиницей в кодах МКБ-10 (Е11, К29)
const LOOKALIKE: Record<string, string> = { Е: 'E', К: 'K', Т: 'T', Н: 'H', М: 'M', В: 'B', С: 'C', Р: 'P', А: 'A', О: 'O', Х: 'X' };

function doseNear(text: string, med: string): string | null {
  const stem = med.toLowerCase().replace(/ё/g, 'е').slice(0, Math.max(6, med.length - 2));
  const m = new RegExp(`${stem}[\\p{L}]*\\s*(?:\\([^)]{0,30}\\)\\s*)?(\\d+(?:[.,]\\d+)?)\\s*мг`, 'u').exec(text.toLowerCase().replace(/ё/g, 'е'));
  return m ? `${m[1]} мг` : null;
}

/** Что найдено в документе: препараты (с отметкой взаимодействия), коды МКБ-10, даты */
export function extractFromDocument(text: string): Extracted {
  const meds: FoundMed[] = findMedsInText(text).map((name) => ({ name, dose: doseNear(text, name), interacting: true }));
  if (/авиандр|маритупирдин/i.test(text)) meds.unshift({ name: 'маритупирдин («Авиандр»)', dose: doseNear(text, 'маритупирдин') ?? doseNear(text, 'авиандр'), interacting: false });

  const latin = text.replace(/[ЕКТНМВСРАОХ](?=\d{2})/g, (c) => LOOKALIKE[c] ?? c);
  const icd = [...latin.matchAll(/(?<![\p{L}\d])([A-TV-Z]\d{2}(?:\.\d{1,2})?)(?![\p{L}\d])/gu)].map((m) => m[1]);

  const dates = [...text.matchAll(/(?<!\d)(\d{2})\.(\d{2})\.(\d{4})(?!\d)/g)]
    .filter((m) => Number(m[1]) >= 1 && Number(m[1]) <= 31 && Number(m[2]) >= 1 && Number(m[2]) <= 12)
    .map((m) => m[0]);

  return { meds, icd: [...new Set(icd)], dates: [...new Set(dates)] };
}
