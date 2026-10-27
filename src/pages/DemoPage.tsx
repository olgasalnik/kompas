import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, CircleDashed, FastForward, MonitorSmartphone, Play, RotateCcw, Siren, SplitSquareHorizontal, Stethoscope, UserRoundCheck, Zap } from 'lucide-react';
import { useDB, standNow } from '../store/db';
import { setSession } from '../store/session';
import { demoRedAlert, resetStand, setDemoSpeed, timeTravel } from '../store/api';
import { SCENARIOS } from '../store/scenarios';
import { scenarioChecks } from '../store/scenarioChecks';
import { fmtDateTime } from '../core/time';
import { Logo } from '../ui/Logo';
import { openSecondWindow } from '../ui/DemoDock';
import { toast } from '../ui/Toasts';
import { MetricsPanel } from '../doctor/MetricsPage';
import { ConfirmButton } from '../ui/Inline';

const SCRIPT = [
  ['0:00–0:40', 'Проблема: врачу не хватает информации между визитами', 'Запрос врача и фармы'],
  ['0:40–1:30', 'Врач приглашает пациента; пациент принимает согласия', 'Условия 1, 2, 10'],
  ['1:30–2:30', 'Чек-ин и PHQ-9/GAD-7; данные у врача за секунды; «перемотка» 6 недель', 'Функции 1, 4, 5'],
  ['2:30–3:30', 'Сценарии 1 и 2: показание совпадает и «вне инструкции»; «Почему?»', 'Функция 2; условия 4, 7, 8'],
  ['3:30–4:15', 'Сценарии 3 и 4: взаимодействие и СТОП (беременность)', 'Функция 3; условия 6, 7'],
  ['4:15–5:15', 'Сценарий 5: красный сигнал с замером и эскалацией', 'Условие 5; метрика 1'],
  ['5:15–5:45', 'Сценарий 6: пропуски, нежелательные явления, приверженность', 'Функция 7'],
  ['5:45–6:30', 'Сценарий 7: режим «Терапевт», ОБЯЗАТЕЛЬНО / ЖЕЛАТЕЛЬНО', 'Функция 8; условие 6'],
  ['6:30–7:00', 'Закон, регистрация, пилот и что дальше', 'Условие 9'],
];

