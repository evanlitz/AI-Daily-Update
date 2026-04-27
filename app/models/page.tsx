'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { AIModel } from '@/lib/types'

// ── Benchmark history types ───────────────────────────────────────────────────

type HistSeries = { slug: string; name: string; lab: string; values: { date: string; value: number }[] }

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

// ── Metric chart ──────────────────────────────────────────────────────────────

const CHART_METRICS = [
  { key: 'coding',    label: 'Coding',    desc: 'SWE-bench · HumanEval fallback'                     },
  { key: 'reasoning', label: 'Reasoning', desc: 'ARC-AGI · GPQA fallback'                            },
  { key: 'context',   label: 'Context',   desc: 'Context window in thousands of tokens'               },
  { key: 'price',     label: 'Price',     desc: 'Input $/MTok · longer bar = better value · open-weight = free' },
] as const
type ChartMetricKey = typeof CHART_METRICS[number]['key']

function getMetricVal(model: AIModel, metric: ChartMetricKey): number | null {
  if (metric === 'coding')    return model.benchmarks.swe_bench ?? model.benchmarks.humaneval ?? null
  if (metric === 'reasoning') return model.benchmarks.arc_agi   ?? model.benchmarks.gpqa      ?? null
  if (metric === 'context')   return model.context_window != null ? Math.round(model.context_window / 1000) : null
  return model.input_cost_per_mtok
}

function fmtMetric(val: number | null, metric: ChartMetricKey, isOpen: boolean): string {
  if (metric === 'price') {
    if (isOpen)    return 'FREE'
    if (val == null) return '—'
    return `$${val % 1 === 0 ? val.toFixed(0) : val.toFixed(2)}`
  }
  if (val == null) return '—'
  return metric === 'context' ? `${val}K` : `${val}%`
}

