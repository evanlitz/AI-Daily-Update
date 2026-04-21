'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { AIPrediction } from '@/lib/types'

// ── Color maps ────────────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  capability:     '#7c6aff',
  science:        '#38bdf8',
  society:        '#34d399',
  safety:         '#fbbf24',
  infrastructure: '#94a3b8',
}
const CAT_RGB: Record<string, string> = {
  capability:     '124,106,255',
  science:        '56,189,248',
  society:        '52,211,153',
  safety:         '251,191,36',
  infrastructure: '148,163,184',
}
const CATS = ['capability', 'science', 'society', 'safety', 'infrastructure'] as const

const CONF_META: Record<string, { color: string; label: string; pct: number }> = {
  confirmed:   { color: '#34d399', label: 'Confirmed',         pct: 100 },
  high:        { color: '#a78bfa', label: 'High confidence',   pct: 80  },
  medium:      { color: '#fbbf24', label: 'Medium confidence', pct: 55  },
  low:         { color: '#fb923c', label: 'Low confidence',    pct: 30  },
  speculative: { color: '#9090c0', label: 'Speculative',       pct: 10  },
}

const NOW_YEAR = new Date().getFullYear() + new Date().getMonth() / 12
const SIDEBAR_W = 72   // must match layout.tsx

// ── Story slide ───────────────────────────────────────────────────────────────

