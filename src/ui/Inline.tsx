// Встроенные в страницу подтверждение и ввод вместо системных confirm()/prompt():
// системные окна выглядят чужеродно и не работают во встроенных просмотрщиках.
import { useState, type ReactNode } from 'react';

export function ConfirmButton({
  label,
  question,
  confirmLabel = 'Да',
  onConfirm,
  className = 'btn btn-sm',
  confirmClass = 'btn btn-sm btn-danger',
}: {
  label: ReactNode;
  question: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  confirmClass?: string;
}) {
  const [ask, setAsk] = useState(false);
  if (!ask)
    return (
      <button className={className} onClick={() => setAsk(true)}>
        {label}
      </button>
    );
  return (
    <span className="row wrap" style={{ gap: 6 }} role="group">
      <span className="small strong">{question}</span>
      <button
        className={confirmClass}
        onClick={() => {
          setAsk(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => setAsk(false)}>
        Отмена
      </button>
    </span>
  );
}

export function PromptButton({
  label,
  placeholder,
  initial = '',
  minLength = 1,
  submitLabel = 'Сохранить',
  onSubmit,
  className = 'btn btn-sm',
  submitClass = 'btn btn-sm btn-primary',
  multiline = true,
  disabled,
}: {
  label: ReactNode;
  placeholder?: string;
  initial?: string;
  minLength?: number;
  submitLabel?: string;
  onSubmit: (text: string) => void;
  className?: string;
  submitClass?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial);
  if (!open)
    return (
      <button
        className={className}
        disabled={disabled}
        onClick={() => {
          setText(initial);
          setOpen(true);
        }}
      >
        {label}
      </button>
    );
  const ok = text.trim().length >= minLength;
  return (
    <div className="stack" style={{ gap: 8, width: '100%' }}>
      {multiline ? (
        <textarea className="textarea" autoFocus value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} style={{ minHeight: 64 }} />
      ) : (
        <input className="input" autoFocus value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      )}
      <div className="row wrap" style={{ gap: 8 }}>
        <button
          className={submitClass}
          disabled={!ok}
          onClick={() => {
            setOpen(false);
            onSubmit(text.trim());
          }}
        >
          {submitLabel}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
          Отмена
        </button>
        {minLength > 1 && !ok && <span className="xs muted">не менее {minLength} символов</span>}
      </div>
    </div>
  );
}
