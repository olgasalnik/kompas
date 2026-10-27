// Прикреплённые документы: анализы, выписки, фото рукописных заметок. Пациент и врач могут прикрепить,
// врач видит всё в карточке. В прототипе файлы хранятся в браузере, поэтому размер ограничен.
import { useRef, useState } from 'react';
import { AlertTriangle, Check, ClipboardCopy, FileImage, FileText, Paperclip, Pencil, ScanText, Upload, ZoomIn } from 'lucide-react';
import { Modal } from '../ui/Modal';
import type { PatientDocument } from '../core/types';
import { useDB } from '../store/db';
import { addDocument, MAX_DOC_BYTES, saveDocumentText } from '../store/api';
import { fmtDateTime, plural } from '../core/time';
import { extractFromDocument, LOW_CONFIDENCE, lowConfidenceWords } from '../core/ocrText';
import { toast } from '../ui/Toasts';
import { copyText } from '../ui/hooks';
import { OCR_ENGINE, ocrAvailability, recognizeImage, type OcrProgress, type OcrResult } from '../ui/ocr';

function kindOf(f: File): PatientDocument['kind'] {
  if (f.type.startsWith('image/')) return 'image';
  if (f.type === 'application/pdf') return 'pdf';
  if (f.type.startsWith('text/') || /\.(txt|md|csv)$/i.test(f.name)) return 'text';
  return 'other';
}

// Фото с телефона весят 2–8 МБ: перед сохранением уменьшаем до 2000 px по длинной стороне (JPEG) — текст остаётся
// читаемым и для врача, и для распознавания, а файл — около 0,3–0,8 МБ
const PHOTO_MAX_SIDE = 2000;

function readAsDataUrl(f: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('Не удалось прочитать файл'));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(f);
  });
}

async function compressPhoto(f: File): Promise<{ dataUrl: string; size: number } | null> {
  if (!/^image\/(jpeg|png|webp|bmp)$/.test(f.type)) return null; // SVG, GIF, HEIC — как есть
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && f.size < 900_000) return null; // уже небольшое
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85));
    if (!blob || blob.size >= f.size) return null;
    return { dataUrl: await readAsDataUrl(blob), size: blob.size };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function readFileAsDocument(f: File, patientId: string, uploadedBy: 'patient' | 'doctor'): Promise<Omit<PatientDocument, 'id' | 'at'>> {
  const kind = kindOf(f);
  if (kind === 'text') {
    if (f.size > MAX_DOC_BYTES) throw new Error(`Файл больше ${Math.round(MAX_DOC_BYTES / 1_000_000)} МБ — загрузите файл поменьше`);
    return { patientId, name: f.name, kind, size: f.size, text: (await f.text()).slice(0, 20000), uploadedBy };
  }
  if (kind === 'image') {
    const small = await compressPhoto(f);
    if (small) return { patientId, name: f.name, kind, size: small.size, dataUrl: small.dataUrl, uploadedBy, note: `Фото уменьшено для хранения: было ${(f.size / 1_000_000).toFixed(1).replace('.', ',')} МБ` };
  }
  if (f.size > MAX_DOC_BYTES) throw new Error(`Файл больше ${Math.round(MAX_DOC_BYTES / 1_000_000)} МБ — загрузите файл поменьше`);
  return { patientId, name: f.name, kind, size: f.size, dataUrl: await readAsDataUrl(f), uploadedBy };
}

