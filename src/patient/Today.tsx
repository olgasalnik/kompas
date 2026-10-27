import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Bot,
  CalendarCheck,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardList,
  Clock,
  HeartPulse,
  MapPinned,
  MessageCircle,
  NotebookPen,
  Pill,
  SunMedium,
  Moon,
  Video,
  X,
  Sparkles,
} from 'lucide-react';
import { useDB, standNow } from '../store/db';
import { markDose, requestTelemedByPatient } from '../store/api';
import { MISS_REASONS, SLOT_HOURS, slotKey } from '../core/adherence';
import type { MissReason } from '../core/types';
import { at, fmtDateLong, fmtTime, fmtDate, plural } from '../core/time';
import { isWorking, replyText } from '../core/schedule';
import { useTicker } from '../ui/hooks';
import { toast } from '../ui/Toasts';
import { PromptButton } from '../ui/Inline';
import { NotificationsBell } from './Notifications';
import { SupplyNote } from './Supply';
import { CHANNEL } from './Profile';
import { credentialStatus, fmtUntil } from '../core/credentials';
import { firstName, greeting, pendingScales, SCALE_TIME, SCALE_TITLE } from './util';

export function Today({ patientId }: { patientId: string }) {
  const db = useDB();
  useTicker(30000);
  const now = standNow(db);
  const nav = useNavigate();
  const p = db.patients.find((x) => x.id === patientId)!;
  const doctor = db.users.find((u) => u.id === p.doctorId);
  const docCred = doctor ? credentialStatus(doctor.credentials, now) : null;
  const rx = [...db.prescriptions].reverse().find((r) => r.patientId === p.id && (r.status === 'confirmed' || r.status === 'modified'));
  const todayCi = db.checkins.filter((c) => c.patientId === p.id && new Date(c.at).toDateString() === now.toDateString()).pop();
  const scales = pendingScales(db, p, now);
  const [aboutDoctor, setAboutDoctor] = useState(false);

  return (
    <>
      <div className="p-header">
        <div className="stack" style={{ gap: 2 }}>
          <span className="small muted">{fmtDateLong(now)}</span>
          <span className="p-title">
            {greeting(now)}, {firstName(p)}
          </span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <NotificationsBell patientId={p.id} />
          <Link to="/patient/me" className="avatar" aria-label="Профиль">
            {p.name.slice(0, 1)}
          </Link>
        </div>
      </div>
      <div className="p-scroll">
        <button className="sos-btn" onClick={() => nav('/patient/sos')}>
          <span className="sos-icon">
            <HeartPulse />
          </span>
          <span>
            Мне тяжело сейчас
            <small>Упражнение, связь с врачом и помощь</small>
          </span>
          <ChevronRight style={{ marginLeft: 'auto' }} size={20} />
        </button>

        <section className="p-section">
          <div className="eyebrow">Приём препарата</div>
          {rx ? (
            <div className="card dose-card">
              <div className="row spread">
                <div className="row" style={{ gap: 10 }}>
                  <div className="role-icon" style={{ width: 38, height: 38, borderRadius: 12 }}>
                    <Pill />
                  </div>
                  <div>
                    <div className="strong">«Авиандр», 20 мг</div>
                    <div className="xs muted">По плану врача · за 30 минут до еды</div>
                  </div>
                </div>
              </div>
              <DoseSlotRow patientId={p.id} slot="morning" now={now} />
              <DoseSlotRow patientId={p.id} slot="evening" now={now} />
              <SupplyNote patientId={p.id} rx={rx} />
              <Link to="/patient/help#bot" className="xs muted row" style={{ gap: 6, paddingTop: 2 }}>
                <Bot size={13} /> Компас-бот напомнит в 08:00 и 20:00 · {CHANNEL[p.reminderChannel]}
              </Link>
            </div>
          ) : (
            <div className="card card-pad stack" style={{ gap: 6 }}>
              <div className="row" style={{ gap: 10 }}>
                <ClipboardList size={20} color="var(--brand)" />
                <span className="strong">План лечения обсуждается с врачом</span>
              </div>
              <p className="small ink-2">Пока ведите дневник самочувствия — врач увидит динамику до следующего приёма. Назначение появится здесь только после решения врача.</p>
            </div>
          )}
        </section>

        <section className="p-section">
          <div className="eyebrow">Самочувствие</div>
          {todayCi ? (
            <div className="card card-pad row" style={{ gap: 12 }}>
              <div className="role-icon" style={{ width: 40, height: 40, background: 'var(--mint-soft)', color: 'var(--mint)' }}>
                <Check />
              </div>
              <div className="grow">
                <div className="strong">Запись за сегодня сделана</div>
                <div className="xs muted">
                  в {fmtTime(todayCi.at)} · врач увидит её в карточке
                </div>
              </div>
              <Link to="/patient/checkin" className="btn btn-ghost btn-sm">
                Ещё
              </Link>
            </div>
          ) : (
            <Link to="/patient/checkin" className="card card-interactive card-pad row" style={{ gap: 12, color: 'inherit' }}>
              <div className="role-icon" style={{ width: 40, height: 40 }}>
                <Sparkles />
              </div>
              <div className="grow">
                <div className="strong">Как вы сегодня?</div>
                <div className="xs muted">Настроение, тревога, сон — меньше минуты</div>
              </div>
              <ChevronRight size={20} color="var(--ink-3)" />
            </Link>
          )}
        </section>

        {scales.length > 0 && (
          <section className="p-section">
            <div className="eyebrow">Врач просит заполнить</div>
            <div className="stack" style={{ gap: 8 }}>
              {scales.map((s) => (
                <Link key={s.scale} to={`/patient/scale/${s.scale}`} className="card card-interactive card-pad row" style={{ gap: 12, color: 'inherit' }}>
                  <div className="role-icon" style={{ width: 40, height: 40, background: 'var(--amber-soft)', color: 'var(--amber)' }}>
                    <ClipboardList />
                  </div>
                  <div className="grow">
                    <div className="strong">{SCALE_TITLE[s.scale]}</div>
                    <div className="xs muted">
                      {SCALE_TIME[s.scale]} · {s.reason}
                    </div>
                  </div>
                  <ChevronRight size={20} color="var(--ink-3)" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {p.nextVisitAt && (
          <section className="p-section">
            <div className="eyebrow">Перед приёмом</div>
            <Link to="/patient/previsit" className="card card-interactive card-pad row" style={{ gap: 12, color: 'inherit' }}>
              <div className="role-icon" style={{ width: 40, height: 40 }}>
                <NotebookPen />
              </div>
              <div className="grow">
                <div className="strong">{p.previsit ? 'Заметка к приёму отправлена' : 'Расскажите врачу заранее'}</div>
                <div className="xs muted">
                  Приём {fmtDate(p.nextVisitAt)} в {fmtTime(p.nextVisitAt)} · что беспокоит и что хотите обсудить
                </div>
              </div>
              <ChevronRight size={20} color="var(--ink-3)" />
            </Link>
          </section>
        )}

        <section className="p-section">
          <div className="eyebrow">Ваш врач</div>
          {doctor && docCred && (
            <div className="card card-pad stack" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 12 }}>
                <div className="avatar">{doctor.initials}</div>
                <div className="grow">
                  <div className="strong">{doctor.name}</div>
                  <div className="xs muted">{doctor.title}</div>
                </div>
              </div>
              <div className="row small ink-2" style={{ gap: 8 }}>
                <Clock size={15} /> График: {doctor.schedule.label}
              </div>
              <div className={`row small ${isWorking(doctor.schedule, now) ? 'ink-2' : 'muted'}`} style={{ gap: 8 }}>
                <MessageCircle size={15} /> {replyText(doctor.schedule, now)}
              </div>
              {p.lastVisitAt && (
                <div className="row small ink-2" style={{ gap: 8 }}>
                  <CalendarCheck size={15} /> Последний приём: {fmtDate(p.lastVisitAt)}
                </div>
              )}
              {p.nextVisitAt && (
                <div className="row small ink-2" style={{ gap: 8 }}>
                  <CalendarClock size={15} />
                  Следующий приём: {fmtDate(p.nextVisitAt)}, {fmtTime(p.nextVisitAt)}
                </div>
              )}
              <div className="row wrap" style={{ gap: 8 }}>
                <span className={`badge ${docCred.status === 'verified' || docCred.status === 'expiring' ? 'badge-mint' : 'badge-outline'}`}>
                  <BadgeCheck /> {docCred.status === 'verified' || docCred.status === 'expiring' ? `Документы проверены клиникой · ${doctor.credentials.checkedAt}` : 'Документы на проверке'}
                </span>
                <button className="link-btn small" onClick={() => setAboutDoctor(!aboutDoctor)}>
                  {aboutDoctor ? 'Скрыть' : 'Образование и аккредитация'}
                </button>
              </div>
              {aboutDoctor && (
                <div className="callout small stack fade-in" style={{ gap: 4, display: 'flex' }}>
                  <span>
                    <b>Образование:</b> {doctor.credentials.education}
                  </span>
                  <span>
                    <b>Диплом:</b> {doctor.credentials.diploma}
                  </span>
                  <span>
                    <b>Аккредитация:</b> {doctor.credentials.accreditation}, действует до {fmtUntil(doctor.credentials.accreditationUntil)}
                  </span>
                  <span>
                    <b>Стаж:</b> {doctor.credentials.experienceYears} {plural(doctor.credentials.experienceYears, 'год', 'года', 'лет')}
                  </span>
                  <span className="xs">
                    Сведения проверены клиникой в реестре: {doctor.credentials.registry}, {doctor.credentials.checkedAt}. Данные синтетические.
                  </span>
                </div>
              )}
              <Link to="/patient/chat" className="btn btn-soft btn-block">
                <MessageCircle /> Написать врачу
              </Link>
              <PromptButton
                className="btn btn-ghost btn-sm btn-block"
                label={
                  <>
                    <Video /> Попросить онлайн-консультацию
                  </>
                }
                placeholder="Что хотите обсудить? Удобное время?"
                minLength={3}
                submitLabel="Отправить просьбу"
                onSubmit={(t) => {
                  requestTelemedByPatient(p.id, t);
                  toast('Просьба отправлена врачу', { sub: 'Онлайн-консультация проводится после очного приёма — время подтвердит клиника' });
                }}
              />
            </div>
          )}
          <Link to="/patient/centers" className="link-btn small" style={{ marginTop: 10, marginLeft: 4 }}>
            <MapPinned /> Куда обратиться, если нужна другая помощь
          </Link>
        </section>
      </div>
    </>
  );
}

function DoseSlotRow({ patientId, slot, now }: { patientId: string; slot: 'morning' | 'evening'; now: Date }) {
  const db = useDB();
  const [askReason, setAskReason] = useState(false);
  const key = slotKey(now, slot);
  const ev = db.medEvents.filter((e) => e.patientId === patientId && slotKey(new Date(e.scheduledAt), e.slot) === key).pop();
  const time = at(now, SLOT_HOURS[slot]);
  const future = time.getTime() - now.getTime() > 2 * 3600_000;
  const mark = (status: 'taken' | 'missed' | 'later', reason?: MissReason) => {
    const alerts = markDose(patientId, slot, status, reason);
    if (status === 'taken') toast('Отмечено: принял(а)', { tone: 'ok' });
    if (status === 'later') toast('Напомню позже', { sub: 'Без медицинских подробностей в уведомлении' });
    if (alerts.some((a) => a.level !== 'yellow')) toast('Врач уведомлён', { sub: 'Пожалуйста, ничего не меняйте в приёме сами' });
    setAskReason(false);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row spread small">
        <span className="row strong" style={{ gap: 6 }}>
          {slot === 'morning' ? <SunMedium size={16} color="var(--amber)" /> : <Moon size={16} color="var(--brand)" />}
          {slot === 'morning' ? 'Утро' : 'Вечер'} · {fmtTime(time)}
        </span>
        {ev && (
          <span className={`badge ${ev.status === 'taken' ? 'badge-mint' : ev.status === 'missed' ? 'badge-red' : 'badge-amber'}`}>
            {ev.status === 'taken' ? 'Принял(а)' : ev.status === 'missed' ? 'Пропуск' : 'Позже'} · {fmtTime(ev.recordedAt)}
          </span>
        )}
      </div>
      {(!ev || ev.status === 'later') && !askReason && (
        <div className="dose-actions">
          <button className="dose-btn is-taken" onClick={() => mark('taken')} disabled={future}>
            <Check /> Принял(а)
          </button>
          <button className="dose-btn" onClick={() => setAskReason(true)} disabled={future}>
            <X /> Пропустил(а)
          </button>
          <button className={`dose-btn ${ev?.status === 'later' ? 'is-later' : ''}`} onClick={() => mark('later')} disabled={future}>
            <Clock /> Позже
          </button>
        </div>
      )}
      {askReason && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="small ink-2">Что помешало? Это поможет врачу.</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {(Object.keys(MISS_REASONS) as MissReason[]).map((r) => (
              <button key={r} className="chip" onClick={() => mark('missed', r)}>
                {MISS_REASONS[r]}
              </button>
            ))}
          </div>
          <button className="link-btn small" onClick={() => setAskReason(false)}>
            Отмена
          </button>
        </div>
      )}
      {future && !ev && <div className="xs muted">Отметить можно ближе ко времени приёма</div>}
    </div>
  );
}
