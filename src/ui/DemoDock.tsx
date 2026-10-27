import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FastForward, FlaskConical, RotateCcw, Siren, SplitSquareHorizontal, X, Zap } from 'lucide-react';
import { useDB } from '../store/db';
import { demoRedAlert, resetStand, setDemoSpeed, timeTravel } from '../store/api';
import { fmtDateTime } from '../core/time';
import { useStandNow } from './hooks';
import { toast } from './Toasts';
import { ConfirmButton } from './Inline';

/** Второе окно для показа «врач + пациент». Если браузер или встроенный просмотрщик не открывает окна — переходим здесь же. */
export function openSecondWindow(hash: string) {
  const url = `${location.origin}${location.pathname}${location.search}#${hash}`;
  let w: Window | null = null;
  try {
    w = window.open(url, `kompas_${hash.replace(/\W/g, '')}`, 'width=480,height=900');
  } catch {
    w = null;
  }
  if (!w) {
    location.hash = hash;
    toast('Открыто в этом окне', { sub: 'Второе окно здесь недоступно — переключайтесь между ролями через главную' });
  }
}

export function DemoDock() {
  const loc = useLocation();
  const db = useDB();
  const now = useStandNow(5000);
  const [open, setOpen] = useState(false);
  // На главной и странице демо кнопка не нужна; при автоматических скриншотах — тоже
  if (loc.pathname === '/' || loc.pathname === '/demo' || navigator.webdriver) return null;
  const fast = db.settings.demoSpeed > 1;
  return (
    <div className="demo-dock">
      {open && (
        <div className="demo-pop">
          <div className="row spread">
            <div className="stack" style={{ gap: 0 }}>
              <div className="strong">Демо-стенд</div>
              <div className="xs muted">Синтетические данные · время стенда {fmtDateTime(now)}</div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setOpen(false)} aria-label="Закрыть">
              <X />
            </button>
          </div>
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={() => {
              const a = demoRedAlert();
              toast('Сценарий 5 запущен', { sub: a.length ? `Пациент Сергей П. отправил PHQ-9 · создано сигналов: ${a.length}` : 'Сигнал уже создан ранее — сбросьте стенд', tone: a.length ? 'red' : 'default' });
            }}
          >
            <Siren /> Сценарий 5: красный сигнал
          </button>
          <div className="grid-2" style={{ gap: 8 }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                timeTravel(7);
                toast('Перемотка: +7 дней', { sub: 'Сгенерированы записи по траекториям пациентов' });
              }}
            >
              <FastForward /> +7 дней
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                timeTravel(42);
                toast('Перемотка: +6 недель', { sub: 'Откройте вкладку «Динамика» у пациента' });
              }}
            >
              <FastForward /> +6 недель
            </button>
          </div>
          <button className="btn btn-sm" onClick={() => setDemoSpeed(fast ? 1 : 60)}>
            <Zap /> {fast ? 'Ускорение эскалации: 1 с = 1 мин' : 'Реальное время эскалации'}
          </button>
          <div className="grid-2" style={{ gap: 8 }}>
            <button className="btn btn-sm" onClick={() => openSecondWindow('/patient')}>
              <SplitSquareHorizontal /> Окно пациента
            </button>
            <button className="btn btn-sm" onClick={() => openSecondWindow('/doctor')}>
              <SplitSquareHorizontal /> Окно врача
            </button>
          </div>
          <div className="row spread">
            <Link to="/demo" className="link-btn" onClick={() => setOpen(false)}>
              Все 7 сценариев →
            </Link>
            <ConfirmButton
              className="btn btn-ghost btn-sm"
              label={
                <>
                  <RotateCcw /> Сброс
                </>
              }
              question="Сбросить?"
              confirmLabel="Да"
              onConfirm={() => {
                resetStand();
                toast('Стенд сброшен', { tone: 'ok' });
              }}
            />
          </div>
        </div>
      )}
      <button className="demo-dock-btn" onClick={() => setOpen(!open)}>
        <FlaskConical /> Демо
      </button>
    </div>
  );
}
