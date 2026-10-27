// Голосовой ввод через Web Speech API браузера. Надиктованное добавляется в поле как обычный текст — его можно
// поправить перед отправкой. Если браузер умеет распознавать русскую речь на устройстве, используется этот режим;
// иначе (Chrome, Edge) распознаёт облачный сервис браузера — об этом сказано прямо в подсказке.
import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { speechErrorText } from '../core/speech';
import { toast } from './Toasts';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

function getSR(): any | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechSupported(): boolean {
  return Boolean(getSR());
}

const inFrame = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

export function useDictation(onFinal: (text: string) => void) {
  const [state, setState] = useState<'idle' | 'starting' | 'listening'>('idle');
  const [interim, setInterim] = useState('');
  const [onDevice, setOnDevice] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const final = useRef(onFinal);
  final.current = onFinal;

  useEffect(
    () => () => {
      rec.current?.abort?.();
    },
    [],
  );

  const start = async () => {
    const SR = getSR();
    if (!SR) {
      toast('Голосовой ввод работает в Chrome, Edge и Safari', { sub: 'В этом браузере текст можно напечатать' });
      return;
    }
    setState('starting');
    let local = false;
    try {
      // Новые версии Chrome умеют распознавать речь на устройстве — тогда звук никуда не отправляется
      if (typeof SR.available === 'function') local = (await SR.available({ langs: ['ru-RU'], processLocally: true })) === 'available';
    } catch {
      local = false;
    }
    const r: Recognition = new SR();
    r.lang = 'ru-RU';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    if (local) r.processLocally = true;
    r.onstart = () => setState('listening');
    r.onresult = (e: any) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final.current(res[0].transcript);
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e: any) => {
      const msg = speechErrorText(e.error, inFrame());
      if (msg) toast(msg);
    };
    r.onend = () => {
      setState('idle');
      setInterim('');
      rec.current = null;
    };
    rec.current = r;
    setOnDevice(local);
    try {
      r.start();
    } catch {
      setState('idle');
      rec.current = null;
      toast(speechErrorText('other'));
    }
  };

  const stop = () => rec.current?.stop?.();
  return { state, interim, onDevice, start, stop };
}

/** Кнопка микрофона рядом с полем ввода. onText получает каждый распознанный фрагмент. */
export function DictateButton({ onText, label = 'Надиктовать голосом', place = 'above' }: { onText: (text: string) => void; label?: string; place?: 'above' | 'below' }) {
  const d = useDictation(onText);
  const active = d.state !== 'idle';
  return (
    <span className="dictate">
      <button
        type="button"
        className={`btn btn-icon btn-sm dictate-btn${active ? ' is-live' : ''}`}
        aria-pressed={active}
        aria-label={active ? 'Остановить запись' : label}
        title={active ? 'Остановить запись' : label}
        onClick={() => (active ? d.stop() : d.start())}
      >
        {active ? <Square /> : <Mic />}
      </button>
      {active && (
        <span className={`dictate-bubble${place === 'below' ? ' is-below' : ''}`} role="status" aria-live="polite">
          <span className="row strong xs" style={{ gap: 6 }}>
            <span className="dictate-dot" /> {d.state === 'starting' ? 'Включаем микрофон…' : 'Слушаю — говорите'}
          </span>
          {d.interim && <span className="small">{d.interim}</span>}
          <span className="xs muted">{d.onDevice ? 'Распознаётся на устройстве. ' : 'Распознаёт браузер (в Chrome и Edge — через интернет). '}Текст можно поправить перед отправкой.</span>
        </span>
      )}
    </span>
  );
}
