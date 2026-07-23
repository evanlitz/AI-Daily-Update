'use client'

import { useCallback, useEffect, useState } from 'react'
import { relTime } from '@/lib/utils'
import type { HealthDashboard, SourceHealthRow } from '@/lib/health-dashboard'
import {
  RepoGlyph as SharedRepoGlyph,
  DatasetGlyph as SharedDatasetGlyph,
  PaperGlyph as SharedPaperGlyph,
  ModelGlyph as SharedModelGlyph,
} from '@/components/icons'

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

// These four also appear in the sidebar/mobile nav (app/layout.tsx) — delegate
// to the shared glyphs in components/icons.tsx so the path data lives in one
// place, just overriding the default 22px nav size down to this page's 15px.
function RepoGlyph(p: { style?: React.CSSProperties }) {
  return <SharedRepoGlyph size={15} {...p} />
}
function DatasetGlyph(p: { style?: React.CSSProperties }) {
  return <SharedDatasetGlyph size={15} {...p} />
}
function PaperGlyph(p: { style?: React.CSSProperties }) {
  return <SharedPaperGlyph size={15} {...p} />
}
function ModelGlyph(p: { style?: React.CSSProperties }) {
  return <SharedModelGlyph size={15} {...p} />
}
function FeedGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><circle cx="6" cy="18" r="1.75" fill="currentColor" stroke="none" /><path d="M4 11a9 9 0 019 9" strokeWidth="1.75" /><path d="M4 4a16 16 0 0116 16" strokeWidth="1.75" /></Icon>
}
function PlayGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><rect x="2.5" y="5" width="19" height="14" rx="3.5" strokeWidth="1.75" /><path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" /></Icon>
}
function DiscussionGlyph(p: { style?: React.CSSProperties }) {
  return <Icon {...p}><path d="M21 11.5a8.38 8.38 0 01-4.5 7.5 8.4 8.4 0 01-8-.3L3 21l1.9-5.7a8.4 8.4 0 01-.3-8A8.38 8.38 0 0112 3h.5a8.48 8.48 0 018 8v.5z" strokeWidth="1.75" /></Icon>
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
  if (source === 'hn') return DiscussionGlyph
  if (source === 'hf-datasets' || source === 'kaggle') return DatasetGlyph
  if (source === 'huggingface' || source.startsWith('hf-')) return ModelGlyph
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
// MUTE/FAINT are too low-contrast for actual content on a dark background —
// fine for uppercase micro-labels, not for anything someone needs to read.
// DIM (matches the app's existing --dim token, used elsewhere for readable
// secondary text like feed hooks) is the real body/meta-text color below.
const DIM = '#a1a1aa'
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
    <th style={{ textAlign: align, padding: '10px 16px', color: DIM, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {children}
    </th>
  )
}

function StatusLabel({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? DIM
  return (
    <span className="flex items-center gap-2">
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} />
      <span style={{ color: status === 'ok' ? DIM : color, fontSize: 14.5, fontWeight: status === 'ok' ? 500 : 700 }}>{status}</span>
    </span>
  )
}

// title= gives a native hover tooltip explaining each glyph — same convention
// TrendFeed.tsx already uses for its own hover hints, so no new UI pattern.
function ScreeningCell({ row }: { row: SourceHealthRow }) {
  return (
    <div className="flex items-center gap-3" style={{ ...MONO, fontSize: 14, color: DIM }}>
      <span className="flex items-center gap-1" title="Accepted — passed Claude's relevance screen">
        <CheckGlyph style={{ color: '#4ade80' }} />{row.accepted}
      </span>
      <span className="flex items-center gap-1" title="Rejected — failed Claude's relevance screen">
        <XGlyph style={{ color: '#f87171' }} />{row.rejected}
      </span>
      <span className="flex items-center gap-1" title="Fast-tracked — matched a recent near-duplicate item, so screening was skipped">
        <BoltGlyph style={{ color: '#60a5fa' }} />{row.fastTracked}
      </span>
    </div>
  )
}

function AcceptRateBar({ row }: { row: SourceHealthRow }) {
  const total = row.accepted + row.rejected
  if (total === 0) return <span style={{ color: MUTE, fontSize: 14 }}>—</span>
  const pct = Math.round((row.accepted / total) * 100)
  return (
    <div className="flex items-center justify-end gap-2">
      <span style={{ ...MONO, color: DIM, fontSize: 14 }}>{pct}%</span>
      <div style={{ width: 44, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 60 ? '#34d399' : pct >= 30 ? '#eab308' : '#ef4444' }} />
      </div>
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <p style={{ color: DIM, fontSize: 14.5, padding: '18px 4px' }}>{text}</p>
}

// Colored chip instead of a bare label/number pair — gives each status its
// own visual weight (a "0 Dead" chip reads as calm/quiet, a nonzero one pops)
// without breaking the existing "ok stays neutral gray" convention below.
function StatChip({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 96,
      padding: '12px 18px', borderRadius: 12,
      background: `${color}14`, border: `1px solid ${color}33`,
    }}>
      <span style={{ color, opacity: 0.9, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ color: INK, fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', ...MONO }}>{value}</span>
    </div>
  )
}

// Homepage's SectionHeader pattern (app/page.tsx) replicated locally — every
// page with section labels (predictions, stories) keeps its own copy rather
// than sharing one, since it's a ~10-line helper.
function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mb-3">
      <span style={{ fontSize: 18, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>{label}</span>
      {sub && <p style={{ color: MUTE, fontSize: 13, marginTop: 4 }}>{sub}</p>}
    </div>
  )
}

// ── Header ambience ───────────────────────────────────────────────────────────
// Reuses the Model Arsenal header's two existing keyframes (app/models/page.tsx)
// instead of inventing new motion: soft drifting glow blobs behind the title
// (`ambient-drift`) and a light beam sweeping the header's bottom rule
// (`header-scan`). Tinted with the live overallColor so it's still tied to
// real status, not purely decorative.
function HeaderAmbientBg({ color }: { color: string }) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <div style={{
        position: 'absolute', top: '-55%', right: '-8%', width: 340, height: 340, borderRadius: '50%',
        background: `radial-gradient(circle, ${color}22 0%, transparent 65%)`,
        animation: 'ambient-drift 14s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: '-70%', left: '10%', width: 260, height: 260, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 65%)',
        animation: 'ambient-drift 18s ease-in-out infinite reverse',
      }} />
    </div>
  )
}

