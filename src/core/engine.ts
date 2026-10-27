// Движок правил: интерпретирует условия из JSON-пакетов (правила — данные, а не код).
// Каждое срабатывание возвращает правило с версией и входные данные, которые к нему привели, —
// это основа кнопки «Почему?».
import type { Condition, FactMatch, Facts, Op, Rule, RuleHit } from './types';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

export function compare(op: Op, actual: unknown, expected?: unknown): boolean {
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'ne':
      return actual !== expected;
    case 'gt':
      return isNum(actual) && isNum(expected) && actual > expected;
    case 'gte':
      return isNum(actual) && isNum(expected) && actual >= expected;
    case 'lt':
      return isNum(actual) && isNum(expected) && actual < expected;
    case 'lte':
      return isNum(actual) && isNum(expected) && actual <= expected;
    case 'between':
      return (
        isNum(actual) &&
        Array.isArray(expected) &&
        isNum(expected[0]) &&
        isNum(expected[1]) &&
        actual >= expected[0] &&
        actual <= expected[1]
      );
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as never);
    case 'intersects':
      return Array.isArray(actual) && Array.isArray(expected) && actual.some((a) => expected.includes(a));
    case 'truthy':
      return truthy(actual);
    case 'falsy':
      return !truthy(actual);
    default:
      return false;
  }
}

export interface EvalResult {
  ok: boolean;
  matched: FactMatch[];
}

function leafMatch(c: { fact: string; op: Op; value?: unknown; label?: string }, facts: Facts, negated = false): FactMatch {
  const actual = facts[c.fact];
  let shown: unknown = actual;
  if (c.op === 'intersects' && Array.isArray(actual) && Array.isArray(c.value)) {
    shown = actual.filter((a) => (c.value as unknown[]).includes(a));
  }
  return { fact: c.fact, label: c.label ?? c.fact, value: shown, op: c.op, expected: c.value, negated };
}

function leaves(c: Condition): { fact: string; op: Op; value?: unknown; label?: string }[] {
  if ('all' in c) return c.all.flatMap(leaves);
  if ('any' in c) return c.any.flatMap(leaves);
  if ('not' in c) return leaves(c.not);
  return [c];
}

export function evaluate(c: Condition, facts: Facts): EvalResult {
  if ('all' in c) {
    const parts = c.all.map((x) => evaluate(x, facts));
    const ok = parts.every((p) => p.ok);
    return { ok, matched: ok ? parts.flatMap((p) => p.matched) : [] };
  }
  if ('any' in c) {
    const parts = c.any.map((x) => evaluate(x, facts));
    const ok = parts.some((p) => p.ok);
    return { ok, matched: ok ? parts.filter((p) => p.ok).flatMap((p) => p.matched) : [] };
  }
  if ('not' in c) {
    const inner = evaluate(c.not, facts);
    if (inner.ok) return { ok: false, matched: [] };
    // Показываем, какие факты НЕ совпали (для «вне инструкции» — диагноз)
    const seen = new Set<string>();
    const matched = leaves(c.not)
      .filter((l) => (seen.has(l.fact) ? false : (seen.add(l.fact), true)))
      .map((l) => leafMatch(l, facts, true));
    return { ok: true, matched };
  }
  const ok = compare(c.op, facts[c.fact], c.value);
  return { ok, matched: ok ? [leafMatch(c, facts)] : [] };
}

/** Запускает только утверждённые правила. Черновики движок не читает. */
export function runRules(rules: Rule[], facts: Facts): RuleHit[] {
  const hits: RuleHit[] = [];
  for (const rule of rules) {
    if (rule.status !== 'approved_demo') continue;
    const r = evaluate(rule.condition, facts);
    if (r.ok) hits.push({ rule, matched: r.matched });
  }
  return hits;
}

/** Человекочитаемое описание условия-листа для «Почему?» */
export function describeMatch(m: FactMatch): string {
  const v = formatValue(m.value);
  const e = formatValue(m.expected);
  const ops: Record<Op, string> = {
    eq: '=',
    ne: '≠',
    gt: '>',
    gte: '≥',
    lt: '<',
    lte: '≤',
    in: '∈',
    intersects: '∩',
    truthy: '',
    falsy: '',
    between: '∈',
  };
  if (m.negated) return `${m.label}: ${v} — не входит в ${e}`;
  if (m.op === 'truthy') return `${m.label}: ${v === 'нет' ? 'да' : v}`;
  if (m.op === 'falsy') return `${m.label}: нет`;
  if (m.op === 'intersects') return `${m.label}: ${v}`;
  if (m.op === 'between' && Array.isArray(m.expected)) return `${m.label}: ${v} (диапазон ${m.expected[0]}–${m.expected[1]})`;
  return `${m.label}: ${v} (порог ${ops[m.op]} ${e})`;
}

export function formatValue(v: unknown): string {
  if (v === true) return 'да';
  if (v === false || v === null || v === undefined) return 'нет';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return String(v);
}
