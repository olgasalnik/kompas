import { useState } from 'react';
import { BookOpenCheck, FileCheck2, FlaskConical, HelpCircle, ListChecks, ShieldCheck } from 'lucide-react';
import type { FactMatch, Rule } from '../core/types';
import { describeMatch } from '../core/engine';
import { ALERT_RULES, AVIANDR_RULES, ROUTING_RULES } from '../core/clinical';
import sources from '../data/sources.json';
import { Modal } from './Modal';

const ALL_RULES: Rule[] = [...AVIANDR_RULES, ...ALERT_RULES, ...ROUTING_RULES];

export const ruleById = (id: string) => ALL_RULES.find((r) => r.id === id);
export const sourceById = (id: string) => sources.sources.find((s) => s.id === id);

const TYPE_LABEL: Record<Rule['type'], string> = {
  STOP: 'СТОП — противопоказание',
  WARN: 'ВНИМАНИЕ — предостережение / взаимодействие',
  INDICATION: 'Показание',
  OFF_LABEL: 'Вне инструкции',
  SUGGEST: 'Предложение врачу',
  ALERT: 'Сигнал',
  ROUTE: 'Маршрутизация',
};

const ACTION_LABEL: Record<string, string> = {
  patient_safe_screen: 'Пациенту — безопасный экран и маршруты помощи',
  notify_push: 'Врачу — push-уведомление (без медицинских данных)',
  notify_sms: 'Врачу — SMS (без медицинских данных)',
  escalate: 'Эскалация: нет подтверждения 10 мин → дежурный, 30 мин → заведующая',
  task_checklist: 'Задача и чек-лист действий врача',
  audit: 'Запись каждого шага в журнал с временем',
  patient_doctor_notified: 'Пациенту — «врач уведомлён», без клинических указаний',
  repeat_24h: 'Повтор уведомления при отсутствии реакции 24 ч',
  digest: 'Ежедневный дайджест врача',
  patient_soft_reminder: 'Пациенту — мягкое напоминание без медицинского содержания',
};

export function WhyButton({ ruleId, facts, label = 'Почему?' }: { ruleId: string; facts?: FactMatch[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="why-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <HelpCircle />
        {label}
      </button>
      {open && <WhyModal ruleId={ruleId} facts={facts} onClose={() => setOpen(false)} />}
    </>
  );
}

export function WhyModal({ ruleId, facts, onClose }: { ruleId: string; facts?: FactMatch[]; onClose: () => void }) {
  const rule = ruleById(ruleId);
  if (!rule) {
    return (
      <Modal title="Почему?" onClose={onClose}>
        <p className="muted">Сигнал создан по вопросу пациента ({ruleId}). Основание — текст сообщения и раздел инструкции.</p>
      </Modal>
    );
  }
  const src = sourceById(rule.source.id);
  const matched = facts ?? [];
  return (
    <Modal
      wide
      title={rule.title}
      sub={
        <span className="row wrap" style={{ gap: 6 }}>
          <span className="badge badge-brand">{TYPE_LABEL[rule.type]}</span>
          <span className="badge badge-outline">
            {rule.id} · v{rule.version}
          </span>
          {rule.level && <span className={`badge badge-${rule.level}`}>{{ red: 'Красный', orange: 'Оранжевый', yellow: 'Жёлтый' }[rule.level]}</span>}
        </span>
      }
      onClose={onClose}
      icon={
        <div className="signal-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
          <HelpCircle />
        </div>
      }
    >
      <div className="stack" style={{ gap: 18 }}>
        <section className="stack" style={{ gap: 8 }}>
          <div className="eyebrow">Что сработало</div>
          <p>{rule.messageDoctor}</p>
        </section>

        <section className="stack" style={{ gap: 8 }}>
          <div className="eyebrow row" style={{ gap: 6 }}>
            <ListChecks size={14} /> Входные данные, которые привели к выводу
          </div>
          {matched.length ? (
            <ul className="list-plain why-facts">
              {matched.map((m, i) => (
                <li key={i}>
                  <code>{m.fact}</code>
                  <span>{describeMatch(m)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">Факты будут показаны при срабатывании правила для конкретного пациента.</p>
          )}
        </section>

        <section className="why-source">
          <div className="row row-top" style={{ gap: 12 }}>
            <BookOpenCheck size={20} color="var(--brand)" style={{ flex: 'none', marginTop: 2 }} />
            <div className="stack" style={{ gap: 4 }}>
              <div className="eyebrow">Источник · {rule.source.id}</div>
              <div className="strong">{src?.title ?? rule.source.id}</div>
              <div className="small ink-2">{src?.org}</div>
              <div className="small">
                Раздел: <b>{rule.source.section}</b>
              </div>
              {rule.source.quote && <div className="quote">{rule.source.quote}</div>}
              <div className="row wrap small muted" style={{ gap: 14 }}>
                <span>Статус: {src?.status}</span>
                <span>Проверено: {src?.checked}</span>
                {src?.license && <span>Условия: {src.license}</span>}
              </div>
            </div>
          </div>
        </section>

        <div className="grid-2">
          <section className="stack" style={{ gap: 6 }}>
            <div className="eyebrow row" style={{ gap: 6 }}>
              <FileCheck2 size={14} /> Утверждение правила
            </div>
            <div className="small">{rule.approvedBy}</div>
            <div className="small muted">Версия {rule.version} от {rule.approvedAt} · статус: {rule.status === 'approved_demo' ? 'утверждено для демонстрации' : 'черновик'}</div>
            {rule.note && <div className="callout callout-amber small">{rule.note}</div>}
          </section>
          <section className="stack" style={{ gap: 6 }}>
            <div className="eyebrow row" style={{ gap: 6 }}>
              <ShieldCheck size={14} /> Что делает система
            </div>
            {rule.actions?.length ? (
              <ul className="bullets small">
                {rule.actions.map((a) => (
                  <li key={a}>{ACTION_LABEL[a] ?? a}</li>
                ))}
              </ul>
            ) : (
              <div className="small ink-2">
                {rule.type === 'STOP'
                  ? rule.allowOverride
                    ? 'Блокирует обычный путь назначения. Исключение — только отдельное решение врача с обоснованием и записью в журнал.'
                    : 'Блокирует назначение без возможности исключения.'
                  : rule.type === 'WARN'
                    ? 'Требует подтверждения ознакомления врачом.'
                    : 'Показывает врачу вывод; решение принимает врач.'}
              </div>
            )}
          </section>
        </div>
        <div className="callout small">
          <FlaskConical />
          <span>
            Для правила есть автотесты: положительный, отрицательный и граничный случаи (<code>src/core/core.test.ts</code>). Движок исполняет только утверждённые версии правил.
          </span>
        </div>
      </div>
    </Modal>
  );
}
