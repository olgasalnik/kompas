// «Защита данных и врачебная тайна»: что зашифровано в этом браузере (живая проверка), что и куда уходит наружу,
// правовые основания и что меняется в пилоте. Без преувеличений: граница прототипа названа прямо.
import { useState } from 'react';
import { KeyRound, LockKeyhole, Scale, Send, ServerCog, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useDB, storageInfo, resealNow } from '../store/db';
import { rotateKey, vaultState } from '../store/vault';
import { audit, NOTIFY_TEXTS } from '../store/api';
import { mutate } from '../store/db';
import { BOT_NOTIFY } from '../core/bot';
import { findLeaks } from '../core/privacy';
import { fmtDateTime } from '../core/time';
import { useTicker } from '../ui/hooks';
import { toast } from '../ui/Toasts';

const kb = (chars: number) => `${Math.max(1, Math.round(chars / 1024)).toLocaleString('ru-RU')} КБ`;

export function PrivacyPage({ me }: { me: string }) {
  const db = useDB();
  useTicker(1500);
  const [busy, setBusy] = useState(false);
  const v = vaultState();
  const info = storageInfo();
  const leaks = findLeaks(db.notifications);
  const outgoing = [...new Set([...Object.values(NOTIFY_TEXTS), BOT_NOTIFY])];

  return (
    <div className="stack fade-in" style={{ gap: 22 }}>
      <div className="page-head">
        <div>
          <h1>Защита данных и врачебная тайна</h1>
          <p>Что зашифровано, что и куда уходит наружу и на каком основании. Проверка ниже — живая, по данным этого браузера.</p>
        </div>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        <section className="card card-pad stack" style={{ gap: 12 }}>
          <div className="row spread wrap" style={{ gap: 8 }}>
            <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
              <LockKeyhole /> Хранилище в этом браузере
            </div>
            <span className={`badge badge-lg ${v.mode === 'encrypted' && info.sealed ? 'badge-mint' : 'badge-amber'}`}>
              {v.mode === 'encrypted' && info.sealed ? <ShieldCheck /> : <ShieldAlert />}
              {v.mode === 'encrypted' && info.sealed ? 'Зашифровано' : 'Без шифрования'}
            </span>
          </div>
          {v.mode === 'encrypted' ? (
            <ul className="bullets small">
              <li>
                Алгоритм: <b>{v.alg}</b>
                {v.compressed ? ', перед шифрованием — сжатие gzip' : ''}. Каждая запись — со свежим случайным вектором инициализации.
              </li>
              <li>
                Ключ создан в браузере как <b>неизвлекаемый</b>: его нельзя прочитать даже скриптом страницы. Хранится в IndexedDB{v.keyCreatedAt ? `, создан ${fmtDateTime(v.keyCreatedAt)}` : ''}.
              </li>
              <li>Зашифровано всё: карточки, дневник, сообщения, голосовые, сканы документов, журнал.</li>
              <li>
                На диске ({info.where}): {kb(info.storedChars)} шифротекста (данные — {kb(info.plainChars)}){info.savedAt ? `, последняя запись ${new Date(info.savedAt).toLocaleTimeString('ru-RU')}` : ''}. Хранилище
                IndexedDB вмещает сотни мегабайт — фото документов и голосовые помещаются.
              </li>
            </ul>
          ) : (
            <div className="callout callout-amber small">
              <ShieldAlert />
              <span>Шифрование в этом окне недоступно: {v.reason}. Данные стенда синтетические; в пилоте данные хранятся на сервере, а не в браузере.</span>
            </div>
          )}
          {v.note && <div className="xs ink-2">{v.note}</div>}
          {info.error && (
            <div className="callout callout-red small">
              <ShieldAlert />
              <span>{info.error}</span>
            </div>
          )}
          <div className="stack" style={{ gap: 4 }}>
            <span className="xs muted strong">Так данные выглядят на диске ({info.where === 'память' ? 'не сохранены — только в памяти вкладки' : info.where}):</span>
            <pre className="recipe" style={{ fontSize: 11.5, maxHeight: 120, overflow: 'hidden' }} aria-label="Начало записи на диске">
              {info.sample || '—'}…
            </pre>
          </div>
          {v.mode === 'encrypted' && (
            <button
              className="btn btn-sm"
              style={{ alignSelf: 'flex-start' }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await rotateKey();
                  await resealNow();
                  mutate((d) => audit(d, me, 'Ключ шифрования хранилища заменён, данные перешифрованы'));
                  toast('Ключ заменён', { tone: 'ok', sub: 'Данные перешифрованы новым ключом' });
                } finally {
                  setBusy(false);
                }
              }}
            >
              <KeyRound /> Сменить ключ и перешифровать
            </button>
          )}
        </section>

        <section className="card card-pad stack" style={{ gap: 10 }}>
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            <Send /> Что уходит наружу
          </div>
          <div className="table-wrap">
            <table className="table small">
              <thead>
                <tr>
                  <th>Куда</th>
                  <th>Что</th>
                  <th>Медданные</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="strong">SMS, push, почта, мессенджер</td>
                  <td>Только нейтральные тексты: напоминания, «есть сообщение», сигналы врачу</td>
                  <td>
                    <span className={`badge ${leaks.length ? 'badge-red' : 'badge-mint'}`}>{leaks.length ? `найдено ${leaks.length}` : 'нет'}</span>
                  </td>
                </tr>
                <tr>
                  <td className="strong">Доверенное лицо</td>
                  <td>«Близкому может понадобиться поддержка» — только если пациент сам выбрал</td>
                  <td>
                    <span className="badge badge-mint">нет</span>
                  </td>
                </tr>
                <tr>
                  <td className="strong">Распознавание сканов</td>
                  <td>Идёт в браузере, изображение никуда не отправляется</td>
                  <td>
                    <span className="badge badge-mint">не уходит</span>
                  </td>
                </tr>
                <tr>
                  <td className="strong">Голосовой ввод и расшифровка голосовых</td>
                  <td>Распознаёт браузер: в Chrome и Edge — облачный сервис браузера (кроме режима «на устройстве»)</td>
                  <td>
                    <span className="badge badge-amber">уходит звук</span>
                  </td>
                </tr>
                <tr>
                  <td className="strong">Синхронизация вкладок</td>
                  <td>Внутри браузера (BroadcastChannel), без сети</td>
                  <td>
                    <span className="badge badge-mint">не уходит</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="xs muted">
            Автопроверка: {db.notifications.length} уведомлений стенда, утечек медицинских данных — {leaks.length}. Шаблоны уведомлений:
          </div>
          <ul className="bullets xs ink-2">
            {outgoing.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      </div>

      <div className="dossier-grid">
        <section className="card card-pad stack" style={{ gap: 8 }}>
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            <Scale /> Врачебная тайна и закон
          </div>
          <ul className="bullets small">
            <li>323-ФЗ, ст. 13 — врачебная тайна: сведения о здоровье и самом факте обращения не раскрываются без согласия пациента.</li>
            <li>152-ФЗ, ст. 10 — сведения о здоровье относятся к специальной категории персональных данных: только с письменного согласия, доступ по ролям.</li>
            <li>Информированное добровольное согласие по целям; отзыв согласия — в профиле пациента.</li>
            <li>Каждое действие с данными — в журнале аудита (кто, когда, что).</li>
            <li>Уведомления и SMS не содержат диагноза, препарата и результатов опросников.</li>
          </ul>
        </section>
        <section className="card card-pad stack" style={{ gap: 8 }}>
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            <ServerCog /> В пилоте
          </div>
          <ul className="bullets small">
            <li>Данные — на сервере в РФ, шифрование при передаче (TLS) и при хранении; ключи — отдельно от данных.</li>
            <li>Меры защиты информационной системы персональных данных по требованиям ФСТЭК и сертифицированные средства криптозащиты — уточняет специалист по ИБ.</li>
            <li>Вход врачей с двухфакторной аутентификацией, разграничение доступа по ролям и отделениям.</li>
            <li>Распознавание речи — собственный сервер внутри контура РФ, без облачных сервисов браузера.</li>
            <li>SMS-шлюз получает только нейтральный текст и номер телефона.</li>
          </ul>
        </section>
      </div>

      <div className="callout small">
        <ShieldAlert />
        <span>
          Граница прототипа: ключ хранится в том же браузере, что и данные. Шифрование защищает файл хранилища от чтения, но не от человека с доступом к этому браузеру. Данные
          стенда синтетические.
        </span>
      </div>
    </div>
  );
}
