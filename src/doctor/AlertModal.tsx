import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AtSign, CheckCircle2, CircleSlash, Mail, MessageSquareText, MonitorSmartphone, Smartphone, UserRound } from 'lucide-react';
import type { Alert } from '../core/types';
import { useDB } from '../store/db';
import { ackAlert, closeAlert, toggleChecklist, viewAlert } from '../store/api';
import { describeMatch } from '../core/engine';
import { fmtDateTime, fmtDuration, fmtTimeSec } from '../core/time';
import { Modal } from '../ui/Modal';
import { AlertSignal, STATUS_LABEL } from '../ui/Signals';
import { useTicker } from '../ui/hooks';
import { useSession } from '../store/session';

const CH_ICON = { screen: <MonitorSmartphone size={15} />, push: <Smartphone size={15} />, sms: <MessageSquareText size={15} />, email: <AtSign size={15} />, messenger: <Mail size={15} /> };
const CH_LABEL = { screen: 'Экран', push: 'Push', sms: 'SMS', email: 'Почта', messenger: 'Мессенджер' };

export function escalationInfo(a: Alert, speed: number, minutes: [number, number], nowMs: number) {
  const mins = ((nowMs - a.createdAtMs) / 60000) * speed;
  const next = a.escalationStep === 0 ? minutes[0] : a.escalationStep === 1 ? minutes[1] : null;
  const leftMin = next === null ? null : Math.max(0, next - mins);
  const leftRealMs = leftMin === null ? null : (leftMin / speed) * 60000;
  return { mins, next, leftMin, leftRealMs };
}

