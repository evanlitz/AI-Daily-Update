'use client'

import { useCallback, useEffect, useState } from 'react'
import { relTime } from '@/lib/utils'
import type { HealthDashboard, SourceHealthRow } from '@/lib/health-dashboard'

// ── Icon primitives ──────────────────────────────────────────────────────────
// Same stroke language as the sidebar nav (app/layout.tsx): 24x24 viewBox,
// currentColor stroke, 1.75 weight — kept generic/geometric rather than real
// brand marks (no trademark risk, and it matches the rest of the app).

function Icon({ children, size = 15, style }: { children: React.ReactNode; size?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
      width={size} height={size} style={{ flexShrink: 0, ...style }}>
      {children}
    </svg>
  )
}

function RepoGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><circle cx="6" cy="4" r="2" strokeWidth="1.75" /><circle cx="6" cy="20" r="2" strokeWidth="1.75" /><circle cx="18" cy="10" r="2" strokeWidth="1.75" /><path d="M6 6v10M6 10h6a6 6 0 016 6" strokeWidth="1.75" /></Icon>
}
function FeedGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><circle cx="6" cy="18" r="1.75" fill="currentColor" stroke="none" /><path d="M4 11a9 9 0 019 9" strokeWidth="1.75" /><path d="M4 4a16 16 0 0116 16" strokeWidth="1.75" /></Icon>
}
function PlayGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><rect x="2.5" y="5" width="19" height="14" rx="3.5" strokeWidth="1.75" /><path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" /></Icon>
}
function PaperGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8L14 2z" strokeWidth="1.75" /><path d="M14 2v6h6M8 13h8M8 17h5" strokeWidth="1.75" /></Icon>
}
function DiscussionGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><path d="M21 11.5a8.38 8.38 0 01-4.5 7.5 8.4 8.4 0 01-8-.3L3 21l1.9-5.7a8.4 8.4 0 01-.3-8A8.38 8.38 0 0112 3h.5a8.48 8.48 0 018 8v.5z" strokeWidth="1.75" /></Icon>
}
function ModelGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><rect x="2" y="3" width="20" height="5" rx="1.5" strokeWidth="1.75" /><rect x="2" y="10" width="20" height="5" rx="1.5" strokeWidth="1.75" /><rect x="2" y="17" width="20" height="5" rx="1.5" strokeWidth="1.75" /></Icon>
}
function DatasetGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><ellipse cx="12" cy="5" rx="9" ry="3" strokeWidth="1.75" /><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" strokeWidth="1.75" /></Icon>
}
function BenchGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><path d="M4 20V10M12 20V4M20 20v-7" strokeWidth="1.75" /></Icon>
}
function DotGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><circle cx="12" cy="12" r="8" strokeWidth="1.75" /></Icon>
}

function sourceGlyph(source: string): React.ComponentType<{ style?: React.CSSProperties }> {
  if (source.startsWith('github')) return RepoGlyph
  if (source.startsWith('rss:')) return FeedGlyph
  if (source.startsWith('youtube:')) return PlayGlyph
  if (source === 'arxiv' || source === 'semanticscholar') return PaperGlyph
  if (source === 'hackernews') return DiscussionGlyph
  if (source === 'huggingface' || source.startsWith('hf-')) return ModelGlyph
  if (source === 'kaggle') return DatasetGlyph
  if (source === 'benchmark-sync') return BenchGlyph
  return DotGlyph
}

function CheckGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><path d="M20 6L9 17l-5-5" strokeWidth="2" /></Icon>
}
function XGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><path d="M18 6L6 18M6 6l12 12" strokeWidth="2" /></Icon>
}
function BoltGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" strokeWidth="1.75" /></Icon>
}

// ── Design tokens (scoped to this page) ──────────────────────────────────────

const INK = '#e4e4e7'
const MUTE = '#71717a'
const FAINT = '#52525b'
const LINE = 'rgba(255,255,255,0.07)'
const MONO = { fontVariantNumeric: 'tabular-nums' as const, fontFamily: 'monospace' }

// 'ok' is deliberately not colored — color is reserved for states that need
// attention, so a page of 46 quiet gray rows makes the 1 orange/red row obvious
// instead of drowning it in green.
const STATUS_COLOR: Record<string, string> = { ok: FAINT, warn: '#eab308', stale: '#f97316', dead: '#ef4444' }
const OVERALL_COLOR: Record<string, string> = { ok: '#34d399', degraded: '#eab308', critical: '#ef4444' }

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max) + '…' : s
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{ textAlign: align, padding: '8px 16px', color: MUTE, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {children}
    </th>
  )
}

function StatusLabel({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? MUTE
  return (
    <span className="flex items-center gap-2">
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color, flexShrink: 0 }} />
      <span style={{ color, fontSize: 12.5, fontWeight: status === 'ok' ? 500 : 700 }}>{status}</span>
    </span>
  )
}

