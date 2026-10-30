// A simple line chart of price over time, one line per vendor. Drawn with plain SVG (no chart library).
import { formatDate, formatINR } from '@/lib/format';

export interface ChartPoint {
  date: string; // YYYY-MM-DD
  price: number;
}
export interface ChartSeries {
  name: string;
  points: ChartPoint[];
}

export const SERIES_COLORS = ['#0f766e', '#d97706', '#2563eb', '#db2777', '#7c3aed', '#65a30d'];

const W = 360;
const H = 220;
const M = { left: 52, right: 12, top: 12, bottom: 30 };

const day = (iso: string) => Date.parse(iso + 'T00:00:00Z') / 86_400_000;

export function PriceChart({ series, label }: { series: ChartSeries[]; label: string }) {
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;

  const xMin = Math.min(...all.map((p) => day(p.date)));
  const xMax = Math.max(...all.map((p) => day(p.date)));
  let yMin = Math.min(...all.map((p) => p.price));
  let yMax = Math.max(...all.map((p) => p.price));
  const pad = (yMax - yMin) * 0.12 || yMax * 0.05 || 1; // some air above and below the lines
  yMin -= pad;
  yMax += pad;

  const x = (iso: string) => M.left + (xMax === xMin ? (W - M.left - M.right) / 2 : ((day(iso) - xMin) / (xMax - xMin)) * (W - M.left - M.right));
  const y = (price: number) => M.top + (1 - (price - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);

  const yTicks = [0, 1, 2, 3].map((i) => yMin + ((yMax - yMin) * i) / 3);
  const xTicks = xMax === xMin ? [all[0].date] : [all.reduce((a, b) => (a.date < b.date ? a : b)).date, all.reduce((a, b) => (a.date > b.date ? a : b)).date];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={M.left} x2={W - M.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={M.left - 6} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#475569">
              {formatINR(tick, true)}
            </text>
          </g>
        ))}
        {xTicks.map((date, i) => (
          <text
            key={date}
            x={x(date)}
            y={H - 8}
            textAnchor={xTicks.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'}
            fontSize="11"
            fill="#475569"
          >
            {formatDate(date)}
          </text>
        ))}
        {series.map((s, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          const points = [...s.points].sort((a, b) => a.date.localeCompare(b.date));
          return (
            <g key={s.name}>
              {points.length > 1 && (
                <polyline
                  fill="none"
                  stroke={color}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={points.map((p) => `${x(p.date)},${y(p.price)}`).join(' ')}
                />
              )}
              {points.map((p, j) => (
                <circle key={j} cx={x(p.date)} cy={y(p.price)} r="3.5" fill={color}>
                  <title>
                    {s.name}: {formatINR(p.price)} on {formatDate(p.date)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {series.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
