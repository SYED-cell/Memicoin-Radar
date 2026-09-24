import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatPercent, formatUsd } from '../../utils/format';
import { ChartTooltip } from './chartTheme';

export interface AllocationSlice {
  name: string;
  value: number;
  color: string;
}

export const ALLOCATION_COLORS = ['#22e07a', '#2f8cff', '#f5b83d', '#9b6bff', '#38bdf8', '#ff6b8a', '#64748b'];

export function AllocationDonut({ data, total, height = 200 }: { data: AllocationSlice[]; total: number; height?: number }) {
  return (
    <div style={{ height }} className="relative w-full min-w-0" role="img" aria-label="Portfolio allocation">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none" isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={(p) => (
              <ChartTooltip<AllocationSlice>
                active={p.active}
                payload={p.payload}
                render={(row) => ({
                  title: row.name,
                  rows: [
                    ['Value', formatUsd(row.value), row.color],
                    ['Share', formatPercent((row.value / total) * 100, 1, false)],
                  ],
                })}
              />
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[10px] text-muted uppercase">Total</p>
          <p className="num text-sm font-bold">{formatUsd(total, 0)}</p>
        </div>
      </div>
    </div>
  );
}