function HeaderScanRule({ color }: { color: string }) {
  return (
    <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ height: 1 }}>
      <div style={{ position: 'absolute', inset: 0, background: LINE }} />
      <div style={{
        position: 'absolute', top: 0, height: '100%', width: '50%',
        background: `linear-gradient(to right, transparent, ${color}, rgba(59,130,246,0.5), transparent)`,
        animation: 'header-scan 3.5s ease-in-out infinite',
      }} />
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
      <style>{`
        @media (max-width: 767px) {
          .health-stats { gap: 10px !important; }
          .health-stats-divider { display: none !important; }
          .health-row-header { flex-wrap: wrap !important; gap: 4px 12px !important; }
        }
      `}</style>

      {/* Header */}
      <div className="relative overflow-hidden mb-8" style={{ paddingBottom: 20 }}>
        <HeaderAmbientBg color={overallColor} />
        <HeaderScanRule color={overallColor} />

        <div className="relative" style={{ zIndex: 1 }}>
          <p className="eyebrow mb-2">Ops · Data Quality</p>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h1 style={{
              fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em',
              background: 'linear-gradient(135deg, #f4f4f5 30%, #71717a 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>Source Health</h1>
            <span className="flex items-center gap-2" style={{
              padding: '4px 11px', borderRadius: 999,
              background: `${overallColor}14`, border: `1px solid ${overallColor}40`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: overallColor }} />
              <span style={{ color: overallColor, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {data.overallStatus}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5" style={{ color: MUTE, fontSize: 14 }}>
            <span>Checked {relTime(data.checkedAt)}</span>
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0 }} />
            <span>{data.sources.length} sources tracked</span>
          </div>
        </div>
      </div>

      {/* Stat strip — grouped chips: source-status distribution, then pipeline signals */}
      <div className="health-stats flex flex-wrap items-start gap-3 mb-8 pb-6" style={{ borderBottom: `1px solid ${LINE}` }}>
        <StatChip label="OK" value={data.summary.ok} color={FAINT} />
        <StatChip label="Warn" value={data.summary.warn} color={data.summary.warn ? STATUS_COLOR.warn : FAINT} />
        <StatChip label="Stale" value={data.summary.stale} color={data.summary.stale ? STATUS_COLOR.stale : FAINT} />
        <StatChip label="Dead" value={data.summary.dead} color={data.summary.dead ? STATUS_COLOR.dead : FAINT} />
        <div className="health-stats-divider" style={{ width: 1, alignSelf: 'stretch', background: LINE }} />
        <StatChip label="Cron failures · 7d" value={data.cronFailures.length} color={data.cronFailures.length ? '#ef4444' : FAINT} />
        <StatChip label="Eval flags open" value={data.evalFlags.length} color={data.evalFlags.length ? '#eab308' : FAINT} />
        <StatChip label="Graph edges" value={data.graph.totalEdges} color={FAINT} />
      </div>

      {/* Sources table */}
      <div className="mb-10">
        <SectionHeader label="Sources" sub="Fetch status merged with screening quality · worst first" />
        <div style={{ border: `1px solid rgba(59,130,246,0.35)`, borderRadius: 12, overflow: 'hidden' }}>
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
                      <td style={{ padding: '13px 16px' }}>
                        <span className="flex items-center gap-2.5">
                          <Glyph style={{ color: DIM }} />
                          <span style={{ color: INK, fontSize: 15, fontWeight: 600 }}>{row.source}</span>
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px' }}><StatusLabel status={row.status} /></td>
                      <td style={{ padding: '13px 16px', color: DIM, fontSize: 14 }}>{row.lastFetchAt ? relTime(row.lastFetchAt) : '—'}</td>
                      <td style={{ padding: '13px 16px', color: DIM, fontSize: 14, textAlign: 'right', ...MONO }}>{row.lastCount}</td>
                      <td style={{ padding: '13px 16px' }}><ScreeningCell row={row} /></td>
                      <td style={{ padding: '13px 16px' }}><AcceptRateBar row={row} /></td>
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
        <SectionHeader label="Claude usage by task" sub={`Last ${data.screening.windowDays} days`} />
        <div style={{ border: `1px solid rgba(59,130,246,0.35)`, borderRadius: 12, overflow: 'hidden' }}>
          {data.screening.usageByTask.length === 0 ? (
            <div style={{ padding: '4px 16px' }}><EmptyRow text="No Claude usage recorded in this window." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 480 }}>
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
                      <td style={{ padding: '13px 16px', color: INK, fontSize: 15, fontWeight: 600 }}>{u.task}</td>
                      <td style={{ padding: '13px 16px', color: DIM, fontSize: 14, textAlign: 'right', ...MONO }}>{u.inputTokens.toLocaleString()}</td>
                      <td style={{ padding: '13px 16px', color: DIM, fontSize: 14, textAlign: 'right', ...MONO }}>{u.outputTokens.toLocaleString()}</td>
                      <td style={{ padding: '13px 16px', color: INK, fontSize: 14.5, fontWeight: 700, textAlign: 'right', ...MONO }}>
                        {(u.inputTokens + u.outputTokens).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Graph edges */}
      <div className="mb-10">
        <SectionHeader label="Graph" sub="graph_edges by type · freshness is last write, not a fixed staleness cutoff (producers run on different cadences)" />
        <div style={{ border: `1px solid rgba(59,130,246,0.35)`, borderRadius: 12, overflow: 'hidden' }}>
          {data.graph.byType.length === 0 ? (
            <div style={{ padding: '4px 16px' }}><EmptyRow text="No graph edges recorded yet." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 480 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${LINE}` }}>
                    <Th>Edge type</Th>
                    <Th align="right">Count</Th>
                    <Th align="right">Last updated</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.graph.byType.map((row, i) => (
                    <tr key={row.edgeType} style={{ borderBottom: i === data.graph.byType.length - 1 ? 'none' : `1px solid ${LINE}` }}>
                      <td style={{ padding: '13px 16px', color: INK, fontSize: 15, fontWeight: 600 }}>{row.edgeType}</td>
                      <td style={{ padding: '13px 16px', color: DIM, fontSize: 14, textAlign: 'right', ...MONO }}>{row.count.toLocaleString()}</td>
                      <td style={{ padding: '13px 16px', color: DIM, fontSize: 14, textAlign: 'right' }}>{row.lastUpdated ? relTime(row.lastUpdated) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Cron failures + eval flags — self-contained cards instead of a thin-divider
          list, so each failure/flag reads as its own item rather than blurring
          together, with the severity tint doing double duty as a scan cue. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 mb-10">
        <div>
          <SectionHeader label="Cron failures" sub="Last 7 days" />
          {data.cronFailures.length === 0 ? (
            <EmptyRow text="No cron failures in the last 7 days." />
          ) : (
            <div className="flex flex-col gap-3">
              {data.cronFailures.map((f, i) => (
                <div key={i} style={{
                  padding: '14px 16px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
                }}>
                  <div className="health-row-header flex items-start justify-between gap-3 mb-2">
                    <span style={{ color: INK, fontSize: 15, fontWeight: 600 }}>{f.path}</span>
                    <span style={{ color: DIM, fontSize: 12.5, whiteSpace: 'nowrap', flexShrink: 0 }}>{relTime(f.startedAt)}</span>
                  </div>
                  <p style={{ color: DIM, fontSize: 14.5, lineHeight: 1.65 }}>{truncate(f.errorText, 140) || 'No error detail recorded.'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeader label="Eval quality flags" sub="Groundedness ≤ 3, not yet exported" />
          {data.evalFlags.length === 0 ? (
            <EmptyRow text="No flagged items pending review." />
          ) : (
            <div className="flex flex-col gap-3">
              {data.evalFlags.map((f, i) => (
                <div key={i} style={{
                  padding: '14px 16px', borderRadius: 10,
                  background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)',
                }}>
                  <div className="health-row-header flex items-start justify-between gap-3 mb-2">
                    {/* Full targetId is a UUID — noisy inline, so show a short
                        prefix and put the full value in a native hover tooltip. */}
                    <span style={{ color: INK, fontSize: 15, fontWeight: 600 }} title={f.targetId}>
                      {f.targetType} · <span style={{ ...MONO, fontSize: 13, color: DIM }}>{f.targetId.slice(0, 8)}</span>
                    </span>
                    <span style={{
                      padding: '2px 9px', borderRadius: 6, whiteSpace: 'nowrap', flexShrink: 0,
                      background: 'rgba(234,179,8,0.15)', color: '#eab308', fontSize: 13, fontWeight: 700, ...MONO,
                    }}>
                      {f.groundedness ?? '—'}/5
                    </span>
                  </div>
                  <p style={{ color: DIM, fontSize: 14.5, lineHeight: 1.65 }}>{truncate(f.rationale, 140)}</p>
                </div>
              ))}
              <p style={{ color: MUTE, fontSize: 13, marginTop: 2 }}>Run scripts/eval/export-flagged.mts to review.</p>
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
            background: 'transparent', color: refreshing ? FAINT : 'var(--accent)',
            border: `1px solid rgba(59,130,246,0.4)`, borderRadius: 8, padding: '8px 20px',
            fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: refreshing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            opacity: refreshing ? 0.5 : 1, transition: 'all 0.15s',
          }}
        >
          {refreshing && <span className="inline-block h-3 w-3 rounded-full border border-blue-500 border-t-transparent animate-spin" />}
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <p style={{ color: MUTE, fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em', textAlign: 'center' }}>
          Source status from source_runs · screening from screening_stats · refreshed on load
        </p>
      </div>
    </main>
  )
}
