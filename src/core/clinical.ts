// Клиническая логика поверх движка: проверка препарата по паспорту, сигналы, маршрутизация.
// Здесь нет ни одного клинического действия: только оценка и предложения для врача.
import aviandr from '../data/packs/aviandr.json';
import alertRulesJson from '../data/alertRules.json';
import routingJson from '../data/routingRules.json';
import type { Facts, RouteCategory, Rule, RuleHit } from './types';
import { runRules } from './engine';

export const AVIANDR_RULES = aviandr.rules as unknown as Rule[];
export const ALERT_RULES = alertRulesJson.rules as unknown as Rule[];
export const ROUTING_RULES = routingJson.rules as unknown as Rule[];
export const ROUTE_CATEGORIES = routingJson.categories as Record<RouteCategory, { label: string; term: string }>;
export const RED_FLAGS = routingJson.redFlags;
export const OTHER_FLAGS = routingJson.otherFlags;
export const EXCLUDE_CHECKLIST = routingJson.excludeChecklist;
export const DRUG_PACKS = { aviandr };

export interface TherapyCheck {
  indication: RuleHit | null;
  offLabel: RuleHit | null;
  stops: RuleHit[];
  warns: RuleHit[];
  suggestions: RuleHit[];
  onLabel: boolean;
  blocked: boolean; // обычный путь назначения заблокирован (СТОП)
  hardBlocked: boolean; // СТОП без возможности исключения (возраст, ИМАО, аллергия)
  durationMs: number;
}

export function checkTherapy(facts: Facts, rules: Rule[] = AVIANDR_RULES): TherapyCheck {
  const t0 = performance.now();
  const base = runRules(
    rules.filter((r) => r.type !== 'SUGGEST'),
    facts,
  );
  const indication = base.find((h) => h.rule.type === 'INDICATION') ?? null;
  const offLabel = base.find((h) => h.rule.type === 'OFF_LABEL') ?? null;
  const stops = base.filter((h) => h.rule.type === 'STOP');
  const warns = base.filter((h) => h.rule.type === 'WARN');
  const onLabel = Boolean(indication) && !offLabel && stops.length === 0;
  const suggestions = runRules(
    rules.filter((r) => r.type === 'SUGGEST'),
    { ...facts, 'therapy.onLabel': onLabel && !facts['therapy.active'] },
  );
  return {
    indication,
    offLabel,
    stops,
    warns,
    suggestions,
    onLabel,
    blocked: stops.length > 0,
    hardBlocked: stops.some((s) => s.rule.allowOverride === false),
    durationMs: performance.now() - t0,
  };
}

export function evaluateAlerts(facts: Facts, rules: Rule[] = ALERT_RULES): RuleHit[] {
  return runRules(rules, facts);
}

export interface RoutingResult {
  category: RouteCategory | null;
  hits: RuleHit[];
  byCategory: Record<RouteCategory, RuleHit[]>;
  durationMs: number;
}

const ORDER: RouteCategory[] = ['urgent', 'mandatory', 'desirable'];

export function evaluateRouting(facts: Facts, rules: Rule[] = ROUTING_RULES): RoutingResult {
  const t0 = performance.now();
  const hits = runRules(rules, facts);
  const byCategory: Record<RouteCategory, RuleHit[]> = { urgent: [], mandatory: [], desirable: [] };
  for (const h of hits) byCategory[h.rule.category ?? 'desirable'].push(h);
  const category = ORDER.find((c) => byCategory[c].length > 0) ?? null;
  return { category, hits, byCategory, durationMs: performance.now() - t0 };
}

export const LEVEL_LABEL = { red: 'Красный · критический', orange: 'Оранжевый · существенный', yellow: 'Жёлтый · наблюдение' } as const;
export const LEVEL_SHORT = { red: 'Красный', orange: 'Оранжевый', yellow: 'Жёлтый' } as const;
export const LEVEL_RANK = { red: 0, orange: 1, yellow: 2 } as const;

/** Чек-лист действий врача при красном сигнале (создаётся автоматически, выполняет врач) */
export const RED_CHECKLIST = [
  { id: 'call', label: 'Связаться с пациентом (звонок)' },
  { id: 'assess', label: 'Оценить риск структурированным интервью' },
  { id: 'decide', label: 'Решить вопрос о срочной очной оценке' },
  { id: 'plan', label: 'Пересмотреть план лечения (решение врача)' },
  { id: 'record', label: 'Зафиксировать решение в карточке' },
];

export const ORANGE_CHECKLIST = [
  { id: 'review', label: 'Посмотреть основание сигнала' },
  { id: 'contact', label: 'Связаться с пациентом или ответить в чате' },
  { id: 'record', label: 'Зафиксировать решение' },
];
