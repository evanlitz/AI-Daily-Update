'use client'

import { useState, useEffect, useMemo } from 'react'
import type { TechRadarItem, FeedItem } from '@/lib/types'
import { relTime } from '@/lib/utils'

// ── Constants ──────────────────────────────────────────────────────────────

const CX = 260, CY = 260, SVG_SIZE = 520

const RINGS = [
  { key: 'adopt',  label: 'ADOPT',  outerR: 62,  innerR: 0,   color: '#34d399', rgb: '52,211,153',  desc: 'use now'    },
  { key: 'trial',  label: 'TRIAL',  outerR: 124, innerR: 62,  color: '#60a5fa', rgb: '96,165,250',  desc: 'experiment' },
  { key: 'assess', label: 'ASSESS', outerR: 186, innerR: 124, color: '#fbbf24', rgb: '251,191,36',  desc: 'watch'      },
  { key: 'hold',   label: 'HOLD',   outerR: 246, innerR: 186, color: '#f87171', rgb: '248,113,113', desc: 'not yet'    },
] as const

const CAT_COLORS: Record<string, string> = {
  model:     '#a78bfa',
  tool:      '#fb923c',
  framework: '#38bdf8',
  technique: '#34d399',
  infra:     '#fbbf24',
}

const VEL_COLORS: Record<string, string> = {
  models: '#7c6aff', tools: '#fb923c', research: '#60a5fa', industry: '#34d399',
}

const CATEGORIES = ['all', 'model', 'tool', 'framework', 'technique', 'infra']

// ── Helpers ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return '124,106,255'
  return m.map(x => parseInt(x, 16)).join(',')
}

function prand(str: string, salt: string): number {
  const s = str + salt
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff
  return (h % 997) / 997
}

