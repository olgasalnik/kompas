// «Сканы» синтетических документов для демонстрации распознавания текста: SVG с бумажным фоном, лёгким наклоном
// и печатью, как у отсканированной выписки. Организации и врачи вымышлены, на каждом листе — пометка «синтетический».

export interface ScanLine {
  text: string;
  size?: number;
  bold?: boolean;
  center?: boolean;
  cols?: [string, string, string]; // строка таблицы
  gap?: number; // дополнительный отступ перед строкой
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function scanSvg(lines: ScanLine[], opts: { tilt?: number; stamp?: string } = {}): string {
  const W = 820;
  let y = 70;
  const parts: string[] = [];
  for (const l of lines) {
    const size = l.size ?? 21;
    y += (l.gap ?? 0) + size * 1.55;
    const weight = l.bold ? ' font-weight="700"' : '';
    if (l.cols) {
      const [a, b, c] = l.cols;
      parts.push(`<text x="70" y="${y}" font-size="${size}"${weight}>${esc(a)}</text>`);
      parts.push(`<text x="350" y="${y}" font-size="${size}"${weight}>${esc(b)}</text>`);
      parts.push(`<text x="580" y="${y}" font-size="${size}"${weight}>${esc(c)}</text>`);
    } else if (l.center) {
      parts.push(`<text x="${W / 2}" y="${y}" font-size="${size}" text-anchor="middle"${weight}>${esc(l.text)}</text>`);
    } else {
      parts.push(`<text x="70" y="${y}" font-size="${size}"${weight}>${esc(l.text)}</text>`);
    }
  }
  const H = Math.round(y + 170);
  const stamp = opts.stamp
    ? `<g transform="translate(${W - 190} ${H - 120}) rotate(-12)" fill="none" stroke="#3a55b4" stroke-opacity=".55"><circle r="62" stroke-width="3"/><circle r="50" stroke-width="1.5"/><text y="7" font-size="17" text-anchor="middle" fill="#3a55b4" fill-opacity=".6" stroke="none" font-weight="700">${esc(opts.stamp)}</text></g>`
    : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs><filter id="paper"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .35 0 0 0 0 .32 0 0 0 0 .28 0 0 0 .07 0"/></filter></defs>` +
    `<rect width="${W}" height="${H}" fill="#f7f4ec"/><rect width="${W}" height="${H}" filter="url(#paper)"/>` +
    `<g transform="rotate(${opts.tilt ?? -0.5} ${W / 2} ${H / 2})" font-family="'Times New Roman', 'Liberation Serif', Times, serif" fill="#23211f">${parts.join('')}` +
    `<path d="M 300 ${H - 92} c 18 -26 30 8 44 -10 s 22 -20 30 4 s 26 -8 40 -2" fill="none" stroke="#2b3f8f" stroke-width="2" stroke-opacity=".7"/></g>` +
    `${stamp}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const fmtPaperDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

/** Скан выписки другого врача: сертралин — для сценария 3 (сочетанный приём) */
export function dischargeScan(dateIso: string): string {
  return scanSvg(
    [
      { text: 'Медицинский центр «Пример» · синтетический документ', size: 16, center: true },
      { text: 'ВЫПИСКА ИЗ МЕДИЦИНСКОЙ КАРТЫ', size: 24, bold: true, center: true, gap: 14 },
      { text: 'амбулаторного пациента', size: 19, center: true },
      { text: 'Пациентка: П-038', gap: 26 },
      { text: `Дата приёма: ${fmtPaperDate(dateIso)}` },
      { text: 'Жалобы: тревога, внутреннее напряжение, трудности засыпания.', gap: 12 },
      { text: 'Диагноз: F41.1 Генерализованное тревожное расстройство.' },
      { text: 'Назначено: сертралин 50 мг 1 раз в сутки утром.' },
      { text: 'Рекомендовано: наблюдение, контроль через 4 недели.' },
      { text: 'Врач-терапевт Петрова А. В. (вымышленный врач)', gap: 40 },
    ],
    { tilt: -0.6, stamp: 'ОБРАЗЕЦ' },
  );
}

/** Скан результатов анализов — для сценария 1 */
export function labScan(dateIso: string): string {
  return scanSvg(
    [
      { text: 'Лаборатория «Пример» · синтетический документ', size: 16, center: true },
      { text: 'РЕЗУЛЬТАТЫ ЛАБОРАТОРНЫХ ИССЛЕДОВАНИЙ', size: 23, bold: true, center: true, gap: 14 },
      { text: `Дата взятия: ${fmtPaperDate(dateIso)}`, gap: 18 },
      { text: '', cols: ['Показатель', 'Результат', 'Референс'], bold: true, gap: 16 },
      { text: '', cols: ['ТТГ', '1,8 мЕд/л', '0,4–4,0'] },
      { text: '', cols: ['Гемоглобин', '132 г/л', '120–160'] },
      { text: '', cols: ['Глюкоза', '5,1 ммоль/л', '3,9–6,1'] },
      { text: 'Заключение: показатели в пределах референсных значений.', gap: 18 },
    ],
    { tilt: 0.4, stamp: 'ОБРАЗЕЦ' },
  );
}
