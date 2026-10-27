// Рецепт для записи врача: Rp./D.S. по МНН на латыни (образец — справочник AllMed PRO), бланк № 107-1/у,
// количество кратно упаковке, расчёт «на сколько дней хватит» и запас по уже выписанным рецептам.
import { useState } from 'react';
import { ClipboardCopy, FilePenLine, FileText } from 'lucide-react';
import type { Patient, Prescription } from '../../core/types';
import { useDB, standNow } from '../../store/db';
import { issueRecipe } from '../../store/api';
import { aviandrRecipe, defaultQty, QTY_OPTIONS, RECIPE_BLANK, signaFor, supplyOf, SUPPLY_WARN_DAYS } from '../../core/recipe';
import { tabletsPerDay } from '../../core/dose';
import { DAY, fmtDate, plural } from '../../core/time';
import { copyText } from '../../ui/hooks';
import { toast } from '../../ui/Toasts';

export function RecipeCard({ p, rx, me, postCovid }: { p: Patient; rx: Prescription; me: string; postCovid: boolean }) {
  const db = useDB();
  const now = standNow(db);
  const [qty, setQty] = useState(() => defaultQty(postCovid));
  const [signa, setSigna] = useState(() => signaFor(rx));
  const recipe = aviandrRecipe(qty, signa);
  const perDay = tabletsPerDay(signa);
  const supply = supplyOf(rx, now);
  const asked = db.messages.some((m) => m.patientId === p.id && m.intent === 'recipe_request' && (!supply || m.at > supply.last.at));
  const history = [...(rx.recipes ?? [])].reverse();

  return (
    <div className="card card-flat stack" style={{ padding: 14, gap: 10 }} id="recipe">
      <div className="row spread wrap" style={{ gap: 8 }}>
        <div className="strong row" style={{ gap: 8 }}>
          <FileText size={18} color="var(--brand)" /> Рецепт
        </div>
        <span className="badge badge-outline">бланк № {RECIPE_BLANK} · по МНН</span>
      </div>

      {supply && (
        <div className={`callout small ${supply.daysLeft <= SUPPLY_WARN_DAYS ? 'callout-amber' : ''}`}>
          <FileText />
          <span>
            Запас по {supply.count} {plural(supply.count, 'рецепту', 'рецептам', 'рецептам')}: примерно до <b>{fmtDate(supply.until)}</b>
            {supply.daysLeft > 0 ? ` (осталось ${supply.daysLeft} ${plural(supply.daysLeft, 'день', 'дня', 'дней')})` : ' — закончился'}.
            {asked && ' Пациент просит выписать новый рецепт.'}
          </span>
        </div>
      )}

      <pre className="recipe" aria-label="Текст рецепта">
        {recipe.rp}
        {'\n'}
        {recipe.ds}
      </pre>

      <div className="stack" style={{ gap: 6 }}>
        <span className="xs muted strong">Количество (кратно упаковке по 30 таблеток)</span>
        <div className="segmented" role="group" aria-label="Количество таблеток">
          {QTY_OPTIONS.map((n) => (
            <button key={n} aria-pressed={qty === n} onClick={() => setQty(n)}>
              № {n}
              {perDay ? ` · ${Math.floor(n / perDay)} дн.` : ''}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span className="label">D.S. — способ применения (как в плане пациента; можно поправить)</span>
        <textarea className="textarea" value={signa} onChange={(e) => setSigna(e.target.value)} style={{ minHeight: 56 }} aria-label="Способ применения (D.S.)" />
      </label>
      <div className="xs ink-2">
        {recipe.days !== null ? (
          <>
            Хватит на {recipe.days} {plural(recipe.days, 'день', 'дня', 'дней')} — до {fmtDate(new Date(now.getTime() + recipe.days * DAY))}.{' '}
          </>
        ) : (
          'Не удалось посчитать суточное количество по тексту D.S. — запас не будет рассчитан. '
        )}
        Доза в рецепте — в граммах: 20 мг = 0,02 г.
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={signa.trim().length < 10}
          onClick={() => {
            try {
              issueRecipe(p.id, me, qty, signa);
              toast('Рецепт выписан и записан в карту', { tone: 'ok', sub: 'Пациент получит уведомление без названия препарата' });
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          <FilePenLine /> Выписать рецепт
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={async () => {
            const ok = await copyText(recipe.text);
            toast(ok ? 'Рецепт скопирован' : 'Не удалось скопировать', { tone: ok ? 'ok' : 'default' });
          }}
        >
          <ClipboardCopy /> Копировать
        </button>
      </div>

      {history.length > 0 && (
        <details>
          <summary className="small muted" style={{ cursor: 'pointer' }}>
            Выписанные рецепты ({history.length})
          </summary>
          <ul className="list-plain stack small" style={{ gap: 4, marginTop: 6 }}>
            {history.map((r) => (
              <li key={r.id} className="row spread" style={{ gap: 8 }}>
                <span>
                  {fmtDate(r.at)} · № {r.qty}
                  {r.days ? ` · на ${r.days} дн.` : ''}
                </span>
                <span className="xs muted">{db.users.find((u) => u.id === r.by)?.name ?? r.by}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="xs muted">
        Образец оформления — справочник AllMed PRO (S14). Требования к бланку № 107-1/у — приказ Минздрава № 1094н (S15, сверить действующую редакцию). Электронный рецепт через МИС
        — в пилоте.
      </div>
    </div>
  );
}
