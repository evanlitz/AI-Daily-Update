'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface EntityRow {
  id: string
  name: string
  type: string
  mention_count: number
  first_seen: string
  this_week: number
  last_week: number
  velocity: number
}

const TYPE_META: Record<string, { color: string; rgb: string; label: string }> = {
  company:    { color: '#34d399', rgb: '52,211,153',  label: 'Company' },
  model:      { color: '#a78bfa', rgb: '167,139,250', label: 'Model' },
  researcher: { color: '#fbbf24', rgb: '251,191,36',  label: 'Researcher' },
  paper:      { color: '#60a5fa', rgb: '96,165,250',  label: 'Paper' },
}
const DEFAULT_TYPE = { color: '#71717a', rgb: '113,113,122', label: 'Other' }

const TYPES = ['company', 'model', 'researcher', 'paper']

export default function EntitiesPage() {
  const [rows, setRows] = useState<EntityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<'mentions' | 'trending'>('mentions')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const load = useCallback((s: typeof sort) => {
    setLoading(true)
    fetch(`/api/entities?sort=${s}`)
      .then(r => r.json())
      .then(setRows)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(sort) }, [sort, load])

  const filtered = typeFilter ? rows.filter(r => r.type === typeFilter) : rows

  return (
    <main className="mx-auto max-w-screen-2xl px-4 sm:px-10 py-8">
      {/* Header */}
      <div className="mb-8">
        <p className="eyebrow mb-2">Intelligence · Named Entities</p>
        <h1 style={{
          fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em',
          background: 'linear-gradient(135deg, #f4f4f5 30%, #71717a 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Entities</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>
          Companies, models, researchers, and papers mentioned across the feed — ranked by mentions or this-week velocity.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex gap-1" style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 3 }}>
          {(['mentions', 'trending'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              style={{
                fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 6,
                color: sort === s ? '#f4f4f5' : 'var(--muted)',
                background: sort === s ? 'var(--accent)' : 'transparent',
                textTransform: 'capitalize',
              }}
            >
              {s === 'mentions' ? 'Most mentioned' : 'Trending'}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: 'var(--border-2)' }} />
        <button
          onClick={() => setTypeFilter(null)}
          style={{
            fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999,
            color: typeFilter === null ? '#f4f4f5' : 'var(--muted)',
            background: typeFilter === null ? 'rgba(255,255,255,0.08)' : 'transparent',
            border: '1px solid var(--border-2)',
          }}
        >
          All
        </button>
        {TYPES.map(t => {
          const meta = TYPE_META[t] ?? DEFAULT_TYPE
          const active = typeFilter === t
          return (
            <button
              key={t}
              onClick={() => setTypeFilter(active ? null : t)}
              style={{
                fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 999,
                color: active ? meta.color : 'var(--muted)',
                background: active ? `rgba(${meta.rgb},0.14)` : 'transparent',
                border: `1px solid ${active ? `rgba(${meta.rgb},0.4)` : 'var(--border-2)'}`,
                textTransform: 'capitalize',
              }}
            >
              {meta.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 rounded-full border border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--muted)', padding: '40px 0', textAlign: 'center' }}>No entities found.</p>
      ) : (
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {filtered.map(e => {
            const meta = TYPE_META[e.type] ?? DEFAULT_TYPE
            return (
              <Link
                key={e.id}
                href={`/entities/${e.id}`}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderLeft: `3px solid ${meta.color}`, borderRadius: 10, padding: '16px 18px',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
                onMouseEnter={e2 => {
                  (e2.currentTarget as HTMLElement).style.background = `rgba(${meta.rgb},0.06)`
                  ;(e2.currentTarget as HTMLElement).style.borderColor = `rgba(${meta.rgb},0.45)`
                }}
                onMouseLeave={e2 => {
                  (e2.currentTarget as HTMLElement).style.background = 'var(--surface)'
                  ;(e2.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 15.5, fontWeight: 700, color: '#e4e4e7' }}>{e.name}</span>
                  {e.velocity >= 2 && e.this_week >= 2 && (
                    <span style={{
                      fontSize: 9, fontWeight: 900, letterSpacing: '0.08em', color: '#fb923c',
                      background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)',
                      borderRadius: 3, padding: '1px 6px', flexShrink: 0,
                    }}>
                      ↑ {e.velocity.toFixed(1)}×
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2" style={{ fontSize: 11.5 }}>
                  <span style={{
                    color: meta.color, background: `rgba(${meta.rgb},0.12)`,
                    borderRadius: 4, padding: '1px 7px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {meta.label}
                  </span>
                  <span style={{ color: 'var(--muted)' }}>{e.mention_count} mention{e.mention_count !== 1 ? 's' : ''}</span>
                  <span style={{ color: 'var(--muted)' }}>· {e.this_week} this week</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