function MetricChart({ models }: { models: AIModel[] }) {
  const [metric, setMetric] = useState<ChartMetricKey>('coding')
  const [show,   setShow]   = useState(false)

  useEffect(() => {
    setShow(false)
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)))
    return () => cancelAnimationFrame(id)
  }, [metric])

  const rows = useMemo(() => {
    const base = models.map(m => {
      const isOpen = m.input_cost_per_mtok == null && m.output_cost_per_mtok == null
      const val    = getMetricVal(m, metric)
      return { model: m, val, isOpen }
    })
    if (metric === 'price') {
      const free    = base.filter(r => r.isOpen)
      const priced  = base.filter(r => !r.isOpen && r.val != null).sort((a, b) => (a.val ?? 0) - (b.val ?? 0))
      const unknown = base.filter(r => !r.isOpen && r.val == null)
      return [...free, ...priced, ...unknown]
    }
    return [
      ...base.filter(r => r.val != null).sort((a, b) => (b.val ?? 0) - (a.val ?? 0)),
      ...base.filter(r => r.val == null),
    ]
  }, [models, metric])

  const maxVal = useMemo(() => {
    if (metric === 'price') {
      const prices = rows.filter(r => !r.isOpen && r.val != null).map(r => r.val as number)
      return Math.max(...prices, 0.1)
    }
    return Math.max(...rows.filter(r => r.val != null).map(r => r.val as number), 1)
  }, [rows, metric])

  function barPct(r: typeof rows[0]): number {
    if (r.isOpen && metric === 'price') return 1
    if (r.val == null) return 0
    if (metric === 'price') return 1 - r.val / maxVal
    return r.val / maxVal
  }

  const activeMeta = CHART_METRICS.find(m => m.key === metric)!

  return (
    <div className="relative mb-10 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(4,4,18,0.88)', border: '1px solid rgba(255,255,255,0.09)' }}>

      {/* Header + tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, padding: '18px 24px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div>
          <p style={{ color: '#d0d0e8', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
            Capability Benchmark
          </p>
          <p style={{ color: '#6060a0', fontSize: 12 }}>{activeMeta.desc} · active models only</p>
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3 }}>
          {CHART_METRICS.map(cm => (
            <button key={cm.key} onClick={() => setMetric(cm.key)} style={{
              padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.03em',
              background: metric === cm.key ? 'rgba(124,106,255,0.22)' : 'transparent',
              color:      metric === cm.key ? '#a78bfa' : '#6060a0',
              transition: 'all 0.15s',
            }}>
              {cm.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bars */}
      <div style={{ padding: '18px 24px 20px' }}>
        {rows.map((r, i) => {
          const meta    = LAB[r.model.lab] ?? { color: '#7c6aff', rgb: '124,106,255', short: '???' }
          const p       = barPct(r)
          const hasData = r.val != null || (r.isOpen && metric === 'price')
          const label   = fmtMetric(r.val, metric, r.isOpen)
          const isTop   = i === 0 && hasData

          return (
            <div key={r.model.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>

              {/* Name + lab badge */}
              <div style={{ width: 140, flexShrink: 0, textAlign: 'right', paddingRight: 4 }}>
                <span style={{
                  display: 'block', fontSize: 12, fontWeight: isTop ? 800 : 600,
                  color: !hasData ? '#3a3a5a' : isTop ? '#e8e8f0' : '#9090c0',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {r.model.name}
                </span>
                <span style={{ fontSize: 10, color: meta.color, opacity: 0.65, fontWeight: 700, letterSpacing: '0.06em' }}>
                  {meta.short}
                </span>
              </div>

              {/* Bar track */}
              <div style={{
                flex: 1, height: 24, background: 'rgba(255,255,255,0.04)',
                borderRadius: 5, overflow: 'hidden',
              }}>
                {hasData && (
                  <div style={{
                    height: '100%',
                    width: show ? `${Math.round(p * 100)}%` : '0%',
                    background: r.isOpen && metric === 'price'
                      ? 'linear-gradient(to right, rgba(52,211,153,0.8), rgba(52,211,153,0.25))'
                      : `linear-gradient(to right, rgba(${meta.rgb},0.9), rgba(${meta.rgb},0.25))`,
                    borderRadius: 5,
                    transition: `width 0.65s cubic-bezier(0.22,1,0.36,1) ${i * 28}ms`,
                    boxShadow: isTop ? `0 0 18px rgba(${meta.rgb},0.5)` : 'none',
                  }} />
                )}
              </div>

              {/* Value label */}
              <div style={{ width: 52, flexShrink: 0, textAlign: 'right' }}>
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: !hasData ? '#3a3a5a'
                    : r.isOpen && metric === 'price' ? '#34d399'
                    : isTop ? meta.color : '#6868a0',
                }}>
                  {label}
                </span>
              </div>

            </div>
          )
        })}
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

// ── Benchmark history chart ───────────────────────────────────────────────────

const HIST_METRICS = [
  { key: 'swe_bench', label: 'SWE-Bench' },
  { key: 'humaneval', label: 'HumanEval' },
  { key: 'arc_agi',   label: 'ARC-AGI'   },
  { key: 'gpqa',      label: 'GPQA'       },
  { key: 'mmlu',      label: 'MMLU'       },
  { key: 'aime',      label: 'AIME'       },
]

type Tip = { x: number; y: number; name: string; lab: string; value: number; date: string }

function BenchmarkHistory() {
  const [metric,  setMetric]  = useState('swe_bench')
  const [series,  setSeries]  = useState<HistSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [tip,     setTip]     = useState<Tip | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true); setTip(null)
    fetch(`/api/benchmarks/history?metric=${metric}`)
      .then(r => r.ok ? r.json() : [])
      .then(setSeries)
      .finally(() => setLoading(false))
  }, [metric])

  // ── SVG geometry ──────────────────────────────────────────────────────────
  const VW = 800, VH = 220
  const ML = 44, MR = 16, MT = 14, MB = 30
  const CW = VW - ML - MR, CH = VH - MT - MB

  const allVals  = series.flatMap(s => s.values.map(v => v.value))
  const allTimes = series.flatMap(s => s.values.map(v => new Date(v.date).getTime()))
  const minT  = allTimes.length ? Math.min(...allTimes) : Date.now() - 86400000
  const maxT  = allTimes.length ? Math.max(...allTimes) : Date.now()
  const tSpan = maxT - minT || 86400000
  const rawMin = allVals.length ? Math.min(...allVals) : 0
  const rawMax = allVals.length ? Math.max(...allVals) : 100
  const minV  = Math.max(0,   rawMin - Math.max((rawMax - rawMin) * 0.12, 5))
  const maxV  = Math.min(100, rawMax + Math.max((rawMax - rawMin) * 0.12, 5))
  const vSpan = maxV - minV || 1

  const px = (d: string) => ML + ((new Date(d).getTime() - minT) / tSpan) * CW
  const py = (v: number) => MT + CH - ((v - minV) / vSpan) * CH

  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round(minV + (vSpan / 4) * i))
  const xTicks = Array.from({ length: tSpan < 86400001 ? 1 : 5 }, (_, i) =>
    new Date(minT + (tSpan / Math.max(tSpan < 86400001 ? 1 : 4, 1)) * i)
  )

  function fmtD(t: number) {
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  function onDotEnter(e: React.MouseEvent, s: HistSeries, v: { date: string; value: number }) {
    const box = containerRef.current?.getBoundingClientRect()
    if (!box) return
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, name: s.name, lab: s.lab, value: v.value, date: v.date })
  }

  const isBaseline = series.length > 0 &&
    new Set(series.flatMap(s => s.values.map(v => v.date.slice(0, 10)))).size <= 1

  return (
    <div className="relative mb-10 rounded-2xl overflow-hidden"
      style={{ background: 'rgba(4,4,18,0.88)', border: '1px solid rgba(255,255,255,0.09)' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12, padding: '18px 24px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div>
          <p style={{ color: '#d0d0e8', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
            Benchmark History
          </p>
          <p style={{ color: '#6060a0', fontSize: 12 }}>
            {isBaseline
              ? 'Baseline snapshot · sync benchmarks to track changes over time'
              : 'Score progression over time · hover dots for details'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3 }}>
          {HIST_METRICS.map(m => (
            <button key={m.key} onClick={() => setMetric(m.key)} style={{
              padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
              background: metric === m.key ? 'rgba(124,106,255,0.22)' : 'transparent',
              color:      metric === m.key ? '#a78bfa' : '#6060a0',
              transition: 'all 0.15s',
            }}>{m.label}</button>
          ))}
        </div>
      </div>

      {/* Chart body */}
      <div ref={containerRef} style={{ padding: '12px 24px 20px', position: 'relative' }}
        onMouseLeave={() => setTip(null)}>

        {loading ? (
          <div style={{ height: VH, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="inline-block h-6 w-6 rounded-full border border-violet-500 border-t-transparent animate-spin" />
          </div>
        ) : series.length === 0 ? (
          <div style={{ height: VH, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <p style={{ color: '#5a5a8a', fontSize: 13 }}>No {HIST_METRICS.find(m => m.key === metric)?.label} data</p>
            <p style={{ color: '#4a4a6a', fontSize: 12 }}>Add this benchmark to model data or sync from external sources</p>
          </div>
        ) : (
          <>
            <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>

              {/* Y grid + labels */}
              {yTicks.map(t => (
                <g key={t}>
                  <line x1={ML} y1={py(t)} x2={ML + CW} y2={py(t)}
                    stroke="rgba(255,255,255,0.045)" strokeWidth={1} />
                  <text x={ML - 7} y={py(t)} textAnchor="end" dominantBaseline="middle"
                    fill="#4a4a6a" fontSize={10} fontFamily="monospace">{t}%</text>
                </g>
              ))}

              {/* X axis baseline */}
              <line x1={ML} y1={MT + CH} x2={ML + CW} y2={MT + CH}
                stroke="rgba(255,255,255,0.07)" strokeWidth={1} />

              {/* X labels */}
              {xTicks.map((d, i) => (
                <text key={i}
                  x={ML + (tSpan < 86400001 ? CW / 2 : (CW / 4) * i)}
                  y={VH - 6}
                  textAnchor="middle" fill="#4a4a6a" fontSize={10} fontFamily="monospace">
                  {fmtD(d.getTime())}
                </text>
              ))}

              {/* Series: lines + dots */}
              {series.map(s => {
                const color = LAB[s.lab]?.color ?? '#7c6aff'
                const rgb   = LAB[s.lab]?.rgb   ?? '124,106,255'
                const pts   = s.values.map(v => ({ x: px(v.date), y: py(v.value), ...v }))
                const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
                return (
                  <g key={s.slug}>
                    {pts.length > 1 && (
                      <path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeOpacity={0.65}
                        strokeLinejoin="round" strokeLinecap="round" />
                    )}
                    {pts.map((pt, i) => (
                      <g key={i} style={{ cursor: 'pointer' }} onMouseEnter={e => onDotEnter(e, s, pt)}>
                        <circle cx={pt.x} cy={pt.y} r={9} fill="transparent" />
                        <circle cx={pt.x} cy={pt.y} r={4.5} fill={color}
                          stroke={`rgba(${rgb},0.3)`} strokeWidth={2} />
                      </g>
                    ))}
                  </g>
                )
              })}
            </svg>

            {/* Tooltip */}
            {tip && (
              <div style={{
                position: 'absolute',
                left: tip.x + 14, top: tip.y - 52,
                background: 'rgba(6,6,20,0.97)',
                border: '1px solid rgba(255,255,255,0.11)',
                borderRadius: 8, padding: '8px 13px',
                pointerEvents: 'none', zIndex: 20,
                minWidth: 130,
              }}>
                <p style={{ color: LAB[tip.lab]?.color ?? '#a78bfa', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', marginBottom: 2 }}>
                  {LAB[tip.lab]?.short ?? tip.lab}
                </p>
                <p style={{ color: '#e0e0f0', fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{tip.name}</p>
                <p style={{ color: LAB[tip.lab]?.color ?? '#a78bfa', fontSize: 16, fontWeight: 900, fontFamily: 'monospace', marginBottom: 2 }}>
                  {tip.value}%
                </p>
                <p style={{ color: '#5a5a8a', fontSize: 11 }}>{fmtD(new Date(tip.date).getTime())}</p>
              </div>
            )}

            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 20px', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              {series.map(s => {
                const color = LAB[s.lab]?.color ?? '#7c6aff'
                const latest = s.values.at(-1)
                return (
                  <div key={s.slug} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 12, height: 3, borderRadius: 2, background: color, opacity: 0.8 }} />
                    <span style={{ color: '#9090c0', fontSize: 12 }}>{s.name}</span>
                    <span style={{ color, fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>
                      {latest?.value}%
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
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
  const [syncing,   setSyncing]             = useState(false)
  const [syncMsg,   setSyncMsg]             = useState<string | null>(null)

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

  async function syncBenchmarks() {
    setSyncing(true); setSyncMsg(null)
    try {
      const r = await fetch('/api/benchmarks', { method: 'POST' })
      if (r.ok) {
        const data = await r.json()
        const msg = data.updated > 0
          ? `${data.updated} scores updated from ${data.sources.join(', ')}`
          : data.sources.length > 0 ? `No new scores (${data.sources.join(', ')} checked)` : 'No sources reachable'
        setSyncMsg(msg)
        if (data.updated > 0) {
          const fresh = await fetch('/api/models'); if (fresh.ok) setModels(await fresh.json())
        }
      }
    } catch { setSyncMsg('Sync failed') }
    finally { setSyncing(false) }
  }
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

        {!loading && <MetricChart models={models.filter(m => m.status === 'active')} />}
        {!loading && <BenchmarkHistory />}

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

        <div className="mt-16 flex flex-col items-center gap-3">
          <button
            onClick={syncBenchmarks}
            disabled={syncing}
            style={{
              background: 'transparent', color: syncing ? '#4a4a6a' : '#7070a8',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 8, padding: '7px 18px',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
              opacity: syncing ? 0.5 : 1, transition: 'all 0.15s',
            }}
          >
            {syncing && <span className="inline-block h-3 w-3 rounded-full border border-violet-500 border-t-transparent animate-spin" />}
            {syncing ? 'Syncing…' : '⟳ Sync Benchmarks'}
          </button>
          {syncMsg && <p style={{ color: '#5a5a8a', fontSize: 12, fontFamily: 'monospace' }}>{syncMsg}</p>}
          <p style={{ color: '#7070a8', fontSize: 12, letterSpacing: '0.1em', fontFamily: 'monospace' }}>
            ■ PRICING APPROXIMATE · BENCHMARKS FROM PUBLIC SOURCES · DATA SNAPSHOT 2025 ■
          </p>
        </div>
      </main>

      {compareMode && compareModels.length >= 2 && (
        <ComparePanel models={compareModels} onClose={clearCompare}
          onRemove={id => setCompareIds(prev => prev.filter(x => x !== id))} />
      )}
    </>
  )
}
