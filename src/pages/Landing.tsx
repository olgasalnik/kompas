import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  BookOpenCheck,
  ClipboardCheck,
  Compass,
  FlaskConical,
  HeartHandshake,
  LineChart,
  Lock,
  MessagesSquare,
  Pill,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  UserRoundCheck,
  Waypoints,
} from 'lucide-react';
import { Logo } from '../ui/Logo';
import { Signal } from '../ui/Signals';
import { Spark } from '../ui/Charts';
import { setSession } from '../store/session';

const TASKS = [
  { n: 1, icon: <ClipboardCheck />, title: 'Стандартизированная оценка', text: 'PHQ-4, PHQ-9, GAD-7 с автоподсчётом по ключу; отдельная обработка пункта 9; ввод HAM-D / HAM-A / MADRS врачом.' },
  { n: 2, icon: <BookOpenCheck />, title: 'Справка по терапии', text: 'Карточки КР Минздрава и паспорт «Авиандра» из ГРЛС; метка «вне инструкции — решение врача».' },
  { n: 3, icon: <ShieldCheck />, title: 'Риски и нежелательные явления', text: 'Правила СТОП и ВНИМАНИЕ по инструкции, чек-лист факторов, журнал НЯ и черновик извещения.' },
  { n: 4, icon: <LineChart />, title: 'Мониторинг динамики', text: 'Досье на 30 секунд: что изменилось с прошлого визита, графики с отметками событий.' },
  { n: 5, icon: <Smartphone />, title: 'Самоотчёт пациента', text: 'Чек-ин за минуту и до 5 нажатий, свои графики, кнопка «Мне тяжело сейчас».' },
  { n: 6, icon: <MessagesSquare />, title: 'Каналы связи', text: 'Чат с карточкой контекста за 7 дней, честные часы ответа, напоминания без медицинских данных.' },
  { n: 7, icon: <Pill />, title: 'Приверженность', text: 'Принял / пропустил / позже, причины пропусков, индекс за 7 и 28 дней, время до сигнала врачу.' },
  { n: 8, icon: <Waypoints />, title: 'Маршрутизация к психиатру', text: 'Режим «Терапевт»: красные флаги и категории ОБЯЗАТЕЛЬНО / ЖЕЛАТЕЛЬНО со сроком и источником.' },
];

