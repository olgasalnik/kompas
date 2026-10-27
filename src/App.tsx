import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { PatientApp } from './patient/PatientApp';
import { DoctorApp } from './doctor/DoctorApp';
import { TherapistApp } from './therapist/TherapistApp';
import { DemoPage } from './pages/DemoPage';
import { CasePage } from './pages/CasePage';
import { ToastHost, toast } from './ui/Toasts';
import { PERSIST_ERROR_EVENT } from './store/db';
import { DemoDock } from './ui/DemoDock';

/** При смене страницы — наверх (вкладки внутри карточки пациента прокрутку не сбрасывают) */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Если браузер не дал сохранить данные — сказать об этом, а не терять записи молча */
function PersistWarning() {
  useEffect(() => {
    const h = (e: Event) => toast('Данные не сохраняются', { sub: (e as CustomEvent<string>).detail });
    window.addEventListener(PERSIST_ERROR_EVENT, h);
    return () => window.removeEventListener(PERSIST_ERROR_EVENT, h);
  }, []);
  return null;
}

export function App() {
  return (
    <HashRouter>
      <ScrollToTop />
      <PersistWarning />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/patient/*" element={<PatientApp />} />
        <Route path="/doctor/*" element={<DoctorApp />} />
        <Route path="/therapist" element={<TherapistApp />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/case" element={<CasePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DemoDock />
      <ToastHost />
    </HashRouter>
  );
}
