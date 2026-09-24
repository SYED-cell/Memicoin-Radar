import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ScorePoint } from '../../types';
import { formatDateTime } from '../../utils/format';
import { AXIS_PROPS, ChartEmpty, ChartTooltip, formatAxisTime, GRID_PROPS, spanOf } from './chartTheme';

/** Opportunity vs risk score over time — shows how the model's read evolved. */
export function ScoreHistoryChart({ data, height = 180 }: { data: ScorePoint[]; height?: number }) {
  if (data.length < 2) return <ChartEmpty height={height} label="Score history builds as updates arrive…" />;
  return (
    <div style={{ height }} className="w-full min-w-0" role="img" aria-label="Opportunity and risk score history">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t: number) => formatAxisTime(t, spanOf(data))} minTickGap={40} {...AXIS_PROPS} />
          <YAxis orientation="right" width={32} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} {...AXIS_PROPS} />
          <Tooltip
            content={(p) => (
              <ChartTooltip<ScorePoint>
                active={p.active}
                payload={p.payload}
                render={(row) => ({
                  title: formatDateTime(row.t),
                  rows: [
                    ['Opportunity', `${row.score}/100`, 'var(--color-primary)'],
                    ['Risk', `${row.risk}/100`, 'var(--color-danger)'],
                  ],
                })}
              />
            )}
          />
          <Line type="stepAfter" dataKey="score" stroke="var(--color-primary)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="stepAfter" dataKey="risk" stroke="var(--color-danger)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
