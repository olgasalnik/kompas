// Распознавание текста со сканов и фото прямо в браузере (tesseract.js, русский + английский).
// Модели лежат рядом с сайтом в папке ocr/ (копирует scripts/copy-ocr.mjs) — ничего не уходит в интернет,
// изображение не покидает компьютер врача. Модуль грузится только по кнопке «Распознать текст».
import type { Worker as TesseractWorker } from 'tesseract.js';
import { cleanOcrText, meanConfidence, type OcrWord } from '../core/ocrText';

export const OCR_ENGINE = 'tesseract.js 6 · rus+eng · LSTM';

export interface OcrProgress {
  stage: 'load' | 'recognize';
  progress: number; // 0–1
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  lines: OcrWord[][];
  confidence: number | null;
  ms: number;
}

/** Можно ли распознавать в этом окне. Файл, открытый с диска, не может запустить фоновый процесс распознавания. */
export function ocrAvailability(): { ok: true } | { ok: false; reason: string } {
  if (typeof window === 'undefined' || typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    return { ok: false, reason: 'Этот браузер не поддерживает распознавание текста. Откройте стенд в Chrome, Edge, Firefox или Safari.' };
  }
  if (location.protocol === 'file:') {
    return { ok: false, reason: 'В офлайн-файле распознавание отключено, чтобы файл оставался лёгким. Оно работает в веб-версии стенда (npm run dev, GitHub Pages, тестовая ссылка).' };
  }
  return { ok: true };
}

let workerP: Promise<TesseractWorker> | null = null;
let onProgress: ((p: OcrProgress) => void) | null = null;

function getWorker(): Promise<TesseractWorker> {
  if (!workerP) {
    workerP = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      const base = new URL('ocr/', document.baseURI).href;
      return createWorker(['rus', 'eng'], OEM.LSTM_ONLY, {
        workerPath: `${base}worker-wrap.js`, // подставляет имена моделей *.traineddata.wasm
        corePath: base,
        langPath: base,
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: (m) => {
          const stage = m.status === 'recognizing text' ? 'recognize' : 'load';
          onProgress?.({ stage, progress: typeof m.progress === 'number' ? m.progress : 0 });
        },
      });
    })();
    workerP.catch(() => {
      workerP = null;
    });
  }
  return workerP;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось открыть изображение'));
    img.src = src;
  });
}

/** Готовит изображение: белый фон (у PNG бывает прозрачность), мелкие — увеличить, крупные фото — уменьшить */
async function toCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth || 800;
  const h = img.naturalHeight || 1000;
  const longest = Math.max(w, h);
  const scale = longest < 1200 ? 2 : longest > 3000 ? 3000 / longest : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export async function recognizeImage(dataUrl: string, progress?: (p: OcrProgress) => void): Promise<OcrResult> {
  const t0 = performance.now();
  onProgress = progress ?? null;
  try {
    progress?.({ stage: 'load', progress: 0 });
    const [worker, canvas] = await Promise.all([getWorker(), toCanvas(dataUrl)]);
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const lines: OcrWord[][] = [];
    for (const b of data.blocks ?? []) for (const para of b.paragraphs) for (const l of para.lines) lines.push(l.words.map((w) => ({ text: w.text, confidence: Math.round(w.confidence) })));
    const words = lines.flat();
    return { text: cleanOcrText(data.text), words, lines, confidence: meanConfidence(words), ms: Math.round(performance.now() - t0) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(/fetch|network|Failed to load|importScripts|NetworkError/i.test(msg) ? 'Не удалось загрузить модуль распознавания (папка ocr/ рядом с сайтом). Запустите npm run dev или пересоберите сайт.' : `Распознавание не удалось: ${msg}`);
  } finally {
    onProgress = null;
  }
}
