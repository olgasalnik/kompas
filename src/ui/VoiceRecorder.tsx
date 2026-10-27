// Голосовое сообщение: запись с микрофона (MediaRecorder, до 1 минуты), параллельно — расшифровка речью браузера,
// если она доступна. Звук хранится вместе с перепиской в зашифрованном хранилище стенда.
import { useEffect, useRef, useState } from 'react';
import { AudioLines, Send, Trash2 } from 'lucide-react';
import { speechErrorText } from '../core/speech';
import type { VoiceAudio } from '../core/types';
import { toast } from './Toasts';

export const MAX_VOICE_MS = 60_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
const inFrame = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

function pickMime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(m)) ?? '';
}

export const fmtVoice = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function VoiceRecorder({ onRecorded, label = 'Записать голосовое', onRecording }: { onRecorded: (a: VoiceAudio) => void; label?: string; onRecording?: (on: boolean) => void }) {
  const [rec, setRec] = useState<{ startedAt: number } | null>(null);
  const notify = useRef(onRecording);
  notify.current = onRecording;
  useEffect(() => notify.current?.(Boolean(rec)), [rec]);
  const [elapsed, setElapsed] = useState(0);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const sr = useRef<any>(null);
  const transcript = useRef<string[]>([]);
  const cancelled = useRef(false);

  const cleanup = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    try {
      sr.current?.stop?.();
    } catch {
      /* уже остановлено */
    }
    sr.current = null;
    setRec(null);
    setElapsed(0);
  };

  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => {
      const ms = Date.now() - rec.startedAt;
      setElapsed(ms);
      if (ms >= MAX_VOICE_MS) stop(false);
    }, 200);
    return () => clearInterval(t);
  }, [rec]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast('Этот браузер не умеет записывать голосовые', { sub: 'Можно надиктовать текст или напечатать' });
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as DOMException).name;
      toast(name === 'NotFoundError' ? speechErrorText('audio-capture') : speechErrorText('not-allowed', inFrame()));
      return;
    }
    const mime = pickMime();
    const r = new MediaRecorder(stream.current, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
    chunks.current = [];
    transcript.current = [];
    cancelled.current = false;
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      const durationMs = Date.now() - startedAt;
      const blob = new Blob(chunks.current, { type: r.mimeType || mime || 'audio/webm' });
      const text = transcript.current.join(' ').replace(/\s+/g, ' ').trim();
      cleanup();
      if (cancelled.current || !blob.size) return;
      const fr = new FileReader();
      fr.onload = () => onRecorded({ dataUrl: String(fr.result), durationMs: Math.min(durationMs, MAX_VOICE_MS), mime: blob.type, transcript: text || null });
      fr.readAsDataURL(blob);
    };
    mr.current = r;
    const startedAt = Date.now();
    r.start(500);
    setRec({ startedAt });
    // Расшифровка параллельно с записью (если браузер умеет); без неё сообщение уйдёт как звук
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (SR) {
      try {
        const s = new SR();
        s.lang = 'ru-RU';
        s.continuous = true;
        s.interimResults = false;
        s.onresult = (e: any) => {
          for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) transcript.current.push(e.results[i][0].transcript);
        };
        s.onerror = () => undefined;
        s.start();
        sr.current = s;
      } catch {
        sr.current = null;
      }
    }
  };

  const stop = (cancel: boolean) => {
    cancelled.current = cancel;
    // Даём распознаванию дослать последнюю фразу
    try {
      sr.current?.stop?.();
    } catch {
      /* уже остановлено */
    }
    setTimeout(() => {
      if (mr.current?.state === 'recording') mr.current.stop();
    }, cancel ? 0 : 350);
  };

  if (!rec)
    return (
      <button type="button" className="btn btn-icon btn-sm dictate-btn" onClick={start} aria-label={label} title={label}>
        <AudioLines />
      </button>
    );
  return (
    <span className="voice-rec" role="status" aria-live="polite">
      <span className="dictate-dot" />
      <span className="mono small">{fmtVoice(elapsed)}</span>
      <span className="xs muted">/ 1:00 · запись</span>
      <button type="button" className="btn btn-icon btn-sm btn-ghost" onClick={() => stop(true)} aria-label="Отменить запись" title="Отменить">
        <Trash2 />
      </button>
      <button type="button" className="btn btn-icon btn-sm btn-primary" onClick={() => stop(false)} aria-label="Отправить голосовое" title="Отправить">
        <Send />
      </button>
    </span>
  );
}

/** Плеер голосового сообщения в переписке */
export function VoiceBubble({ a }: { a: VoiceAudio }) {
  return (
    <span className="stack" style={{ gap: 4 }}>
      <span className="row xs strong" style={{ gap: 6 }}>
        <AudioLines size={14} /> Голосовое · {fmtVoice(a.durationMs)}
      </span>
      <audio className="voice-audio" controls preload="metadata" src={a.dataUrl} />
      {a.transcript ? (
        <span className="xs ink-2">
          <span className="muted">Расшифровка (автоматически, возможны ошибки): </span>«{a.transcript}»
        </span>
      ) : (
        <span className="xs muted">Без расшифровки — прослушайте сообщение</span>
      )}
    </span>
  );
}
