import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ClipboardCheck, Download, Info, MapPinned, Pill, Plus, Scale, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useDB, getDB } from '../store/db';
import { reportMed, setConsent, setReminderChannel, setTrustedContact } from '../store/api';
import { SCOPE_TEXT, TrustedForm } from './Trusted';
import { MyDocuments } from './Documents';
import { doseSummary } from '../core/dose';
import { fmtDate, fmtTime } from '../core/time';
import { toast } from '../ui/Toasts';
import { copyText } from '../ui/hooks';
import type { ConsentPurpose } from '../core/types';

export const CONSENT_TEXT: Record<ConsentPurpose, { title: string; text: string; required: boolean }> = {
  treatment: {
    title: 'Информированное добровольное согласие на дистанционное наблюдение',
    text: 'Записи дневника, опросники и сообщения видит только ваш лечащий врач. Ст. 20 323-ФЗ, ст. 4 и 11 Закона № 3185-1.',
    required: true,
  },
  health_data: { title: 'Согласие на обработку сведений о здоровье', text: 'Специальная категория персональных данных: хранение в РФ, шифрование, доступ по ролям (ст. 10 152-ФЗ).', required: true },
  reminders: { title: 'Нейтральные напоминания', text: 'Напоминания без медицинских подробностей: «Время сделать короткую запись».', required: false },
  trusted_person: { title: 'Доверенное лицо (родственник, опекун, законный представитель)', text: 'Получает только то, что вы выберете: статус приёма и, по желанию, уведомление «не в безопасности». Не видит ответы, заметки и переписку.', required: false },
  research: { title: 'Обезличенные данные для науки', text: 'Только по отдельному согласию, в обезличенном виде, группами не менее 10 человек.', required: false },
};

/** Право отказаться — простыми словами (ст. 20 323-ФЗ, ст. 12 и 29 Закона № 3185-1) */
export const REFUSAL_TEXT =
  'Вы вправе отказаться от дистанционного наблюдения или отозвать любое согласие в любой момент — это не влияет на очную помощь. Без согласия медицинская помощь оказывается только в случаях, прямо предусмотренных законом (например, при угрозе жизни — ст. 29 Закона № 3185-1). Платформа в таких ситуациях не принимает решений: она направляет к врачу и в экстренные службы.';

export const CHANNEL = { push: 'Push-уведомления', sms: 'SMS', email: 'Электронная почта', max: 'MAX', vk: 'VK', telegram: 'Telegram' } as const;

