import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import {
  Activity,
  BookMarked,
  Clock3,
  GaugeCircle,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  Moon,
  QrCode,
  ScrollText,
  Sparkles,
  UserRoundCheck,
  FileCheck2,
  IdCard,
  LockKeyhole,
} from 'lucide-react';
import { StaffCount, StaffPage } from './StaffPage';
import { PrivacyPage } from './PrivacyPage';
import { useDB, standNow } from '../store/db';
import { setSession, useSession } from '../store/session';
import { ackAlert, markDelivered, setAiMode } from '../store/api';
import type { AiMode } from '../core/types';
import { fmtDateTime, fmtDuration } from '../core/time';
import { Logo } from '../ui/Logo';
import { toast } from '../ui/Toasts';
import { useTicker } from '../ui/hooks';
import { AlertModal, escalationInfo } from './AlertModal';
import { Dashboard } from './Dashboard';
import { PatientPage } from './PatientPage';
import { SourcesPage } from './SourcesPage';
import { JournalPage } from './JournalPage';
import { MetricsPage } from './MetricsPage';
import { InvitePage } from './InvitePage';
import { isOpen, visiblePatients } from './select';
import { InboxPage, threadStatus } from './InboxPage';
import { isWorking } from '../core/schedule';

const AlertCtx = createContext<(id: string) => void>(() => {});
export const useOpenAlert = () => useContext(AlertCtx);

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.55);
  } catch {
    /* звук недоступен */
  }
}

export function DoctorApp() {
  const db = useDB();
  const s = useSession();
  const nav = useNavigate();
  const [alertId, setAlertId] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const me = s.role === 'doctor' && s.userId ? s.userId : 'd1';
  const user = db.users.find((u) => u.id === me)!;

  useEffect(() => {
    if (s.role !== 'doctor') setSession({ role: 'doctor', userId: 'd1' });
  }, [s.role]);

  // Доставка: вкладка врача получает новые сигналы своих пациентов и фиксирует время доставки
  const mine = visiblePatients(db, me).map((p) => p.id);
  useEffect(() => {
    const undelivered = db.alerts.filter((a) => !a.deliveredAt && mine.includes(a.patientId)).map((a) => a.id);
    if (undelivered.length) markDelivered(undelivered);
    if (seen.current === null) {
      seen.current = new Set(db.alerts.map((a) => a.id));
      return;
    }
    for (const a of db.alerts) {
      if (seen.current.has(a.id) || !mine.includes(a.patientId)) continue;
      seen.current.add(a.id);
      const p = db.patients.find((x) => x.id === a.patientId);
      if (a.level === 'red') {
        beep();
        toast(`Красный сигнал: ${p?.name}`, { tone: 'red', sub: a.title, ms: 7000 });
      } else if (a.level === 'orange') toast(`Оранжевый сигнал: ${p?.name}`, { sub: a.title });
    }
  }, [db, mine.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AlertCtx.Provider value={setAlertId}>
      <div className="app">
        <aside className={`sidebar ${menu ? 'open' : ''}`} onClick={() => setMenu(false)}>
          <Logo sub="Кабинет врача" />
          <nav className="nav">
            <NavLink to="/doctor" end>
              <LayoutDashboard /> Сигналы и пациенты
              <SignalCount />
            </NavLink>
            <NavLink to="/doctor/messages">
              <MessagesSquare /> Сообщения
              <InboxCount me={me} />
            </NavLink>
            <NavLink to="/doctor/invite">
              <QrCode /> Пригласить пациента
            </NavLink>
            <div className="nav-label">Справочно</div>
            <NavLink to="/doctor/sources">
              <BookMarked /> Источники и правила
            </NavLink>
            <NavLink to="/doctor/staff">
              <IdCard /> Сотрудники и документы
              <StaffCount />
            </NavLink>
            <NavLink to="/doctor/privacy">
              <LockKeyhole /> Защита данных
            </NavLink>
            <NavLink to="/doctor/journal">
              <ScrollText /> Журнал аудита
            </NavLink>
            <NavLink to="/doctor/metrics">
              <GaugeCircle /> Метрики стенда
            </NavLink>
            <div className="nav-label">Другие роли</div>
            <button onClick={() => nav('/therapist')}>
              <UserRoundCheck /> Режим «Терапевт»
            </button>
            <button onClick={() => nav('/case')}>
              <FileCheck2 /> Соответствие кейсу
            </button>
          </nav>
          <div className="sidebar-foot">
            <div className="user-chip" title={`${user.credentials.education}\n${user.credentials.accreditation}`}>
              <div className="avatar avatar-sm">{user.initials}</div>
              <div className="grow">
                <div className="name">{user.name}</div>
                <div className="role">{user.title}</div>
                <div className="role">График: {user.schedule.label}</div>
              </div>
            </div>
            <select
              className="select"
              value={me}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setSession({ role: 'doctor', userId: e.target.value })}
              aria-label="Войти как"
              style={{ minHeight: 36, fontSize: 13 }}
            >
              <option value="d1">Лечащий врач</option>
              <option value="d2">Дежурный врач (эскалация 1)</option>
              <option value="h1">Заведующая (эскалация 2)</option>
            </select>
          </div>
        </aside>
        <div className="main">
          <RedBanner me={me} onOpen={setAlertId} />
          <header className="topbar">
            <button className="btn btn-ghost btn-icon mobile-nav-toggle" onClick={() => setMenu(true)} aria-label="Меню">
              <Menu />
            </button>
            <StandClock me={me} />
            <div className="grow" />
            <AiModeSwitch me={me} />
          </header>
          <main className="content">
            <Routes>
              <Route index element={<Dashboard me={me} />} />
              <Route path="patient/:id" element={<PatientPage me={me} />} />
              <Route path="sources" element={<SourcesPage />} />
              <Route path="journal" element={<JournalPage />} />
              <Route path="metrics" element={<MetricsPage />} />
              <Route path="invite" element={<InvitePage me={me} />} />
              <Route path="messages" element={<InboxPage me={me} />} />
              <Route path="staff" element={<StaffPage me={me} />} />
              <Route path="privacy" element={<PrivacyPage me={me} />} />
            </Routes>
          </main>
        </div>
      </div>
      {alertId && <AlertModal alertId={alertId} onClose={() => setAlertId(null)} />}
    </AlertCtx.Provider>
  );
}