export function DemoPage() {
  const db = useDB();
  const nav = useNavigate();
  const now = standNow(db);
  const scenarios = SCENARIOS.filter((s) => s.n);
  const all = scenarios.map((s) => scenarioChecks(db, s.n!, now));
  const passed = all.reduce((n, c) => n + c.filter((x) => x.ok).length, 0);
  const total = all.reduce((n, c) => n + c.length, 0);

  const openDoctor = (pid: string) => {
    setSession({ role: 'doctor', userId: 'd1' });
    nav(`/doctor/patient/${pid}`);
  };

  return (
    <div className="landing">
      <header className="landing-top">
        <Logo sub="Демо-стенд · синтетические данные" />
        <Link to="/" className="btn btn-ghost btn-sm">
          <ArrowLeft /> На главную
        </Link>
      </header>
      <div className="stack" style={{ gap: 22 }}>
        <div className="row spread wrap row-top" style={{ gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 'var(--fs-4xl)' }}>7 клинических сценариев с «Авиандром»</h1>
            <p className="hero-lead" style={{ marginTop: 10 }}>
              Каждый сценарий — профиль пациента, рекомендации по лечению и маршрутизация. Эталонные результаты проверяются автоматически прямо на стенде.
            </p>
          </div>
          <div className="card card-pad stack" style={{ gap: 6, minWidth: 220 }}>
            <span className="small muted">Эталонные проверки</span>
            <span className="stat-value" style={{ fontSize: 34 }}>
              {passed} <small>из {total}</small>
            </span>
            <span className="xs muted">Сценарий 5 засчитывается после запуска сигнала</span>
          </div>
        </div>

        <section className="card card-pad stack" style={{ gap: 14 }}>
          <div className="row spread wrap" style={{ gap: 10 }}>
            <div className="card-title">
              <MonitorSmartphone /> Как показывать: два окна
            </div>
            <span className="small muted">Время стенда: {fmtDateTime(now)}</span>
          </div>
          <p className="small ink-2">
            Пациент — на телефоне или в узком окне, врач — на ноутбуке. Данные расходятся между окнами мгновенно, время доставки сигнала измеряется. Стенд работает без интернета.
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn" onClick={() => openSecondWindow('/patient?as=p5')}>
              <SplitSquareHorizontal /> Окно пациента (Сергей П.)
            </button>
            <button className="btn" onClick={() => openSecondWindow('/doctor')}>
              <SplitSquareHorizontal /> Окно врача
            </button>
            <span className="grow" />
            <button
              className="btn btn-sm"
              onClick={() => {
                timeTravel(7);
                toast('Перемотка: +7 дней');
              }}
            >
              <FastForward /> +7 дней
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                timeTravel(42);
                toast('Перемотка: +6 недель');
              }}
            >
              <FastForward /> +6 недель
            </button>
            <button className="btn btn-sm" onClick={() => setDemoSpeed(db.settings.demoSpeed > 1 ? 1 : 60)}>
              <Zap /> {db.settings.demoSpeed > 1 ? 'Эскалация: 1 с = 1 мин' : 'Эскалация: реальное время'}
            </button>
            <ConfirmButton
              className="btn btn-sm btn-ghost"
              label={
                <>
                  <RotateCcw /> Сброс стенда
                </>
              }
              question="Вернуть исходные данные?"
              confirmLabel="Сбросить"
              onConfirm={() => {
                resetStand();
                toast('Стенд сброшен', { tone: 'ok' });
              }}
            />
          </div>
        </section>

        <div className="grid-2">
          {scenarios.map((s, i) => {
            const p = db.patients.find((x) => x.scenario === s.n)!;
            const checks = all[i];
            const ok = checks.filter((c) => c.ok).length;
            return (
              <article key={s.key} className="card card-pad stack" style={{ gap: 12 }}>
                <div className="row spread row-top" style={{ gap: 10 }}>
                  <div className="row row-top" style={{ gap: 12 }}>
                    <span className="feature-num" style={{ width: 36, height: 36, fontSize: 15 }}>
                      {s.n}
                    </span>
                    <div className="stack" style={{ gap: 2 }}>
                      <h3>{s.title}</h3>
                      <span className="small muted">
                        {p.name}, {p.age} · {p.code} · {p.diagnosis.code}
                      </span>
                    </div>
                  </div>
                  <span className={`badge badge-lg ${ok === checks.length ? 'badge-mint' : 'badge-amber'}`}>
                    {ok}/{checks.length}
                  </span>
                </div>
                <p className="small ink-2">{s.goal}</p>
                <ul className="list-plain stack" style={{ gap: 5 }}>
                  {checks.map((c) => (
                    <li key={c.label} className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
                      {c.ok ? <CheckCircle2 size={16} color="var(--mint)" style={{ flex: 'none', marginTop: 2 }} /> : <CircleDashed size={16} color="var(--ink-3)" style={{ flex: 'none', marginTop: 2 }} />}
                      <span className={c.ok ? '' : 'muted'}>{c.label}</span>
                    </li>
                  ))}
                </ul>
                <details>
                  <summary className="small" style={{ cursor: 'pointer', color: 'var(--brand)', fontWeight: 600 }}>
                    Шаги показа
                  </summary>
                  <ol className="bullets small" style={{ marginTop: 6 }}>
                    {s.demo.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ol>
                </details>
                <div className="row wrap" style={{ gap: 8, marginTop: 'auto' }}>
                  {s.n === 7 ? (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        setSession({ role: 'therapist', userId: 't1' });
                        nav('/therapist');
                      }}
                    >
                      <UserRoundCheck /> Режим «Терапевт»
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => openDoctor(p.id)}>
                      <Stethoscope /> Досье у врача
                    </button>
                  )}
                  {s.n !== 7 && (
                    <button className="btn btn-sm" onClick={() => openSecondWindow(`/patient?as=${p.id}`)}>
                      <SplitSquareHorizontal /> Кабинет пациента
                    </button>
                  )}
                  {s.n === 5 && (
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => {
                        const a = demoRedAlert(p.id);
                        toast(a.length ? 'Пациент отправил PHQ-9 с пунктом 9 = 2' : 'Сигнал уже создан — сбросьте стенд, чтобы повторить', { tone: a.length ? 'red' : 'default' });
                      }}
                    >
                      <Siren /> Запустить сигнал
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Play /> Сценарий показа на 7 минут
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {SCRIPT.map(([t, w, c]) => (
                  <tr key={t}>
                    <td className="nowrap strong small">{t}</td>
                    <td className="small">{w}</td>
                    <td className="small muted">{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stack" style={{ gap: 12 }}>
          <h2>Замеры на стенде</h2>
          <MetricsPanel />
        </section>
      </div>
    </div>
  );
}
