'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import type { AIModel } from '@/lib/types'

const LAB: Record<string, { color: string; rgb: string; short: string; bg: string }> = {
  Anthropic: { color: '#f97316', rgb: '249,115,22',  short: 'ANT', bg: 'rgba(249,115,22,0.04)'  },
  OpenAI:    { color: '#10b981', rgb: '16,185,129',  short: 'OAI', bg: 'rgba(16,185,129,0.04)'  },
  Google:    { color: '#3b82f6', rgb: '59,130,246',  short: 'GOG', bg: 'rgba(59,130,246,0.04)'  },
  Meta:      { color: '#a855f7', rgb: '168,85,247',  short: 'MTA', bg: 'rgba(168,85,247,0.04)'  },
  Mistral:   { color: '#f59e0b', rgb: '245,158,11',  short: 'MST', bg: 'rgba(245,158,11,0.04)'  },
  DeepSeek:  { color: '#06b6d4', rgb: '6,182,212',   short: 'DSK', bg: 'rgba(6,182,212,0.04)'   },
  xAI:       { color: '#94a3b8', rgb: '148,163,184', short: 'XAI', bg: 'rgba(148,163,184,0.04)' },
}

const BENCH_LABEL: Record<string, string> = {
  arc_agi: 'ARC-AGI', aime: 'AIME', swe_bench: 'SWE-Bench',
  gpqa: 'GPQA', mmlu: 'MMLU', humaneval: 'HumanEval', math: 'MATH',
}
const BENCH_ORDER = ['arc_agi', 'aime', 'swe_bench', 'gpqa', 'mmlu', 'humaneval', 'math']
const MOD_LABEL: Record<string, string> = { text: 'TXT', vision: 'VIS', audio: 'AUD', code: 'COD' }
const ALL_LABS = Object.keys(LAB)
const PRESETS = [
  { label: 'Best Coding',     key: 'coding'    },
  { label: 'Best Reasoning',  key: 'reasoning' },
  { label: 'Longest Context', key: 'context'   },
  { label: 'Cheapest',        key: 'cheap'     },
  { label: 'Open Weight',     key: 'open'      },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCtx(n: number | null) {
  if (!n) return '—'
  if (n >= 1_000_000) return `${n / 1_000_000}M`
  if (n >= 1_000)     return `${n / 1_000}K`
  return String(n)
}
function fmtCost(n: number | null) {
  if (n === null) return null
  return `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`
}
function fmtDate(s: string) {
  const p = s.split('-')
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1]) - 1] + ' ' + p[0]
}
function truncate(s: string, max: number) {
  if (s.length <= max) return s
  const cut = s.lastIndexOf(' ', max)
  return s.slice(0, cut > 0 ? cut : max) + '…'
}
function topBench(b: Record<string, number>) {
  for (const k of BENCH_ORDER) if (b[k] !== undefined) return { k, v: b[k] }
  const e = Object.entries(b)[0]
  return e ? { k: e[0], v: e[1] } : null
}
function codingScore(m: AIModel)    { return m.benchmarks.swe_bench ?? m.benchmarks.humaneval ?? 0 }
function reasoningScore(m: AIModel) { return m.benchmarks.arc_agi ?? m.benchmarks.aime ?? m.benchmarks.gpqa ?? 0 }

function applyPreset(models: AIModel[], p: string): AIModel[] {
  const active = models.filter(m => m.status === 'active')
  switch (p) {
    case 'coding':    return [...active].sort((a, b) => codingScore(b) - codingScore(a))
    case 'reasoning': return [...active].sort((a, b) => reasoningScore(b) - reasoningScore(a))
    case 'context':   return active.filter(m => m.context_window).sort((a,b) => (b.context_window ?? 0) - (a.context_window ?? 0))
    case 'cheap':     return active.filter(m => m.input_cost_per_mtok !== null).sort((a,b) => (a.input_cost_per_mtok ?? 999) - (b.input_cost_per_mtok ?? 999))
    case 'open':      return active.filter(m => m.input_cost_per_mtok === null)
    default:          return models
  }
}

// ── Boot sequence ─────────────────────────────────────────────────────────────

const BOOT_LINES = [
  '> INITIALIZING MODEL ARSENAL...',
  '> CONNECTING TO INTELLIGENCE NETWORK...',
  '> INDEXING ACTIVE DEPLOYMENTS...',
  '> CALIBRATING CAPABILITY MATRIX...',
  '> ALL SYSTEMS OPERATIONAL',
]

function BootScreen({ onDone }: { onDone: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    const timers = BOOT_LINES.map((line, i) =>
      setTimeout(() => setLines(prev => [...prev, line]), i * 280 + 80)
    )
    const finish = setTimeout(() => { setDone(true); setTimeout(onDone, 350) }, BOOT_LINES.length * 280 + 300)
    return () => { timers.forEach(clearTimeout); clearTimeout(finish) }
  }, [onDone])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center flex-col"
      style={{ background: '#030308', opacity: done ? 0 : 1, transition: 'opacity 0.35s ease', pointerEvents: done ? 'none' : 'auto' }}>
      <div style={{ fontFamily: 'monospace', width: 440 }}>
        <p style={{ color: '#f97316', fontSize: 13, fontWeight: 900, letterSpacing: '0.2em', marginBottom: 24 }}>
          ■ AI PULSE · MODEL ARSENAL
        </p>
        {lines.map((line, i) => (
          <p key={i} style={{
            color: i === lines.length - 1 ? '#34d399' : '#9090c4',
            fontSize: 14, letterSpacing: '0.05em', marginBottom: 7,
            animation: 'boot-reveal 0.18s ease-out',
          }}>{line}</p>
        ))}
        {lines.length < BOOT_LINES.length && (
          <span style={{ color: '#a78bfa', fontSize: 14, animation: 'boot-blink 0.8s step-end infinite' }}>█</span>
        )}
      </div>
    </div>
  )
}

