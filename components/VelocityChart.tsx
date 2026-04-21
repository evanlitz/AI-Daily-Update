'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts'
import type { FeedItem } from '@/lib/types'

const TAG_COLORS: Record<string, string> = {
  models:   '#7c6aff',
  tools:    '#fb923c',
  research: '#60a5fa',
  industry: '#34d399',
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const color = TAG_COLORS[label?.toLowerCase()] ?? '#a78bfa'
  return (
    <div
      style={{
        background: 'rgba(5,5,14,0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: '8px 12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      }}
    >
      <p style={{ color: '#e8e8f0', fontSize: 11, fontWeight: 700, marginBottom: 3 }}>{label}</p>
      <p style={{ color, fontSize: 13, fontWeight: 900 }}>{payload[0].value}x</p>
      <p style={{ color: '#3d3d5a', fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' }}>velocity</p>
    </div>
  )
}

export function VelocityChart({ items }: { items: FeedItem[] }) {
  const tagVelocity: Record<string, number[]> = {}
  for (const item of items) {
    for (const tag of item.topic_tags) {
      if (!tagVelocity[tag]) tagVelocity[tag] = []
      tagVelocity[tag].push(item.velocity_score)
    }
  }

  const data = ['models', 'tools', 'research', 'industry'].map(tag => ({
    name: tag.charAt(0).toUpperCase() + tag.slice(1),
    velocity: tagVelocity[tag]?.length
      ? +(tagVelocity[tag].reduce((a, b) => a + b, 0) / tagVelocity[tag].length).toFixed(2)
      : 0,
  }))

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '18px 18px 12px',
      }}
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="eyebrow mb-1">Topic Velocity</p>
          <p style={{ color: '#3d3d5a', fontSize: 11 }}>7-day vs 30-day acceleration</p>
        </div>
        <div className="flex gap-4">
          {Object.entries(TAG_COLORS).map(([tag, color]) => (
            <div key={tag} className="flex items-center gap-1.5">
              <div style={{ width: 6, height: 6, borderRadius: 2, background: color }} />
              <span style={{ color: '#3d3d5a', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {tag}
              </span>
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={148}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#3d3d5a', fontSize: 10, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#3d3d5a', fontSize: 9 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
          <ReferenceLine
            y={1}
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="4 4"
            label={{ value: '1x', fill: '#3d3d5a', fontSize: 9, position: 'right' }}
          />
          <Bar dataKey="velocity" radius={[5, 5, 0, 0]} maxBarSize={44}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={TAG_COLORS[entry.name.toLowerCase()] ?? '#7c6aff'}
                fillOpacity={0.75}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