function ScreeningCell({ row }: { row: SourceHealthRow }) {
  return (
    <div className="flex items-center gap-3" style={{ ...MONO, fontSize: 12, color: MUTE }}>
      <span className="flex items-center gap-1"><CheckGlyph style={{ color: '#3f6f5c' }} />{row.accepted}</span>
      <span className="flex items-center gap-1"><XGlyph style={{ color: '#7a4646' }} />{row.rejected}</span>
      <span className="flex items-center gap-1"><BoltGlyph style={{ color: '#4a5a78' }} />{row.fastTracked}</span>
    </div>
  )
}

function AcceptRateBar({ row }: { row: SourceHealthRow }) {
  const total = row.accepted + row.rejected
  if (total === 0) return <span style={{ color: FAINT, fontSize: 12 }}>—</span>
  const pct = Math.round((row.accepted / total) * 100)
  return (
    <div className="flex items-center justify-end gap-2">
      <span style={{ ...MONO, color: MUTE, fontSize: 12 }}>{pct}%</span>
      <div style={{ width: 44, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 60 ? '#34d399' : pct >= 30 ? '#eab308' : '#ef4444' }} />
      </div>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <p style={{ color: FAINT, fontSize: 13, padding: '18px 4px' }}>{text}</p>
}

function StatBlock({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ color: MUTE, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ color, fontSize: 18, fontWeight: 700, ...MONO }}>{value}</span>
    </div>
  )
}

