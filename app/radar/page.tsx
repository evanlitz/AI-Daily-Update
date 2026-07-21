'use client'

import { useState, useEffect } from 'react'
import { relTime } from '@/lib/utils'

interface RadarItem {
  id: string
  name: string
  category: string
  quadrant: string
  rationale: string | null
  last_updated: string
  ring_history: { from: string; to: string; date: string }[]
}

interface RadarData {
  grouped: Record<string, RadarItem[]>
  total: number
}

interface RadarMention {
  id: string
  title: string
  url: string
  source: string
  published_at: string | null
}

const QUADRANTS = [
  { key: 'adopt',  label: 'Adopt',  color: '#34d399', rgb: '52,211,153',  sub: 'Proven, use with confidence' },
  { key: 'trial',  label: 'Trial',  color: '#60a5fa', rgb: '96,165,250',  sub: 'Worth pursuing, manage the risk' },
  { key: 'assess', label: 'Assess', color: '#fbbf24', rgb: '251,191,36', sub: 'Worth exploring, understand the impact' },
  { key: 'hold',   label: 'Hold',   color: '#71717a', rgb: '113,113,122', sub: 'Proceed with caution' },
]

function cleanCategory(c: string): string {
  return c.replace(/_/g, ' ')
}

export default function RadarPage() {
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mentions, setMentions] = useState<Record<string, RadarMention[]>>({})
  const [mentionsLoading, setMentionsLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/radar')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (mentions[id]) return
    setMentionsLoading(id)
    fetch(`/api/radar/${id}/mentions`)
      .then(r => r.json())
      .then(list => setMentions(prev => ({ ...prev, [id]: list })))
      .finally(() => setMentionsLoading(null))
  }

  return (
    <main className="mx-auto max-w-screen-2xl px-4 sm:px-10 py-8">
      {/* Header */}
      <div className="mb-8">
        <p className="eyebrow mb-2">Intelligence · Tech Radar</p>
        <h1 style={{
          fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em',
          background: 'linear-gradient(135deg, #f4f4f5 30%, #71717a 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Radar</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>
          Tools and frameworks classified as they emerge from the feed — ThoughtWorks-style adopt/trial/assess/hold.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 rounded-full border border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : !data || data.total === 0 ? (
        <p style={{ color: 'var(--muted)', padding: '40px 0', textAlign: 'center' }}>No radar entries yet.</p>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {QUADRANTS.map(q => {
            const items = data.grouped[q.key] ?? []
            return (
              <div key={q.key}>
                <div className="flex items-center justify-between mb-3" style={{ borderBottom: `2px solid rgba(${q.rgb},0.35)`, paddingBottom: 10 }}>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: q.color }}>{q.label}</h2>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>{q.sub}</p>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: q.color,
                    background: `rgba(${q.rgb},0.12)`, borderRadius: 999, padding: '2px 9px',
                  }}>
                    {items.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {items.length === 0 ? (
                    <p style={{ color: 'var(--muted)', fontSize: 12.5, padding: '8px 0' }}>Nothing here yet.</p>
                  ) : items.map(item => {
                    const lastMove = item.ring_history[item.ring_history.length - 1]
                    const expanded = expandedId === item.id
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleExpand(item.id)}
                        style={{
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderLeft: `3px solid ${q.color}`, borderRadius: 8, padding: '12px 14px',
                          cursor: 'pointer',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span style={{ fontSize: 14.5, fontWeight: 700, color: '#e4e4e7' }}>{item.name}</span>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, textTransform: 'capitalize' }}>
                          {cleanCategory(item.category)}
                        </p>
                        {item.rationale && (
                          <p style={{ fontSize: 12.5, color: 'var(--dim)', marginTop: 6, lineHeight: 1.5 }}>{item.rationale}</p>
                        )}
                        {lastMove && (
                          <p style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 6 }}>
                            Moved {lastMove.from} → {lastMove.to} · {relTime(lastMove.date)}
                          </p>
                        )}
                        {expanded && (
                          <div
                            onClick={e => e.stopPropagation()}
                            style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', cursor: 'default' }}
                          >
                            {mentionsLoading === item.id ? (
                              <p style={{ fontSize: 11, color: 'var(--muted)' }}>Loading mentions…</p>
                            ) : !mentions[item.id]?.length ? (
                              <p style={{ fontSize: 11, color: 'var(--muted)' }}>No linked articles yet.</p>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {mentions[item.id].map(m => (
                                  <a
                                    key={m.id}
                                    href={m.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontSize: 11.5, color: 'var(--dim)', lineHeight: 1.4, display: 'block' }}
                                  >
                                    {m.title}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