function SignalCount() {
  const db = useDB();
  const n = db.alerts.filter((a) => isOpen(a) && a.level !== 'yellow').length;
  const red = db.alerts.some((a) => isOpen(a) && a.level === 'red');
  return n ? <span className={`badge ${red ? 'badge-solid-red' : 'badge-orange'}`}>{n}</span> : null;
}

function InboxCount({ me }: { me: string }) {
  const db = useDB();
  const n = visiblePatients(db, me).filter((p) => threadStatus(db, p.id).status === 'new').length;
  return n ? <span className="badge badge-brand">{n}</span> : null;
}

function StandClock({ me }: { me: string }) {
  const db = useDB();
  useTicker(1000);
  const now = standNow(db);
  const user = db.users.find((u) => u.id === me);
  const inHours = user ? isWorking(user.schedule, now) : true;
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <span className="stand-clock" title="Время стенда (с учётом симулятора)">
        <Clock3 /> {fmtDateTime(now)}
      </span>
      <span className={`badge badge-lg ${inHours ? 'badge-mint' : 'badge-info'}`} title={user ? `Ваш график: ${user.schedule.label}` : undefined}>
        {inHours ? <Activity /> : <Moon />}
        {user?.schedule.roundTheClock ? 'Дежурство: все сигналы' : inHours ? 'Рабочее время' : 'Нерабочее время: только красные сигналы'}
      </span>
      {db.settings.timeOffsetMs > 0 && <span className="badge badge-amber badge-lg">Симулятор: +{Math.round(db.settings.timeOffsetMs / 86400000)} дн.</span>}
    </div>
  );
}

const MODES: { v: AiMode; label: string; icon: JSX.Element; hint: string }[] = [
  { v: 'mentor', label: 'Наставник', icon: <GraduationCap />, hint: 'Сначала своя гипотеза, затем подсказка с обоснованием; решения — через супервизора' },
  { v: 'practice', label: 'Практик', icon: <Sparkles />, hint: 'Досье, сигналы, предложения и черновик по кнопке' },
  { v: 'silent', label: 'Тихий', icon: <Moon />, hint: 'Только безопасность: сигналы, противопоказания, взаимодействия' },
];

function AiModeSwitch({ me }: { me: string }) {
  const db = useDB();
  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="small muted nowrap">Режим ИИ</span>
      <div className="segmented" role="group" aria-label="Режим ИИ">
        {MODES.map((m) => (
          <button key={m.v} aria-pressed={db.settings.aiMode === m.v} title={m.hint} onClick={() => setAiMode(m.v, me)}>
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RedBanner({ me, onOpen }: { me: string; onOpen: (id: string) => void }) {
  const db = useDB();
  const now = useTicker(1000);
  const mine = visiblePatients(db, me).map((p) => p.id);
  const reds = db.alerts.filter((a) => a.level === 'red' && !a.ackAt && isOpen(a) && mine.includes(a.patientId));
  if (!reds.length) return null;
  const a = reds[0];
  const p = db.patients.find((x) => x.id === a.patientId);
  const esc = escalationInfo(a, db.settings.demoSpeed, db.settings.escalationMinutes, now);
  return (
    <div className="red-banner" role="alert">
      <span className="pulse-dot" />
      <div className="grow stack" style={{ gap: 2 }}>
        <div>
          <b>КРАСНЫЙ СИГНАЛ · {p?.name}</b> — {a.title}
          {reds.length > 1 && ` (+ ещё ${reds.length - 1})`}
        </div>
        <div className="meta">
          {a.deliveryMs !== undefined ? `Доставлен за ${fmtDuration(a.deliveryMs)}` : 'Доставляется…'} ·{' '}
          {esc.next !== null ? `эскалация на ${a.escalationStep === 0 ? 'дежурного' : 'заведующую'} через ${fmtDuration(esc.leftRealMs ?? 0)}` : 'эскалация выполнена'}
          {a.escalationStep > 0 && ` · уже уведомлён: ${a.escalationStep === 1 ? 'дежурный врач' : 'дежурный и заведующая'}`}
        </div>
      </div>
      <button className="btn btn-sm btn-ghost-inv" onClick={() => onOpen(a.id)}>
        Открыть
      </button>
      <button className="btn btn-sm" onClick={() => ackAlert(a.id, me)}>
        Принять в работу
      </button>
    </div>
  );
}