export default function HealthPage() {
  const [data, setData] = useState<HealthDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    return fetch('/api/health/dashboard')
      .then(r => r.json())
      .then(setData)
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <main className="mx-auto max-w-screen-2xl px-4 sm:px-10 py-8">
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 rounded-full border border-blue-500 border-t-transparent animate-spin" />
        </div>
      </main>
    )
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-screen-2xl px-4 sm:px-10 py-8">
        <EmptyRow text="Couldn't load health data — try refreshing." />
      </main>
    )
  }

  const overallColor = OVERALL_COLOR[data.overallStatus] ?? MUTE

  return (
    <main className="mx-auto max-w-screen-2xl px-4 sm:px-10 py-8">
      {/* Header */}
      <div className="mb-6">
        <p className="eyebrow mb-2">Ops · Data Quality</p>
        <div className="flex flex-wrap items-baseline gap-3 mb-1">
          <h1 style={{ color: '#f4f4f5', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>Source Health</h1>
          <span className="flex items-center gap-1.5">
            <span style={{ width: 7, height: 7, borderRadius: 999, background: overallColor }} />
            <span style={{ color: overallColor, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {data.overallStatus}
            </span>
          </span>
        </div>
        <p style={{ color: MUTE, fontSize: 13 }}>Checked {relTime(data.checkedAt)} · {data.sources.length} sources tracked</p>
      </div>

      {/* Stat strip — flat, no per-metric card chrome */}
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4 mb-8 pb-6" style={{ borderBottom: `1px solid ${LINE}` }}>
        <StatBlock label="OK" value={data.summary.ok} color={FAINT} />
        <StatBlock label="Warn" value={data.summary.warn} color={data.summary.warn ? STATUS_COLOR.warn : FAINT} />
        <StatBlock label="Stale" value={data.summary.stale} color={data.summary.stale ? STATUS_COLOR.stale : FAINT} />
        <StatBlock label="Dead" value={data.summary.dead} color={data.summary.dead ? STATUS_COLOR.dead : FAINT} />
        <StatBlock label="Cron failures · 7d" value={data.cronFailures.length} color={data.cronFailures.length ? '#ef4444' : FAINT} />
        <StatBlock label="Eval flags open" value={data.evalFlags.length} color={data.evalFlags.length ? '#eab308' : FAINT} />
      </div>

      {/* Sources table */}
      <div className="mb-10">
        <h2 style={{ color: INK, fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Sources</h2>
        <p style={{ color: MUTE, fontSize: 12, marginBottom: 12 }}>Fetch status merged with screening quality · worst first</p>
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${LINE}` }}>
                  <Th>Source</Th>
                  <Th>Status</Th>
                  <Th>Last fetch</Th>
                  <Th align="right">Count</Th>
                  <Th>Screening</Th>
                  <Th align="right">Accept rate</Th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((row, i) => {
                  const Glyph = sourceGlyph(row.source)
                  return (
                    <tr key={row.source} style={{ borderBottom: i === data.sources.length - 1 ? 'none' : `1px solid ${LINE}` }}>
                      <td style={{ padding: '9px 16px' }}>
                        <span className="flex items-center gap-2">
                          <Glyph style={{ color: FAINT }} />
                          <span style={{ color: INK, fontSize: 13, fontWeight: 600 }}>{row.source}</span>
                        </span>
                      </td>
                      <td style={{ padding: '9px 16px' }}><StatusLabel status={row.status} /></td>
                      <td style={{ padding: '9px 16px', color: MUTE, fontSize: 12 }}>{row.lastFetchAt ? relTime(row.lastFetchAt) : '—'}</td>
                      <td style={{ padding: '9px 16px', color: MUTE, fontSize: 12, textAlign: 'right', ...MONO }}>{row.lastCount}</td>
                      <td style={{ padding: '9px 16px' }}><ScreeningCell row={row} /></td>
                      <td style={{ padding: '9px 16px' }}><AcceptRateBar row={row} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Claude usage */}
      <div className="mb-10">
        <h2 style={{ color: INK, fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Claude usage by task</h2>
        <p style={{ color: MUTE, fontSize: 12, marginBottom: 12 }}>Last {data.screening.windowDays} days</p>
        <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
          {data.screening.usageByTask.length === 0 ? (
            <div style={{ padding: '4px 16px' }}><EmptyRow text="No Claude usage recorded in this window." /></div>
          ) : (
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${LINE}` }}>
                  <Th>Task</Th>
                  <Th align="right">Input</Th>
                  <Th align="right">Output</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {data.screening.usageByTask.map((u, i) => (
                  <tr key={u.task} style={{ borderBottom: i === data.screening.usageByTask.length - 1 ? 'none' : `1px solid ${LINE}` }}>
                    <td style={{ padding: '9px 16px', color: INK, fontSize: 13, fontWeight: 600 }}>{u.task}</td>
                    <td style={{ padding: '9px 16px', color: MUTE, fontSize: 12, textAlign: 'right', ...MONO }}>{u.inputTokens.toLocaleString()}</td>
                    <td style={{ padding: '9px 16px', color: MUTE, fontSize: 12, textAlign: 'right', ...MONO }}>{u.outputTokens.toLocaleString()}</td>
                    <td style={{ padding: '9px 16px', color: INK, fontSize: 12, fontWeight: 700, textAlign: 'right', ...MONO }}>
                      {(u.inputTokens + u.outputTokens).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Cron failures + eval flags */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-10">
        <div>
          <h2 style={{ color: INK, fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Cron failures</h2>
          <p style={{ color: MUTE, fontSize: 12, marginBottom: 12 }}>Last 7 days</p>
          {data.cronFailures.length === 0 ? (
            <EmptyRow text="No cron failures in the last 7 days." />
          ) : (
            <div className="flex flex-col">
              {data.cronFailures.map((f, i) => (
                <div key={i} style={{ padding: '10px 0 10px 12px', borderLeft: '2px solid #ef4444', borderBottom: i === data.cronFailures.length - 1 ? 'none' : `1px solid ${LINE}`, marginBottom: 2 }}>
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ color: INK, fontSize: 13, fontWeight: 600 }}>{f.path}</span>
                    <span style={{ color: FAINT, fontSize: 11 }}>{relTime(f.startedAt)}</span>
                  </div>
                  <p style={{ color: MUTE, fontSize: 12 }}>{truncate(f.errorText, 140) || 'No error detail recorded.'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 style={{ color: INK, fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Eval quality flags</h2>
          <p style={{ color: MUTE, fontSize: 12, marginBottom: 12 }}>Groundedness ≤ 3, not yet exported</p>
          {data.evalFlags.length === 0 ? (
            <EmptyRow text="No flagged items pending review." />
          ) : (
            <div className="flex flex-col">
              {data.evalFlags.map((f, i) => (
                <div key={i} style={{ padding: '10px 0 10px 12px', borderLeft: '2px solid #eab308', borderBottom: i === data.evalFlags.length - 1 ? 'none' : `1px solid ${LINE}`, marginBottom: 2 }}>
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ color: INK, fontSize: 13, fontWeight: 600 }}>{f.targetType} {f.targetId}</span>
                    <span style={{ color: '#eab308', fontSize: 12, fontWeight: 700, ...MONO }}>{f.groundedness ?? '—'}/5</span>
                  </div>
                  <p style={{ color: MUTE, fontSize: 12 }}>{truncate(f.rationale, 140)}</p>
                </div>
              ))}
              <p style={{ color: FAINT, fontSize: 11, marginTop: 8 }}>Run scripts/eval/export-flagged.mts to review.</p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-2 flex flex-col items-center gap-3">
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          style={{
            background: 'transparent', color: refreshing ? FAINT : MUTE,
            border: `1px solid ${LINE}`, borderRadius: 8, padding: '7px 18px',
            fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: refreshing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            opacity: refreshing ? 0.5 : 1, transition: 'all 0.15s',
          }}
        >
          {refreshing && <span className="inline-block h-3 w-3 rounded-full border border-blue-500 border-t-transparent animate-spin" />}
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <p style={{ color: FAINT, fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textAlign: 'center' }}>
          Source status from source_runs · screening from screening_stats · refreshed on load
        </p>
      </div>
    </main>
  )
}
