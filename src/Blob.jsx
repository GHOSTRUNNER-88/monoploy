const BLOB = "M20 3.5C30.5 3.5 36.5 11.5 36.5 21.5C36.5 31 30 36.5 20 36.5C10 36.5 3.5 31 3.5 21.5C3.5 11.5 9.5 3.5 20 3.5Z";

// A player's character: a coloured blob with eyes. Used for tokens and avatars.
export function Blob({ color, className = "" }) {
  return (
    <svg className={`blob ${className}`} viewBox="0 0 40 40" aria-hidden>
      <path d={BLOB} fill={color} />
      <path d={BLOB} fill="url(#blob-shade)" />
      <ellipse cx="13" cy="10.5" rx="5.5" ry="2.6" fill="#fff" opacity="0.4" transform="rotate(-18 13 10.5)" />
      <g className="eyes">
        <ellipse cx="14" cy="19" rx="4.4" ry="5.2" fill="#fff" />
        <ellipse cx="26" cy="19" rx="4.4" ry="5.2" fill="#fff" />
        <g className="pupils">
          <circle cx="14.6" cy="20" r="2.4" fill="#141824" />
          <circle cx="26.6" cy="20" r="2.4" fill="#141824" />
          <circle cx="15.4" cy="19" r="0.8" fill="#fff" />
          <circle cx="27.4" cy="19" r="0.8" fill="#fff" />
        </g>
      </g>
    </svg>
  );
}

// Shared shading gradient for every blob (rendered once).
export function BlobDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <linearGradient id="blob-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>
      </defs>
    </svg>
  );
}