// ── Ambient background ────────────────────────────────────────────────────────

function AmbientBg() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <div style={{ position: 'absolute', top: '-15%', right: '-8%', width: 700, height: 700, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(249,115,22,0.07) 0%, transparent 65%)',
        animation: 'ambient-drift 14s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '25%', left: '-12%', width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,106,255,0.065) 0%, transparent 65%)',
        animation: 'ambient-drift 18s ease-in-out infinite reverse' }} />
      <div style={{ position: 'absolute', bottom: '-8%', right: '25%', width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.055) 0%, transparent 65%)',
        animation: 'ambient-drift 22s ease-in-out infinite 8s' }} />
    </div>
  )
}

// ── Scanner header ────────────────────────────────────────────────────────────

function ScannerHeader({ models, visibleCount }: { models: AIModel[]; visibleCount: number }) {
  const [counts, setCounts] = useState({ active: 0, labs: 0, newest: '' })

  useEffect(() => {
    if (!models.length) return
    const active = models.filter(m => m.status === 'active').length
    const labs = new Set(models.map(m => m.lab)).size
    const newest = [...models].sort((a, b) => b.release_date.localeCompare(a.release_date))[0]?.name ?? ''
    let frame = 0
    const id = setInterval(() => {
      frame++
      const p = Math.min(frame / 40, 1)
      setCounts({ active: Math.round(active * p), labs: Math.round(labs * p), newest })
      if (frame >= 40) clearInterval(id)
    }, 20)
    return () => clearInterval(id)
  }, [models])

  return (
    <div className="relative overflow-hidden mb-10" style={{ paddingBottom: 24 }}>
      <div className="absolute inset-x-0" style={{ height: 1, bottom: 0, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, height: '100%', width: '60%',
          background: 'linear-gradient(to right, transparent, rgba(249,115,22,0.6), rgba(124,106,255,0.4), transparent)',
          animation: 'header-scan 3.5s ease-in-out infinite',
        }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.06)' }} />
      </div>

      <p style={{ color: '#f97316', fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 12 }}>
        ■ Model Intelligence · Arsenal
      </p>
      <h1 style={{
        fontSize: 'clamp(38px, 5vw, 58px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 20,
        background: 'linear-gradient(135deg, #e8e8f0 30%, #b0b0d8 65%, #7c6aff 100%)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
      }}>
        AI Model Changelog
      </h1>

      <div className="flex items-center gap-8 flex-wrap">
        {[
          { label: 'ACTIVE MODELS', value: String(counts.active), color: '#34d399' },
          { label: 'LABS TRACKED',  value: String(counts.labs),   color: '#a78bfa' },
          { label: 'LATEST',        value: counts.newest,         color: '#f97316', mono: false },
          { label: 'SHOWING',       value: String(visibleCount),  color: '#60a5fa' },
        ].map(({ label, value, color, mono }) => (
          <div key={label} className="flex flex-col gap-1">
            <span style={{ color: '#9090c0', fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{label}</span>
            <span style={{ color, fontSize: 17, fontWeight: 900, fontFamily: mono !== false ? 'monospace' : undefined, letterSpacing: '-0.02em' }}>
              {value || '—'}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', color: '#8080b0', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'monospace' }}>
          PRICING/MTOK · BENCHMARKS % · 2025
        </div>
      </div>
    </div>
  )
}

// ── Capability matrix ─────────────────────────────────────────────────────────

function CapabilityMatrix({ models, onHover }: { models: AIModel[]; onHover: (id: string | null) => void }) {
  const [mounted, setMounted] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; model: AIModel } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => { setTimeout(() => setMounted(true), 100) }, [])

  const plot = models.filter(m => m.status === 'active' && Object.keys(m.benchmarks).length > 0)
  if (plot.length < 3) return null

  const W = 1000, H = 310
  const PAD = { l: 58, r: 36, t: 36, b: 52 }

  const dates = plot.map(m => new Date(m.release_date).getTime())
  const dMin = Math.min(...dates), dMax = Math.max(...dates)
  const ctxs = plot.map(m => m.context_window ?? 8000)
  const cMin = Math.min(...ctxs), cMax = Math.max(...ctxs)

  function px(dateStr: string) {
    const t = new Date(dateStr).getTime()
    if (dMax === dMin) return (W - PAD.l - PAD.r) / 2 + PAD.l
    return PAD.l + ((t - dMin) / (dMax - dMin)) * (W - PAD.l - PAD.r)
  }
  function py(score: number) {
    return H - PAD.b - (score / 100) * (H - PAD.t - PAD.b)
  }
  function pr(ctx: number | null) {
    if (!ctx) return 6
    const pct = (Math.log(ctx) - Math.log(cMin)) / (Math.log(cMax / cMin) || 1)
    return 5 + pct * 13
  }

  const years = new Set(plot.map(m => m.release_date.slice(0, 4)))

  // Top 7 models by benchmark — labeled on chart
  const labelSet = new Set(
    [...plot]
      .map(m => ({ m, b: topBench(m.benchmarks) }))
      .filter(x => x.b)
      .sort((a, b) => b.b!.v - a.b!.v)
      .slice(0, 7)
      .map(x => x.m.id)
  )

  // Constellation lines per lab
  const labGroups: Record<string, AIModel[]> = {}
  for (const m of plot) {
    if (!labGroups[m.lab]) labGroups[m.lab] = []
    labGroups[m.lab].push(m)
  }
  for (const k of Object.keys(labGroups)) {
    labGroups[k].sort((a, b) => a.release_date.localeCompare(b.release_date))
  }

  return (
    <div className="relative mb-10 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(4,4,18,0.88)', border: '1px solid rgba(255,255,255,0.09)' }}>

      <div className="flex items-start justify-between px-6 pt-5 pb-2">
        <div>
          <p style={{ color: '#d0d0e8', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Capability Matrix
          </p>
          <p style={{ color: '#9090c0', fontSize: 13, marginTop: 3 }}>
            Release date × benchmark score · bubble size = context window · lines connect same-lab models
          </p>
        </div>
        <p style={{ color: '#8080b0', fontSize: 11, fontFamily: 'monospace', flexShrink: 0, paddingTop: 2 }}>
          active models only
        </p>
      </div>

      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        <defs>
          <linearGradient id="plotBg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(124,106,255,0.04)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="url(#plotBg)" />

        {/* Y-axis grid + labels */}
        {[0, 25, 50, 75, 100].map(y => (
          <g key={y}>
            <line x1={PAD.l} x2={W - PAD.r} y1={py(y)} y2={py(y)}
              stroke={y === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)'}
              strokeWidth={y === 0 ? 1.5 : 1} strokeDasharray={y === 0 ? '' : '3,5'} />
            <text x={PAD.l - 8} y={py(y) + 4} textAnchor="end" fill="#9090c4" fontSize={11} fontFamily="monospace">{y}%</text>
          </g>
        ))}

        {/* Y-axis title */}
        <text x={13} y={H / 2} textAnchor="middle" fill="#8080b0" fontSize={10} fontFamily="monospace"
          transform={`rotate(-90, 13, ${H / 2})`}>BENCHMARK %</text>

        {/* X-axis baseline */}
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="rgba(255,255,255,0.1)" strokeWidth={1.5} />

        {/* Year ticks */}
        {Array.from(years).sort().map(yr => {
          const t = new Date(`${yr}-07-01`).getTime()
          const x = PAD.l + ((t - dMin) / (dMax - dMin || 1)) * (W - PAD.l - PAD.r)
          return (
            <g key={yr}>
              <line x1={x} x2={x} y1={H - PAD.b} y2={H - PAD.b + 6} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
              <text x={x} y={H - PAD.b + 20} textAnchor="middle" fill="#a0a0c8" fontSize={12} fontFamily="monospace">{yr}</text>
            </g>
          )
        })}

        {/* Constellation lines */}
        {mounted && Object.entries(labGroups).map(([lab, lms]) => {
          if (lms.length < 2) return null
          const meta = LAB[lab] ?? { rgb: '124,106,255' }
          return lms.slice(0, -1).map((m, i) => {
            const next = lms[i + 1]
            const b1 = topBench(m.benchmarks), b2 = topBench(next.benchmarks)
            if (!b1 || !b2) return null
            return (
              <line key={`${m.id}-${next.id}`}
                x1={px(m.release_date)} y1={py(b1.v)}
                x2={px(next.release_date)} y2={py(b2.v)}
                stroke={`rgba(${meta.rgb},0.2)`} strokeWidth={1.5} strokeDasharray="4,5" />
            )
          })
        })}

        {/* Glow halos */}
        {mounted && plot.map((m, i) => {
          const b = topBench(m.benchmarks)
          if (!b) return null
          const meta = LAB[m.lab] ?? { color: '#7c6aff', rgb: '124,106,255' }
          const x = px(m.release_date), y = py(b.v), r = pr(m.context_window)
          return (
            <circle key={`halo-${m.id}`} cx={x} cy={y} r={r + 9}
              fill={`rgba(${meta.rgb},0.12)`}
              style={{ transition: `all 0.6s cubic-bezier(0.34,1.56,0.64,1) ${i * 30}ms`, opacity: mounted ? 1 : 0 }} />
          )
        })}

        {/* Bubbles */}
        {plot.map((m, i) => {
          const b = topBench(m.benchmarks)
          if (!b) return null
          const meta = LAB[m.lab] ?? { color: '#7c6aff', rgb: '124,106,255' }
          const x = px(m.release_date), y = py(b.v), r = pr(m.context_window)
          return (
            <g key={m.id} style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => {
                const rect = svgRef.current?.getBoundingClientRect()
                const svgX = rect ? (e.clientX - rect.left) / rect.width * W : x
                setTooltip({ x: svgX, y, model: m }); onHover(m.id)
              }}
              onMouseLeave={() => { setTooltip(null); onHover(null) }}>
              <circle cx={x} cy={y} r={mounted ? r : 0}
                fill={`rgba(${meta.rgb},0.82)`} stroke={meta.color} strokeWidth={2}
                style={{ transition: `r 0.55s cubic-bezier(0.34,1.56,0.64,1) ${i * 35}ms` }} />
              {/* Name label for top models */}
              {mounted && labelSet.has(m.id) && (
                <text x={x} y={y - r - 7} textAnchor="middle"
                  fill="#d0d0e8" fontSize={9.5} fontWeight="700" fontFamily="system-ui"
                  style={{ pointerEvents: 'none' }}>
                  {m.name.length > 18 ? m.name.split(' ').slice(0, 2).join(' ') : m.name}
                </text>
              )}
            </g>
          )
        })}

        {/* SVG tooltip */}
        {tooltip && (() => {
          const m = tooltip.model
          const b = topBench(m.benchmarks)
          const meta = LAB[m.lab] ?? { color: '#7c6aff', rgb: '124,106,255' }
          const tx = Math.min(Math.max(tooltip.x, 105), W - 105)
          const ty = tooltip.y < H / 2 ? tooltip.y + 24 : tooltip.y - 62
          return (
            <g>
              <rect x={tx - 100} y={ty} width={200} height={54} rx={8}
                fill="rgba(6,6,22,0.97)" stroke={`rgba(${meta.rgb},0.55)`} strokeWidth={1.5} />
              <text x={tx} y={ty + 17} textAnchor="middle" fill="#e8e8f0" fontSize={13} fontWeight="bold">{m.name}</text>
              <text x={tx} y={ty + 32} textAnchor="middle" fill={meta.color} fontSize={12}>{BENCH_LABEL[b?.k ?? ''] ?? b?.k}: {b?.v}%</text>
              <text x={tx} y={ty + 47} textAnchor="middle" fill="#a0a0c8" fontSize={11} fontFamily="monospace">
                CTX {fmtCtx(m.context_window)} · {m.lab}
              </text>
            </g>
          )
        })()}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-5 px-6 pb-5 pt-2">
        {ALL_LABS.filter(l => plot.some(m => m.lab === l)).map(l => (
          <div key={l} className="flex items-center gap-2">
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: LAB[l].color, boxShadow: `0 0 8px ${LAB[l].color}` }} />
            <span style={{ color: '#c0c0d8', fontSize: 13, fontWeight: 600 }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Benchmark bar ─────────────────────────────────────────────────────────────

function BenchBar({ label, value, color, rgb, delay }: {
  label: string; value: number; color: string; rgb: string; delay: number
}) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setW(value), delay + 50)
    return () => clearTimeout(t)
  }, [value, delay])

  return (
    <div style={{ marginBottom: 9 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ color: '#a0a0c8', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ color, fontSize: 13, fontWeight: 900, fontFamily: 'monospace' }}>{value}%</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
        <div style={{
          height: '100%', width: `${w}%`, borderRadius: 999,
          background: `linear-gradient(to right, rgba(${rgb},0.4), ${color})`,
          boxShadow: `0 0 10px rgba(${rgb},0.5)`,
          transition: 'width 0.9s cubic-bezier(0.22,1,0.36,1)',
        }} />
      </div>
    </div>
  )
}

// ── Model card ────────────────────────────────────────────────────────────────

function ModelCard({ model, compareMode, isSelected, onSelect, highlighted, enterDelay }: {
  model: AIModel; compareMode: boolean; isSelected: boolean
  onSelect: (id: string) => void; highlighted: boolean; enterDelay: number
}) {
  const meta  = LAB[model.lab] ?? { color: '#7c6aff', rgb: '124,106,255', short: '???', bg: 'rgba(124,106,255,0.04)' }
  const bench = topBench(model.benchmarks)
  const isOpen = model.input_cost_per_mtok === null && model.output_cost_per_mtok === null
  const allBenches = BENCH_ORDER.filter(k => model.benchmarks[k] !== undefined)

  return (
    <div className="model-card relative flex flex-col rounded-2xl overflow-hidden"
      onClick={compareMode ? () => onSelect(model.id) : undefined}
      style={{
        background: `radial-gradient(ellipse at top left, ${meta.bg}, #050512 60%)`,
        border: `1px solid ${isSelected ? meta.color : highlighted ? `rgba(${meta.rgb},0.45)` : `rgba(${meta.rgb},0.16)`}`,
        boxShadow: isSelected
          ? `0 0 0 2px rgba(${meta.rgb},0.25), 0 8px 40px rgba(${meta.rgb},0.18)`
          : highlighted ? `0 4px 30px rgba(${meta.rgb},0.14)` : '0 2px 16px rgba(0,0,0,0.3)',
        cursor: compareMode ? 'pointer' : 'default',
        transform: isSelected ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
        animation: `model-enter 0.4s ease-out ${enterDelay}ms both`,
      }}>
      <div className="model-card-shimmer" />

      {/* Top accent bar */}
      <div style={{ height: 3, background: `linear-gradient(to right, ${meta.color}, rgba(${meta.rgb},0.4) 60%, transparent)`, boxShadow: `0 0 14px rgba(${meta.rgb},0.5)` }} />

      {/* Left glow strip */}
      <div style={{ position: 'absolute', left: 0, top: 3, bottom: 0, width: 3,
        background: model.status === 'active' ? meta.color : `rgba(${meta.rgb},0.3)`,
        boxShadow: model.status === 'active' ? `0 0 14px ${meta.color}` : 'none' }} />

      {compareMode && (
        <div className="absolute top-3 right-3 flex items-center justify-center rounded-full"
          style={{ width: 22, height: 22, background: isSelected ? meta.color : 'rgba(255,255,255,0.07)', border: `1.5px solid ${isSelected ? meta.color : 'rgba(255,255,255,0.2)'}` }}>
          {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>}
        </div>
      )}

      <div style={{ padding: '16px 18px 18px 22px', position: 'relative', zIndex: 1 }}>
        {bench && (
          <div aria-hidden style={{ position: 'absolute', right: 14, top: 8, fontSize: 80, fontWeight: 900, lineHeight: 1,
            color: meta.color, opacity: 0.07, letterSpacing: '-0.04em', userSelect: 'none', pointerEvents: 'none', fontFamily: 'monospace' }}>
            {bench.v}
          </div>
        )}

        <div className="flex items-center justify-between mb-3" style={{ paddingRight: compareMode ? 28 : 0 }}>
          <span style={{ background: `rgba(${meta.rgb},0.15)`, color: meta.color, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', padding: '3px 9px', borderRadius: 5 }}>
            {meta.short}
          </span>
          <div className="flex items-center gap-2">
            {model.status === 'active' ? (
              <div className="flex items-center gap-1.5">
                <div className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full ping-slow" style={{ background: 'rgba(52,211,153,0.5)' }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: '#34d399' }} />
                </div>
                <span style={{ color: '#34d399', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em' }}>LIVE</span>
              </div>
            ) : (
              <span style={{ background: 'rgba(239,68,68,0.09)', color: '#ef4444', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 4 }}>
                DECOMMISSIONED
              </span>
            )}
          </div>
        </div>

        <h3 style={{ color: '#e8e8f0', fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 5 }}>
          {model.name}
        </h3>
        <p style={{ color: '#a0a0c8', fontSize: 13, marginBottom: 14 }}>
          {model.family} · {fmtDate(model.release_date)}
          {model.knowledge_cutoff && <span style={{ color: '#8080b0' }}> · cutoff {model.knowledge_cutoff}</span>}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '4px 10px', fontSize: 13, fontWeight: 700, color: '#b0b0d0', fontFamily: 'monospace' }}>
            CTX {fmtCtx(model.context_window)}
          </span>
          {isOpen ? (
            <span style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.28)', borderRadius: 7, padding: '4px 10px', fontSize: 13, fontWeight: 700, color: '#34d399' }}>
              OPEN WEIGHT
            </span>
          ) : (
            <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '4px 10px', fontSize: 13, fontWeight: 700, color: '#b0b0d0', fontFamily: 'monospace' }}>
              {fmtCost(model.input_cost_per_mtok) ?? '?'} / {fmtCost(model.output_cost_per_mtok) ?? '?'}
            </span>
          )}
          {model.modalities.map(mod => (
            <span key={mod} style={{ background: `rgba(${meta.rgb},0.11)`, color: meta.color, borderRadius: 7, padding: '4px 8px', fontSize: 11, fontWeight: 900, letterSpacing: '0.06em' }}>
              {MOD_LABEL[mod] ?? mod.slice(0,3).toUpperCase()}
            </span>
          ))}
        </div>

        {allBenches.length > 0 && (
          <div style={{ borderTop: `1px solid rgba(${meta.rgb},0.14)`, paddingTop: 14, marginBottom: 12 }}>
            {allBenches.map((k, i) => (
              <BenchBar key={k} label={BENCH_LABEL[k] ?? k} value={model.benchmarks[k]}
                color={meta.color} rgb={meta.rgb} delay={i * 120} />
            ))}
          </div>
        )}

        {model.notes && (
          <p style={{ color: '#9090b8', fontSize: 13, lineHeight: 1.7 }}>
            {truncate(model.notes, 120)}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Lab section ───────────────────────────────────────────────────────────────

function LabSection({ lab, models, compareMode, compareIds, onSelect, hoveredId, enterBase }: {
  lab: string; models: AIModel[]; compareMode: boolean; compareIds: string[]
  onSelect: (id: string) => void; hoveredId: string | null; enterBase: number
}) {
  const meta = LAB[lab] ?? { color: '#7c6aff', rgb: '124,106,255', short: '???' }
  const active = models.filter(m => m.status === 'active').length

  return (
    <section style={{ marginBottom: 56 }}>
      <div className="relative flex items-center gap-4 mb-6 overflow-hidden" style={{ paddingBottom: 16 }}>
        <div aria-hidden style={{
          position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
          fontSize: 'clamp(52px, 9vw, 88px)', fontWeight: 900, letterSpacing: '-0.05em',
          color: meta.color, opacity: 0.05, lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
        }}>{lab.toUpperCase()}</div>

        <div style={{ width: 48, height: 48, borderRadius: 13, flexShrink: 0, background: `rgba(${meta.rgb},0.13)`,
          border: `1px solid rgba(${meta.rgb},0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 24px rgba(${meta.rgb},0.15)` }}>
          <span style={{ color: meta.color, fontSize: 13, fontWeight: 900, letterSpacing: '0.06em' }}>{meta.short}</span>
        </div>

        <div>
          <h2 style={{ color: '#e8e8f0', fontSize: 24, fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>{lab}</h2>
          <p style={{ color: '#a0a0c8', fontSize: 13, marginTop: 3 }}>{active} active · {models.length} total</p>
        </div>

        <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, rgba(${meta.rgb},0.35), rgba(${meta.rgb},0.05), transparent)` }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, height: 1, width: '100%', background: `linear-gradient(to right, rgba(${meta.rgb},0.18), transparent)` }} />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[...models].sort((a, b) => b.release_date.localeCompare(a.release_date)).map((m, i) => (
          <ModelCard key={m.id} model={m} compareMode={compareMode} isSelected={compareIds.includes(m.id)}
            onSelect={onSelect} highlighted={hoveredId === m.id} enterDelay={enterBase + i * 60} />
        ))}
      </div>
    </section>
  )
}

// ── Compare panel ─────────────────────────────────────────────────────────────

function ComparePanel({ models, onClose, onRemove }: {
  models: AIModel[]; onClose: () => void; onRemove: (id: string) => void
}) {
  const is2 = models.length === 2
  const allBenchKeys = BENCH_ORDER.filter(k => models.some(m => m.benchmarks[k] !== undefined))

  function winner(getter: (m: AIModel) => number | null, higherBetter: boolean, freeWins?: boolean) {
    const vals = models.map(getter)
    if (freeWins && vals.some(v => v === null)) return vals.findIndex(v => v === null)
    const defined = vals.filter(v => v !== null) as number[]
    if (!defined.length) return -1
    const best = higherBetter ? Math.max(...defined) : Math.min(...defined)
    return vals.findIndex(v => v === best)
  }

  const metrics: Array<{ label: string; getter: (m: AIModel) => number | null; fmt: (v: number | null, m: AIModel) => string; higher: boolean; freeWins?: boolean }> = [
    { label: 'Context',   getter: m => m.context_window, fmt: v => fmtCtx(v), higher: true },
    { label: 'Input $/M', getter: m => m.input_cost_per_mtok,
      fmt: (v, m) => m.input_cost_per_mtok === null && m.output_cost_per_mtok === null ? 'free' : (fmtCost(v) ?? '—'),
      higher: false, freeWins: true },
    ...allBenchKeys.map(k => ({
      label: BENCH_LABEL[k] ?? k,
      getter: (m: AIModel) => m.benchmarks[k] ?? null,
      fmt: (v: number | null) => v === null ? '—' : `${v}%`,
      higher: true,
    })),
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50"
      style={{ marginLeft: 52, background: 'rgba(3,3,14,0.97)', borderTop: '1px solid rgba(124,106,255,0.38)',
        backdropFilter: 'blur(24px)', boxShadow: '0 -24px 80px rgba(0,0,0,0.7)', animation: 'arsenal-fade-in 0.25s ease-out' }}>

      <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-4">
          <span style={{ color: '#a78bfa', fontSize: 13, fontWeight: 900, letterSpacing: '0.14em' }}>
            {is2 ? '⚔ MODEL DUEL' : '◈ COMPARISON'}
          </span>
          <div className="flex gap-3">
            {models.map(m => {
              const meta = LAB[m.lab] ?? { color: '#7c6aff' }
              return (
                <div key={m.id} className="flex items-center gap-1.5">
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: meta.color, boxShadow: `0 0 6px ${meta.color}` }} />
                  <span style={{ color: '#d0d0e8', fontSize: 13, fontWeight: 700 }}>{m.name}</span>
                </div>
              )
            })}
          </div>
        </div>
        <button onClick={onClose}
          style={{ color: '#a0a0c8', fontSize: 13, padding: '5px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', cursor: 'pointer' }}>
          ✕ Close
        </button>
      </div>

      <div className="overflow-x-auto" style={{ maxHeight: '50vh' }}>
        <div style={{ minWidth: 560, padding: '0 24px 20px' }}>

          {/* Column headers */}
          <div className="grid sticky top-0 pt-3 pb-2"
            style={{ gridTemplateColumns: `160px ${is2 ? '1fr 40px 1fr' : `repeat(${models.length}, 1fr)`}`, gap: 8,
              background: 'rgba(3,3,14,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 4, zIndex: 1 }}>
            <div />
            {models.map((m, i) => {
              const meta = LAB[m.lab] ?? { color: '#7c6aff', rgb: '124,106,255' }
              return (
                <React.Fragment key={m.id}>
                  <div className="relative flex flex-col gap-0.5">
                    <button onClick={() => onRemove(m.id)} className="absolute -top-1 right-0 flex items-center justify-center rounded-full"
                      style={{ width: 16, height: 16, background: 'rgba(239,68,68,0.14)', color: '#ef4444', fontSize: 9, fontWeight: 900, cursor: 'pointer', border: 'none' }}>✕</button>
                    <span style={{ color: meta.color, fontSize: 11, fontWeight: 900, letterSpacing: '0.1em' }}>{meta.short}</span>
                    <span style={{ color: '#e8e8f0', fontSize: 14, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{m.name}</span>
                    <span style={{ color: '#a0a0c8', fontSize: 12 }}>{fmtDate(m.release_date)}</span>
                  </div>
                  {is2 && i === 0 && <div />}
                </React.Fragment>
              )
            })}
          </div>

          {/* Metric rows */}
          {metrics.map(metric => {
            const winIdx = winner(metric.getter, metric.higher, metric.freeWins)
            return (
              <div key={metric.label} className="grid items-center"
                style={{ gridTemplateColumns: `160px ${is2 ? '1fr 40px 1fr' : `repeat(${models.length}, 1fr)`}`, gap: 8,
                  padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: '#a0a0c8', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  {metric.label}
                </span>
                {models.map((m, i) => {
                  const meta = LAB[m.lab] ?? { color: '#7c6aff', rgb: '124,106,255' }
                  const val = metric.getter(m)
                  const isWin = i === winIdx
                  const pct = (typeof val === 'number' && metric.label !== 'Context' && metric.label !== 'Input $/M') ? val : null
                  return (
                    <React.Fragment key={m.id}>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span style={{ color: isWin ? meta.color : '#c0c0d8', fontSize: 15, fontWeight: isWin ? 900 : 600 }}>
                            {metric.fmt(val, m)}
                          </span>
                          {isWin && <span style={{ color: meta.color, fontSize: 13 }}>★</span>}
                        </div>
                        {pct !== null && (
                          <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 999 }}>
                            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999,
                              background: isWin ? meta.color : `rgba(${meta.rgb},0.35)`, transition: 'width 0.5s ease' }} />
                          </div>
                        )}
                      </div>
                      {is2 && i === 0 && (
                        <div className="flex items-center justify-center">
                          <span style={{ color: '#9090c0', fontSize: 11, fontWeight: 900, letterSpacing: '0.06em' }}>VS</span>
                        </div>
                      )}
                    </React.Fragment>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ModelsPage() {
  const [models, setModels]           = useState<AIModel[]>([])
  const [loading, setLoading]         = useState(true)
  const [booted, setBooted]           = useState(false)
  const [pageVisible, setPageVisible] = useState(false)
  const [activeLab, setActiveLab]     = useState('All')
  const [showDeprecated, setShowDeprecated] = useState(false)
  const [activePreset, setActivePreset]     = useState<string | null>(null)
  const [compareMode, setCompareMode]       = useState(false)
  const [compareIds, setCompareIds]         = useState<string[]>([])
  const [hoveredId, setHoveredId]           = useState<string | null>(null)

  useEffect(() => {
    const already = typeof window !== 'undefined' && sessionStorage.getItem('arsenal-booted')
    if (already) { setBooted(true); setPageVisible(true) }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && compareMode) { setCompareMode(false); setCompareIds([]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compareMode])

  const handleBootDone = useCallback(() => {
    if (typeof window !== 'undefined') sessionStorage.setItem('arsenal-booted', '1')
    setBooted(true)
    setTimeout(() => setPageVisible(true), 50)
  }, [])

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(data => setModels(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  const handleSelect = useCallback((id: string) => {
    setCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id)
      if (prev.length >= 3) return prev
      return [...prev, id]
    })
  }, [])

  const clearCompare = () => { setCompareMode(false); setCompareIds([]) }
  const hasFilters = activeLab !== 'All' || activePreset !== null || showDeprecated

  let filtered = models.filter(m => {
    if (activeLab !== 'All' && m.lab !== activeLab) return false
    if (!showDeprecated && m.status === 'deprecated') return false
    return true
  })

  const presetModels = activePreset ? applyPreset([...filtered], activePreset) : null
  const displayList  = presetModels ?? filtered

  const grouped: Record<string, AIModel[]> = {}
  for (const m of displayList) {
    if (!grouped[m.lab]) grouped[m.lab] = []
    grouped[m.lab].push(m)
  }
  const labOrder = Object.keys(LAB)
  const labs = activeLab === 'All'
    ? labOrder.filter(l => grouped[l]?.length)
    : [activeLab].filter(l => grouped[l]?.length)

  const compareModels = compareIds.map(id => models.find(m => m.id === id)).filter(Boolean) as AIModel[]
  const bottomPad     = compareMode && compareIds.length >= 2 ? 340 : 0

  return (
    <>
      <AmbientBg />
      {!booted && <BootScreen onDone={handleBootDone} />}

      <main className="relative mx-auto max-w-screen-xl px-6 py-10"
        style={{ zIndex: 1, paddingBottom: 60 + bottomPad, opacity: pageVisible ? 1 : 0, transition: 'opacity 0.4s ease' }}>

        <ScannerHeader models={models} visibleCount={displayList.length} />

        {!loading && <CapabilityMatrix models={models.filter(m => m.status === 'active')} onHover={setHoveredId} />}

        {/* Preset filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span style={{ color: '#9090c0', fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', textTransform: 'uppercase' }}>FILTER</span>
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setActivePreset(prev => prev === p.key ? null : p.key)}
              style={{
                background: activePreset === p.key ? 'rgba(124,106,255,0.16)' : 'rgba(255,255,255,0.03)',
                color: activePreset === p.key ? '#a78bfa' : '#b0b0d0',
                border: `1px solid ${activePreset === p.key ? 'rgba(124,106,255,0.38)' : 'rgba(255,255,255,0.09)'}`,
                borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {p.label}
            </button>
          ))}
          <button onClick={() => { setCompareMode(v => !v); if (compareMode) setCompareIds([]) }}
            style={{
              marginLeft: 'auto',
              background: compareMode ? 'rgba(124,106,255,0.16)' : 'rgba(255,255,255,0.04)',
              color: compareMode ? '#a78bfa' : '#b0b0d0',
              border: `1px solid ${compareMode ? 'rgba(124,106,255,0.38)' : 'rgba(255,255,255,0.09)'}`,
              borderRadius: 8, padding: '6px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
            }}>
            ⚔ {compareMode ? compareIds.length >= 2 ? `Duel (${compareIds.length})` : `Pick models (${compareIds.length}/3)` : 'Compare'}
          </button>
        </div>

        {/* Lab filters */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {['All', ...Object.keys(LAB)].map(lab => {
            const meta = LAB[lab]
            const active = activeLab === lab
            return (
              <button key={lab} onClick={() => setActiveLab(lab)}
                style={{
                  background: active ? (meta ? `rgba(${meta.rgb},0.14)` : 'rgba(124,106,255,0.14)') : 'rgba(255,255,255,0.03)',
                  color: active ? (meta?.color ?? '#a78bfa') : '#b0b0d0',
                  border: `1px solid ${active ? (meta ? `rgba(${meta.rgb},0.38)` : 'rgba(124,106,255,0.38)') : 'rgba(255,255,255,0.09)'}`,
                  borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                {lab}
              </button>
            )
          })}
          <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
            {hasFilters && (
              <button onClick={() => { setActiveLab('All'); setActivePreset(null); setShowDeprecated(false) }}
                style={{ color: '#a78bfa', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  background: 'rgba(124,106,255,0.09)', border: '1px solid rgba(124,106,255,0.22)', borderRadius: 8, padding: '6px 13px' }}>
                ✕ Reset
              </button>
            )}
            <button onClick={() => setShowDeprecated(v => !v)}
              style={{
                background: showDeprecated ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                color: showDeprecated ? '#ef4444' : '#b0b0d0',
                border: `1px solid ${showDeprecated ? 'rgba(239,68,68,0.28)' : 'rgba(255,255,255,0.09)'}`,
                borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
              }}>
              {showDeprecated ? '✕ Hide deprecated' : '+ Show deprecated'}
            </button>
          </div>
        </div>

        {/* Count line */}
        <p style={{ color: '#9090c0', fontSize: 13, fontWeight: 600, marginBottom: 22 }}>
          Showing <span style={{ color: '#d0d0e8', fontWeight: 900 }}>{displayList.length}</span> model{displayList.length !== 1 ? 's' : ''}
          {activeLab !== 'All' && <span> from <span style={{ color: LAB[activeLab]?.color ?? '#a78bfa' }}>{activeLab}</span></span>}
          {activePreset && <span> · <span style={{ color: '#a78bfa' }}>{PRESETS.find(p => p.key === activePreset)?.label}</span></span>}
        </p>

        {/* Compare banner */}
        {compareMode && (
          <div className="flex items-center gap-4 rounded-xl px-5 py-4 mb-6"
            style={{ background: 'rgba(124,106,255,0.07)', border: '1px solid rgba(124,106,255,0.2)' }}>
            <span style={{ color: '#7c6aff', fontSize: 20 }}>⚔</span>
            <div>
              <span style={{ color: '#d0d0e8', fontSize: 14, fontWeight: 700 }}>Compare Mode </span>
              <span style={{ color: '#a0a0c8', fontSize: 14 }}>
                {compareIds.length === 0 ? '— click any model card to select'
                  : compareIds.length === 1 ? '— pick one more to start duel'
                  : `— ${compareIds.length} models selected · panel live below`}
              </span>
            </div>
            {compareIds.length > 0 && (
              <button onClick={() => setCompareIds([])}
                style={{ color: '#a0a0c8', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'none', border: 'none' }}>
                Clear
              </button>
            )}
            <span style={{ color: '#8080b0', fontSize: 12, marginLeft: 'auto' }}>ESC to exit</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-10 w-10 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
          </div>
        ) : displayList.length === 0 ? (
          <div className="flex items-center justify-center py-28 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p style={{ color: '#a0a0c8', fontSize: 16 }}>No models match the current filters</p>
          </div>
        ) : activePreset ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {(presetModels ?? []).map((m, i) => (
              <ModelCard key={m.id} model={m} compareMode={compareMode} isSelected={compareIds.includes(m.id)}
                onSelect={handleSelect} highlighted={hoveredId === m.id} enterDelay={i * 55} />
            ))}
          </div>
        ) : (
          labs.map((lab, li) => (
            <LabSection key={lab} lab={lab} models={grouped[lab]} compareMode={compareMode}
              compareIds={compareIds} onSelect={handleSelect} hoveredId={hoveredId} enterBase={li * 120} />
          ))
        )}

        <p className="mt-16 text-center" style={{ color: '#7070a8', fontSize: 12, letterSpacing: '0.1em', fontFamily: 'monospace' }}>
          ■ PRICING APPROXIMATE · BENCHMARKS FROM PUBLIC SOURCES · DATA SNAPSHOT 2025 ■
        </p>
      </main>

      {compareMode && compareModels.length >= 2 && (
        <ComparePanel models={compareModels} onClose={clearCompare}
          onRemove={id => setCompareIds(prev => prev.filter(x => x !== id))} />
      )}
    </>
  )
}
