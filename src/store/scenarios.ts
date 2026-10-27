// Семь демонстрационных клинических сценариев с «Авиандром» (раздел 5.7 рабочего документа) и три фоновых
// пациента для реалистичного списка врача. Все профили СИНТЕТИЧЕСКИЕ.
import type { MissReason, Patient, PatientFactors } from '../core/types';

export const NO_FACTORS: PatientFactors = {
  pregnant: false,
  breastfeeding: false,
  epilepsy: false,
  renalModerateSevere: false,
  hepaticImpairment: false,
  maoi: false,
  allergy: false,
  drives: false,
  cardio: false,
  endocrine: false,
  substanceDependence: false,
  alcohol: 'none',
};

export interface HistorySpec {
  therapyDaysAgo: number | null; // начало «Авиандра»; null — терапия ещё не назначена
  monitorDaysAgo: number; // с какого дня пациент ведёт дневник
  phq9: [number, number]; // исходно → сейчас
  gad7: [number, number];
  item9?: [number, number];
  adherence: number; // вероятность приёма каждой дозы
  forcedMisses?: { lastDoses: number; missed: number[]; reason: MissReason }; // индексы с конца (0 — последняя доза)
  aes?: { term: string; severity: 'mild' | 'moderate'; fromDay: number; toDay?: number }[];
  noEntriesLastDays?: number;
  messages?: { daysAgo: number; hour: number; from: 'patient' | 'doctor'; text: string }[];
  medLog?: { name: string; daysAgo: number; by: 'patient' | 'doctor'; note?: string }[];
}