export function Landing() {
  const nav = useNavigate();
  const go = (path: string, role: 'doctor' | 'patient' | 'therapist' | null, extra: Record<string, string> = {}) => {
    if (role) setSession({ role, ...extra });
    nav(path);
  };
  return (
    <div className="landing">
      <header className="landing-top">
        <Logo sub="Клинический компас · прототип" />
        <nav className="row wrap" style={{ gap: 8 }}>
          <Link to="/case" className="btn btn-ghost btn-sm">
            Соответствие кейсу
          </Link>
          <Link to="/demo" className="btn btn-soft btn-sm">
            <FlaskConical /> Демо-сценарии
          </Link>
        </nav>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow" style={{ color: 'var(--brand)' }}>
            Цифровой ассистент врача и пациента · тревожно-депрессивные состояния
          </div>
          <h1 style={{ marginTop: 14 }}>
            Видеть пациента <em>между визитами</em> и вовремя узнавать о главном
          </h1>
          <p className="hero-lead">
            Пациент за минуту отмечает самочувствие и приём препарата. Компас считает шкалы, проверяет правила безопасности по клиническим рекомендациям и инструкции,
            а врач получает досье на 30 секунд и сигналы — и принимает решения сам.
          </p>
          <div className="row wrap" style={{ gap: 10, marginTop: 26 }}>
            <button className="btn btn-primary btn-lg" onClick={() => go('/doctor', 'doctor', { userId: 'd1' })}>
              <Stethoscope /> Я врач
            </button>
            <button className="btn btn-lg" onClick={() => go('/patient', 'patient')}>
              <Smartphone /> Я пациент
            </button>
          </div>
          <div className="hero-formula">
            <Compass /> Врач решает. Компас помнит, считает, проверяет и вовремя зовёт.
          </div>
        </div>

        <div className="hero-art" aria-hidden="true">
          <div className="stack" style={{ gap: 12, position: 'relative', zIndex: 1 }}>
            <div className="row spread">
              <div className="row" style={{ gap: 10 }}>
                <div className="avatar">АК</div>
                <div>
                  <div className="strong">Пациентка П-034, 34 года</div>
                  <div className="xs muted">ГТР · «Авиандр», 6-я неделя</div>
                </div>
              </div>
              <span className="badge badge-ai">Досье за 30 секунд</span>
            </div>
            <div className="mini-stats">
              <div className="stat">
                <span className="stat-label">GAD-7</span>
                <span className="stat-value">
                  7 <small>из 21</small>
                </span>
                <span className="stat-delta delta-good">−8 за 6 нед</span>
              </div>
              <div className="stat">
                <span className="stat-label">Приём, 7 дн</span>
                <span className="stat-value">93%</span>
                <span className="stat-delta delta-flat">13 из 14</span>
              </div>
              <div className="stat">
                <span className="stat-label">Тревога</span>
                <Spark values={[8, 8, 7, 7, 6, 6, 5, 4, 4, 3]} width={90} height={34} />
                <span className="stat-delta delta-good">снижается</span>
              </div>
            </div>
            <Signal variant="warn" compact kicker="ВНИМАНИЕ · проверьте сочетание" title="Новый препарат: дифенгидрамин (CYP2D6)" />
            <Signal variant="must" compact kicker="ОБЯЗАТЕЛЬНО: психиатр" meta="в тот же день" title="Пункт 9 PHQ-9 ≥ 2 — красный сигнал, эскалация через 10 мин" />
            <Signal variant="should" compact kicker="ЖЕЛАТЕЛЬНО: психотерапия (КПТ)" meta="в течение 4 недель" title="Можно отложить с комментарием" />
          </div>
        </div>
      </section>

      <div className="role-grid">
        <button className="card card-interactive role-card" onClick={() => go('/doctor', 'doctor', { userId: 'd1' })}>
          <div className="role-icon">
            <Stethoscope />
          </div>
          <h3>Я врач</h3>
          <p>Панель сигналов, досье на 30 секунд, проверка «Авиандра», предложения «Принять / Изменить / Отклонить».</p>
          <span className="role-go">
            Открыть <ArrowRight />
          </span>
        </button>
        <button className="card card-interactive role-card" onClick={() => go('/patient', 'patient')}>
          <div className="role-icon" style={{ background: 'var(--mint-soft)', color: 'var(--mint)' }}>
            <HeartHandshake />
          </div>
          <h3>Я пациент</h3>
          <p>Отметка приёма, чек-ин за минуту, шкалы, справка по своему препарату, связь с врачом и экран поддержки.</p>
          <span className="role-go">
            Открыть <ArrowRight />
          </span>
        </button>
        <button className="card card-interactive role-card" onClick={() => go('/therapist', 'therapist', { userId: 't1' })}>
          <div className="role-icon" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>
            <UserRoundCheck />
          </div>
          <h3>Я терапевт</h3>
          <p>Скрининг, красные флаги и «что исключить», маршрут ОБЯЗАТЕЛЬНО / ЖЕЛАТЕЛЬНО к психиатру с критериями.</p>
          <span className="role-go">
            Открыть <ArrowRight />
          </span>
        </button>
        <button className="card card-interactive role-card" onClick={() => nav('/demo')}>
          <div className="role-icon" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
            <BellRing />
          </div>
          <h3>Демо-сценарии</h3>
          <p>7 клинических сценариев с «Авиандром», живой красный сигнал с замером времени, симулятор 6 недель.</p>
          <span className="role-go">
            Открыть <ArrowRight />
          </span>
        </button>
      </div>

      <div className="section-title">
        <div>
          <div className="eyebrow">Что делает инструмент</div>
          <h2 style={{ marginTop: 6 }}>8 задач кейса — 8 модулей</h2>
        </div>
        <Link to="/case" className="link-btn">
          Таблица соответствия <ArrowRight />
        </Link>
      </div>
      <div className="grid-4">
        {TASKS.map((t) => (
          <div key={t.n} className="card card-pad stack" style={{ gap: 10 }}>
            <div className="row spread">
              <span className="feature-num">{t.n}</span>
              <span style={{ color: 'var(--brand)' }}>{t.icon}</span>
            </div>
            <h4 style={{ fontSize: 'var(--fs-base)' }}>{t.title}</h4>
            <p className="small ink-2">{t.text}</p>
          </div>
        ))}
      </div>

      <div className="section-title">
        <div>
          <div className="eyebrow">Петля безопасности</div>
          <h2 style={{ marginTop: 6 }}>От ответа пациента до решения врача</h2>
        </div>
      </div>
      <div className="grid-4">
        {[
          { icon: <Smartphone />, t: 'Пациент отвечает', d: 'Шкала, заметка, отметка приёма или «Мне тяжело сейчас».' },
          { icon: <ShieldCheck />, t: 'Правила проверяют', d: 'Детерминированные правила с версией и источником — не «мнение модели».' },
          { icon: <BellRing />, t: 'Врач получает сигнал', d: 'Экран + push + SMS без медицинских данных; без подтверждения — эскалация.' },
          { icon: <Stethoscope />, t: 'Врач решает', d: 'Принять, изменить или отклонить. Всё — в журнале со временем.' },
        ].map((s, i) => (
          <div key={i} className="card card-pad stack" style={{ gap: 10 }}>
            <div className="role-icon" style={{ width: 40, height: 40 }}>
              {s.icon}
            </div>
            <div className="strong">
              {i + 1}. {s.t}
            </div>
            <p className="small ink-2">{s.d}</p>
          </div>
        ))}
      </div>

      <div className="disclaimer row row-top" style={{ gap: 12 }}>
        <Lock size={18} style={{ flex: 'none', marginTop: 2, color: 'var(--brand)' }} />
        <div className="stack" style={{ gap: 6 }}>
          <b>Демонстрационный прототип на синтетических данных.</b>
          <span>
            Не является медицинским изделием и не применяется к реальным пациентам. Система не ставит диагноз, не назначает и не отменяет терапию — это делает только врач.
            Пороги сигналов и критерии маршрутизации — предложение команды, требующее подписи клинического эксперта. Сведения о препарате — по листку-вкладышу из ГРЛС (сверить с
            актуальной ОХЛП). Данные хранятся только в этом браузере.
          </span>
        </div>
      </div>
    </div>
  );
}