function placeBlips(
  grouped: Record<string, TechRadarItem[]>,
  cat: string,
): { item: TechRadarItem; x: number; y: number; ring: typeof RINGS[number] }[] {
  const out: { item: TechRadarItem; x: number; y: number; ring: typeof RINGS[number] }[] = []
  for (const ring of RINGS) {
    const items = (grouped[ring.key] ?? []).filter(i => cat === 'all' || i.category === cat)
    const n = items.length
    items.forEach((item, idx) => {
      const base   = n === 1 ? -Math.PI / 2 : (idx / n) * 2 * Math.PI - Math.PI / 2
      const jitter = (prand(item.id, 'j') - 0.5) * (n > 1 ? (1.2 / n) : 0.4)
      const angle  = base + jitter
      const mid    = (ring.innerR + ring.outerR) / 2
      const half   = (ring.outerR - ring.innerR) / 2
      const r      = mid + (prand(item.id, 'r') - 0.5) * half * 0.72
      out.push({ item, x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle), ring })
    })
  }
  return out
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function RadarPage() {
  const [grouped,    setGrouped]   = useState<Record<string, TechRadarItem[]>>({ adopt: [], trial: [], assess: [], hold: [] })
  const [feedItems,  setFeedItems] = useState<FeedItem[]>([])
  const [total,      setTotal]     = useState(0)
  const [activeCat,  setActiveCat] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scanning,   setScanning]  = useState(false)
  const [scanMsg,    setScanMsg]   = useState<string | null>(null)
  const [loading,    setLoading]   = useState(true)
  const [scannedAt,  setScannedAt] = useState<string | null>(null)
  const [removing,   setRemoving]  = useState(false)
  const [confirmId,  setConfirmId] = useState<string | null>(null)
  const [tableRing,  setTableRing]  = useState('all')
  const [tableSearch, setTableSearch] = useState('')

  useEffect(() => {
    setScannedAt(localStorage.getItem('radar-scanned-at'))
    Promise.all([
      fetch('/api/radar').then(r => r.json()),
      fetch('/api/feed?page=1&sort=velocity').then(r => r.json()),
    ]).then(([radar, feed]) => {
      setGrouped(radar?.grouped ?? { adopt: [], trial: [], assess: [], hold: [] })
      setTotal(radar?.total ?? 0)
      setFeedItems(Array.isArray(feed) ? feed : [])
    }).finally(() => setLoading(false))
  }, [])

  const blips = useMemo(() => placeBlips(grouped, activeCat), [grouped, activeCat])

  const selected = useMemo(() => {
    if (!selectedId) return null
    for (const ring of RINGS) {
      const found = (grouped[ring.key] ?? []).find(i => i.id === selectedId)
      if (found) return { item: found, ring }
    }
    return null
  }, [selectedId, grouped])

  const allSignals = useMemo(() =>
    RINGS.flatMap(ring => (grouped[ring.key] ?? []).map(item => ({ ...item, ringMeta: ring }))),
    [grouped]
  )

  const tableItems = useMemo(() => {
    const q = tableSearch.toLowerCase()
    return allSignals.filter(item =>
      (tableRing === 'all' || item.ringMeta.key === tableRing) &&
      (activeCat === 'all' || item.category === activeCat) &&
      (q === '' || item.name.toLowerCase().includes(q) || (item.rationale ?? '').toLowerCase().includes(q))
    )
  }, [allSignals, tableRing, activeCat, tableSearch])

  const velData = useMemo(() => {
    const agg: Record<string, number[]> = {}
    for (const item of feedItems) {
      for (const tag of item.topic_tags) {
        if (!agg[tag]) agg[tag] = []
        agg[tag].push(item.velocity_score ?? 0)
      }
    }
    const rows = ['models', 'tools', 'research', 'industry'].map(tag => ({
      name: tag,
      v: agg[tag]?.length ? +(agg[tag].reduce((a, b) => a + b, 0) / agg[tag].length).toFixed(2) : 0,
    }))
    const maxV = Math.max(...rows.map(r => r.v), 0.1)
    return rows.map(r => ({ ...r, pct: r.v / maxV }))
  }, [feedItems])

  async function removeSignal(id: string) {
    if (confirmId !== id) { setConfirmId(id); setTimeout(() => setConfirmId(null), 3000); return }
    setConfirmId(null)
    setRemoving(true)
    try {
      await fetch('/api/radar', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      setSelectedId(null)
      const fresh = await fetch('/api/radar')
      if (fresh.ok) {
        const data = await fresh.json()
        setGrouped(data.grouped)
        setTotal(data.total)
      }
    } finally { setRemoving(false) }
  }

  async function scan() {
    setScanning(true); setScanMsg(null)
    try {
      const res = await fetch('/api/radar/scan', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setScanMsg(`${data.total} signals classified`)
        setTotal(data.total)
        const now = new Date().toISOString()
        localStorage.setItem('radar-scanned-at', now)
        setScannedAt(now)
        const fresh = await fetch('/api/radar')
        if (fresh.ok) setGrouped((await fresh.json()).grouped)
      }
    } catch { setScanMsg('Scan failed') }
    finally { setScanning(false) }
  }

  return (
    <main style={{ padding: '32px 28px', maxWidth: 1500, margin: '0 auto' }}>

      {/* Header */}
      <div className="mb-8">
        <p className="eyebrow mb-2">Signal Matrix</p>
        <h1 style={{ color: '#e8e8f0', fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Tech Radar
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `${SVG_SIZE}px 1fr`, gap: 36, alignItems: 'start' }}>

        {/* ── LEFT: Radar ──────────────────────────────────────────── */}
        <div>
          <div
            style={{
              position: 'relative',
              width: SVG_SIZE,
              height: SVG_SIZE,
              borderRadius: '50%',
              background: 'radial-gradient(circle at center, rgba(52,211,153,0.035) 0%, rgba(5,5,14,0.9) 65%)',
              border: '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
              boxShadow: '0 0 80px rgba(52,211,153,0.05)',
            }}
          >
            {/* SVG: rings + blips */}
            <svg width={SVG_SIZE} height={SVG_SIZE} style={{ position: 'absolute', inset: 0, display: 'block' }}>
              {/* Cross-hairs */}
              <line x1={0} y1={CY} x2={SVG_SIZE} y2={CY} stroke="rgba(255,255,255,0.025)" strokeWidth={1} />
              <line x1={CX} y1={0} x2={CX} y2={SVG_SIZE} stroke="rgba(255,255,255,0.025)" strokeWidth={1} />
              <line x1={20} y1={20} x2={500} y2={500} stroke="rgba(255,255,255,0.012)" strokeWidth={0.5} />
              <line x1={500} y1={20} x2={20} y2={500} stroke="rgba(255,255,255,0.012)" strokeWidth={0.5} />

              {/* Zone fills (drawn largest first so smaller rings overlap) */}
              {[...RINGS].reverse().map(ring => (
                <circle key={ring.key + 'fill'} cx={CX} cy={CY} r={ring.outerR}
                  fill={`rgba(${ring.rgb},0.022)`} />
              ))}

              {/* Ring boundary circles */}
              {RINGS.map(ring => (
                <circle key={ring.key} cx={CX} cy={CY} r={ring.outerR}
                  fill="none"
                  stroke={`rgba(${ring.rgb},0.18)`}
                  strokeWidth={ring.key === 'adopt' ? 1.5 : 1}
                  strokeDasharray={ring.key === 'adopt' ? undefined : '6 9'}
                />
              ))}

              {/* Ring labels */}
              {RINGS.map(ring => (
                <text key={ring.key + 'lbl'}
                  x={CX} y={CY - ring.outerR + 14}
                  textAnchor="middle"
                  fill={ring.color} fontSize={13} fontWeight={900}
                  letterSpacing={3} opacity={0.35}
                  fontFamily="monospace"
                >
                  {ring.label}
                </text>
              ))}

              {/* Tick marks on outer ring */}
              {Array.from({ length: 36 }, (_, i) => {
                const a  = (i / 36) * 2 * Math.PI - Math.PI / 2
                const r1 = 246
                const r2 = i % 9 === 0 ? 236 : i % 3 === 0 ? 240 : 243
                return (
                  <line key={i}
                    x1={CX + r1 * Math.cos(a)} y1={CY + r1 * Math.sin(a)}
                    x2={CX + r2 * Math.cos(a)} y2={CY + r2 * Math.sin(a)}
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={i % 9 === 0 ? 1.5 : 0.5}
                  />
                )
              })}

              {/* Blips */}
              {blips.map(({ item, x, y, ring }) => {
                const color  = CAT_COLORS[item.category] ?? '#7c6aff'
                const isSel  = selectedId === item.id
                const dimmed = activeCat !== 'all' && item.category !== activeCat
                return (
                  <g key={item.id}
                    onClick={() => setSelectedId(isSel ? null : item.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    {isSel && (
                      <>
                        <circle cx={x} cy={y} r={18} fill="none" stroke={color} strokeWidth={1} opacity={0.2}>
                          <animate attributeName="r" values="10;24" dur="1.6s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.35;0" dur="1.6s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={x} cy={y} r={10} fill="none" stroke={color} strokeWidth={1} opacity={0.45} />
                      </>
                    )}
                    {/* Hit area (invisible, larger than visual dot) */}
                    <circle cx={x} cy={y} r={10} fill="transparent" />
                    {/* Visual dot */}
                    <circle
                      cx={x} cy={y}
                      r={isSel ? 7 : 5.5}
                      fill={color}
                      opacity={dimmed ? 0.1 : isSel ? 1 : 0.82}
                      style={{
                        filter: isSel ? `drop-shadow(0 0 6px ${color})` : undefined,
                        transition: 'opacity 0.2s, r 0.15s',
                      }}
                    />
                  </g>
                )
              })}

              {/* Center crosshair */}
              <circle cx={CX} cy={CY} r={8} fill="none" stroke="rgba(124,106,255,0.3)" strokeWidth={1} />
              <circle cx={CX} cy={CY} r={3} fill="#7c6aff" opacity={0.6} />
            </svg>

            {/* Rotating sweep — conic gradient glow sector */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'conic-gradient(from 270deg at 50% 50%, rgba(52,211,153,0) 0deg, rgba(52,211,153,0) 305deg, rgba(52,211,153,0.04) 345deg, rgba(52,211,153,0.2) 358deg, rgba(52,211,153,0) 360deg)',
              animation: 'radar-sweep 6s linear infinite',
              pointerEvents: 'none',
            }} />

            {/* Sweep arm */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              width: '50%', height: 1,
              background: 'linear-gradient(to right, rgba(52,211,153,0.1), rgba(52,211,153,0.8))',
              transformOrigin: '0% 50%',
              animation: 'radar-sweep 6s linear infinite',
              pointerEvents: 'none',
            }} />
          </div>

          {/* Legend below radar */}
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 6 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {RINGS.map(ring => (
                <div key={ring.key} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 9, height: 9, borderRadius: 2, background: ring.color, opacity: 0.7 }} />
                  <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.1em', color: ring.color, opacity: 0.7 }}>{ring.label}</span>
                  <span style={{ fontSize: 14, color: '#8080b0' }}>· {ring.desc}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {Object.entries(CAT_COLORS).map(([cat, color]) => (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                  <span style={{ fontSize: 14, color: '#9090c0', textTransform: 'capitalize' }}>{cat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Controls + detail ──────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* System status */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p className="eyebrow" style={{ marginBottom: 6 }}>System status</p>
              <p style={{ fontSize: 16, fontWeight: 700 }}>
                {loading ? (
                  <span style={{ color: '#8080b0' }}>Loading…</span>
                ) : total > 0 ? (
                  <><span style={{ color: '#34d399' }}>{total}</span><span style={{ color: '#5a5a7a' }}> signals tracked</span></>
                ) : (
                  <span style={{ color: '#8080b0' }}>No signals — run a scan</span>
                )}
              </p>
              {scanMsg && <p style={{ fontSize: 13, color: '#34d399', marginTop: 4 }}>{scanMsg}</p>}
              {scannedAt && !scanMsg && (
                <p style={{ fontSize: 12, color: '#5a5a8a', marginTop: 4 }}>Last scanned {relTime(scannedAt)}</p>
              )}
            </div>
            <button
              onClick={scan}
              disabled={scanning}
              style={{
                background: 'rgba(52,211,153,0.09)',
                color: '#34d399',
                border: '1px solid rgba(52,211,153,0.22)',
                borderRadius: 12,
                padding: '10px 20px',
                fontSize: 15, fontWeight: 900,
                letterSpacing: '0.1em', textTransform: 'uppercase',
                cursor: scanning ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                flexShrink: 0,
                opacity: scanning ? 0.5 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {scanning
                ? <><span className="inline-block h-3.5 w-3.5 rounded-full border border-emerald-400 border-t-transparent animate-spin" />Scanning…</>
                : '⟳ Scan Feed'}
            </button>
          </div>

          {/* Category filter */}
          <div>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Filter signal type</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {CATEGORIES.map(cat => {
                const active = activeCat === cat
                const color  = cat === 'all' ? '#7c6aff' : (CAT_COLORS[cat] ?? '#7c6aff')
                const rgb    = hexToRgb(color)
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCat(cat)}
                    style={{
                      background: active ? `rgba(${rgb},0.13)` : 'transparent',
                      color: active ? color : '#9090c0',
                      border: `1px solid ${active ? `rgba(${rgb},0.32)` : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: 10, padding: '8px 14px',
                      fontSize: 15, fontWeight: 700,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      cursor: 'pointer', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 7,
                    }}
                  >
                    {cat !== 'all' && (
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                    )}
                    {cat}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Signal detail panel */}
          <div
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: `1px solid ${selected ? `rgba(${selected.ring.rgb},0.24)` : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 16,
              overflow: 'hidden',
              transition: 'border-color 0.3s',
              minHeight: 220,
            }}
          >
            {selected ? (
              <div style={{ position: 'relative' }}>
                <div style={{ height: 2.5, background: `linear-gradient(to right, ${selected.ring.color}, transparent)` }} />
                <div style={{ position: 'absolute', left: 0, top: 2.5, bottom: 0, width: 3, background: selected.ring.color, opacity: 0.7 }} />
                <div style={{ padding: '20px 20px 22px 26px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: CAT_COLORS[selected.item.category] ?? '#7c6aff',
                      background: `rgba(${hexToRgb(CAT_COLORS[selected.item.category] ?? '#7c6aff')},0.1)`,
                      border: `1px solid rgba(${hexToRgb(CAT_COLORS[selected.item.category] ?? '#7c6aff')},0.24)`,
                      borderRadius: 5, padding: '3px 9px',
                    }}>
                      {selected.item.category}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
                      color: selected.ring.color,
                      background: `rgba(${selected.ring.rgb},0.1)`,
                      border: `1px solid rgba(${selected.ring.rgb},0.24)`,
                      borderRadius: 5, padding: '3px 9px',
                    }}>
                      {selected.ring.label}
                    </span>
                    <span style={{ fontSize: 14, color: '#8080b0', marginLeft: 'auto' }}>
                      {selected.ring.desc}
                    </span>
                  </div>

                  <h2 style={{ color: '#e8e8f0', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12, lineHeight: 1.2 }}>
                    {selected.item.name}
                  </h2>

                  {selected.item.rationale && (
                    <p style={{ color: '#7070a0', fontSize: 14, lineHeight: 1.75 }}>
                      {selected.item.rationale}
                    </p>
                  )}

                  {/* Ring journey */}
                  {selected.item.ring_history && selected.item.ring_history.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', color: '#5a5a8a', textTransform: 'uppercase', marginBottom: 8 }}>
                        Ring Journey
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                        {selected.item.ring_history.map((h, i) => {
                          const fromRing = RINGS.find(r => r.key === h.from)
                          const toRing   = RINGS.find(r => r.key === h.to)
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                              <span style={{ color: fromRing?.color ?? '#5a5a8a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h.from}</span>
                              <span style={{ color: '#3a3a5a' }}>→</span>
                              <span style={{ color: toRing?.color ?? '#5a5a8a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h.to}</span>
                              <span style={{ color: '#4a4a6a', fontSize: 11 }}>({relTime(h.date)})</span>
                              {i < selected.item.ring_history!.length - 1 && (
                                <span style={{ color: '#2a2a4a', margin: '0 2px' }}>·</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 16 }}>
                    <button
                      onClick={() => setSelectedId(null)}
                      style={{
                        fontSize: 14, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: '#8080b0',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      }}
                    >
                      ← deselect
                    </button>
                    <button
                      onClick={() => removeSignal(selected.item.id)}
                      disabled={removing}
                      style={{
                        fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: confirmId === selected.item.id ? '#fbbf24' : '#f87171',
                        background: confirmId === selected.item.id ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.07)',
                        border: `1px solid ${confirmId === selected.item.id ? 'rgba(251,191,36,0.25)' : 'rgba(248,113,113,0.2)'}`,
                        borderRadius: 7, padding: '4px 12px',
                        cursor: removing ? 'not-allowed' : 'pointer',
                        opacity: removing ? 0.5 : 1,
                        transition: 'all 0.2s',
                      }}
                    >
                      {removing ? 'removing…' : confirmId === selected.item.id ? 'confirm?' : '✕ remove'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 220, gap: 12, padding: 24 }}>
                <svg width={52} height={52} style={{ opacity: 0.2 }}>
                  <circle cx={26} cy={26} r={22} fill="none" stroke="#34d399" strokeWidth={1} strokeDasharray="4 4" />
                  <circle cx={26} cy={26} r={12} fill="none" stroke="#34d399" strokeWidth={1} />
                  <circle cx={26} cy={26} r={3} fill="#34d399" />
                  <line x1={4} y1={26} x2={48} y2={26} stroke="#34d399" strokeWidth={0.75} />
                  <line x1={26} y1={4} x2={26} y2={48} stroke="#34d399" strokeWidth={0.75} />
                </svg>
                <p className="eyebrow">no signal selected</p>
                <p style={{ color: '#8080b0', fontSize: 13, textAlign: 'center' }}>Click any blip on the radar to inspect</p>
              </div>
            )}
          </div>

          {/* Velocity bars */}
          <div>
            <p className="eyebrow" style={{ marginBottom: 12 }}>Topic velocity</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {velData.map(({ name, v, pct }) => {
                const color = VEL_COLORS[name] ?? '#7c6aff'
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 70, fontSize: 14, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#8080b0', textAlign: 'right', flexShrink: 0 }}>
                      {name}
                    </span>
                    <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: 99, opacity: 0.8, transition: 'width 0.5s ease' }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color, width: 40, textAlign: 'right', flexShrink: 0 }}>
                      {v}x
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Empty scan prompt */}
          {total === 0 && !scanning && !loading && (
            <div style={{
              background: 'rgba(52,211,153,0.04)',
              border: '1px solid rgba(52,211,153,0.12)',
              borderRadius: 14, padding: '18px 20px',
            }}>
              <p style={{ color: '#34d399', fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Radar is empty</p>
              <p style={{ color: '#9090c0', fontSize: 13, lineHeight: 1.6 }}>
                Click "Scan Feed" to auto-classify tools and models from your feed. Takes ~15 seconds.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Signal Index Table ──────────────────────────────────────────── */}
      {!loading && total > 0 && (
        <div style={{ marginTop: 52 }}>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 18 }}>
            <div>
              <p className="eyebrow" style={{ marginBottom: 4 }}>Signal Index</p>
              <p style={{ fontSize: 13, color: '#5a5a8a' }}>
                {tableItems.length} signal{tableItems.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Ring filter */}
              <button
                onClick={() => setTableRing('all')}
                style={{
                  background: tableRing === 'all' ? 'rgba(124,106,255,0.13)' : 'transparent',
                  color: tableRing === 'all' ? '#7c6aff' : '#9090c0',
                  border: `1px solid ${tableRing === 'all' ? 'rgba(124,106,255,0.32)' : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 8, padding: '6px 14px',
                  fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                All
              </button>
              {RINGS.map(ring => (
                <button
                  key={ring.key}
                  onClick={() => setTableRing(ring.key)}
                  style={{
                    background: tableRing === ring.key ? `rgba(${ring.rgb},0.13)` : 'transparent',
                    color: tableRing === ring.key ? ring.color : '#9090c0',
                    border: `1px solid ${tableRing === ring.key ? `rgba(${ring.rgb},0.32)` : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 8, padding: '6px 14px',
                    fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {ring.label}
                </button>
              ))}
              <input
                value={tableSearch}
                onChange={e => setTableSearch(e.target.value)}
                placeholder="Search signals…"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: 8, padding: '7px 14px',
                  fontSize: 13, color: '#c0c0e0',
                  outline: 'none', width: 210,
                }}
              />
            </div>
          </div>

          {/* Table */}
          <div style={{
            background: 'rgba(255,255,255,0.018)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '90px 90px 200px 1fr',
              padding: '10px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.025)',
            }}>
              {['Ring', 'Type', 'Signal', 'Rationale'].map(h => (
                <span key={h} style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#5a5a8a' }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {tableItems.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: '#5a5a8a', fontSize: 14 }}>
                No signals match filters
              </div>
            ) : (
              tableItems.map(item => {
                const isSel    = selectedId === item.id
                const catColor = CAT_COLORS[item.category] ?? '#7c6aff'
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedId(item.id)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 90px 200px 1fr',
                      padding: '13px 20px',
                      cursor: 'pointer',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      borderLeft: isSel ? `3px solid ${item.ringMeta.color}` : '3px solid transparent',
                      background: isSel ? `rgba(${item.ringMeta.rgb},0.07)` : undefined,
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{
                      fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: item.ringMeta.color, alignSelf: 'center',
                    }}>
                      {item.ringMeta.label}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'center' }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: catColor, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: '#9090c0', textTransform: 'capitalize' }}>{item.category}</span>
                    </div>
                    <span style={{
                      fontSize: 14, fontWeight: 700,
                      color: isSel ? '#e8e8f0' : '#c8c8e0',
                      alignSelf: 'center', paddingRight: 20,
                    }}>
                      {item.name}
                    </span>
                    <span style={{ fontSize: 13, color: '#7070a0', lineHeight: 1.65, alignSelf: 'center' }}>
                      {item.rationale ?? '—'}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </main>
  )
}
