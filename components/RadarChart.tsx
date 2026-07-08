'use client';

type RadarVector = {
  id:    string;
  label: string;
  color: string;
  c:     number; // 0–1 current completion
  e:     number; // 0–1 expected pace
};

type Props = { vectors: RadarVector[] };

const W = 440;
const H = 340;
const CX = W / 2;
const CY = H / 2 + 10;
const R  = 128; // max radius

function axisAngle(i: number, n: number): number {
  return -Math.PI / 2 + (i * 2 * Math.PI) / n;
}

function point(value: number, i: number, n: number): [number, number] {
  const angle = axisAngle(i, n);
  return [CX + R * value * Math.cos(angle), CY + R * value * Math.sin(angle)];
}

function polygon(values: number[], n: number): string {
  return values.map((v, i) => point(v, i, n).join(',')).join(' ');
}

const RINGS = [0.2, 0.4, 0.6, 0.8, 1.0];

export default function RadarChart({ vectors }: Props) {
  const n = vectors.length;
  if (n < 3) return null;

  const behindCount = vectors.filter(v => v.c < v.e).length;
  const caption = behindCount === 0
    ? 'all vectors on pace'
    : `${behindCount} of ${n} behind quarterly pace`;

  const cValues = vectors.map(v => v.c);
  const eValues = vectors.map(v => v.e);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Vectors</span>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>
          {caption}
        </span>
      </div>

      {/* Chart */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>

        {/* Concentric ring grid */}
        {RINGS.map(r => (
          <polygon
            key={r}
            points={polygon(Array(n).fill(r), n)}
            fill="none"
            stroke={`rgba(41,39,35,${r === 1 ? 0.09 : 0.05})`}
            strokeWidth={1}
          />
        ))}

        {/* Axis lines from center to each vertex */}
        {vectors.map((_, i) => {
          const [x, y] = point(1, i, n);
          return (
            <line
              key={i}
              x1={CX} y1={CY} x2={x} y2={y}
              stroke="rgba(41,39,35,0.07)"
              strokeWidth={1}
            />
          );
        })}

        {/* Ring scale labels on the top axis */}
        {RINGS.map(r => {
          const [x, y] = point(r, 0, n);
          return (
            <text
              key={r}
              x={x + 5} y={y + 3}
              fontSize={8}
              fontFamily="var(--font-mono)"
              fill="rgba(41,39,35,0.35)"
            >
              {Math.round(r * 100)}
            </text>
          );
        })}

        {/* "On pace" dashed polygon */}
        <polygon
          points={polygon(eValues, n)}
          fill="none"
          stroke="rgba(41,39,35,0.28)"
          strokeWidth={1.5}
          strokeDasharray="4,3"
        />

        {/* "Now" filled polygon */}
        <polygon
          points={polygon(cValues, n)}
          fill="rgba(41,39,35,0.05)"
          stroke="rgba(41,39,35,0.14)"
          strokeWidth={1.5}
        />

        {/* Center dot */}
        <circle cx={CX} cy={CY} r={3} fill="rgba(41,39,35,0.15)" />

        {/* Axis tip faint dots */}
        {vectors.map((_, i) => {
          const [x, y] = point(1, i, n);
          return <circle key={i} cx={x} cy={y} r={2.5} fill="rgba(41,39,35,0.08)" />;
        })}

        {/* Current position colored dots */}
        {vectors.map((v, i) => {
          const [x, y] = point(v.c, i, n);
          return <circle key={v.id} cx={x} cy={y} r={7} fill={v.color} />;
        })}

        {/* Axis labels */}
        {vectors.map((v, i) => {
          const angle = axisAngle(i, n);
          const labelR = R + 22;
          const lx = CX + labelR * Math.cos(angle);
          const ly = CY + labelR * Math.sin(angle);
          const anchor = Math.cos(angle) > 0.1 ? 'start' : Math.cos(angle) < -0.1 ? 'end' : 'middle';
          return (
            <g key={v.id}>
              <text
                x={lx}
                y={ly - 5}
                textAnchor={anchor}
                fontSize={13}
                fontWeight={500}
                fontFamily="var(--font-sans)"
                fill="var(--ink)"
              >
                {v.label}
              </text>
              <text
                x={lx}
                y={ly + 9}
                textAnchor={anchor}
                fontSize={10}
                fontFamily="var(--font-mono)"
                fill="var(--ink-faint)"
              >
                {Math.round(v.c * 100)}% / {Math.round(v.e * 100)}%
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width={20} height={10}>
            <line x1={0} y1={5} x2={20} y2={5} stroke="rgba(41,39,35,0.28)" strokeWidth={1.5} strokeDasharray="4,3" />
          </svg>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>on pace</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(41,39,35,0.10)', border: '1.5px solid rgba(41,39,35,0.14)' }} />
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-soft)' }}>now</span>
        </div>
      </div>
    </div>
  );
}
