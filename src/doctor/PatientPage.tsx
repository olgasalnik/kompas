import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  ClipboardCopy,
  ClipboardList,
  FileHeart,
  LineChart,
  MessagesSquare,
  Paperclip,
  Pill,
  ScrollText,
  Stethoscope,
  Video,
  Waypoints,
  LayoutList,
} from 'lucide-react';
import { getDB, useDB, standNow } from '../store/db';
import { archivePatient, recordMetric, restorePatient, viewPatient } from '../store/api';
import { fmtDate, fmtTime, plural } from '../core/time';
import { PromptButton } from '../ui/Inline';
import { DocumentsTab } from './tabs/Documents';
import { TelemedModal } from './Telemed';
import { copyText, usePatientView } from '../ui/hooks';
import { toast } from '../ui/Toasts';
import { anamnesisText, misSummary, openAlerts, therapyWeek } from './select';
import { DossierTab } from './tabs/Dossier';
import { TherapyTab } from './tabs/Therapy';
import { DynamicsTab } from './tabs/Dynamics';
import { MessagesTab } from './tabs/Messages';
import { RoutingTab } from './tabs/Routing';
import { JournalTab } from './tabs/Journal';
import { evaluateRouting } from '../core/clinical';
import { checkTherapy } from '../core/clinical';

