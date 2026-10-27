export function CompassMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="km-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5a47a6" />
          <stop offset="1" stopColor="#3a2b73" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#km-bg)" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#e9e4ff" strokeOpacity=".35" strokeWidth="2" />
      <path d="M32 10 L37 32 L32 54 L27 32 Z" fill="#f1eeff" />
      <path d="M10 32 L32 27 L54 32 L32 37 Z" fill="#9fe3c9" />
      <circle cx="32" cy="32" r="4.5" fill="#3a2b73" stroke="#f1eeff" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ sub }: { sub?: string }) {
  return (
    <div className="logo">
      <CompassMark />
      <div className="logo-text">
        <span className="logo-name">Компас</span>
        {sub && <span className="logo-sub">{sub}</span>}
      </div>
    </div>
  );
}
