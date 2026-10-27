// Запас таблеток по выписанным рецептам: «хватит до …» и кнопка «Попросить рецепт», когда остаётся мало.
import { FileText } from 'lucide-react';
import type { Prescription } from '../core/types';
import { useDB, standNow } from '../store/db';
import { requestRecipe } from '../store/api';
import { supplyOf, SUPPLY_WARN_DAYS } from '../core/recipe';
import { fmtDate, plural } from '../core/time';
import { toast } from '../ui/Toasts';

export function SupplyNote({ patientId, rx }: { patientId: string; rx: Prescription }) {
  const db = useDB();
  const now = standNow(db);
  const s = supplyOf(rx, now);
  if (!s) return null;
  const asked = db.messages.some((m) => m.patientId === patientId && m.intent === 'recipe_request' && m.at > s.last.at);
  const low = s.daysLeft <= SUPPLY_WARN_DAYS;
  if (!low)
    return (
      <div className="xs muted row" style={{ gap: 6, paddingTop: 4 }}>
        <FileText size={13} /> Таблеток по рецепту хватит примерно до {fmtDate(s.until)}
      </div>
    );
  return (
    <div className="callout callout-amber small" style={{ marginTop: 6 }}>
      <FileText />
      <span className="stack" style={{ gap: 6 }}>
        <span>
          {s.daysLeft > 0
            ? `Таблетки заканчиваются: по рецепту хватит примерно на ${s.daysLeft} ${plural(s.daysLeft, 'день', 'дня', 'дней')} (до ${fmtDate(s.until)}).`
            : 'Таблетки по последнему рецепту, вероятно, закончились.'}{' '}
          Новый рецепт выписывает врач.
        </span>
        {asked ? (
          <span className="xs strong">Просьба отправлена врачу</span>
        ) : (
          <button
            className="btn btn-sm btn-soft"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              requestRecipe(patientId);
              toast('Просьба отправлена врачу', { tone: 'ok', sub: 'Когда рецепт будет готов, придёт уведомление' });
            }}
          >
            Попросить рецепт
          </button>
        )}
      </span>
    </div>
  );
}
