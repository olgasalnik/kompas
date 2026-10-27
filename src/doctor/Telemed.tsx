// Телемедицинская консультация (приказ Минздрава № 965н): запрос «врач — врач» к специалисту или
// онлайн-приём «врач — пациент» (только после очного приёма). Жалобы, анамнез, шкалы и терапия
// собираются автоматически — врач правит текст, копирует его в МИС или создаёт запрос.
import { useMemo, useState } from 'react';
import { ClipboardCopy, Send, Video } from 'lucide-react';
import type { TelemedRequest } from '../core/types';
import { useDB } from '../store/db';
import { createTelemed } from '../store/api';
import { fmtDate, fmtDateTime, plural } from '../core/time';
import { pct } from '../core/adherence';
import { Modal } from '../ui/Modal';
import { copyText, type PatientView } from '../ui/hooks';
import { toast } from '../ui/Toasts';
import { scalePoints } from './select';

export function TelemedModal({ v, me, onClose }: { v: PatientView; me: string; onClose: () => void }) {
  const db = useDB();
  const { p, facts, adherence } = v;
  const [type, setType] = useState<TelemedRequest['type']>('doctor_doctor');
  const [urgency, setUrgency] = useState<TelemedRequest['urgency']>('плановая');
  const [to, setTo] = useState('Врач-психиатр (консультант)');
  const [goal, setGoal] = useState('');
  const doctor = db.users.find((u) => u.id === me);
  const history = db.telemed.filter((t) => t.patientId === p.id).reverse();

  const auto = useMemo(() => {
    const gad = scalePoints(db, p.id, 'GAD7');
    const phq = scalePoints(db, p.id, 'PHQ9');
    const rx = [...db.prescriptions].reverse().find((r) => r.patientId === p.id && r.status === 'confirmed');
    const aes = db.adverseEvents.filter((a) => a.patientId === p.id);
    const alerts = db.alerts.filter((a) => a.patientId === p.id && a.level !== 'yellow');
    const words = db.patientWords.filter((w) => w.patientId === p.id).slice(-2);
    const docs = db.documents.filter((d) => d.patientId === p.id && d.ocr?.text);
    return [
      `Пациент: ${p.code}, медицинская карта ${p.cardNo}, ${p.age} ${plural(p.age, 'год', 'года', 'лет')}.`,
      `Жалобы: ${p.complaints || 'со слов пациента — см. дневник'}${p.previsit?.concerns ? `; к приёму: ${p.previsit.concerns}` : ''}.`,
      ...words.map((w) => `Со слов пациента (${fmtDate(w.at)}): «${w.text}».`),
      ...docs.map((d) => `Документ «${d.name}» (печатная версия): ${d.ocr!.text.replace(/\s*\n\s*/g, ' ').slice(0, 400)}`),
      `Анамнез: диагноз (внесён врачом) ${p.diagnosis.code} ${p.diagnosis.label}. ${rx ? `«Авиандр» ${rx.regimen} с ${fmtDate(rx.decidedAt!)}${rx.offLabel ? ' (вне инструкции, решение врача)' : ''}` : 'Медикаментозная терапия не назначена'}. Сопутствующие препараты: ${p.meds.join(', ') || 'нет'}.`,
      `Динамика: GAD-7 ${gad.map((x) => x.v).join(' → ') || '—'}; PHQ-9 ${phq.map((x) => x.v).join(' → ') || '—'} (пункт 9: ${facts['phq9.item9'] ?? '—'}). Приверженность за 7 дней: ${adherence.due7 ? pct(adherence.rate7) : '—'}.`,
      `Нежелательные явления: ${aes.length ? aes.map((a) => a.term).join(', ') : 'не отмечены'}. Сигналы: ${alerts.length ? alerts.map((a) => a.title).join('; ') : 'нет'}.`,
      `Последний очный приём: ${p.lastVisitAt ? fmtDate(p.lastVisitAt) : '—'}.`,
    ].join('\n');
  }, [db, p, facts, adherence]);

  const text = `${type === 'doctor_patient' ? 'Онлайн-консультация с пациентом (повторная)' : `Запрос на телемедицинскую консультацию: ${to}`} — ${urgency}\n${auto}\nЦель консультации: ${goal || '[укажите вопрос к консультанту]'}\nЗапросил: ${doctor?.name ?? ''}, ${doctor?.title ?? ''}`;
  const patientEligible = Boolean(p.lastVisitAt);

  return (
    <Modal
      wide
      title="Телемедицинская консультация"
      sub={`${p.name} · ${p.code} · карта ${p.cardNo}`}
      onClose={onClose}
      icon={
        <div className="signal-icon" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
          <Video />
        </div>
      }
      footer={
        <>
          <button
            className="btn"
            onClick={async () => {
              const ok = await copyText(text);
              toast(ok ? 'Текст скопирован' : 'Не удалось скопировать', { sub: 'Можно вставить в МИС или письмо консультанту', tone: ok ? 'ok' : 'default' });
            }}
          >
            <ClipboardCopy /> Скопировать
          </button>
          <button
            className="btn btn-primary"
            disabled={type === 'doctor_patient' && !patientEligible}
            onClick={() => {
              createTelemed({ patientId: p.id, type, to: type === 'doctor_patient' ? p.name : to, urgency, text, status: 'sent', createdBy: me });
              toast(type === 'doctor_patient' ? 'Пациенту предложена онлайн-консультация' : 'Запрос консультации создан', { tone: 'ok', sub: 'Запись в журнале аудита' });
              onClose();
            }}
          >
            <Send /> Создать запрос
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="grid-3" style={{ gap: 10 }}>
          <label className="field">
            <span className="label">Тип</span>
            <select id="tm-type" className="select" value={type} onChange={(e) => setType(e.target.value as TelemedRequest['type'])}>
              <option value="doctor_doctor">Врач — врач (консилиум, консультация)</option>
              <option value="doctor_patient">Врач — пациент (повторная, онлайн)</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Срочность</span>
            <select id="tm-urgency" className="select" value={urgency} onChange={(e) => setUrgency(e.target.value as TelemedRequest['urgency'])}>
              <option value="плановая">Плановая</option>
              <option value="неотложная">Неотложная</option>
            </select>
          </label>
          {type === 'doctor_doctor' && (
            <label className="field">
              <span className="label">Кому</span>
              <input id="tm-to" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          )}
        </div>
        {type === 'doctor_patient' && (
          <div className={`callout small ${patientEligible ? '' : 'callout-red'}`}>
            {patientEligible
              ? `Онлайн-консультация с пациентом возможна для коррекции ранее назначенного лечения после очного приёма (последний — ${fmtDate(p.lastVisitAt!)}). Приказ Минздрава № 965н.`
              : 'Нет очного приёма: дистанционная консультация «врач — пациент» для постановки диагноза и назначения лечения не проводится.'}
          </div>
        )}
        <label className="field">
          <span className="label">Цель консультации</span>
          <input id="tm-goal" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Например: подбор терапии при сочетании с сертралином" />
        </label>
        <div className="field">
          <span className="label">Текст запроса (жалобы и анамнез собраны автоматически)</span>
          <pre className="small" style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, fontFamily: 'var(--font-body)', margin: 0 }}>
            {text}
          </pre>
        </div>
        {history.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="eyebrow">История запросов</div>
            {history.map((h) => (
              <div key={h.id} className="small row" style={{ gap: 8 }}>
                <span className="badge badge-outline">{h.type === 'patient_request' ? 'просьба пациента' : h.type === 'doctor_patient' ? 'врач — пациент' : 'врач — врач'}</span>
                <span className="muted">
                  {fmtDateTime(h.at)} · {h.urgency} · {h.to}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