export function AlertModal({ alertId, onClose }: { alertId: string; onClose: () => void }) {
  const db = useDB();
  const s = useSession();
  const me = s.userId ?? 'd1';
  const now = useTicker(1000);
  const a = db.alerts.find((x) => x.id === alertId);
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (a && !a.viewedAt) viewAlert(a.id, me);
  }, [a, me]);
  if (!a) return null;
  const p = db.patients.find((x) => x.id === a.patientId)!;
  const user = (id?: string) => db.users.find((u) => u.id === id);
  const esc = escalationInfo(a, db.settings.demoSpeed, db.settings.escalationMinutes, now);
  const closed = a.status === 'closed' || a.status === 'false_positive';
  const tDetectFrom = a.firstEventAt ?? a.triggerEventAt;

  const steps: { at?: string; label: string; tone: string; extra?: string }[] = [
    { at: a.firstEventAt, label: 'Первый пропуск в серии', tone: 'gray' },
    { at: a.triggerEventAt, label: 'Событие у пациента (данные поступили)', tone: 'gray' },
    { at: a.createdAt, label: `Правило ${a.ruleId} v${a.ruleVersion} сработало, сигнал создан`, tone: a.level === 'red' ? 'red' : 'orange' },
    { at: a.deliveredAt, label: 'Доставлен на экран врача', tone: '', extra: a.deliveryMs !== undefined ? `за ${fmtDuration(a.deliveryMs)}` : undefined },
    ...a.escalations.map((e) => ({ at: e.at, label: `Эскалация: ${user(e.to)?.title ?? e.to}`, tone: 'red', extra: user(e.to)?.name })),
    { at: a.viewedAt, label: 'Врач открыл сигнал', tone: '' },
    { at: a.ackAt, label: `Принят в работу: ${user(a.ackBy)?.name ?? ''}`, tone: 'mint' },
    { at: a.closedAt, label: a.status === 'false_positive' ? 'Отмечен как ложное срабатывание' : 'Закрыт', tone: 'mint', extra: a.closeComment },
  ].filter((x) => x.at);
  steps.sort((x, y) => x.at!.localeCompare(y.at!));

  return (
    <Modal wide title={`${p.name} · ${p.code}`} sub={`${p.age} лет · ${p.diagnosis.code} ${p.diagnosis.label}`} onClose={onClose}>
      <div className="stack" style={{ gap: 18 }}>
        <AlertSignal alert={a} meta={`${STATUS_LABEL[a.status]} · ${fmtDateTime(a.createdAt)}`}>
          {a.reason}
        </AlertSignal>

        {a.level === 'red' && !a.ackAt && !closed && (
          <div className="callout callout-red">
            <span className="pulse-dot" style={{ marginTop: 5 }} />
            <span>
              {esc.next !== null ? (
                <>
                  Без подтверждения через <b>{fmtDuration(esc.leftRealMs ?? 0)}</b> сигнал уйдёт: {a.escalationStep === 0 ? 'дежурному врачу' : 'заведующей отделением'} (порог {esc.next} мин
                  {db.settings.demoSpeed > 1 ? `, демо-время ×${db.settings.demoSpeed}` : ''}).
                </>
              ) : (
                'Эскалация выполнена по всем уровням регламента. Сигнал остаётся неподтверждённым в панели.'
              )}
            </span>
          </div>
        )}

        <div className="grid-2" style={{ alignItems: 'start' }}>
          <section className="stack" style={{ gap: 10 }}>
            <div className="eyebrow">Хронология</div>
            <div className="timeline">
              {steps.map((st, i) => (
                <div key={i} className="tl-item">
                  <div className="tl-time">{fmtTimeSec(st.at!)}</div>
                  <div className={`tl-dot ${st.tone}`} />
                  <div className="small">
                    <div className="strong">{st.label}</div>
                    {st.extra && <div className="xs muted">{st.extra}</div>}
                  </div>
                </div>
              ))}
            </div>
            {a.viewedAt && (
              <div className="badge badge-brand badge-lg" title="Время от события до просмотра сигнала врачом">
                T-detect: {fmtDuration(Date.parse(a.viewedAt) - Date.parse(tDetectFrom))}
              </div>
            )}
          </section>

          <section className="stack" style={{ gap: 14 }}>
            <div className="stack" style={{ gap: 8 }}>
              <div className="eyebrow">Основание (входные данные)</div>
              {a.facts.length ? (
                <ul className="list-plain why-facts">
                  {a.facts.map((m, i) => (
                    <li key={i}>
                      <span className="small">{describeMatch(m)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="small muted">Вопрос пациента в чате</div>
              )}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <div className="eyebrow">Каналы уведомления (без медицинских данных)</div>
              <ul className="list-plain stack" style={{ gap: 6 }}>
                {a.channels.map((c, i) => (
                  <li key={i} className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
                    <span className="badge badge-outline" style={{ flex: 'none' }}>
                      {CH_ICON[c.channel]} {CH_LABEL[c.channel]}
                    </span>
                    <span className="ink-2">
                      {user(c.to)?.name ?? 'пациент'}: «{c.text}»
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        <section className="stack" style={{ gap: 8 }}>
          <div className="eyebrow">Чек-лист действий врача (решения — за врачом)</div>
          <div className="grid-2" style={{ gap: 6 }}>
            {a.checklist.map((c) => (
              <label key={c.id} className="check card card-flat" style={{ padding: '10px 12px' }}>
                <input type="checkbox" checked={c.done} onChange={() => toggleChecklist(a.id, c.id, me)} disabled={closed} />
                <span className="small">{c.label}</span>
              </label>
            ))}
          </div>
        </section>

        {!closed && (
          <section className="stack" style={{ gap: 8 }}>
            <textarea className="textarea" placeholder="Комментарий врача (что сделано, решение)" value={comment} onChange={(e) => setComment(e.target.value)} style={{ minHeight: 70 }} />
            <div className="row wrap" style={{ gap: 8 }}>
              {!a.ackAt && (
                <button className={`btn ${a.level === 'red' ? 'btn-danger' : 'btn-primary'}`} onClick={() => ackAlert(a.id, me)}>
                  <CheckCircle2 /> Принять в работу
                </button>
              )}
              <button className="btn" onClick={() => closeAlert(a.id, me, comment)}>
                Закрыть сигнал
              </button>
              <button className="btn btn-ghost" onClick={() => closeAlert(a.id, me, comment || 'Ложное срабатывание', true)}>
                <CircleSlash /> Ложное срабатывание
              </button>
              <Link to={`/doctor/patient/${p.id}`} className="btn btn-ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>
                <UserRound /> Досье пациента
              </Link>
            </div>
            <div className="xs muted">Система не меняет терапию и не направляет пациента сама. «Ложное срабатывание» используется для калибровки порогов.</div>
          </section>
        )}
      </div>
    </Modal>
  );
}