export function UploadButton({ patientId, by, label = 'Прикрепить файл' }: { patientId: string; by: 'patient' | 'doctor'; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={input}
        type="file"
        id={`upload-${by}`}
        accept="image/*,application/pdf,text/plain"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          try {
            addDocument(await readFileAsDocument(f, patientId, by));
            toast('Документ прикреплён', { tone: 'ok', sub: by === 'patient' ? 'Врач увидит его в карточке' : f.name });
          } catch (err) {
            toast((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      <button className="btn btn-sm" onClick={() => input.current?.click()} disabled={busy} aria-busy={busy}>
        <Upload /> {busy ? 'Обрабатываю файл…' : label}
      </button>
    </>
  );
}

/** Что найдено в тексте документа: препараты (взаимодействие с «Авиандром»), коды МКБ-10, даты */
export function FoundInText({ text, patientId }: { text: string; patientId?: string }) {
  const db = useDB();
  const p = patientId ? db.patients.find((x) => x.id === patientId) : undefined;
  const f = extractFromDocument(text);
  if (!f.meds.length && !f.icd.length && !f.dates.length) return null;
  const missing = p ? f.meds.filter((m) => m.interacting && !p.meds.includes(m.name)) : [];
  // Сверка кода с карточкой: расхождение — повод посмотреть на изображение (ошибка распознавания или другой диагноз)
  const cardCode = p?.diagnosis.code;
  const mismatch = cardCode ? f.icd.filter((c) => c !== cardCode) : [];
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="ocr-found">
        <span className="xs muted strong">Найдено в документе:</span>
        {f.meds.map((m) => (
          <span key={m.name} className={`badge ${m.interacting ? 'badge-amber' : 'badge-brand'}`} title={m.interacting ? 'Входит в группы взаимодействия из инструкции «Авиандра»' : ''}>
            {m.interacting && <AlertTriangle />} {m.name}
            {m.dose ? ` ${m.dose}` : ''}
            {m.interacting ? ' — взаимодействие с «Авиандром»' : ''}
          </span>
        ))}
        {f.icd.map((c) => (
          <span key={c} className={`badge ${!cardCode ? 'badge-outline' : c === cardCode ? 'badge-mint' : 'badge-amber'}`}>
            МКБ-10: {c}
            {cardCode ? (c === cardCode ? ' · как в карточке' : ' · не как в карточке') : ''}
          </span>
        ))}
        {f.dates.map((x) => (
          <span key={x} className="badge badge-outline">
            {x}
          </span>
        ))}
      </div>
      {mismatch.length > 0 && (
        <div className="callout callout-amber small">
          <AlertTriangle />
          <span>
            Код {mismatch.join(', ')} не совпадает с диагнозом в карточке ({cardCode}). Сверьте с изображением: распознаватель путает похожие буквы (F и Е, 1 и I), или в документе
            другой диагноз.
          </span>
        </div>
      )}
      {missing.length > 0 && (
        <div className="callout callout-amber small">
          <AlertTriangle />
          <span>
            {missing.map((m) => `«${m.name}»`).join(', ')} нет в списке препаратов пациента. Уточните у пациента и при необходимости добавьте на вкладке «Терапия» — тогда сработает проверка взаимодействий.
          </span>
        </div>
      )}
    </div>
  );
}

type OcrState = null | { phase: 'run'; stage: OcrProgress['stage']; progress: number } | { phase: 'done'; r: OcrResult } | { phase: 'error'; msg: string };

/** Распознанный текст с подсветкой слов, в которых распознаватель не уверен */
function HighlightedText({ r }: { r: OcrResult }) {
  return (
    <div className="ocr-text">
      {r.lines.map((line, i) => (
        <div key={i}>
          {line.map((w, j) => (
            <span key={j}>
              {j > 0 && ' '}
              {w.confidence < LOW_CONFIDENCE && /[\p{L}\d]/u.test(w.text) ? (
                <span className="ocr-low" title={`Уверенность ${w.confidence}% — сверьте с изображением`}>
                  {w.text}
                </span>
              ) : (
                w.text
              )}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function OcrReview({ d, me, r, onClose }: { d: PatientDocument; me: string; r: OcrResult; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.text);
  const low = lowConfidenceWords(r.words);
  const [zoom, setZoom] = useState(false);
  return (
    <div className="ocr-panel">
      {d.dataUrl && (
        <button className="ocr-image" onClick={() => setZoom(true)} title="Открыть изображение в полном размере">
          <img src={d.dataUrl} alt={`Исходное изображение: ${d.name}`} />
          <span className="xs muted row" style={{ gap: 4, justifyContent: 'center' }}>
            <ZoomIn size={13} /> исходное изображение — нажмите, чтобы увеличить
          </span>
        </button>
      )}
      {zoom && d.dataUrl && (
        <Modal wide title={d.name} sub="Исходное изображение" onClose={() => setZoom(false)}>
          <img src={d.dataUrl} alt={d.name} style={{ width: '100%' }} />
        </Modal>
      )}
      <div className="stack" style={{ gap: 10, minWidth: 0 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="badge badge-ai">
            <ScanText /> Распознано в браузере
          </span>
          <span className="xs muted">
            {r.confidence !== null ? `средняя уверенность ${r.confidence}% · ` : ''}
            {(r.ms / 1000).toFixed(1).replace('.', ',')} с
          </span>
        </div>
        {r.text ? (
          editing ? (
            <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 260, fontSize: 'var(--fs-md)' }} aria-label="Распознанный текст" />
          ) : (
            <HighlightedText r={r} />
          )
        ) : (
          <div className="callout small">
            <ScanText />
            <span>Текст не найден. Попробуйте более чёткое фото: ровно, без бликов, вся страница в кадре.</span>
          </div>
        )}
        {!editing && low.length > 0 && (
          <div className="xs ink-2">
            Подчёркнуто {low.length} {plural(low.length, 'слово', 'слова', 'слов')} с низкой уверенностью — сверьте с изображением и при необходимости нажмите «Исправить».
          </div>
        )}
        {text && <FoundInText text={text} patientId={d.patientId} />}
        <div className="row wrap" style={{ gap: 6 }}>
          <button
            className="btn btn-sm btn-primary"
            disabled={!text.trim()}
            onClick={() => {
              saveDocumentText(d.id, me, text, { confidence: r.confidence, edited: text.trim() !== r.text.trim(), engine: OCR_ENGINE });
              toast('Печатная версия сохранена в карточке', { tone: 'ok', sub: 'Текст документа теперь находится поиском' });
              onClose();
            }}
          >
            <Check /> Сохранить в карточку
          </button>
          {r.text && (
            <button className="btn btn-sm" onClick={() => setEditing(!editing)}>
              <Pencil /> {editing ? 'Показать подсветку' : 'Исправить'}
            </button>
          )}
          <CopyButton text={text} />
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ text, label = 'Копировать' }: { text: string; label?: string }) {
  return (
    <button
      className="btn btn-sm btn-ghost"
      disabled={!text}
      onClick={async () => {
        const ok = await copyText(text);
        toast(ok ? 'Текст скопирован' : 'Не удалось скопировать', { tone: ok ? 'ok' : 'default' });
      }}
    >
      <ClipboardCopy /> {label}
    </button>
  );
}

/** Документ в карточке. me — врач: может распознать текст скана и сохранить печатную версию. */
export function DocumentView({ d, me }: { d: PatientDocument; me?: string }) {
  const [open, setOpen] = useState(false);
  const [ocr, setOcr] = useState<OcrState>(null);
  const canOcr = Boolean(me) && d.kind === 'image' && Boolean(d.dataUrl);
  const run = async () => {
    const av = ocrAvailability();
    if (!av.ok) return setOcr({ phase: 'error', msg: av.reason });
    setOcr({ phase: 'run', stage: 'load', progress: 0 });
    try {
      const r = await recognizeImage(d.dataUrl!, (p) => setOcr({ phase: 'run', stage: p.stage, progress: p.progress }));
      setOcr({ phase: 'done', r });
    } catch (e) {
      setOcr({ phase: 'error', msg: (e as Error).message });
    }
  };
  const showImage = open && d.kind === 'image' && d.dataUrl && ocr?.phase !== 'done';
  return (
    <div className="card card-flat" style={{ padding: 12 }}>
      <div className="row spread wrap" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          {d.kind === 'image' ? <FileImage size={18} color="var(--brand)" /> : <FileText size={18} color="var(--brand)" />}
          <div className="stack" style={{ gap: 1, minWidth: 0 }}>
            <span className="small strong" style={{ overflowWrap: 'anywhere' }}>
              {d.name}
            </span>
            <span className="xs muted">
              {d.uploadedBy === 'patient' ? 'загрузил пациент' : 'загрузил врач'} · {fmtDateTime(d.at)} · {Math.max(1, Math.round(d.size / 1024))} КБ
              {d.viewedByDoctor === false && d.uploadedBy === 'patient' ? ' · новый' : ''}
              {d.ocr ? ' · есть печатная версия' : ''}
            </span>
          </div>
        </div>
        <span className="row" style={{ gap: 4 }}>
          {canOcr && ocr?.phase !== 'run' && ocr?.phase !== 'done' && (
            <button className="btn btn-sm btn-soft" onClick={run}>
              <ScanText /> {d.ocr ? 'Распознать заново' : 'Распознать текст'}
            </button>
          )}
          {(d.kind === 'image' || d.kind === 'text') && ocr?.phase !== 'done' && (
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen(!open)}>
              {open ? 'Скрыть' : 'Открыть'}
            </button>
          )}
        </span>
      </div>
      {ocr?.phase === 'run' && (
        <div className="stack" style={{ gap: 6, marginTop: 12 }} role="status" aria-live="polite">
          <span className="xs ink-2">
            {ocr.stage === 'load' ? 'Загружаем модуль распознавания (русский и английский) — только при первом запуске…' : `Распознаём текст… ${Math.round(ocr.progress * 100)}%`}
          </span>
          <div className="progress">
            <span style={{ width: `${Math.round((ocr.stage === 'load' ? ocr.progress * 0.3 : 0.3 + ocr.progress * 0.7) * 100)}%` }} />
          </div>
        </div>
      )}
      {ocr?.phase === 'error' && (
        <div className="callout small" style={{ marginTop: 10 }}>
          <ScanText />
          <span>{ocr.msg}</span>
        </div>
      )}
      {ocr?.phase === 'done' && me && <OcrReview d={d} me={me} r={ocr.r} onClose={() => setOcr(null)} />}
      {showImage && <img src={d.dataUrl} alt={d.name} style={{ marginTop: 10, borderRadius: 10, maxHeight: 420, objectFit: 'contain' }} />}
      {open && d.kind === 'text' && (
        <div className="stack" style={{ gap: 8, marginTop: 10 }}>
          <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', padding: 12, borderRadius: 10, fontFamily: 'var(--font-body)', maxHeight: 320, overflow: 'auto', margin: 0 }}>
            {d.text}
          </pre>
          {me && d.text && <FoundInText text={d.text} patientId={d.patientId} />}
        </div>
      )}
      {d.ocr && ocr?.phase !== 'done' && (
        <details style={{ marginTop: 10 }} open={Boolean(me)}>
          <summary className="small strong" style={{ cursor: 'pointer', color: 'var(--brand-ink)' }}>
            Печатная версия документа
          </summary>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <span className="xs muted">
              Распознано и {d.ocr.edited ? 'исправлено' : 'проверено'} врачом · {fmtDateTime(d.ocr.at)}
              {d.ocr.confidence !== null ? ` · уверенность распознавания ${d.ocr.confidence}%` : ''}
            </span>
            <div className="ocr-text">{d.ocr.text}</div>
            {me && <FoundInText text={d.ocr.text} patientId={d.patientId} />}
            <span>
              <CopyButton text={d.ocr.text} />
            </span>
          </div>
        </details>
      )}
      {d.kind === 'pdf' && <div className="xs muted" style={{ marginTop: 6 }}>PDF хранится в карточке. Для распознавания текста загрузите скан или фото страницы (JPG, PNG).</div>}
    </div>
  );
}

export function MyDocuments({ patientId }: { patientId: string }) {
  const db = useDB();
  const docs = db.documents.filter((d) => d.patientId === patientId).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row spread">
        <div className="row strong" style={{ gap: 8 }}>
          <Paperclip size={18} color="var(--brand)" /> Мои документы
        </div>
        <UploadButton patientId={patientId} by="patient" label="Прикрепить" />
      </div>
      <div className="xs muted">Анализы, выписки, заключения других врачей — врач увидит их в вашей карточке. Фото (уменьшаются автоматически), PDF или текст до 5 МБ.</div>
      {docs.length === 0 && <span className="small muted">Документов пока нет</span>}
      {docs.map((d) => (
        <DocumentView key={d.id} d={d} />
      ))}
    </div>
  );
}