export interface ScenarioDef {
  n?: number; // номер сценария (у фоновых пациентов нет)
  key: string;
  title: string;
  goal: string;
  expected: string[]; // эталон — что система обязана показать (основа автотестов)
  demo: string[]; // шаги для демонстрации
  patient: Omit<
    Patient,
    'id' | 'cardNo' | 'inviteCode' | 'consents' | 'onboarded' | 'reminderChannel' | 'trustedPerson' | 'tone' | 'lastVisitAt' | 'nextVisitAt' | 'therapyStart' | 'medLog' | 'archived' | 'previsit'
  > & {
    tone?: Patient['tone'];
  };
  history: HistorySpec;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    n: 1,
    key: 's1',
    title: 'Классическое ГТР: показание совпадает',
    goal: 'Профиль, шкалы, рекомендации КР и паспорт препарата; врач проверяет противопоказания и принимает решение.',
    expected: [
      'Показание совпадает (ГТР, взрослая) — правило AVI-IND-GAD',
      'Противопоказаний нет, сигналов нет',
      'Предупреждения: алкоголь, ранние нежелательные явления',
      'Предложение «Рассмотреть режим по инструкции» — статус «Предложено» до подписи врача',
      'Маршрутизация: ЖЕЛАТЕЛЬНО — психотерапия (КПТ)',
    ],
    demo: ['Открыть досье Анны К.', 'Вкладка «Терапия» → «Почему?» у показания', 'Принять предложение — назначение подписано врачом', 'Симулятор: перемотать 6 недель → динамика GAD-7'],
    patient: {
      code: 'П-034',
      name: 'Анна К.',
      age: 34,
      sex: 'f',
      scenario: 1,
      doctorId: 'd1',
      diagnosis: { code: 'F41.1', label: 'Генерализованное тревожное расстройство' },
      complaints: '8 месяцев постоянное беспокойство, напряжение, нарушение сна',
      meds: [],
      factors: { ...NO_FACTORS, alcohol: 'rare' },
      trajectory: 'improving',
    },
    history: { therapyDaysAgo: null, monitorDaysAgo: 7, phq9: [8, 8], gad7: [15, 15], adherence: 1 },
  },
  {
    n: 2,
    key: 's2',
    title: 'Депрессия доминирует: вне показаний',
    goal: 'Система не выдаёт препарат автоматически; метка «ВНЕ ИНСТРУКЦИИ — решение врача» и источники для проверки.',
    expected: [
      'Метка «ВНЕ ИНСТРУКЦИИ — решение врача» (AVI-OFFLABEL)',
      'Препарат не предлагается автоматически',
      'Карточка КР «Депрессивный эпизод, РДР»; чек-лист «что исключить»',
      'Маршрутизация: ЖЕЛАТЕЛЬНО — психиатр (PHQ-9 15–19)',
    ],
    demo: ['Открыть досье Михаила С.', 'Вкладка «Терапия»: метка «вне инструкции», «Почему?»', 'Показать, что назначение возможно только с обоснованием врача'],
    patient: {
      code: 'П-041',
      name: 'Михаил С.',
      age: 41,
      sex: 'm',
      scenario: 2,
      doctorId: 'd1',
      diagnosis: { code: 'F32.1', label: 'Депрессивный эпизод средней степени' },
      complaints: 'Снижение интереса и энергии в течение 6 недель',
      meds: [],
      factors: { ...NO_FACTORS, drives: true },
      trajectory: 'stable',
    },
    history: { therapyDaysAgo: null, monitorDaysAgo: 5, phq9: [17, 17], gad7: [11, 11], adherence: 1 },
  },
  {
    n: 3,
    key: 's3',
    title: 'Сочетанный приём: возможное взаимодействие',
    goal: 'Врач видит сочетание, основание правила и источник. Пациенту не предлагается самостоятельно менять терапию.',
    expected: [
      'ВНИМАНИЕ: антидепрессанты (сертралин) — AVI-IX-ANTIDEPRESSANTS',
      'ВНИМАНИЕ: ингибиторы CYP2D6 (дифенгидрамин) — AVI-IX-CYP2D6',
      'Оранжевый сигнал врачу (IX-NEW-MED)',
      'Пациенту: «ничего не меняйте сами» — без клинических указаний',
      'Маршрутизация: ЖЕЛАТЕЛЬНО — консультация психиатра по комбинации',
    ],
    demo: ['Панель сигналов → оранжевый сигнал Елены В.', '«Почему?» → правило, факты, раздел инструкции', 'Принять в работу, ответить шаблоном'],
    patient: {
      code: 'П-038',
      name: 'Елена В.',
      age: 38,
      sex: 'f',
      scenario: 3,
      doctorId: 'd1',
      diagnosis: { code: 'F41.1', label: 'Генерализованное тревожное расстройство' },
      complaints: 'Тревога, напряжение; сертралин назначен другим врачом',
      meds: ['сертралин', 'дифенгидрамин'],
      factors: { ...NO_FACTORS },
      trajectory: 'improving',
    },
    history: {
      therapyDaysAgo: 21,
      monitorDaysAgo: 24,
      phq9: [10, 8],
      gad7: [16, 12],
      adherence: 0.96,
      medLog: [
        { name: 'сертралин', daysAgo: 60, by: 'doctor', note: 'Назначен другим врачом (со слов пациентки)' },
        { name: 'дифенгидрамин', daysAgo: 1, by: 'patient', note: 'Средство от простуды с антигистаминным компонентом' },
      ],
      messages: [
        { daysAgo: 1, hour: 19, from: 'patient', text: 'Простыла, начала пить средство от простуды с дифенгидрамином. Можно ли вместе с Авиандром?' },
      ],
    },
  },
  {
    n: 4,
    key: 's4',
    title: 'Противопоказание: беременность — жёсткая остановка',
    goal: 'Обычный путь подтверждения блокируется; основание отображается и фиксируется в журнале.',
    expected: [
      'СТОП: беременность — противопоказание по инструкции (AVI-CI-PREGNANCY)',
      'Предложение препарата заблокировано, сигнал нельзя скрыть',
      'Нелекарственные варианты по КР (психотерапия)',
      'Маршрутизация: ОБЯЗАТЕЛЬНО — психиатр и акушер-гинеколог, 1–2 недели',
    ],
    demo: ['Открыть досье Ольги Н.', 'Вкладка «Терапия»: красная плашка СТОП', 'Кнопка назначения заблокирована; исключение — только с обоснованием'],
    patient: {
      code: 'П-029',
      name: 'Ольга Н.',
      age: 29,
      sex: 'f',
      scenario: 4,
      doctorId: 'd1',
      diagnosis: { code: 'F41.1', label: 'Генерализованное тревожное расстройство' },
      complaints: 'Тревога, беспокойство о течении беременности (10 недель)',
      meds: [],
      factors: { ...NO_FACTORS, pregnant: true },
      trajectory: 'stable',
    },
    history: { therapyDaysAgo: null, monitorDaysAgo: 4, phq9: [9, 9], gad7: [14, 14], adherence: 1 },
  },
  {
    n: 5,
    key: 's5',
    title: 'Красный алерт: суицидальные мысли на 10-й день',
    goal: 'Ответ пациента запускает уведомление врача, безопасный экран и эскалацию при отсутствии подтверждения.',
    expected: [
      'КРАСНЫЙ: пункт 9 PHQ-9 = 2 (SAFETY-PHQ9-ITEM9) и кризисная фраза (SAFETY-CRISIS-TEXT)',
      'Пациенту — безопасное сообщение, «Позвонить врачу», «112», «Я в безопасности»',
      'Врачу — push + SMS + экран; без подтверждения 10 мин — дежурный, 30 мин — заведующая',
      'Чек-лист действий врача; терапия не меняется',
      'Маршрутизация: ОБЯЗАТЕЛЬНО · экстренно, в тот же день',
    ],
    demo: ['Открыть кабинет пациента Сергея П. на телефоне', 'Пройти PHQ-9 (пункт 9 — «Более недели»), заметка «не вижу смысла»', 'На экране врача — красный сигнал с замером времени доставки', 'Не подтверждать 10 секунд (= 10 минут) — эскалация на дежурного'],
    patient: {
      code: 'П-045',
      name: 'Сергей П.',
      age: 45,
      sex: 'm',
      scenario: 5,
      doctorId: 'd1',
      diagnosis: { code: 'F41.1', label: 'ГТР с депрессивными симптомами' },
      complaints: 'Тревога, сниженное настроение; принимает «Авиандр» 10 дней',
      meds: [],
      factors: { ...NO_FACTORS },
      trajectory: 'worsening',
    },
    history: { therapyDaysAgo: 10, monitorDaysAgo: 12, phq9: [13, 14], gad7: [17, 15], item9: [0, 0], adherence: 0.95 },
  },
  {
    n: 6,
    key: 's6',
    title: 'Пропуски и нежелательные явления',
    goal: 'Изменение индекса приверженности, причины пропусков и зарегистрированная реакция.',
    expected: [
      'ОРАНЖЕВЫЙ: пропущено ≥ 3 из 7 последних приёмов (ADH-MISSED-7)',
      'Причина пропусков — «нежелательные ощущения» (сонливость)',
      'Пациенту — ответ по инструкции: не принимать двойную дозу; врач уведомлён',
      'Врачу — предложения: обсудить реакцию, проверить седативные и алкоголь, напомнить о транспорте',
      'T-detect: время от первого пропуска до сигнала ≤ 24 ч',
    ],
    demo: ['Открыть досье Ирины Л.', 'Блок «Что изменилось»: приверженность 7 дней', 'Полоса приёмов и причины пропусков', 'Предложения «Принять / Изменить / Отклонить»'],
    patient: {
      code: 'П-031',
      name: 'Ирина Л.',
      age: 31,
      sex: 'f',
      scenario: 6,
      doctorId: 'd1',
      diagnosis: { code: 'F41.1', label: 'Генерализованное тревожное расстройство' },
      complaints: 'Вторая неделя приёма; сонливость',
      meds: [],
      factors: { ...NO_FACTORS, drives: true },
      trajectory: 'partial',
    },
    history: {
      therapyDaysAgo: 13,
      monitorDaysAgo: 15,
      phq9: [9, 8],
      gad7: [14, 12],
      adherence: 1,
      forcedMisses: { lastDoses: 7, missed: [0, 1, 3, 5], reason: 'side_effects' },
      aes: [{ term: 'сонливость', severity: 'moderate', fromDay: 3 }],
      messages: [{ daysAgo: 2, hour: 9, from: 'patient', text: 'После таблеток очень клонит в сон, на работе тяжело. Пропустила несколько раз.' }],
    },
  },
  {
    n: 7,
    key: 's7',
    title: 'Режим «Терапевт»: тревога и телесные жалобы',
    goal: 'Скрининг, красные флаги, «что исключить», критерии и маршрут «ОБЯЗАТЕЛЬНО / ЖЕЛАТЕЛЬНО».',
    expected: [
      'Соматический чек-лист показан ДО психиатрических выводов',
      'PHQ-4 положительный → GAD-7 14, PHQ-9 11, пункт 9 = 0',
      'Маршрутизация: ЖЕЛАТЕЛЬНО — психиатр в течение 4 недель',
      'ОБЯЗАТЕЛЬНО, если пункт 9 > 0 или есть красные флаги',
      'При рассмотрении препарата — «С ОСТОРОЖНОСТЬЮ»: сердечно-сосудистые заболевания',
    ],
    demo: ['Войти как терапевт', 'Пройти скрининг Виктора Д.', 'Отметить пункт 9 = 1 → категория становится ОБЯЗАТЕЛЬНО'],
    patient: {
      code: 'П-052',
      name: 'Виктор Д.',
      age: 52,
      sex: 'm',
      scenario: 7,
      doctorId: 't1',
      diagnosis: { code: 'R45.0', label: 'Нервозность (предварительно, терапевт)' },
      complaints: 'Сердцебиение, повышенное давление, «паника»',
      meds: ['амлодипин'],
      factors: { ...NO_FACTORS, cardio: true },
      trajectory: 'stable',
    },
    history: { therapyDaysAgo: null, monitorDaysAgo: 0, phq9: [11, 11], gad7: [14, 14], adherence: 1 },
  },
  // ───── Фоновые пациенты (динамика и жёлтые сигналы) ─────
  {
    key: 'b1',
    title: 'Хороший ответ на терапию, 6-я неделя',
    goal: 'Показывает динамику за 6 недель: GAD-7 снижается, приверженность высокая.',
    expected: ['Сигналов нет', 'GAD-7: снижение более чем на 40%'],
    demo: ['Вкладка «Динамика»: графики с отметками визитов и начала терапии'],
    patient: {
      code: 'П-036',
      name: 'Дмитрий К.',
      age: 36,
      sex: 'm',
      doctorId: 'd1',
      diagnosis: { code: 'F41.1', label: 'Генерализованное тревожное расстройство' },
      complaints: 'Тревога, напряжение, бессонница',
      meds: [],
      factors: { ...NO_FACTORS },
      trajectory: 'improving',
    },
    history: {
      therapyDaysAgo: 41,
      monitorDaysAgo: 45,
      phq9: [11, 5],
      gad7: [16, 7],
      adherence: 0.93,
      aes: [{ term: 'головная боль', severity: 'mild', fromDay: 2, toDay: 6 }],
    },
  },
  {
    key: 'b2',
    title: 'После COVID-19: конец 4-недельного курса',
    goal: 'Таймер курса: на 4-й неделе — напоминание о пересмотре эффекта и безопасности.',
    expected: ['Жёлтый: приближается конец курса (COURSE-END)'],
    demo: ['Ежедневный дайджест: жёлтый сигнал о пересмотре курса'],
    patient: {
      code: 'П-047',
      name: 'Наталья Р.',
      age: 47,
      sex: 'f',
      doctorId: 'd1',
      diagnosis: { code: 'F43.2', label: 'Расстройство адаптации после COVID-19, лёгкая степень', postCovid: true, severity: 'mild' },
      complaints: 'Тревога и нарушение сна после перенесённого COVID-19',
      meds: [],
      factors: { ...NO_FACTORS },
      trajectory: 'improving',
    },
    history: { therapyDaysAgo: 25, monitorDaysAgo: 27, phq9: [8, 5], gad7: [12, 7], adherence: 0.95 },
  },
  {
    key: 'b3',
    title: 'Нет записей 3 дня',
    goal: 'Жёлтый сигнал «нет записей»: пациенту — мягкое напоминание без медицинского содержания.',
    expected: ['Жёлтый: нет записей 3 дня (NO-ENTRIES-3D)'],
    demo: ['Список пациентов: жёлтая метка'],
    patient: {
      code: 'П-055',
      name: 'Татьяна М.',
      age: 55,
      sex: 'f',
      doctorId: 'd1',
      diagnosis: { code: 'F41.1', label: 'Генерализованное тревожное расстройство' },
      complaints: 'Тревога, мышечное напряжение',
      meds: [],
      factors: { ...NO_FACTORS, endocrine: true },
      trajectory: 'partial',
    },
    history: { therapyDaysAgo: 30, monitorDaysAgo: 32, phq9: [9, 7], gad7: [13, 10], adherence: 0.9, noEntriesLastDays: 3 },
  },
];

export const scenarioByN = (n: number) => SCENARIOS.find((s) => s.n === n);
