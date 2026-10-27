import { useState } from 'react';
import type { TrustedContact } from '../core/types';

export const RELATIONS: TrustedContact['relation'][] = ['родственник', 'опекун', 'законный представитель', 'близкий человек'];

export const SCOPE_TEXT: Record<TrustedContact['scope'], string> = {
  adherence: 'Только статус приёма препарата',
  adherence_safety: 'Статус приёма и уведомление, если я отмечу «Я не в безопасности»',
};

/** Кому и какие данные будут приходить: родственник, опекун или законный представитель (только с согласия пациента) */
export function TrustedForm({ initial, onSave, onCancel, saveLabel = 'Сохранить' }: { initial: TrustedContact | null; onSave: (c: TrustedContact) => void; onCancel?: () => void; saveLabel?: string }) {
  const [c, setC] = useState<TrustedContact>(initial ?? { name: '', relation: 'родственник', channel: 'sms', contact: '', scope: 'adherence' });
  const set = (patch: Partial<TrustedContact>) => setC((x) => ({ ...x, ...patch }));
  const ok = c.name.trim().length >= 2 && c.contact.trim().length >= 5;
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="grid-2" style={{ gap: 8 }}>
        <label className="field">
          <span className="label">Имя</span>
          <input id="tc-name" className="input" value={c.name} onChange={(e) => set({ name: e.target.value })} placeholder="Например: Мария (сестра)" />
        </label>
        <label className="field">
          <span className="label">Кем приходится</span>
          <select id="tc-relation" className="select" value={c.relation} onChange={(e) => set({ relation: e.target.value as TrustedContact['relation'] })}>
            {RELATIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid-2" style={{ gap: 8 }}>
        <label className="field">
          <span className="label">Куда присылать</span>
          <select id="tc-channel" className="select" value={c.channel} onChange={(e) => set({ channel: e.target.value as TrustedContact['channel'] })}>
            <option value="sms">SMS</option>
            <option value="email">Электронная почта</option>
          </select>
        </label>
        <label className="field">
          <span className="label">{c.channel === 'sms' ? 'Телефон' : 'Почта'}</span>
          <input id="tc-contact" className="input" value={c.contact} onChange={(e) => set({ contact: e.target.value })} placeholder={c.channel === 'sms' ? '+7 …' : 'name@example.ru'} />
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="label">Что будет приходить</span>
        {(Object.keys(SCOPE_TEXT) as TrustedContact['scope'][]).map((s) => (
          <label key={s} className="check small">
            <input type="radio" name="tc-scope" checked={c.scope === s} onChange={() => set({ scope: s })} />
            {SCOPE_TEXT[s]}
          </label>
        ))}
        <span className="xs muted">Ответы на опросники, заметки и переписку доверенное лицо не видит никогда. Для опекуна или законного представителя клиника проверит документы на приёме.</span>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn btn-sm btn-primary" disabled={!ok} onClick={() => onSave({ ...c, name: c.name.trim(), contact: c.contact.trim() })}>
          {saveLabel}
        </button>
        {onCancel && (
          <button className="btn btn-sm btn-ghost" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </div>
  );
}
