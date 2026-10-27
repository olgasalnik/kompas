import { useEffect } from 'react';
import { Paperclip, ScanText } from 'lucide-react';
import { useDB } from '../../store/db';
import { markDocumentsViewed } from '../../store/api';
import { DocumentView, UploadButton } from '../../patient/Documents';

export function DocumentsTab({ patientId, me }: { patientId: string; me: string }) {
  const db = useDB();
  const docs = db.documents.filter((d) => d.patientId === patientId).sort((a, b) => b.at.localeCompare(a.at));
  useEffect(() => {
    // Открытие вкладки = просмотр документов врачом (фиксируется в журнале)
    const t = setTimeout(() => markDocumentsViewed(patientId, me), 1500);
    return () => clearTimeout(t);
  }, [patientId, me]);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <Paperclip /> Прикреплённые документы ({docs.length})
          </div>
          <UploadButton patientId={patientId} by="doctor" />
        </div>
        <div className="card-body stack" style={{ gap: 10 }}>
          {docs.length === 0 && <div className="empty">Документов пока нет. Пациент может прикрепить их в профиле.</div>}
          {docs.map((d) => (
            <DocumentView key={d.id} d={d} me={me} />
          ))}
        </div>
      </section>
      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
          <ScanText /> Как работает распознавание текста
        </div>
        <ul className="bullets small two-col">
          <li>
            «Распознать текст» у скана или фото переводит документ в печатный вид. Распознавание идёт <b>в браузере</b> (tesseract.js, русский и английский) — изображение
            не уходит на внешние серверы.
          </li>
          <li>Слова, в которых распознаватель не уверен, подчёркнуты: сверьте их с изображением рядом и при необходимости исправьте.</li>
          <li>Компас отмечает препараты из групп взаимодействия «Авиандра», коды МКБ-10 и даты, сверяет код с карточкой и подсказывает, если препарата нет в списке пациента.</li>
          <li>В карточку попадает только проверенный врачом текст. После сохранения он находится поиском и подставляется в запрос телемедконсультации.</li>
          <li>Рукописный текст распознаётся хуже печатного — такие документы проверяйте особенно внимательно.</li>
          <li>В пилоте файлы хранятся на сервере в РФ с шифрованием; в демо — в зашифрованном хранилище браузера; фото с телефона уменьшаются до 2000 px, PDF — до 5 МБ.</li>
        </ul>
      </section>
    </div>
  );
}
