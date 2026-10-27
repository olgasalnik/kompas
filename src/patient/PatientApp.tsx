import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, Home, LineChart, MessageCircle, Phone, ShieldCheck, Siren, SplitSquareHorizontal, UserRound, Wind } from 'lucide-react';
import { useDB } from '../store/db';
import { setSession, useSession } from '../store/session';
import { confirmSafe, sosAction } from '../store/api';
import { CompassMark, Logo } from '../ui/Logo';
import { openSecondWindow } from '../ui/DemoDock';
import { toast } from '../ui/Toasts';
import { Today } from './Today';
import { CheckinPage } from './Checkin';
import { ScaleRunner } from './ScaleRunner';
import { SosPage } from './Sos';
import { HelpPage } from './Help';
import { ChatPage } from './Chat';
import { DiaryPage } from './Diary';
import { ProfilePage } from './Profile';
import { PatientLogin, Onboarding } from './Onboarding';
import { PATIENT_TEXTS } from '../store/api';
import { HelpCentersPage } from './HelpCenters';
import { PrevisitPage } from './Previsit';

export function PatientApp() {
  const db = useDB();
  const session = useSession();
  const [params] = useSearchParams();

  useEffect(() => {
    const as = params.get('as');
    if (as && db.patients.some((p) => p.id === as)) setSession({ role: 'patient', patientId: as });
  }, [params, db.patients]);

  const patient = session.role === 'patient' ? db.patients.find((p) => p.id === session.patientId) : undefined;

  return (
    <div className="phone-stage">
      <div className="phone">
        {!patient ? <PatientLogin /> : !patient.onboarded ? <Onboarding patient={patient} /> : <PatientShell patientId={patient.id} />}
      </div>
      <aside className="phone-side stack" style={{ gap: 14 }}>
        <Logo sub="Кабинет пациента" />
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <div className="strong">Как показывать</div>
          <p className="small ink-2">
            Откройте кабинет врача во втором окне. Всё, что вводит пациент, сразу попадает в карточку его лечащего врача — без участия третьих лиц.
          </p>
          <button className="btn btn-sm" onClick={() => openSecondWindow('/doctor')}>
            <SplitSquareHorizontal /> Открыть кабинет врача
          </button>
        </div>
        <div className="card card-soft card-pad stack" style={{ gap: 8 }}>
          <div className="strong small">Чего нет в интерфейсе пациента</div>
          <ul className="bullets small">
            <li>диагнозов и «градаций тяжести»</li>
            <li>самостоятельных изменений лечения</li>
            <li>успокаивающих заключений вроде «всё в порядке»</li>
          </ul>
        </div>
        {patient && (
          <button className="btn btn-ghost btn-sm" onClick={() => setSession({ role: 'patient' })}>
            Сменить пациента (демо)
          </button>
        )}
      </aside>
    </div>
  );
}

function PatientShell({ patientId }: { patientId: string }) {
  const db = useDB();
  const loc = useLocation();
  const onSos = loc.pathname.endsWith('/sos');
  const unread = db.messages.some((m) => m.patientId === patientId && !m.readByPatient && m.from !== 'patient');
  const redOpen = db.alerts.find((a) => a.patientId === patientId && a.level === 'red' && !a.patientSafeAt && a.status !== 'closed' && a.status !== 'false_positive');
  return (
    <>
      <Routes>
        <Route index element={<Today patientId={patientId} />} />
        <Route path="checkin" element={<CheckinPage patientId={patientId} />} />
        <Route path="scale/:scale" element={<ScaleRunner patientId={patientId} />} />
        <Route path="sos" element={<SosPage patientId={patientId} />} />
        <Route path="help" element={<HelpPage patientId={patientId} />} />
        <Route path="chat" element={<ChatPage patientId={patientId} />} />
        <Route path="diary" element={<DiaryPage patientId={patientId} />} />
        <Route path="me" element={<ProfilePage patientId={patientId} />} />
        <Route path="centers" element={<HelpCentersPage />} />
        <Route path="previsit" element={<PrevisitPage patientId={patientId} />} />
      </Routes>
      <nav className="p-nav" aria-label="Разделы">
        <NavLink to="/patient" end>
          <Home />
          Сегодня
        </NavLink>
        <NavLink to="/patient/diary">
          <LineChart />
          Дневник
        </NavLink>
        <NavLink to="/patient/help">
          <BookOpen />
          Помощник
        </NavLink>
        <NavLink to="/patient/chat">
          <MessageCircle />
          Врач
          {unread && <span className="nav-dot" />}
        </NavLink>
        <NavLink to="/patient/me">
          <UserRound />
          Профиль
        </NavLink>
      </nav>
      {redOpen && !onSos && <SafeOverlay patientId={patientId} />}
    </>
  );
}

/** Безопасный экран: показывается сам при красном сигнале. «Я в безопасности» не закрывает сигнал у врача. */
function SafeOverlay({ patientId }: { patientId: string }) {
  const nav = useNavigate();
  const [calling, setCalling] = useState<string | null>(null);
  return (
    <div className="sos-screen" role="alertdialog" aria-label="Поддержка">
      <div className="row" style={{ gap: 10 }}>
        <CompassMark size={30} />
        <span className="strong">Компас рядом</span>
      </div>
      <div className="stack" style={{ gap: 14, marginTop: 28 }}>
        <h2 style={{ fontSize: 26 }}>Мы здесь, с вами</h2>
        <p style={{ fontSize: 'var(--fs-lg)', color: 'var(--ink-2)' }}>{PATIENT_TEXTS.red}</p>
      </div>
      <div className="stack" style={{ gap: 10, marginTop: 'auto', paddingTop: 24 }}>
        <button
          className="btn btn-danger btn-xl btn-block"
          onClick={() => {
            sosAction(patientId, 'call_112');
            setCalling('112');
          }}
        >
          <Siren /> Позвонить 112
        </button>
        <button
          className="btn btn-xl btn-block"
          onClick={() => {
            sosAction(patientId, 'call_doctor');
            setCalling('врачу');
          }}
        >
          <Phone /> Позвонить врачу
        </button>
        <button className="btn btn-soft btn-lg btn-block" onClick={() => nav('/patient/sos')}>
          <Wind /> Дыхательное упражнение
        </button>
        <button
          className="btn btn-success btn-lg btn-block"
          onClick={() => {
            confirmSafe(patientId);
            toast('Спасибо, что сообщили', { sub: 'Врач всё равно свяжется с вами', tone: 'ok' });
          }}
        >
          <ShieldCheck /> Я в безопасности
        </button>
        {calling && <div className="callout small">В демонстрации звонок не совершается. В приложении откроется набор номера ({calling}); номера настраивает клиника под регион.</div>}
      </div>
    </div>
  );
}
