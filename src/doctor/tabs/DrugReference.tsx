// Справка о препарате для врача: группа, механизм, фармакокинетика, нежелательные реакции по системам органов,
// передозировка, форма выпуска. У каждого блока — источник; расхождения между источниками показаны открыто.
import { BookMarked, TriangleAlert } from 'lucide-react';
import { DRUG_PACKS } from '../../core/clinical';
import { sourceById } from '../../ui/Why';

const pack = DRUG_PACKS.aviandr;

function Src({ id }: { id: string }) {
  const s = sourceById(id);
  return (
    <span className="badge badge-outline" title={s ? `${s.title}. ${s.status}` : id}>
      {id}
    </span>
  );
}

export function DrugReference() {
  const cyp = pack.interactionGroups.find((g) => g.id === 'cyp2d6') as { sourceNote?: string } | undefined;
  return (
    <section className="card">
      <div className="card-head">
        <div className="card-title">
          <BookMarked /> Справка о препарате
        </div>
        <span className="xs muted">для врача · с источниками</span>
      </div>
      <div className="card-body stack" style={{ gap: 10 }}>
        <dl className="ref-grid small">
          <dt>Фармакологическая группа</dt>
          <dd>
            {pack.group}; действие — {pack.action.toLowerCase()} <Src id="S14" />
          </dd>
          <dt>Аналоги</dt>
          <dd>{pack.analogs}</dd>
          <dt>Форма выпуска</dt>
          <dd>
            {pack.release} <Src id="S14" />
          </dd>
          <dt>Отпуск</dt>
          <dd>
            По рецепту, бланк № {pack.prescription.blank} <Src id="S15" />
          </dd>
        </dl>

        <details>
          <summary className="small strong" style={{ cursor: 'pointer' }}>
            Механизм действия
          </summary>
          <p className="small ink-2" style={{ marginTop: 6 }}>
            {pack.mechanism} <Src id={pack.mechanismSource} />
          </p>
        </details>

        <details>
          <summary className="small strong" style={{ cursor: 'pointer' }}>
            Фармакокинетика
          </summary>
          <ul className="bullets small" style={{ marginTop: 6 }}>
            {pack.pharmacokinetics.items.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <div className="xs muted" style={{ marginTop: 4 }}>
            Источник <Src id={pack.pharmacokinetics.source} /> — вторичный, сверить с ОХЛП.
          </div>
        </details>

        <details>
          <summary className="small strong" style={{ cursor: 'pointer' }}>
            Нежелательные реакции по системам органов
          </summary>
          <div className="table-wrap" style={{ marginTop: 6 }}>
            <table className="table small">
              <thead>
                <tr>
                  <th>Система</th>
                  <th>Часто</th>
                  <th>Нечасто</th>
                </tr>
              </thead>
              <tbody>
                {pack.adverseReactions.bySystem.map((r) => (
                  <tr key={r.system}>
                    <td className="strong">{r.system}</td>
                    <td>{r.frequent.join(', ') || '—'}</td>
                    <td>{r.infrequent.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details>
          <summary className="small strong" style={{ cursor: 'pointer' }}>
            Передозировка
          </summary>
          <p className="small ink-2" style={{ marginTop: 6 }}>
            {pack.overdose}. <Src id="S4" />
          </p>
        </details>

        {cyp?.sourceNote && (
          <div className="callout callout-amber small">
            <TriangleAlert />
            <span>
              <b>Расхождение источников.</b> {cyp.sourceNote}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
