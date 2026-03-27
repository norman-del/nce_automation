'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface ChartDatum {
  date: string
  fees: number
}

export default function DashboardChart({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-secondary text-sm">
        No fee data for the last 30 days.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#30363d" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#8b949e', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: '#8b949e', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `£${v}`}
          width={52}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#1c2128',
            border: '1px solid #30363d',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          labelStyle={{ color: '#8b949e', marginBottom: '2px' }}
          itemStyle={{ color: '#388bfd' }}
          formatter={(value) => [`£${Number(value).toFixed(2)}`, 'Fees']}
          cursor={{ fill: 'rgba(56,139,253,0.06)' }}
        />
        <Bar dataKey="fees" fill="#388bfd" radius={[3, 3, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  )
}
