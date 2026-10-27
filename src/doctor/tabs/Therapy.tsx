import { useState } from 'react';
import { BookOpenCheck, ClipboardPen, FileWarning, FlaskConical, Globe2, ListChecks, Lock, Pill, Plus, ShieldCheck, Stethoscope, Trash2, TriangleAlert, X } from 'lucide-react';
import { aviandrRationale, doseSummary } from '../../core/dose';
import type { PatientFactors, ScaleId } from '../../core/types';
import { useDB } from '../../store/db';
import { decideSuggestion, enterClinicianScale, logStopBlocked, prescribe, setAeReportDraft, setMeds, stopTherapy, updateFactors } from '../../store/api';
import { checkTherapy, DRUG_PACKS } from '../../core/clinical';
import { fmtDate, fmtDateTime } from '../../core/time';
import type { PatientView } from '../../ui/hooks';
import { Signal, TherapyHit } from '../../ui/Signals';
import { Modal } from '../../ui/Modal';
import { toast } from '../../ui/Toasts';
import { sourceById } from '../../ui/Why';
import { PromptButton } from '../../ui/Inline';
import guidelines from '../../data/guidelines.json';
import { SCALES } from '../../core/scales';
import { RecipeCard } from './Recipe';
import { DrugReference } from './DrugReference';
import { CompatCheck } from '../../ui/CompatCheck';

const pack = DRUG_PACKS.aviandr;

const FACTOR_LABEL: Record<Exclude<keyof PatientFactors, 'alcohol'>, string> = {
  pregnant: 'Беременность',
  breastfeeding: 'Грудное вскармливание',
  epilepsy: 'Эпилепсия / органическое поражение ГМ',
  renalModerateSevere: 'Почечная недостаточность, СКФ < 60',
  hepaticImpairment: 'Печёночная недостаточность (Чайлд–Пью A–C)',
  maoi: 'ИМАО сейчас или < 2 недель после отмены',
  allergy: 'Аллергия на компоненты',
  drives: 'Управляет транспортом / механизмами',
  cardio: 'Сердечно-сосудистые заболевания',
  endocrine: 'Сахарный диабет / эндокринные',
  substanceDependence: 'Зависимость от алкоголя / ПАВ',
};

