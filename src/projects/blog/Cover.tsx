// Greeked prose: line widths in the viewBox's user units.
const TEXT_LINES = [228, 210, 137];
const LINE_STAGGER_MS = 80;

// A white page in miniature, drawn 3:2 in a viewBox so it scales with its
// frame. The colours are fixed hex rather than palette tokens, because a Cover
// looks the same in light and dark.
export function Cover() {
  return (
    <svg
      viewBox="0 0 300 200"
      preserveAspectRatio="xMidYMid slice"
      className="size-full"
      aria-hidden="true"
    >
      <rect width="300" height="200" fill="#ffffff" />
      <text
        x="36"
        y="48"
        fill="#202523"
        fontFamily="var(--font-serif)"
        fontSize="34"
        fontStyle="italic"
        fontWeight="500"
      >
        Blog
      </text>
      {TEXT_LINES.map((width, index) => (
        <rect
          key={width}
          x="36"
          y={68 + index * 12}
          width={width}
          height="5.2"
          fill="#dcddd8"
          className="motion-safe:group-hover:animate-cover-line-write motion-safe:group-focus-visible:animate-cover-line-write"
          style={{ animationDelay: `${index * LINE_STAGGER_MS}ms` }}
        />
      ))}
      <rect x="36" y="104" width="178" height="26" fill="#f3e3d6" />
      <rect x="36" y="104" width="3.6" height="26" fill="#d96c1e" />
      <rect
        x="36.5"
        y="137.5"
        width="227"
        height="31"
        fill="#f1f4f1"
        stroke="#dcddd8"
      />
    </svg>
  );
}
