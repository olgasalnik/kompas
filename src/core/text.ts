// Работа со свободным текстом пациента: словарный классификатор кризисных формулировок (настроен на полноту)
// и поиск ответа в утверждённом корпусе (инструкция препарата). Никакой генерации: если ответа нет — «передам врачу».
import alertRules from '../data/alertRules.json';
import aviandr from '../data/packs/aviandr.json';

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"“”„.,!?;:()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const lex = alertRules.crisisLexicon;
const SUICIDE = lex.suicide.map(normalize);
const PSYCHOSIS = lex.psychosis.map(normalize);

export interface TextClass {
  crisis: boolean;
  psychosis: boolean;
  matches: string[];
}

export function classifyText(text: string): TextClass {
  const t = ` ${normalize(text)} `;
  const sm = SUICIDE.filter((k) => t.includes(k));
  const pm = PSYCHOSIS.filter((k) => t.includes(k));
  return { crisis: sm.length > 0, psychosis: pm.length > 0, matches: [...sm, ...pm] };
}

export interface PackAnswer {
  id: string;
  title: string;
  keywords: string[];
  answer: string;
  section: string;
  notifyDoctor: boolean;
  alertLevel?: 'red' | 'orange';
}

export const PACK_ANSWERS = aviandr.patientAnswers as PackAnswer[];

/** Все МНН из групп взаимодействия и ИМАО пакета — для распознавания в тексте */
export const KNOWN_INTERACTING: string[] = [...aviandr.interactionGroups.flatMap((g) => g.members), ...aviandr.maoi];

// Торговые названия → МНН («димедрол» → дифенгидрамин); ищутся с начала слова, чтобы «Оксана» не стала «Ксанаксом»
const TRADE_NAMES = aviandr.tradeNames.map as Record<string, string>;

export function findMedsInText(text: string): string[] {
  const t = normalize(text);
  const found = KNOWN_INTERACTING.filter((m) => t.includes(normalize(m).slice(0, Math.max(6, m.length - 2))));
  const words = ` ${t}`;
  for (const [trade, inn] of Object.entries(TRADE_NAMES)) {
    const stem = normalize(trade).slice(0, Math.max(5, trade.length - 2));
    if (KNOWN_INTERACTING.includes(inn) && !found.includes(inn) && words.includes(` ${stem}`)) found.push(inn);
  }
  return found;
}

export interface AnswerResult {
  answer: PackAnswer | null;
  meds: string[];
  crisis: TextClass;
}

/** Подбор ответа из корпуса. Приоритет: кризис → передозировка → беременность → остальное по числу совпадений. */
export function answerQuestion(text: string): AnswerResult {
  const crisis = classifyText(text);
  const t = normalize(text);
  const meds = findMedsInText(text);
  if (crisis.crisis || crisis.psychosis) return { answer: null, meds, crisis };
  const scored = PACK_ANSWERS.map((a) => ({
    a,
    score: a.keywords.filter((k) => t.includes(normalize(k))).length,
  })).filter((x) => x.score > 0);
  const priority = ['overdose', 'pregnancy'];
  scored.sort((x, y) => {
    const px = priority.includes(x.a.id) ? 1 : 0;
    const py = priority.includes(y.a.id) ? 1 : 0;
    return py - px || y.score - x.score;
  });
  let answer: PackAnswer | null = scored[0]?.a ?? null;
  if (!answer && meds.length) answer = PACK_ANSWERS.find((a) => a.id === 'interaction') ?? null;
  return { answer, meds, crisis };
}