export function TherapyTab({ v, me }: { v: PatientView; me: string }) {
  const db = useDB();
  const { p, facts } = v;
  const check = checkTherapy(facts);
  const rationale = aviandrRationale(facts, check);
  const dose = doseSummary(pack.dosing.singleMg, pack.dosing.timesPerDay);
  const [acks, setAcks] = useState<string[]>([]);
  const [override, setOverride] = useState(false);
  const [newMed, setNewMed] = useState('');
  const rx = [...db.prescriptions].reverse().find((r) => r.patientId === p.id && (r.status === 'confirmed' || r.status === 'modified'));
  const sug = db.suggestions.find((s) => s.patientId === p.id && s.ruleId === 'AVI-SUG-REGIMEN' && s.status === 'proposed');
  const allAcked = check.warns.every((w) => acks.includes(w.rule.id));
  const src = sourceById('S4');
  const cards = guidelines.cards.filter((c) => c.codes.some((code) => p.diagnosis.code.startsWith(code)));
  const aes = db.adverseEvents.filter((a) => a.patientId === p.id);

  const accept = () => {
    if (sug) decideSuggestion(sug.id, me, 'confirmed');
    else prescribe(p.id, me, { regimen: pack.dosing.regimen, offLabel: false, ackWarnings: acks });
    toast('Назначение подписано врачом', { tone: 'ok', sub: 'Пациент увидит план в разделе «Мой план»' });
  };

  return (
    <div className="dossier-grid">
      <div className="stack" style={{ gap: 18 }}>
        <section className="card">
          <div className="card-head" style={{ alignItems: 'flex-start' }}>
            <div className="stack" style={{ gap: 6 }}>
              <div className="card-title">
                <Pill /> «{pack.trade}» ({pack.inn}), {pack.form}
              </div>
              <div className="row wrap xs muted" style={{ gap: 10 }}>
                <span>{pack.group}</span>
                <span>РУ {pack.registration}</span>
                <span>▼ дополнительный мониторинг</span>
                <span>Рецептурный, бланк № {pack.prescription.blank}</span>
                <span>Проверено {pack.checkedAt}</span>
              </div>
            </div>
            <span className="badge badge-outline" title={pack.sponsorLabel}>
              Спонсорство раскрыто
            </span>
          </div>
          <div className="card-body stack" style={{ gap: 12 }}>
            <div className="callout small">
              <BookOpenCheck />
              <span>
                Источник: {src?.title}. {src?.status}. Решение о применении вне инструкции может принять только врач.
              </span>
            </div>
            {check.indication && <TherapyHit hit={check.indication} />}
            {check.offLabel && <TherapyHit hit={check.offLabel} />}
            {check.stops.map((h) => (
              <TherapyHit key={h.rule.id} hit={h} />
            ))}
            {check.warns.map((h) => (
              <TherapyHit
                key={h.rule.id}
                hit={h}
                actions={
                  !rx && (
                    <label className="check small" style={{ marginLeft: 4 }}>
                      <input type="checkbox" checked={acks.includes(h.rule.id)} onChange={(e) => setAcks((xs) => (e.target.checked ? [...xs, h.rule.id] : xs.filter((x) => x !== h.rule.id)))} />
                      Ознакомлен(а)
                    </label>
                  )
                }
              />
            ))}
            <Signal variant="info" compact kicker="Справочно из инструкции" title="Нежелательные реакции обычно возникают в первые две недели и носят преходящий характер">
              Часто: {pack.adverseReactions.frequent.join(', ')}. При пропуске: {pack.missedDose.toLowerCase()}. {pack.food}.
            </Signal>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <ListChecks /> Обоснование выбора «Авиандра»
            </div>
            <span className="xs muted">по инструкции и данным пациента · не реклама</span>
          </div>
          <div className="card-body stack" style={{ gap: 8 }}>
            {rationale.map((r, i) => (
              <div key={i} className="row row-top small" style={{ gap: 10 }}>
                <span
                  className="badge"
                  style={{
                    flex: 'none',
                    minWidth: 26,
                    justifyContent: 'center',
                    background: r.state === 'ok' ? 'var(--mint-soft)' : r.state === 'no' ? 'var(--red-soft)' : r.state === 'warn' ? 'var(--amber-soft)' : 'var(--surface-3)',
                    color: r.state === 'ok' ? 'var(--mint-ink)' : r.state === 'no' ? 'var(--red-ink)' : r.state === 'warn' ? 'var(--amber-ink)' : 'var(--ink-3)',
                  }}
                  aria-label={{ ok: 'соответствует', no: 'не соответствует', warn: 'внимание', info: 'справочно' }[r.state]}
                >
                  {{ ok: '✓', no: '✕', warn: '!', info: 'i' }[r.state]}
                </span>
                <span className={r.state === 'info' ? 'ink-2' : ''}>{r.text}</span>
              </div>
            ))}
            <div className="callout small" style={{ marginTop: 4 }}>
              <Pill />
              <span>
                <b>Дозировка по инструкции:</b> {dose.line}; принимать {pack.food.toLowerCase().replace('принимать внутрь ', '')}.
              </span>
            </div>
          </div>
        </section>

        <DrugReference />

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <Stethoscope /> Решение врача
            </div>
            <span className="xs muted">система не назначает сама</span>
          </div>
          <div className="card-body stack" style={{ gap: 12 }}>
            {rx ? (
              <>
                <Signal variant="ok" kicker={rx.offLabel ? 'Назначено вне инструкции — решение врача' : 'Назначение подтверждено врачом'} title={`«Авиандр»: ${rx.regimen}`} meta={`подписал ${db.users.find((u) => u.id === rx.decidedBy)?.name ?? ''}, ${fmtDateTime(rx.decidedAt!)}`}>
                  {rx.overrideReason ? `Обоснование: ${rx.overrideReason}` : 'Предложение системы принято врачом. Статус «Подтверждено» выставлен только после подписи.'}
                </Signal>
                <RecipeCard key={rx.id} p={p} rx={rx} me={me} postCovid={Boolean(facts['diagnosis.postCovid'])} />
                <div className="row">
                  <PromptButton
                    className="btn btn-sm btn-ghost"
                    label="Остановить терапию"
                    placeholder="Причина остановки (фиксируется в журнале)"
                    minLength={5}
                    submitLabel="Остановить"
                    submitClass="btn btn-sm btn-danger"
                    onSubmit={(r) => {
                      stopTherapy(p.id, me, r);
                      toast('Терапия остановлена врачом', { sub: 'Причина записана в журнал' });
                    }}
                  />
                </div>
              </>
            ) : check.blocked ? (
              <>
                <div className="row wrap" style={{ gap: 10 }}>
                  <button className="btn btn-primary" disabled onClick={() => logStopBlocked(p.id, me, check.stops.map((s) => s.rule.id))}>
                    <Lock /> Назначить по инструкции — заблокировано
                  </button>
                  {!check.hardBlocked && (
                    <button
                      className="btn btn-outline-danger"
                      onClick={() => {
                        logStopBlocked(p.id, me, check.stops.map((s) => s.rule.id));
                        setOverride(true);
                      }}
                    >
                      <FileWarning /> Оформить исключение (решение врача)
                    </button>
                  )}
                </div>
                <div className="small ink-2">
                  {check.hardBlocked
                    ? 'Противопоказание без возможности исключения в прототипе. Рассмотрите варианты по КР.'
                    : 'Обычный путь подтверждения заблокирован. Исключение — только отдельное осознанное решение врача с обоснованием и записью в журнал.'}
                </div>
              </>
            ) : check.offLabel ? (
              <>
                <div className="small ink-2">Препарат не предлагается автоматически: диагноз вне зарегистрированных показаний. Используйте варианты из КР (ниже).</div>
                <button className="btn btn-outline-danger" style={{ alignSelf: 'flex-start' }} onClick={() => setOverride(true)}>
                  <FileWarning /> Применить вне инструкции — решение врача
                </button>
              </>
            ) : (
              <>
                <div className="card card-flat" style={{ padding: 14 }}>
                  <div className="row wrap" style={{ gap: 6 }}>
                    <span className="badge badge-ai">Предложено системой</span>
                    <span className="badge badge-outline">AVI-SUG-REGIMEN</span>
                  </div>
                  <div className="strong" style={{ marginTop: 6 }}>
                    Рассмотреть режим по инструкции: {pack.dosing.regimen}
                  </div>
                  <div className="small ink-2" style={{ marginTop: 2 }}>
                    {dose.line}
                  </div>
                  <div className="xs muted" style={{ marginTop: 2 }}>
                    {pack.dosing.durationGad}. {facts['diagnosis.postCovid'] ? pack.dosing.durationPostCovid : ''}
                  </div>
                </div>
                {!allAcked && (
                  <div className="callout callout-amber small">
                    <TriangleAlert />
                    <span>Подтвердите ознакомление с предупреждениями «ВНИМАНИЕ» ({check.warns.length - acks.filter((a) => check.warns.some((w) => w.rule.id === a)).length}) — затем станет доступно подписание.</span>
                  </div>
                )}
                <div className="row wrap" style={{ gap: 8 }}>
                  <button className="btn btn-primary" disabled={!allAcked} onClick={accept}>
                    <ShieldCheck /> Принять и подписать
                  </button>
                  <PromptButton
                    className="btn"
                    disabled={!allAcked}
                    label="Изменить"
                    initial={pack.dosing.regimen}
                    placeholder="Изменённый режим (в пределах инструкции)"
                    minLength={5}
                    submitLabel="Подписать изменённый"
                    onSubmit={(r) => {
                      if (sug) decideSuggestion(sug.id, me, 'modified', r);
                      else prescribe(p.id, me, { regimen: r, offLabel: false, ackWarnings: acks });
                      toast('Изменено и подписано врачом', { tone: 'ok', sub: 'Исходный и изменённый варианты сохранены' });
                    }}
                  />
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      if (sug) decideSuggestion(sug.id, me, 'declined', undefined, 'Врач выбрал другой вариант');
                      toast('Отклонено врачом');
                    }}
                  >
                    Отклонить
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <BookOpenCheck /> Клинические рекомендации Минздрава
            </div>
            <span className="xs muted">варианты — независимо от спонсора</span>
          </div>
          <div className="card-body stack" style={{ gap: 12 }}>
            {(cards.length ? cards : guidelines.cards.slice(0, 1)).map((c) => {
              const s = sourceById(c.source);
              return (
                <div key={c.id} className="card card-flat card-pad stack" style={{ gap: 8 }}>
                  <div className="row spread wrap" style={{ gap: 8 }}>
                    <div className="strong">КР «{c.title}»</div>
                    <span className="badge badge-outline">
                      {c.source} · {c.status}
                    </span>
                  </div>
                  <ul className="bullets small">
                    {c.points.map((pt, i) => (
                      <li key={i}>
                        {pt.text} <span className="muted">— раздел «{pt.ref}»</span>
                      </li>
                    ))}
                  </ul>
                  <div className="xs muted">
                    {s?.org}. {c.expertTodo}.
                  </div>
                </div>
              );
            })}
            <div className="callout small">
              <Globe2 />
              <span>«Мировая практика» по обезличенному профилю — по запросу врача, с пометкой «не зарегистрирован в РФ» (следующий этап).</span>
            </div>
          </div>
        </section>
      </div>

      <div className="stack" style={{ gap: 18 }}>
        <section className="card card-pad stack" style={{ gap: 12 }}>
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            <ShieldCheck /> Факторы риска
          </div>
          <div className="xs muted">Изменения сразу пересчитывают правила СТОП / ВНИМАНИЕ</div>
          <div className="stack" style={{ gap: 6 }}>
            {(Object.keys(FACTOR_LABEL) as (keyof typeof FACTOR_LABEL)[]).map((k) => (
              <label key={k} className="check small">
                <input type="checkbox" checked={p.factors[k]} onChange={(e) => updateFactors(p.id, me, { [k]: e.target.checked })} />
                {FACTOR_LABEL[k]}
              </label>
            ))}
            <label className="field" style={{ marginTop: 6 }}>
              <span className="label">Алкоголь</span>
              <select className="select" value={p.factors.alcohol} onChange={(e) => updateFactors(p.id, me, { alcohol: e.target.value as PatientFactors['alcohol'] })}>
                <option value="none">не употребляет</option>
                <option value="rare">редко</option>
                <option value="regular">регулярно</option>
              </select>
            </label>
          </div>
          <div className="row xs muted" style={{ gap: 6 }}>
            Возраст: {p.age} · Диагноз: {p.diagnosis.code}
          </div>
        </section>

        <section className="card card-pad stack" style={{ gap: 10 }}>
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            <Pill /> Текущие препараты (МНН)
          </div>
          <div className="stack" style={{ gap: 6 }}>
            {p.meds.length === 0 && <span className="small muted">Не указаны</span>}
            {p.meds.map((m) => {
              const log = [...p.medLog].reverse().find((x) => x.name === m);
              return (
                <div key={m} className="row spread small" style={{ gap: 8 }}>
                  <span>
                    <b>{m}</b>{' '}
                    {log && (
                      <span className="xs muted">
                        · {log.by === 'patient' ? 'со слов пациента' : 'внесено врачом'}, {fmtDate(log.at)}
                        {log.note ? ` — ${log.note}` : ''}
                      </span>
                    )}
                  </span>
                  <button className="btn btn-ghost btn-icon btn-sm" aria-label="Убрать" onClick={() => setMeds(p.id, me, p.meds.filter((x) => x !== m))}>
                    <Trash2 />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="МНН, например «кетоконазол»" value={newMed} onChange={(e) => setNewMed(e.target.value)} style={{ minHeight: 38 }} />
            <button
              className="btn btn-soft btn-icon"
              aria-label="Добавить"
              onClick={() => {
                const m = newMed.trim().toLowerCase();
                if (!m) return;
                setMeds(p.id, me, [...new Set([...p.meds, m])]);
                setNewMed('');
              }}
            >
              <Plus />
            </button>
          </div>
          <div className="xs muted">Поиск по МНН → торговые названия из ГРЛС и наличие в формуляре клиники — следующий этап (тестовый формуляр).</div>
        </section>

        <section className="card card-pad stack" style={{ gap: 10 }} id="compat">
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            <ShieldCheck /> Проверить совместимость
          </div>
          <div className="xs muted">Любое лекарство (МНН или торговое название) — сверка с инструкцией «Авиандра» за секунду.</div>
          <CompatCheck
            audience="doctor"
            actLabel="Добавить в список препаратов"
            onAct={(r) => {
              const m = (r.inn ?? r.query).toLowerCase();
              setMeds(p.id, me, [...new Set([...p.meds, m])]);
              toast(`«${m}» добавлен в список`, { tone: 'ok', sub: 'Правила СТОП / ВНИМАНИЕ пересчитаны' });
            }}
          />
        </section>

        <section className="card card-pad stack" style={{ gap: 10 }}>
          <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
            <FlaskConical /> Нежелательные явления
          </div>
          {aes.length === 0 && <span className="small muted">Не отмечены</span>}
          {aes.map((a) => (
            <div key={a.id} className="row spread small" style={{ gap: 8, alignItems: 'flex-start' }}>
              <div>
                <b>{a.term}</b> <span className={`badge ${a.severity === 'mild' ? 'badge-yellow' : 'badge-orange'}`}>{a.severity === 'mild' ? 'лёгкое' : a.severity === 'moderate' ? 'среднее' : 'тяжёлое'}</span>
                <div className="xs muted">
                  с {fmtDate(a.onset)} · {a.status === 'active' ? 'сохраняется' : 'прошло'}
                  {pack.adverseReactions.frequent.includes(a.term) ? ' · в инструкции: «часто»' : pack.adverseReactions.infrequent.includes(a.term) ? ' · в инструкции: «нечасто»' : ''}
                </div>
              </div>
              {a.reportDraft ? (
                <span className="badge badge-mint">черновик извещения</span>
              ) : (
                <button className="btn btn-sm btn-ghost" onClick={() => setAeReportDraft(a.id, me)}>
                  <ClipboardPen /> Извещение
                </button>
              )}
            </div>
          ))}
          <div className="xs muted">Извещение о нежелательной реакции (Росздравнадзор) готовится как черновик; отправляет врач.</div>
        </section>

        <ClinicianScales patientId={p.id} me={me} />
      </div>

      {override && <OverrideModal patientId={p.id} me={me} stops={check.stops.map((s) => s.rule.title)} offLabel={Boolean(check.offLabel)} warns={check.warns.map((w) => w.rule.id)} onClose={() => setOverride(false)} />}
    </div>
  );
}

function OverrideModal({ patientId, me, stops, offLabel, warns, onClose }: { patientId: string; me: string; stops: string[]; offLabel: boolean; warns: string[]; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [aware, setAware] = useState(false);
  const ok = reason.trim().length >= 30 && aware;
  return (
    <Modal
      title="Применение вне инструкции — решение врача"
      sub="Отдельное осознанное решение с обоснованием. Фиксируется в журнале аудита."
      onClose={onClose}
      icon={
        <div className="signal-icon" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
          <FileWarning />
        </div>
      }
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            <X /> Отмена
          </button>
          <button
            className="btn btn-danger"
            disabled={!ok}
            onClick={() => {
              prescribe(patientId, me, { regimen: pack.dosing.regimen, offLabel: true, overrideReason: reason.trim(), ackWarnings: warns });
              toast('Решение врача зафиксировано', { sub: 'Назначение вне инструкции с обоснованием — в журнале', tone: 'ok' });
              onClose();
            }}
          >
            Подписать решение
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        {stops.length > 0 && (
          <div className="callout callout-red small">
            <TriangleAlert />
            <span>Противопоказания по инструкции: {stops.join('; ')}.</span>
          </div>
        )}
        {offLabel && <div className="callout callout-amber small">Диагноз не входит в зарегистрированные показания препарата.</div>}
        <label className="field">
          <span className="label">Клиническое обоснование (не менее 30 символов)</span>
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Почему польза превышает риск, какие альтернативы рассмотрены, согласие пациента…" />
        </label>
        <label className="check small">
          <input type="checkbox" checked={aware} onChange={(e) => setAware(e.target.checked)} />
          Я понимаю, что применение вне инструкции — моё самостоятельное клиническое решение, и подтверждаю информированное согласие пациента.
        </label>
      </div>
    </Modal>
  );
}

function ClinicianScales({ patientId, me }: { patientId: string; me: string }) {
  const db = useDB();
  const [scale, setScale] = useState<ScaleId>('HAMA');
  const [val, setVal] = useState('');
  const list = db.assessments.filter((a) => a.patientId === patientId && a.enteredBy === 'doctor').slice(-4).reverse();
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <div className="row spread">
        <div className="card-title" style={{ fontSize: 'var(--fs-base)' }}>
          <ClipboardPen /> Оценка врачом
        </div>
        <span className="badge badge-outline">S9 · версия на проверке</span>
      </div>
      <div className="xs muted">HAM-D, HAM-A, MADRS — ввод итогового балла. Не смешивается с самоотчётом пациента. {SCALES.HAMD.note}</div>
      <div className="row" style={{ gap: 8 }}>
        <select className="select" value={scale} onChange={(e) => setScale(e.target.value as ScaleId)} style={{ minHeight: 38, width: 120 }}>
          <option value="HAMD">HAM-D</option>
          <option value="HAMA">HAM-A</option>
          <option value="MADRS">MADRS</option>
        </select>
        <input className="input" inputMode="numeric" placeholder={`0–${SCALES[scale].max}`} value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))} style={{ minHeight: 38 }} />
        <button
          className="btn btn-soft"
          onClick={() => {
            try {
              enterClinicianScale(patientId, me, scale, Number(val));
              setVal('');
              toast('Балл сохранён', { tone: 'ok' });
            } catch (e) {
              toast((e as Error).message);
            }
          }}
          disabled={!val}
        >
          Сохранить
        </button>
      </div>
      {list.map((a) => (
        <div key={a.id} className="row spread small">
          <span>
            {SCALES[a.scale].name} · {fmtDate(a.at)}
          </span>
          <b>{a.total}</b>
        </div>
      ))}
    </section>
  );
}