export function ProfilePage({ patientId }: { patientId: string }) {
  const db = useDB();
  const p = db.patients.find((x) => x.id === patientId)!;
  const doctor = db.users.find((u) => u.id === p.doctorId);
  const rx = [...db.prescriptions].reverse().find((r) => r.patientId === p.id && (r.status === 'confirmed' || r.status === 'modified'));
  const [med, setMed] = useState('');
  const [revoke, setRevoke] = useState<ConsentPurpose | null>(null);
  const [editTrusted, setEditTrusted] = useState(false);

  const exportData = () => {
    const d = getDB();
    const mine = {
      exportedAt: new Date().toISOString(),
      patient: { code: p.code, age: p.age, consents: p.consents },
      checkins: d.checkins.filter((c) => c.patientId === p.id),
      assessments: d.assessments.filter((c) => c.patientId === p.id && c.enteredBy !== 'doctor'),
      medEvents: d.medEvents.filter((c) => c.patientId === p.id),
      messages: d.messages.filter((c) => c.patientId === p.id),
    };
    copyText(JSON.stringify(mine, null, 2)).then((ok) =>
      toast(ok ? 'Ваши данные скопированы' : 'Не удалось скопировать', { sub: ok ? 'Формат JSON — можно вставить в письмо или файл' : 'Разрешите доступ к буферу обмена', tone: ok ? 'ok' : 'default' }),
    );
  };

  return (
    <>
      <div className="p-header">
        <div className="stack" style={{ gap: 2 }}>
          <span className="p-title">Профиль</span>
          <span className="small muted">
            {p.name} · {p.code}
          </span>
        </div>
      </div>
      <div className="p-scroll stack" style={{ gap: 14 }}>
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row strong" style={{ gap: 8 }}>
            <ClipboardCheck size={18} color="var(--brand)" /> Мой план
          </div>
          {rx ? (
            <>
              <div>
                <div className="strong">«Авиандр» — {rx.regimen}</div>
                <div className="small ink-2">{doseSummary(20, 2).line}</div>
                <div className="xs muted">
                  Утвердил: {doctor?.name}, {fmtDate(rx.decidedAt!)} в {fmtTime(rx.decidedAt!)}
                </div>
              </div>
              {rx.recipes?.length ? (
                <div className="small">
                  <span className="muted">Рецепт: </span>
                  от {fmtDate(rx.recipes[rx.recipes.length - 1].at)}, {rx.recipes[rx.recipes.length - 1].qty} таблеток (бланк № {rx.recipes[rx.recipes.length - 1].blank}).{' '}
                  <span className="muted">Как принимать: </span>
                  {rx.recipes[rx.recipes.length - 1].signa.charAt(0).toLocaleLowerCase('ru-RU') + rx.recipes[rx.recipes.length - 1].signa.slice(1)}
                </div>
              ) : null}
              <ul className="bullets small">
                <li>Если пропустили приём — не принимайте двойную дозу, следующую примите в обычное время</li>
                <li>Во время лечения не садитесь за руль и воздержитесь от алкоголя — так сказано в инструкции</li>
                <li>Не меняйте приём сами — обсудите с врачом</li>
              </ul>
            </>
          ) : (
            <div className="small ink-2">План лечения появится здесь после решения врача.</div>
          )}
          {p.nextVisitAt && <div className="small">Следующий приём: {fmtDate(p.nextVisitAt)}, {fmtTime(p.nextVisitAt)}</div>}
        </div>

        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row strong" style={{ gap: 8 }}>
            <Pill size={18} color="var(--brand)" /> Мои лекарства
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {rx && <span className="badge badge-brand badge-lg">маритупирдин («Авиандр»)</span>}
            {p.meds.map((m) => (
              <span key={m} className="badge badge-outline badge-lg">
                {m}
              </span>
            ))}
            {!p.meds.length && !rx && <span className="small muted">Нет</span>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="Начал(а) принимать другое лекарство…" value={med} onChange={(e) => setMed(e.target.value)} />
            <button
              className="btn btn-soft btn-icon"
              aria-label="Добавить"
              onClick={() => {
                if (!med.trim()) return;
                const alerts = reportMed(p.id, med, 'Добавлено пациентом в профиле');
                setMed('');
                toast(alerts.length ? 'Врач уведомлён о новом лекарстве' : 'Лекарство добавлено', { sub: 'Пожалуйста, ничего не меняйте в приёме сами' });
              }}
            >
              <Plus />
            </button>
          </div>
          <div className="xs muted">Укажите международное название (например, «дифенгидрамин»). Врач увидит изменения и проверит сочетание.</div>
        </div>

        <div className="card card-pad stack" style={{ gap: 12 }}>
          <div className="row strong" style={{ gap: 8 }}>
            <ShieldCheck size={18} color="var(--brand)" /> Мои согласия
          </div>
          {p.consents.map((c) => {
            const t = CONSENT_TEXT[c.purpose];
            const on = Boolean(c.signedAt) && !c.revokedAt;
            return (
              <div key={c.purpose} className="stack" style={{ gap: 8 }}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      if (!e.target.checked && t.required) return setRevoke(c.purpose);
                      setConsent(p.id, c.purpose, e.target.checked);
                    }}
                  />
                  <span className="stack" style={{ gap: 2 }}>
                    <span className="strong small">
                      {t.title} {t.required && <span className="badge" style={{ height: 18 }}>обязательно</span>}
                    </span>
                    <span className="xs muted">{t.text}</span>
                    <span className="xs muted">{on ? `Подписано ${fmtDate(c.signedAt!)} · ${c.version}` : c.revokedAt ? `Отозвано ${fmtDate(c.revokedAt)}` : 'Не дано'}</span>
                  </span>
                </label>
                {revoke === c.purpose && (
                  <div className="callout callout-amber small stack" style={{ gap: 8 }}>
                    <span>Без этого согласия врач не сможет вести вас дистанционно. Отозвать?</span>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => {
                          setConsent(p.id, c.purpose, false);
                          setRevoke(null);
                        }}
                      >
                        Отозвать
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setRevoke(null)}>
                        Оставить
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="callout small">
          <Scale />
          <span>{REFUSAL_TEXT}</span>
        </div>

        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row strong" style={{ gap: 8 }}>
            <UserPlus size={18} color="var(--brand)" /> Доверенное лицо
          </div>
          {editTrusted ? (
            <TrustedForm
              initial={p.trustedPerson}
              onCancel={() => setEditTrusted(false)}
              onSave={(c) => {
                setTrustedContact(p.id, c);
                setEditTrusted(false);
                toast('Доверенное лицо сохранено', { tone: 'ok', sub: SCOPE_TEXT[c.scope] });
              }}
            />
          ) : p.trustedPerson ? (
            <>
              <div className="small">
                <b>{p.trustedPerson.name}</b> · {p.trustedPerson.relation}
                <div className="xs muted">
                  {p.trustedPerson.channel === 'sms' ? 'SMS' : 'Почта'}: {p.trustedPerson.contact} · {SCOPE_TEXT[p.trustedPerson.scope]}
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setEditTrusted(true)}>
                  Изменить
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setTrustedContact(p.id, null)}>
                  Удалить
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="small ink-2">Не назначено. Можно указать родственника, опекуна или законного представителя — он будет получать только то, что вы выберете.</div>
              <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditTrusted(true)}>
                <UserPlus /> Указать
              </button>
            </>
          )}
        </div>

        <div className="card card-pad stack" style={{ gap: 8 }}>
          <div className="row strong" style={{ gap: 8 }}>
            <Bell size={18} color="var(--brand)" /> Напоминания
          </div>
          <select id="pr-channel" className="select" value={p.reminderChannel} onChange={(e) => setReminderChannel(p.id, e.target.value as keyof typeof CHANNEL)}>
            {(Object.keys(CHANNEL) as (keyof typeof CHANNEL)[]).map((k) => (
              <option key={k} value={k}>
                {CHANNEL[k]}
              </option>
            ))}
          </select>
          <div className="xs muted">
            Тексты напоминаний: «Компас: время отметить приём по вашему плану», «Компас: время сделать короткую запись». Ни названия болезни, ни препарата — в том числе в письмах на почту.
          </div>
        </div>

        <MyDocuments patientId={p.id} />

        <Link to="/patient/centers" className="btn btn-soft btn-block">
          <MapPinned /> Куда обратиться, если нужна другая помощь
        </Link>

        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="strong">Мои данные</div>
          <ul className="bullets small">
            <li>Записи, сообщения, голосовые и документы хранятся в зашифрованном виде — это врачебная тайна.</li>
            <li>В SMS, push, письмах и мессенджерах — только нейтральный текст, без диагноза и названия лекарства.</li>
            <li>Голосовой ввод в Chrome и Edge распознаёт сервис браузера через интернет; если не хотите — печатайте текст.</li>
          </ul>
          <div className="grid-2" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={exportData}>
              <Download /> Копия данных
            </button>
            <button className="btn btn-sm btn-outline-danger" onClick={() => toast('Запрос на удаление отправлен', { sub: 'В пилоте — по регламенту клиники и 152-ФЗ' })}>
              <Trash2 /> Удалить
            </button>
          </div>
        </div>

        <div className="callout small">
          <Info />
          <span>
            Компас — помощник между приёмами. Он не ставит диагноз, не назначает и не отменяет лечение и не заменяет врача или экстренную помощь. Решения принимает ваш лечащий врач.
          </span>
        </div>
      </div>
    </>
  );
}
