// Голосовой ввод: чистые функции. Само распознавание речи — Web Speech API браузера (src/ui/Dictate.tsx).
// Текст после распознавания всегда можно поправить перед отправкой; система ничего не дописывает за человека.

/** Добавляет надиктованный фрагмент к уже набранному тексту: пробел между ними, заглавная буква в начале предложения */
export function joinDictated(prev: string, chunk: string): string {
  const c = chunk.replace(/\s+/g, ' ').trim();
  if (!c) return prev;
  const p = prev.replace(/\s+$/, '');
  const newSentence = !p || /[.!?…]$/.test(p);
  const piece = newSentence ? c.charAt(0).toLocaleUpperCase('ru-RU') + c.slice(1) : c;
  if (!p) return piece;
  return `${p}${/\n$/.test(prev) ? '' : ' '}${piece}`;
}

export type SpeechErrorCode = 'not-allowed' | 'service-not-allowed' | 'no-speech' | 'audio-capture' | 'network' | 'language-not-supported' | 'aborted' | string;

/** Понятное объяснение ошибки распознавания речи */
export function speechErrorText(code: SpeechErrorCode, inFrame = false): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return inFrame
        ? 'Микрофон недоступен в этом окне просмотра. Откройте стенд в отдельной вкладке браузера и разрешите микрофон.'
        : 'Нет доступа к микрофону. Разрешите микрофон для этого сайта в настройках браузера.';
    case 'no-speech':
      return 'Не услышали речь. Нажмите на микрофон и говорите чуть громче.';
    case 'audio-capture':
      return 'Микрофон не найден. Проверьте, что он подключён.';
    case 'network':
      return 'Распознавание речи в этом браузере работает через интернет, а связи нет. Можно напечатать текст.';
    case 'language-not-supported':
      return 'Этот браузер не распознаёт русскую речь. Можно напечатать текст.';
    case 'aborted':
      return '';
    default:
      return 'Не удалось распознать речь. Можно напечатать текст.';
  }
}
