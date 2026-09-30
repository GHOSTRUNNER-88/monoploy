// Simple round flags, one per country group. Drawn on a 30x30 box and clipped to a circle.
const stripes = (dir, colors) =>
  colors.map((c, i) =>
    dir === "h" ? <rect key={i} x="0" y={(30 / colors.length) * i} width="30" height={30 / colors.length + 0.5} fill={c} /> : <rect key={i} y="0" x={(30 / colors.length) * i} height="30" width={30 / colors.length + 0.5} fill={c} />
  );

const FLAGS = {
  egypt: <>{stripes("h", ["#ce1126", "#fff", "#111"])}<circle cx="15" cy="15" r="2.6" fill="#c09300" /></>,
  nepal: (
    <>
      <rect width="30" height="30" fill="#fff" />
      <path d="M9 4 L23 13 H13 L23 26 H9 Z" fill="#dc143c" stroke="#003893" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="13.2" cy="11" r="1.6" fill="#fff" />
      <circle cx="13.2" cy="21" r="2" fill="#fff" />
    </>
  ),
  italy: stripes("v", ["#009246", "#fff", "#ce2b37"]),
  germany: stripes("h", ["#111", "#dd0000", "#ffce00"]),
  china: (
    <>
      <rect width="30" height="30" fill="#de2910" />
      <path d="M10 5 l1.8 5.4 h5.6 l-4.6 3.4 1.8 5.4 -4.6 -3.4 -4.6 3.4 1.8 -5.4 -4.6 -3.4 h5.6z" fill="#ffde00" transform="translate(1 2) scale(0.9)" />
      {[[19, 7], [22, 11], [22, 16], [19, 20]].map(([x, y]) => <circle key={x + "" + y} cx={x} cy={y} r="1.3" fill="#ffde00" />)}
    </>
  ),
  france: stripes("v", ["#0055a4", "#fff", "#ef4135"]),
  uk: (
    <>
      <rect width="30" height="30" fill="#012169" />
      <path d="M0 0 L30 30 M30 0 L0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0 L30 30 M30 0 L0 30" stroke="#c8102e" strokeWidth="2" />
      <path d="M15 0 V30 M0 15 H30" stroke="#fff" strokeWidth="8" />
      <path d="M15 0 V30 M0 15 H30" stroke="#c8102e" strokeWidth="4.5" />
    </>
  ),
  usa: (
    <>
      {stripes("h", ["#b22234", "#fff", "#b22234", "#fff", "#b22234", "#fff", "#b22234"])}
      <rect width="15" height="15" fill="#3c3b6e" />
      {[3, 7.5, 12].flatMap((x) => [3, 7.5, 12].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" fill="#fff" />))}
    </>
  ),
};

export function Flag({ group, className = "", style }) {
  return (
    <svg viewBox="0 0 30 30" className={`flag ${className}`} style={style} aria-hidden>
      <clipPath id={`flag-${group}`}>
        <circle cx="15" cy="15" r="15" />
      </clipPath>
      <g clipPath={`url(#flag-${group})`}>{FLAGS[group]}</g>
      <circle cx="15" cy="15" r="14" fill="none" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}
