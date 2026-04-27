'use client'

import { useState, useEffect, useMemo } from 'react'
import type { AIPrediction } from '@/lib/types'

// ── Constants ──────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { color: string; rgb: string; label: string }> = {
  capability:     { color: '#a78bfa', rgb: '167,139,250', label: 'Capability'     },
  safety:         { color: '#f87171', rgb: '248,113,113', label: 'Safety'         },
  science:        { color: '#34d399', rgb: '52,211,153',  label: 'Science'        },
  society:        { color: '#fbbf24', rgb: '251,191,36',  label: 'Society'        },
  infrastructure: { color: '#60a5fa', rgb: '96,165,250',  label: 'Infrastructure' },
}

const CONFIDENCE_META: Record<string, { color: string; label: string }> = {
  confirmed:   { color: '#34d399', label: 'Confirmed'   },
  high:        { color: '#a78bfa', label: 'High'        },
  medium:      { color: '#fbbf24', label: 'Medium'      },
  low:         { color: '#fb923c', label: 'Low'         },
  speculative: { color: '#f87171', label: 'Speculative' },
}

const CATS   = ['all', 'capability', 'safety', 'science', 'society', 'infrastructure'] as const
const STATUS = ['all', 'past', 'imminent', 'upcoming'] as const

// ── Helpers ────────────────────────────────────────────────────────────────

function confidenceDots(confidence: string) {
  const order = ['speculative', 'low', 'medium', 'high', 'confirmed']
  const idx   = order.indexOf(confidence)
  const meta  = CONFIDENCE_META[confidence] ?? { color: '#5a5a8a', label: confidence }
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {order.map((_, i) => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: i <= idx ? meta.color : 'rgba(255,255,255,0.08)',
          transition: 'background 0.2s',
        }} />
      ))}
      <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 700, color: meta.color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {meta.label}
      </span>
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────

