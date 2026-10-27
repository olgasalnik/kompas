// Проверка совместимости с «Авиандром»: любое лекарство (МНН или торговое название) → СТОП / ВНИМАНИЕ / не упомянуто.
// Работает только по инструкции «Авиандра» (правила AVI-CI-MAOI и AVI-IX-*). «Не упомянуто» не значит «безопасно» —
// общая база взаимодействий любых пар препаратов подключается в пилоте (лицензированный справочник).
import aviandr from '../data/packs/aviandr.json';
import { normalize } from './text';

export interface CompatResult {
  query: string;
  inn: string | null; // распознанное МНН
  viaTrade: string | null; // если узнали по торговому названию
  level: 'stop' | 'warn' | 'alcohol' | 'self' | 'none';
  ruleId: string | null;
  group: string | null;
  doctorText: string;
  patientText: string;
}

const TRADE = aviandr.tradeNames.map as Record<string, string>;
const MEMBERS = aviandr.interactionGroups.flatMap((g) => g.members.map((m) => ({ m, g })));
const GROUP_RULE: Record<string, string> = { sedatives: 'AVI-IX-SEDATIVES', antidepressants: 'AVI-IX-ANTIDEPRESSANTS', triptans: 'AVI-IX-TRIPTANS', opioids: 'AVI-IX-OPIOIDS', cyp2d6: 'AVI-IX-CYP2D6' };

const stem = (s: string) => normalize(s).slice(0, Math.max(5, normalize(s).length - 2));

function matchInn(q: string): { inn: string; viaTrade: string | null } | null {
  const t = normalize(q);
  if (!t) return null;
  for (const [trade, inn] of Object.entries(TRADE)) if (t.includes(stem(trade))) return { inn, viaTrade: trade };
  for (const inn of [...aviandr.maoi, ...MEMBERS.map((x) => x.m)]) if (t.includes(stem(inn))) return { inn, viaTrade: null };
  return null;
}

export function checkCompatibility(query: string): CompatResult {
  const q = query.trim();
  const t = normalize(q);
  const base = { query: q, inn: null, viaTrade: null, ruleId: null, group: null };
  if (/авиандр|маритупирдин/.test(t)) {
    return { ...base, level: 'self', inn: 'маритупирдин', doctorText: 'Это сам «Авиандр».', patientText: 'Это и есть ваш препарат «Авиандр».' };
  }
  if (/(^| )(алкогол\S*|спиртн\S*|вино|вина|пиво|пива|водк\S*|коньяк\S*)( |$)/.test(t)) {
    return {
      ...base,
      level: 'alcohol',
      ruleId: 'AVI-WARN-ALCOHOL',
      doctorText: 'По инструкции во время лечения следует воздерживаться от алкоголя.',
      patientText: 'Во время лечения от алкоголя нужно воздерживаться — так сказано в инструкции.',
    };
  }
  const m = matchInn(q);
  if (!m) {
    return {
      ...base,
      level: 'none',
      doctorText: 'В инструкции «Авиандра» этот препарат не упомянут. Это не значит, что сочетание безопасно: проверьте по полной базе взаимодействий (в пилоте — лицензированный справочник).',
      patientText: 'В инструкции этот препарат не упомянут. Это не значит, что сочетание безопасно — обязательно сообщите врачу о новом лекарстве до начала приёма.',
    };
  }
  if (aviandr.maoi.includes(m.inn)) {
    return {
      ...base,
      inn: m.inn,
      viaTrade: m.viaTrade,
      level: 'stop',
      ruleId: 'AVI-CI-MAOI',
      group: 'Ингибиторы МАО',
      doctorText: 'ПРОТИВОПОКАЗАНО ПО ИНСТРУКЦИИ: одновременный приём ингибиторов МАО и 2 недели после их отмены.',
      patientText: 'По инструкции этот препарат нельзя сочетать с «Авиандром». Не начинайте приём и сразу сообщите врачу.',
    };
  }
  const hit = MEMBERS.find((x) => x.m === m.inn)!;
  return {
    ...base,
    inn: m.inn,
    viaTrade: m.viaTrade,
    level: 'warn',
    ruleId: GROUP_RULE[hit.g.id] ?? null,
    group: hit.g.label,
    doctorText: `ВНИМАНИЕ: инструкция называет группу «${hit.g.label}» среди препаратов, требующих осторожности при совместном применении.`,
    patientText: 'В инструкции есть предупреждение о сочетании с этим препаратом. Не начинайте и не меняйте приём сами — обсудите с врачом.',
  };
}
