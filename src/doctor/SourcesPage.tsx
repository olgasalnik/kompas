import { useState } from 'react';
import { BadgeCheck, BookMarked, CircleAlert, FileJson2 } from 'lucide-react';
import sources from '../data/sources.json';
import { ALERT_RULES, AVIANDR_RULES, ROUTING_RULES } from '../core/clinical';
import { SCALES } from '../core/scales';
import { WhyButton } from '../ui/Why';
import type { Rule } from '../core/types';

const TYPE: Record<Rule['type'], string> = { STOP: 'СТОП', WARN: 'ВНИМАНИЕ', INDICATION: 'Показание', OFF_LABEL: 'Вне инструкции', SUGGEST: 'Предложение', ALERT: 'Сигнал', ROUTE: 'Маршрут' };

export function SourcesPage() {
  const [kind, setKind] = useState<'all' | 'drug' | 'alert' | 'route'>('all');
  const rules = [
    ...(kind === 'all' || kind === 'drug' ? AVIANDR_RULES : []),
    ...(kind === 'all' || kind === 'alert' ? ALERT_RULES : []),
    ...(kind === 'all' || kind === 'route' ? ROUTING_RULES : []),
  ];
  return (
    <div className="stack fade-in" style={{ gap: 22 }}>
      <div className="page-head">
        <div>
          <h1>Источники и правила</h1>
          <p>Каждый вывод системы привязан к правилу с версией, источником и датой проверки. Правила хранятся как данные — добавление шкалы, препарата или порога не меняет ядро.</p>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <BookMarked /> Реестр источников
          </div>
          <span className="xs muted">проверка открытых источников: {sources.checkedAt}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Тип</th>
                <th>Название</th>
                <th>Статус</th>
                <th>Условия использования</th>
                <th>Что осталось</th>
              </tr>
            </thead>
            <tbody>
              {sources.sources.map((s) => (
                <tr key={s.id}>
                  <td className="strong">{s.id}</td>
                  <td className="small nowrap">{s.type}</td>
                  <td className="small">
                    <div className="strong">{s.title}</div>
                    <div className="xs muted">
                      {s.org}
                      {s.year && s.year !== '—' ? ` · ${s.year}` : ''}
                    </div>
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noreferrer" className="xs">
                        {s.link.replace('https://', '')}
                      </a>
                    )}
                  </td>
                  <td className="small">
                    <span className={`badge ${s.verified ? 'badge-mint' : 'badge-amber'}`}>
                      {s.verified ? <BadgeCheck /> : <CircleAlert />}
                      {s.verified ? 'найден' : 'не подтверждён'}
                    </span>
                    <div className="xs muted" style={{ marginTop: 4 }}>
                      {s.status}
                    </div>
                  </td>
                  <td className="xs">{s.license}</td>
                  <td className="xs muted">{s.todo || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title">Психометрические инструменты</div>
          <span className="xs muted">в продукте не называются «валидированными» без источника</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Шкала</th>
                <th>Назначение</th>
                <th>Кто заполняет</th>
                <th>Градации (ключ подсчёта)</th>
                <th>Источник</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(SCALES).map((s) => (
                <tr key={s.id}>
                  <td className="strong nowrap">{s.name}</td>
                  <td className="small">{s.purpose}</td>
                  <td className="small">{s.filledBy === 'patient' ? 'пациент' : 'врач'}</td>
                  <td className="xs">{s.bands.length ? s.bands.map((b) => `${b.min}–${b.max} ${b.label}`).join(' · ') : 'без градаций (на проверке)'}</td>
                  <td className="small">{s.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <div className="card-title">
            <FileJson2 /> Реестр правил ({rules.length})
          </div>
          <div className="segmented">
            {(
              [
                ['all', 'Все'],
                ['drug', 'Пакет «Авиандр»'],
                ['alert', 'Сигналы'],
                ['route', 'Маршрутизация'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>rule_id</th>
                <th>Тип</th>
                <th>Формулировка</th>
                <th>Источник</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">
                    <code>{r.id}</code>
                    <div className="xs muted">v{r.version}</div>
                  </td>
                  <td>
                    <span className={`badge ${r.type === 'STOP' ? 'badge-red' : r.type === 'WARN' ? 'badge-orange' : r.level ? `badge-${r.level}` : r.category === 'desirable' ? 'badge-amber badge-dashed' : r.category ? 'badge-red' : 'badge-brand'}`}>
                      {TYPE[r.type]}
                      {r.level ? ` · ${{ red: 'красный', orange: 'оранжевый', yellow: 'жёлтый' }[r.level]}` : ''}
                    </span>
                  </td>
                  <td className="small">{r.title}</td>
                  <td className="xs">
                    <b>{r.source.id}</b> · {r.source.section}
                  </td>
                  <td className="xs muted">{r.approvedBy}</td>
                  <td>
                    <WhyButton ruleId={r.id} label="Открыть" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
