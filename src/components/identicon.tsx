/** FNV-1a 32-bit hash. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface IdenticonProps {
  /** Deterministic seed — identity address, vault ID, etc. */
  seed: string;
  size?: number;
  radius?: number;
  padding?: number;
  style?: React.CSSProperties;
}

/**
 * 5×5 symmetric identicon generated from an FNV-1a hash of `seed`.
 * Columns 0↔4 and 1↔3 are mirrored; column 2 is the centre.
 * Uses 15 bits for the grid, 9 bits for hue — fully deterministic.
 */
export function Identicon({ seed, size = 32, radius = 4, padding = 2, style }: IdenticonProps) {
  const gridHash = fnv1a(seed);
  const colorHash = fnv1a(seed + "\x00");

  const hue = colorHash % 360;
  const fg = `hsl(${hue}, 65%, 58%)`;
  const bg = `hsl(${hue}, 22%, 11%)`;

  const inner = size - padding * 2;
  const cs = inner / 5; // cell size

  const cells: { x: number; y: number }[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      if (!((gridHash >>> (row * 3 + col)) & 1)) continue;
      cells.push({ x: padding + col * cs, y: padding + row * cs });
      if (col < 2) cells.push({ x: padding + (4 - col) * cs, y: padding + row * cs });
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ borderRadius: radius, flexShrink: 0, ...style }}
    >
      <rect width={size} height={size} fill={bg} rx={radius} />
      {cells.map(({ x, y }, i) => (
        <rect key={i} x={x} y={y} width={cs} height={cs} fill={fg} />
      ))}
    </svg>
  );
}