function EventSlide({
  p, idx, total, isActive, catFilter, onCatFilter, onPrev, onNext, prevP, nextP,
}: {
  p:           AIPrediction
  idx:         number
  total:       number
  isActive:    boolean
  catFilter:   string | null
  onCatFilter: (c: string | null) => void
  onPrev:      () => void
  onNext:      () => void
  prevP:       AIPrediction | null
  nextP:       AIPrediction | null
}) {
  const color  = CAT_COLOR[p.category] ?? '#7c6aff'
  const rgb    = CAT_RGB[p.category]   ?? '124,106,255'
  const conf   = CONF_META[p.confidence] ?? CONF_META.low
  const isPast = p.year_guess < NOW_YEAR

  return (
    <div style={{
      height: '100%', scrollSnapAlign: 'start',
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      {/* Background atmosphere */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 70% 60% at 100% 0%,   rgba(${rgb},0.09) 0%, transparent 60%),
          radial-gradient(ellipse 50% 50% at 0%   100%, rgba(${rgb},0.05) 0%, transparent 55%)
        `,
      }} />

      {/* Watermark year — big, centered, very faint */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        paddingRight: '4%',
        pointerEvents: 'none',
        fontSize: 'clamp(180px, 30vw, 340px)',
        fontWeight: 900, letterSpacing: '-0.07em', lineHeight: 1,
        color: `rgba(${rgb},0.05)`,
        userSelect: 'none',
      }}>
        {p.year_guess}
      </div>

      {/* Left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: '15%', bottom: '15%',
        width: 4, borderRadius: '0 4px 4px 0',
        background: `linear-gradient(to bottom, transparent, ${color} 30%, ${color} 70%, transparent)`,
      }} />

      {/* Main content */}
      <div style={{
        position: 'relative', zIndex: 2,
        maxWidth: 860, width: '100%',
        padding: '0 80px 0 60px',
        opacity:    isActive ? 1 : 0.15,
        transform:  isActive ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.5s ease, transform 0.5s ease',
      }}>

        {/* Row 1: category pills + counter */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
          {CATS.map(cat => {
            const active = cat === p.category
            const c  = CAT_COLOR[cat]
            const r  = CAT_RGB[cat]
            return (
              <button key={cat} onClick={() => onCatFilter(catFilter === cat ? null : cat)}
                style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  letterSpacing: '0.08em', textTransform: 'uppercase', border: 'none',
                  cursor: 'pointer', transition: 'all 0.15s',
                  background: active
                    ? `rgba(${r},0.2)`
                    : catFilter && catFilter !== cat ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                  color:      active ? c : '#3a3a5a',
                  boxShadow:  active ? `0 0 0 1px rgba(${r},0.4)` : 'none',
                }}
              >
                {cat}
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: '#2e2e50' }}>
            {idx + 1} <span style={{ color: '#1e1e38' }}>/</span> {total}
          </span>
        </div>

        {/* Row 2: year + status */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 18 }}>
          <span style={{
            fontSize: 'clamp(56px, 8vw, 96px)',
            fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1,
            color, textShadow: `0 0 60px rgba(${rgb},0.4)`,
          }}>
            {p.year_guess}
          </span>
          {p.year_min !== p.year_max && (
            <span style={{ fontSize: 20, fontWeight: 500, color: `rgba(${rgb},0.6)`, letterSpacing: '-0.01em' }}>
              {p.year_min}–{p.year_max}
            </span>
          )}
          <span style={{
            fontSize: 13, fontWeight: 700, padding: '5px 12px',
            borderRadius: 999,
            background: isPast ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.1)',
            color: isPast ? '#34d399' : '#fbbf24',
          }}>
            {isPast ? '✓ confirmed past' : p.year_guess <= NOW_YEAR + 1 ? '⚡ imminent' : 'upcoming'}
          </span>
        </div>

        {/* Row 3: Title */}
        <h1 style={{
          fontSize: 'clamp(36px, 5vw, 60px)',
          fontWeight: 800, color: '#f0f0fc',
          lineHeight: 1.15, letterSpacing: '-0.03em',
          margin: '0 0 36px',
        }}>
          {p.title}
        </h1>

        {/* Row 4: Confidence */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{
            flex: 1, maxWidth: 380,
            height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 999, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 999,
              width: isActive ? `${conf.pct}%` : '0%',
              background: `linear-gradient(to right, rgba(${rgb},0.5), ${conf.color})`,
              boxShadow: `0 0 12px ${conf.color}`,
              transition: 'width 1s cubic-bezier(0.4,0,0.2,1) 0.3s',
            }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, color: conf.color }}>{conf.label}</span>
        </div>

        {/* Row 5: Description */}
        {(p.description || p.rationale) && (
          <p style={{
            fontSize: 'clamp(16px, 1.8vw, 20px)',
            lineHeight: 1.75, color: '#7a7aa8',
            margin: '0 0 32px', maxWidth: 620,
          }}>
            {p.description || p.rationale}
          </p>
        )}

        {/* Row 6: Evidence */}
        {p.evidence && p.evidence.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {p.evidence.slice(0, 4).map((ev, i) => (
              <a key={i} href={ev.url} target="_blank" rel="noreferrer" style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '9px 16px', borderRadius: 8,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#6060a0', fontSize: 13, fontWeight: 500,
                textDecoration: 'none', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = `rgba(${rgb},0.4)`; e.currentTarget.style.color = color }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#6060a0' }}
              >
                <span style={{ color, fontSize: 12 }}>→</span>
                {ev.title.length > 50 ? ev.title.slice(0, 48) + '…' : ev.title}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Prev / Next navigation — with event preview */}
      {prevP && (
        <button onClick={onPrev} style={{
          position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, cursor: 'pointer', padding: '14px 10px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          color: '#4a4a6a', transition: 'all 0.18s', maxWidth: 44,
          opacity: isActive ? 1 : 0,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#c0c0e0' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#4a4a6a' }}
        >
          <span style={{ fontSize: 18 }}>↑</span>
          <span style={{
            writingMode: 'vertical-rl', fontSize: 10, fontWeight: 600,
            maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{prevP.year_guess}</span>
        </button>
      )}
      {nextP && (
        <button onClick={onNext} style={{
          position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, cursor: 'pointer', padding: '14px 10px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          color: '#4a4a6a', transition: 'all 0.18s', maxWidth: 44,
          opacity: isActive ? 1 : 0,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#c0c0e0' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = '#4a4a6a' }}
        >
          <span style={{ fontSize: 18 }}>↓</span>
          <span style={{
            writingMode: 'vertical-rl', fontSize: 10, fontWeight: 600,
            maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{nextP.year_guess}</span>
        </button>
      )}
    </div>
  )
}

// ── Bottom timeline strip ─────────────────────────────────────────────────────

function TimelineStrip({
  events, activeIdx, onJump,
}: {
  events:    AIPrediction[]
  activeIdx: number
  onJump:    (i: number) => void
}) {
  const stripRef   = useRef<HTMLDivElement>(null)
  const [hov, setHov] = useState<number | null>(null)

  const minY  = useMemo(() => Math.min(...events.map(e => e.year_guess), NOW_YEAR - 1), [events])
  const maxY  = useMemo(() => Math.max(...events.map(e => e.year_guess), NOW_YEAR + 1), [events])
  const span  = maxY - minY

  // Auto-scroll strip to keep active event visible
  useEffect(() => {
    const el = stripRef.current
    if (!el || !events.length) return
    const pct   = (events[activeIdx]?.year_guess - minY) / span
    const inner = el.scrollWidth - el.clientWidth
    el.scrollLeft = pct * inner - el.clientWidth * 0.4
  }, [activeIdx, events, minY, span])

  const TRACK_PAD  = 80   // px from each edge before events start
  const DOT_AREA_H = 80   // height of the dot track area
  const AXIS_H     = 44   // height of the year axis

  // Generate year ticks
  const tickStep = span > 25 ? 5 : span > 12 ? 2 : 1
  const ticks: number[] = []
  for (let y = Math.ceil(minY / tickStep) * tickStep; y <= maxY; y += tickStep) ticks.push(y)

  const nowPct = Math.min(1, Math.max(0, (NOW_YEAR - minY) / span))

  return (
    <div style={{
      height: DOT_AREA_H + AXIS_H,
      background: 'rgba(5,5,14,0.96)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      position: 'relative',
    }}>
      {/* Category legend (left) */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: AXIS_H,
        width: TRACK_PAD - 4,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '0 12px', gap: 4, zIndex: 5,
      }}>
        {CATS.map(cat => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLOR[cat], flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: '#2e2e50', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              {cat.slice(0, 5)}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable inner */}
      <div ref={stripRef} style={{
        position: 'absolute', top: 0, left: TRACK_PAD - 4, right: 0, bottom: 0,
        overflowX: 'auto', overflowY: 'hidden',
        scrollbarWidth: 'none',
      }}>
        <style>{`.tl-strip::-webkit-scrollbar{display:none}`}</style>
        <div className="tl-strip" style={{
          minWidth: '100%',
          width: `${Math.max(100, span * 60)}px`,
          height: '100%',
          position: 'relative',
        }}>
          {/* Horizontal track line */}
          <div style={{
            position: 'absolute',
            top: DOT_AREA_H / 2,
            left: 0, right: 0, height: 1,
            background: 'rgba(255,255,255,0.07)',
          }} />

          {/* NOW marker */}
          <div style={{
            position: 'absolute',
            left: `${nowPct * 100}%`,
            top: 8, bottom: AXIS_H - 4,
            width: 1.5,
            background: 'rgba(124,106,255,0.6)',
            pointerEvents: 'none', zIndex: 3,
          }}>
            <div style={{
              position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
              background: '#7c6aff', color: '#fff',
              fontSize: 8, fontWeight: 900, letterSpacing: '0.1em',
              padding: '1px 5px', borderRadius: 3, whiteSpace: 'nowrap',
            }}>NOW</div>
          </div>

          {/* Event dots */}
          {events.map((p, i) => {
            const pct    = (p.year_guess - minY) / span
            const color  = CAT_COLOR[p.category] ?? '#7c6aff'
            const rgb    = CAT_RGB[p.category]   ?? '124,106,255'
            const active = i === activeIdx
            const hovered = hov === i

            return (
              <div key={p.id}
                onClick={() => onJump(i)}
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov(null)}
                style={{
                  position: 'absolute',
                  left: `${pct * 100}%`,
                  top: DOT_AREA_H / 2,
                  transform: 'translate(-50%, -50%)',
                  zIndex: active ? 10 : hovered ? 8 : 1,
                  cursor: 'pointer',
                }}
              >
                {/* Label above (active or hovered) */}
                {(active || hovered) && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: 8,
                    background: active ? color : 'rgba(30,30,50,0.95)',
                    border: `1px solid ${active ? color : 'rgba(255,255,255,0.1)'}`,
                    color: active ? '#fff' : '#c0c0e0',
                    fontSize: 11, fontWeight: 600,
                    padding: '4px 8px', borderRadius: 5,
                    whiteSpace: 'nowrap', maxWidth: 180,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    pointerEvents: 'none',
                    boxShadow: active ? `0 0 16px rgba(${rgb},0.4)` : '0 2px 8px rgba(0,0,0,0.4)',
                  }}>
                    {p.title.length > 28 ? p.title.slice(0, 26) + '…' : p.title}
                  </div>
                )}

                {/* Dot */}
                <div style={{
                  width:  active ? 16 : hovered ? 12 : 8,
                  height: active ? 16 : hovered ? 12 : 8,
                  borderRadius: '50%',
                  background: color,
                  transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: active
                    ? `0 0 0 4px rgba(${rgb},0.25), 0 0 20px rgba(${rgb},0.6)`
                    : hovered ? `0 0 10px rgba(${rgb},0.5)` : 'none',
                }} />

                {/* Pulse ring for active */}
                {active && (
                  <div style={{
                    position: 'absolute', inset: -4,
                    borderRadius: '50%',
                    border: `1.5px solid rgba(${rgb},0.5)`,
                    animation: 'ping-slow 2s ease-out infinite',
                    pointerEvents: 'none',
                  }} />
                )}
              </div>
            )
          })}

          {/* Year axis */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: AXIS_H,
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}>
            {ticks.map(y => (
              <div key={y} style={{
                position: 'absolute',
                left: `${((y - minY) / span) * 100}%`,
                top: 0, bottom: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{ width: 1, height: 8, background: 'rgba(255,255,255,0.1)' }} />
                <span style={{
                  fontSize: 12, fontWeight: 600, color: '#3a3a58',
                  transform: 'translateX(-50%)', marginTop: 4, whiteSpace: 'nowrap',
                }}>{y}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ events, onSelect }: { events: AIPrediction[]; onSelect: (i: number) => void }) {
  const [hov, setHov] = useState<string | null>(null)
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 40px 32px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {events.map((p, i) => {
          const color  = CAT_COLOR[p.category] ?? '#7c6aff'
          const rgb    = CAT_RGB[p.category]   ?? '124,106,255'
          const conf   = CONF_META[p.confidence] ?? CONF_META.low
          const isPast = p.year_guess < NOW_YEAR
          const isHov  = hov === p.id
          const prevYear = i > 0 ? events[i - 1].year_guess : null

          return (
            <div key={p.id}>
              {prevYear !== p.year_guess && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: i === 0 ? '4px 0 10px' : '28px 0 10px' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#3a3a58', letterSpacing: '0.06em' }}>
                    {p.year_guess}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                  {isPast && <span style={{ fontSize: 10, fontWeight: 800, color: '#34d399', letterSpacing: '0.1em' }}>PAST</span>}
                  {Math.abs(p.year_guess - NOW_YEAR) < 0.6 && <span style={{ fontSize: 10, fontWeight: 800, color: '#7c6aff', letterSpacing: '0.1em' }}>NOW</span>}
                </div>
              )}
              <div
                onClick={() => onSelect(i)}
                onMouseEnter={() => setHov(p.id)}
                onMouseLeave={() => setHov(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 20px', borderRadius: 12, marginBottom: 6,
                  border: `1px solid ${isHov ? `rgba(${rgb},0.3)` : 'rgba(255,255,255,0.05)'}`,
                  background: isHov ? `rgba(${rgb},0.08)` : 'rgba(255,255,255,0.025)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 999, background: color, opacity: 0.7, flexShrink: 0 }} />
                <span style={{
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color, background: `rgba(${rgb},0.12)`, padding: '5px 11px', borderRadius: 6,
                  flexShrink: 0, minWidth: 106, textAlign: 'center',
                }}>{p.category}</span>
                <span style={{
                  flex: 1, fontSize: 16, fontWeight: 600,
                  color: isHov ? '#eaeaf8' : '#b0b0d0', transition: 'color 0.15s',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.title}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: conf.color, flexShrink: 0 }}>
                  {conf.label.split(' ')[0]}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: isPast ? '#34d399' : '#3a3a5a', flexShrink: 0, minWidth: 62, textAlign: 'right' }}>
                  {isPast ? '✓ past' : 'upcoming'}
                </span>
                <span style={{ color: isHov ? color : '#2e2e50', fontSize: 18, flexShrink: 0, transition: 'color 0.15s' }}>›</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TimelinePage() {
  const [predictions, setPredictions] = useState<AIPrediction[]>([])
  const [activeIdx, setActiveIdx]     = useState(0)
  const [catFilter, setCatFilter]     = useState<string | null>(null)
  const [view, setView]               = useState<'story' | 'list'>('story')

  const scrollRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    fetch('/api/predictions')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPredictions(d) })
      .catch(() => {})
  }, [])

  const sorted = useMemo(
    () => [...predictions]
      .filter(p => !catFilter || p.category === catFilter)
      .sort((a, b) => a.year_guess - b.year_guess),
    [predictions, catFilter]
  )

  // IntersectionObserver to track active slide
  useEffect(() => {
    if (!sorted.length || view !== 'story') return
    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            const i = slideRefs.current.findIndex(r => r === e.target)
            if (i !== -1) setActiveIdx(i)
          }
        }
      },
      { root: scrollRef.current, threshold: 0.5 }
    )
    slideRefs.current.forEach(r => r && obs.observe(r))
    return () => obs.disconnect()
  }, [sorted, view])

  const goTo = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(sorted.length - 1, i))
    slideRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [sorted.length])

  // Jump to first future event on first load
  useEffect(() => {
    if (!sorted.length) return
    const i = sorted.findIndex(p => p.year_guess >= NOW_YEAR - 0.5)
    if (i > 0) setTimeout(() => goTo(i), 80)
  }, [sorted.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Select from list → switch to story
  const selectFromList = useCallback((i: number) => {
    setActiveIdx(i)
    setView('story')
    setTimeout(() => goTo(i), 60)
  }, [goTo])

  // Keyboard nav
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); goTo(activeIdx + 1) }
      if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  { e.preventDefault(); goTo(activeIdx - 1) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [activeIdx, goTo])

  const TOPBAR_H   = 56
  const STRIP_H    = 124

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: SIDEBAR_W, right: 0, bottom: 0,
      zIndex: 45,
      display: 'flex', flexDirection: 'column',
      background: '#05050e',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <style>{`
        .tl-scroll::-webkit-scrollbar { display: none; }
        @keyframes bounce-down {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(6px); }
        }
      `}</style>

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <div style={{
        height: TOPBAR_H, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 28px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(5,5,14,0.95)', backdropFilter: 'blur(12px)',
        zIndex: 5,
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#e8e8f0', letterSpacing: '-0.02em' }}>
          AI Pulse <span style={{ color: '#2e2e50', fontWeight: 400 }}>·</span>{' '}
          <span style={{ color: '#7c6aff' }}>Timeline</span>
        </span>

        <div style={{ flex: 1 }} />

        {view === 'story' && sorted.length > 0 && (
          <span style={{ fontSize: 13, color: '#2e2e50' }}>
            {sorted[activeIdx]?.year_guess} · {activeIdx + 1} / {sorted.length}
          </span>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['story', 'list'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '7px 18px', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              background: view === v ? 'rgba(124,106,255,0.22)' : 'rgba(255,255,255,0.04)',
              color:      view === v ? '#a78bfa' : '#4a4a6a',
              transition: 'all 0.15s',
            }}>
              {v === 'story' ? '⊡ Story' : '≡ List'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Story view ─────────────────────────────────────────────────────── */}
      {view === 'story' && (
        <>
          <div
            ref={scrollRef}
            className="tl-scroll"
            style={{
              flex: 1, overflowY: 'scroll', overflowX: 'hidden',
              scrollSnapType: 'y mandatory', scrollbarWidth: 'none',
            }}
          >
            {sorted.map((p, i) => (
              <div key={p.id} ref={el => { slideRefs.current[i] = el }} style={{ height: '100%' }}>
                <EventSlide
                  p={p} idx={i} total={sorted.length}
                  isActive={i === activeIdx}
                  catFilter={catFilter}
                  onCatFilter={setCatFilter}
                  onPrev={() => goTo(i - 1)}
                  onNext={() => goTo(i + 1)}
                  prevP={sorted[i - 1] ?? null}
                  nextP={sorted[i + 1] ?? null}
                />
              </div>
            ))}
            {sorted.length === 0 && (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2e2e50', fontSize: 15 }}>
                No predictions loaded
              </div>
            )}
          </div>

          {/* Bottom timeline strip — always shows ALL events regardless of filter */}
          <TimelineStrip
            events={[...predictions].sort((a, b) => a.year_guess - b.year_guess)}
            activeIdx={predictions
              .sort((a, b) => a.year_guess - b.year_guess)
              .findIndex(p => p.id === sorted[activeIdx]?.id)}
            onJump={i => {
              const allSorted = [...predictions].sort((a, b) => a.year_guess - b.year_guess)
              const target    = allSorted[i]
              const idx       = sorted.findIndex(p => p.id === target?.id)
              if (idx !== -1) goTo(idx)
              else { setCatFilter(null); setTimeout(() => goTo(0), 60) }
            }}
          />
        </>
      )}

      {/* ── List view ──────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <ListView events={sorted} onSelect={selectFromList} />
      )}
    </div>
  )
}