function PredCard({ p }: { p: AIPrediction }) {
  const [open, setOpen] = useState(false)
  const isPast   = p.status === 'past'
  const cat      = CATEGORY_META[p.category] ?? { color: '#5a5a8a', rgb: '90,90,138', label: p.category }
  const conf     = CONFIDENCE_META[p.confidence] ?? { color: '#5a5a8a', label: p.confidence }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.016)',
      border: `1px solid ${open ? `rgba(${cat.rgb},0.22)` : 'rgba(255,255,255,0.06)'}`,
      borderLeft: `3px solid ${isPast ? '#34d399' : conf.color}`,
      borderRadius: 12,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: '16px 18px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start' }}
      >
        {/* Year column */}
        <div style={{ flexShrink: 0, textAlign: 'center', width: 52 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: isPast ? '#34d399' : '#e8e8f0', lineHeight: 1 }}>
            {p.year_guess}
          </div>
          {p.month_guess && !isPast && (
            <div style={{ fontSize: 11, color: '#5a5a8a', marginTop: 2 }}>
              {new Date(0, p.month_guess - 1).toLocaleString('default', { month: 'short' })}
            </div>
          )}
          {isPast && (
            <div style={{ fontSize: 10, color: '#34d399', fontWeight: 800, letterSpacing: '0.08em', marginTop: 3 }}>DONE</div>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: cat.color, background: `rgba(${cat.rgb},0.1)`,
              border: `1px solid rgba(${cat.rgb},0.22)`, borderRadius: 4, padding: '2px 8px',
            }}>{cat.label}</span>
            {!isPast && (
              <span style={{
                fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase',
                color: p.status === 'imminent' ? '#fbbf24' : '#5a5a8a',
                background: p.status === 'imminent' ? 'rgba(251,191,36,0.08)' : 'transparent',
                border: `1px solid ${p.status === 'imminent' ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 4, padding: '2px 8px',
              }}>{p.status}</span>
            )}
          </div>

          <h3 style={{ color: '#e0e0f0', fontSize: 15, fontWeight: 700, lineHeight: 1.35, margin: '0 0 8px' }}>
            {p.title}
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            {!isPast ? confidenceDots(p.confidence) : (
              <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                {[0,1,2,3,4].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                ))}
                <span style={{ marginLeft: 5, fontSize: 11, fontWeight: 700, color: '#34d399', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Confirmed</span>
              </div>
            )}
            <span style={{ fontSize: 12, color: '#5a5a8a' }}>
              {open ? '▴ less' : '▾ details'}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded */}
      {open && (
        <div className="fade-up" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '16px 18px 18px', paddingLeft: 84 }}>
          {p.description && (
            <p style={{ color: '#b0b0d0', fontSize: 13, lineHeight: 1.8, margin: '0 0 14px' }}>
              {p.description}
            </p>
          )}
          {p.rationale && (
            <>
              <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', color: '#5a5a8a', textTransform: 'uppercase', marginBottom: 6 }}>Rationale</p>
              <p style={{ color: '#8080b0', fontSize: 13, lineHeight: 1.8, margin: '0 0 14px' }}>
                {p.rationale}
              </p>
            </>
          )}
          {!isPast && p.year_min !== p.year_max && (
            <p style={{ fontSize: 12, color: '#5a5a8a' }}>
              Range: {p.year_min}–{p.year_max}
              {p.date_guess ? ` · Best guess: ${p.date_guess}` : ''}
            </p>
          )}
          {isPast && p.date_guess && (
            <p style={{ fontSize: 12, color: '#34d399' }}>{p.date_guess}</p>
          )}
          {p.evidence && p.evidence.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', color: '#5a5a8a', textTransform: 'uppercase', marginBottom: 8 }}>Evidence</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {p.evidence.map((e, i) => (
                  <a key={i} href={e.url} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: 12, color: '#7070b0', textDecoration: 'none',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                    onMouseEnter={ev => (ev.currentTarget.style.color = '#a0a0d0')}
                    onMouseLeave={ev => (ev.currentTarget.style.color = '#7070b0')}
                  >
                    <span style={{ flexShrink: 0, fontSize: 10, color: '#4a4a6a' }}>↗</span>
                    {e.title || e.source}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const [predictions, setPredictions] = useState<AIPrediction[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeCat,   setActiveCat]   = useState<string>('all')
  const [activeStatus, setActiveStatus] = useState<string>('all')

  useEffect(() => {
    fetch('/api/predictions')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setPredictions(data); setLoading(false) })
  }, [])

  const filtered = useMemo(() => predictions.filter(p => {
    if (activeCat !== 'all' && p.category !== activeCat) return false
    if (activeStatus !== 'all' && p.status !== activeStatus) return false
    return true
  }), [predictions, activeCat, activeStatus])

  const past     = filtered.filter(p => p.status === 'past').reverse()
  const imminent = filtered.filter(p => p.status === 'imminent')
  const upcoming = filtered.filter(p => p.status === 'upcoming')

  const totalPast = predictions.filter(p => p.status === 'past').length
  const totalFuture = predictions.filter(p => p.status !== 'past').length

  return (
    <main style={{
      maxWidth: 1100, margin: '0 auto', padding: '32px 28px',
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.022) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
    }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p className="eyebrow" style={{ marginBottom: 6 }}>AI Futures</p>
        <h1 style={{ color: '#e8e8f0', fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 8 }}>
          Predictions
        </h1>
        <div style={{ display: 'flex', gap: 20 }}>
          <span style={{ fontSize: 13, color: '#34d399', fontWeight: 700 }}>{totalPast} confirmed milestones</span>
          <span style={{ fontSize: 13, color: '#8080b0' }}>·</span>
          <span style={{ fontSize: 13, color: '#a78bfa', fontWeight: 700 }}>{totalFuture} future predictions</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Category */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {CATS.map(cat => {
            const active = activeCat === cat
            const meta   = cat === 'all' ? null : CATEGORY_META[cat]
            const color  = meta?.color ?? '#a78bfa'
            const rgb    = meta?.rgb   ?? '167,139,250'
            return (
              <button key={cat} onClick={() => setActiveCat(cat)} style={{
                fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'capitalize',
                padding: '4px 11px', borderRadius: 6, cursor: 'pointer',
                background: active ? `rgba(${rgb},0.14)` : 'transparent',
                color: active ? color : '#6060a0',
                border: `1px solid ${active ? `rgba(${rgb},0.3)` : 'transparent'}`,
                transition: 'all 0.15s',
              }}>{cat === 'all' ? 'All' : CATEGORY_META[cat]?.label ?? cat}</button>
            )
          })}
        </div>

        <div style={{ height: 18, width: 1, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />

        {/* Status */}
        <div style={{ display: 'flex', gap: 4 }}>
          {STATUS.map(s => {
            const active = activeStatus === s
            return (
              <button key={s} onClick={() => setActiveStatus(s)} style={{
                fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'capitalize',
                padding: '4px 11px', borderRadius: 6, cursor: 'pointer',
                background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: active ? '#e0e0f0' : '#6060a0',
                border: `1px solid ${active ? 'rgba(255,255,255,0.14)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}>{s === 'all' ? 'All time' : s}</button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: '#5a5a8a' }}>Loading predictions…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Imminent */}
          {imminent.length > 0 && (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 8px #fbbf24', animation: 'glow-pulse 2s ease-in-out infinite' }} />
                <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', color: '#fbbf24', textTransform: 'uppercase' }}>Imminent · on the horizon</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {imminent.map(p => <PredCard key={p.id} p={p} />)}
              </div>
            </section>
          )}

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <section>
              <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', color: '#5a5a8a', textTransform: 'uppercase', marginBottom: 14 }}>Upcoming · longer horizon</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {upcoming.map(p => <PredCard key={p.id} p={p} />)}
              </div>
            </section>
          )}

          {/* Past */}
          {past.length > 0 && (
            <section>
              <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', color: '#34d399', textTransform: 'uppercase', marginBottom: 14 }}>Confirmed milestones · past</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {past.map(p => <PredCard key={p.id} p={p} />)}
              </div>
            </section>
          )}

          {filtered.length === 0 && (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#5a5a8a', fontSize: 14 }}>
              No predictions match the current filters.
            </div>
          )}
        </div>
      )}
    </main>
  )
}