const TABS = [
  { id: 'dossier', label: 'Досье', icon: <LayoutList /> },
  { id: 'therapy', label: 'Терапия и безопасность', icon: <Pill /> },
  { id: 'dynamics', label: 'Динамика', icon: <LineChart /> },
  { id: 'messages', label: 'Сообщения', icon: <MessagesSquare /> },
  { id: 'documents', label: 'Документы', icon: <Paperclip /> },
  { id: 'routing', label: 'Маршрутизация', icon: <Waypoints /> },
  { id: 'journal', label: 'Журнал', icon: <ScrollText /> },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export function PatientPage({ me }: { me: string }) {
  const { id } = useParams();
  const db = useDB();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as TabId) ?? 'dossier';
  const v = usePatientView(id);
  const t0 = useRef(performance.now());
  const [telemed, setTelemed] = useState(false);

  useEffect(() => {
    if (!id) return;
    viewPatient(id, me);
  }, [id, me]);

  // Замер: время открытия досье (метрика быстродействия)
  useEffect(() => {
    if (!v) return;
    const ms = performance.now() - t0.current;
    const code = v.p.code;
    t0.current = performance.now();
    setTimeout(() => recordMetric('dossier_render', ms, code), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!v) return <div className="empty">Пациент не найден</div>;
  const { p } = v;
  const now = standNow(db);
  const wk = therapyWeek(p, db, now);
  const rx = [...db.prescriptions].reverse().find((r) => r.patientId === p.id && (r.status === 'confirmed' || r.status === 'modified'));
  const alerts = openAlerts(db, p.id);
  const unread = db.messages.filter((m) => m.patientId === p.id && m.from === 'patient' && !m.readByDoctor).length;
  const route = evaluateRouting(v.facts).category;
  const therapy = checkTherapy(v.facts);
  const newDocs = db.documents.filter((d) => d.patientId === p.id && !d.viewedByDoctor).length;
  const setTab = (t: TabId) => setParams(t === 'dossier' ? {} : { tab: t }, { replace: true });

  return (
    <div className="stack fade-in" style={{ gap: 18 }}>
      <Link to="/doctor" className="link-btn small" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft /> Все пациенты
      </Link>
      <div className="card card-pad-lg">
        <div className="patient-head">
          <div className="avatar avatar-lg">{p.name.slice(0, 1)}</div>
          <div className="grow stack" style={{ gap: 6 }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <h1 style={{ fontSize: 26 }}>{p.name}</h1>
              <span className="badge badge-outline badge-lg">{p.code}</span>
              <span className="badge badge-outline badge-lg" title="Медицинская карта: история ведётся по номеру">
                карта {p.cardNo}
              </span>
              {p.scenario && <span className="badge badge-brand badge-lg">Сценарий {p.scenario}</span>}
              {p.archived && <span className="badge badge-amber badge-lg">В архиве с {fmtDate(p.archived.at)}</span>}
              <span className="badge badge-lg">синтетический профиль</span>
            </div>
            <div className="patient-meta">
              <span>
                {p.age} {plural(p.age, 'год', 'года', 'лет')}, {p.sex === 'f' ? 'женщина' : 'мужчина'}
              </span>
              <span>
                <FileHeart /> {p.diagnosis.code} · {p.diagnosis.label} <span className="muted">(внёс врач)</span>
              </span>
              <span>
                <Pill /> {rx ? `«Авиандр» ${rx.offLabel ? '(вне инструкции) ' : ''}· ${wk}-я неделя` : 'Терапия не назначена'}
              </span>
              <span>
                <CalendarCheck /> Последний приём: {p.lastVisitAt ? fmtDate(p.lastVisitAt) : '—'}
              </span>
              {p.nextVisitAt && (
                <span>
                  <CalendarClock /> Следующий: {fmtDate(p.nextVisitAt)}, {fmtTime(p.nextVisitAt)}
                </span>
              )}
              <span>
                <Stethoscope /> Ведёт: {db.users.find((u) => u.id === p.doctorId)?.name}
              </span>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button
              className="btn"
              onClick={async () => {
                const ok = await copyText(misSummary(getDB(), p, now));
                toast(ok ? 'Скопировано для МИС' : 'Не удалось скопировать', { sub: 'Форматированный текст: терапия, приверженность, шкалы, НЯ, сигналы', tone: ok ? 'ok' : 'default' });
              }}
            >
              <ClipboardCopy /> Скопировать в МИС
            </button>
            <button
              className="btn"
              onClick={async () => {
                const ok = await copyText(anamnesisText(getDB(), p, now));
                toast(ok ? 'Анамнез скопирован' : 'Не удалось скопировать', { sub: 'Жалобы, анамнез заболевания, лекарственный и аллергологический анамнез, факторы риска', tone: ok ? 'ok' : 'default' });
              }}
            >
              <ClipboardList /> Скопировать анамнез
            </button>
            <button className="btn" onClick={() => setTelemed(true)}>
              <Video /> Телемедконсультация
            </button>
            {p.archived ? (
              <button className="btn btn-ghost" onClick={() => restorePatient(p.id, me)}>
                <ArchiveRestore /> Вернуть из архива
              </button>
            ) : (
              <PromptButton
                className="btn btn-ghost"
                label={
                  <>
                    <Archive /> В архив
                  </>
                }
                placeholder="Причина: наблюдение завершено, переведён к другому врачу…"
                minLength={5}
                submitLabel="Перевести в архив"
                onSubmit={(r) => {
                  archivePatient(p.id, me, r);
                  toast('Пациент переведён в архив', { sub: 'История сохраняется; найти можно через фильтр «Архив» и поиск' });
                }}
              />
            )}
          </div>
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 16 }}>
          {alerts.slice(0, 3).map((a) => (
            <span key={a.id} className={`badge badge-${a.level} badge-lg`}>
              <span className="dot" /> {a.title}
            </span>
          ))}
          {therapy.stops.length > 0 && <span className="badge badge-solid-red badge-lg">СТОП: {therapy.stops[0].rule.title}</span>}
          {therapy.offLabel && <span className="badge badge-amber badge-dashed badge-lg">Вне инструкции — решение врача</span>}
          {route && (
            <span className={`badge badge-lg ${route === 'desirable' ? 'badge-amber badge-dashed' : 'badge-red'}`}>
              {route === 'urgent' ? 'ОБЯЗАТЕЛЬНО · экстренно' : route === 'mandatory' ? 'ОБЯЗАТЕЛЬНО' : 'ЖЕЛАТЕЛЬНО'}: направление
            </span>
          )}
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} className="tab" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.icon}
            {t.label}
            {t.id === 'messages' && unread > 0 && <span className="badge badge-brand">{unread}</span>}
            {t.id === 'documents' && newDocs > 0 && <span className="badge badge-brand">{newDocs}</span>}
            {t.id === 'therapy' && (therapy.stops.length > 0 || therapy.warns.length > 0) && (
              <span className={`badge ${therapy.stops.length ? 'badge-red' : 'badge-orange'}`}>{therapy.stops.length + therapy.warns.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'dossier' && <DossierTab v={v} me={me} goTab={setTab} />}
      {tab === 'therapy' && <TherapyTab v={v} me={me} />}
      {tab === 'dynamics' && <DynamicsTab v={v} />}
      {tab === 'messages' && <MessagesTab v={v} me={me} />}
      {tab === 'documents' && <DocumentsTab patientId={p.id} me={me} />}
      {telemed && <TelemedModal v={v} me={me} onClose={() => setTelemed(false)} />}
      {tab === 'routing' && <RoutingTab v={v} me={me} />}
      {tab === 'journal' && <JournalTab v={v} />}
    </div>
  );
}
