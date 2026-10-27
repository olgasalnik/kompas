import type { DB, Patient, ScaleId } from '../core/types';
import { DAY } from '../core/time';

export function firstName(p: Patient) {
  return p.name.split(' ')[0];
}

export function greeting(now: Date) {
  const h = now.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

/** Какие опросники ждут пациента: расписание врача (исходно, 2 и 4 недели, далее раз в 4 недели) + триггер PHQ-4 */
export function pendingScales(db: DB, p: Patient, now: Date): { scale: ScaleId; reason: string }[] {
  const mine = db.assessments.filter((a) => a.patientId === p.id && a.enteredBy !== 'doctor');
  const last = (s: ScaleId) => mine.filter((a) => a.scale === s).sort((a, b) => b.at.localeCompare(a.at))[0];
  const age = (s: ScaleId) => {
    const l = last(s);
    return l ? (now.getTime() - Date.parse(l.at)) / DAY : Infinity;
  };
  const res: { scale: ScaleId; reason: string }[] = [];
  const active = db.prescriptions.some((r) => r.patientId === p.id && (r.status === 'confirmed' || r.status === 'modified'));
  const therapyDays = active && p.therapyStart ? (now.getTime() - Date.parse(p.therapyStart)) / DAY : 0;
  const period = therapyDays > 28 ? 28 : 14;
  const phq4 = last('PHQ4');
  const triggeredAnx = phq4?.subscores && phq4.subscores.anxiety >= 3 && (!last('GAD7') || last('GAD7').at < phq4.at);
  const triggeredDep = phq4?.subscores && phq4.subscores.depression >= 3 && (!last('PHQ9') || last('PHQ9').at < phq4.at);
  if (active && age('PHQ9') >= period) res.push({ scale: 'PHQ9', reason: 'по расписанию врача' });
  else if (triggeredDep) res.push({ scale: 'PHQ9', reason: 'по результату короткого опросника' });
  if (active && age('GAD7') >= period) res.push({ scale: 'GAD7', reason: 'по расписанию врача' });
  else if (triggeredAnx) res.push({ scale: 'GAD7', reason: 'по результату короткого опросника' });
  if (age('PHQ4') >= 7 && !res.length) res.push({ scale: 'PHQ4', reason: 'короткий еженедельный опросник' });
  return res;
}

export const SCALE_TIME: Record<string, string> = { PHQ9: '9 вопросов · около 2 минут', GAD7: '7 вопросов · около 1,5 минут', PHQ4: '4 вопроса · меньше минуты' };
export const SCALE_TITLE: Record<string, string> = { PHQ9: 'Опросник о настроении', GAD7: 'Опросник о тревоге', PHQ4: 'Короткий опросник' };
