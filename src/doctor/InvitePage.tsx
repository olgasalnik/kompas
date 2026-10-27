import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, SplitSquareHorizontal, UserPlus } from 'lucide-react';
import { invitePatient } from '../store/api';
import type { Patient } from '../core/types';
import { openSecondWindow } from '../ui/DemoDock';

export function InvitePage({ me }: { me: string }) {
  const [name, setName] = useState('Новый пациент');
  const [age, setAge] = useState('35');
  const [sex, setSex] = useState<'f' | 'm'>('f');
  const [made, setMade] = useState<Patient | null>(null);
  const url = made ? `${location.origin}${location.pathname}#/patient` : '';
  return (
    <div className="stack fade-in" style={{ gap: 22 }}>
      <div className="page-head">
        <div>
          <h1>Пригласить пациента</h1>
          <p>Связь «врач — пациент» создаётся только приглашением лечащего врача. Данные, которые вводит пациент, сразу попадают в карточку этого врача.</p>
        </div>
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="card card-pad-lg stack" style={{ gap: 14 }}>
          <div className="card-title">
            <UserPlus /> Данные для приглашения
          </div>
          <div className="callout small">Минимизация данных: только псевдоним, возраст и пол. Идентифицирующие сведения хранятся отдельно (в пилоте).</div>
          <label className="field">
            <span className="label">Псевдоним / имя (синтетическое)</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="grid-2" style={{ gap: 10 }}>
            <label className="field">
              <span className="label">Возраст</span>
              <input className="input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="field">
              <span className="label">Пол</span>
              <select className="select" value={sex} onChange={(e) => setSex(e.target.value as 'f' | 'm')}>
                <option value="f">женский</option>
                <option value="m">мужской</option>
              </select>
            </label>
          </div>
          {Number(age) > 0 && Number(age) < 18 && <div className="callout callout-red small">Пациенты младше 18 лет не входят в MVP: «Авиандр» противопоказан до 18 лет; подростковый режим — следующий этап.</div>}
          <button className="btn btn-primary" disabled={!name.trim() || !(Number(age) >= 18)} onClick={() => setMade(invitePatient(me, name.trim(), Number(age), sex))}>
            <QrCode /> Создать приглашение
          </button>
        </section>
        {made && (
          <section className="card card-pad-lg stack rise-in" style={{ gap: 14, alignItems: 'center', textAlign: 'center' }}>
            <div className="eyebrow">Приглашение для {made.name}</div>
            <div style={{ padding: 14, background: '#fff', borderRadius: 18, border: '1px solid var(--border)' }}>
              <QRCodeSVG value={url} size={180} fgColor="#3a2b73" />
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <div className="small muted">Код для входа</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, letterSpacing: '0.04em' }}>{made.inviteCode}</div>
            </div>
            <p className="small ink-2">Пациент открывает приложение, вводит код, читает, что такое Компас и чем он не является, и подписывает согласия — отдельно по каждой цели.</p>
            <button className="btn" onClick={() => openSecondWindow('/patient')}>
              <SplitSquareHorizontal /> Открыть кабинет пациента
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
