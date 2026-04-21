'use client'

import { useState, useEffect, useMemo } from 'react'
import type { Dataset } from '@/lib/types'
import { TASK_LABELS } from '@/lib/sources/datasets'

// ── Meta ────────────────────────────────────────────────────────────────────

const MODALITY_META: Record<string, { label: string; color: string; rgb: string }> = {
  text:    { label: 'TEXT',    color: '#a78bfa', rgb: '167,139,250' },
  image:   { label: 'IMAGE',   color: '#60a5fa', rgb: '96,165,250' },
  audio:   { label: 'AUDIO',   color: '#34d399', rgb: '52,211,153' },
  video:   { label: 'VIDEO',   color: '#fb923c', rgb: '251,146,60' },
  tabular: { label: 'TABLE',   color: '#fbbf24', rgb: '251,191,36' },
}

const TASK_FILTERS = [
  { key: 'all',                         label: 'ANY' },
  { key: 'text-generation',             label: 'text-gen' },
  { key: 'question-answering',          label: 'question-answering' },
  { key: 'text-classification',         label: 'text-class' },
  { key: 'image-classification',        label: 'image-class' },
  { key: 'automatic-speech-recognition',label: 'speech-rec' },
  { key: 'reinforcement-learning',      label: 'rl' },
  { key: 'tabular-classification',      label: 'tabular' },
]

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function sizeShort(s: string | undefined) {
  if (!s) return null
  if (s.includes('100K') || s.includes('1M')) return '100K–1M'
  const m = s.match(/\d+[KMB]+/)
  return m ? m[0] : s.slice(0, 6)
}

function isKaggle(full: string) { return full.startsWith('kaggle:') }

function parseName(full: string): { owner: string; name: string } {
  const ref = full.replace('kaggle:', '')
  const parts = ref.split('/')
  return { owner: parts[0] ?? '', name: parts[1] ?? ref }
}

const LICENSE_SAFE = new Set(['apache 2.0', 'mit', 'cc0 1.0', 'cc by 4.0', 'cc by sa 4.0', 'openrail'])

// ── Row ─────────────────────────────────────────────────────────────────────

function DataRow({ d, maxDownloads }: { d: Dataset; maxDownloads: number }) {
  const [open, setOpen] = useState(false)
  const mod  = d.modalities[0]
  const meta = MODALITY_META[mod ?? ''] ?? { label: mod?.slice(0, 5).toUpperCase() ?? '?', color: '#8080b0', rgb: '61,61,90' }
  const { owner, name } = parseName(d.full_name)
  const kaggle = isKaggle(d.full_name)
  const pct  = maxDownloads > 0 ? Math.max(d.downloads / maxDownloads, 0.02) : 0
  const task1 = d.task_categories[0]
  const task2 = d.task_categories[1]
  const extra = d.task_categories.length - 2
  const licStr   = d.license?.toLowerCase() ?? ''
  const licColor = LICENSE_SAFE.has(licStr) ? '#34d399' : '#fbbf24'

  return (
    <>
      <tr
        onClick={() => setOpen(o => !o)}
        className="cursor-pointer group"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.045)' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
      >
        {/* Modality strip + type badge */}
        <td style={{ width: 110, padding: '0 14px 0 0', verticalAlign: 'middle' }}>
          <div style={{ paddingLeft: 18, borderLeft: `3px solid ${meta.color}`, display: 'flex', alignItems: 'center' }}>
            <span style={{
              fontSize: 16, fontWeight: 900, letterSpacing: '0.1em',
              color: meta.color,
              background: `rgba(${meta.rgb},0.1)`,
              border: `1px solid rgba(${meta.rgb},0.2)`,
              borderRadius: 5, padding: '4px 8px',
              whiteSpace: 'nowrap',
            }}>
              {meta.label}
            </span>
          </div>
        </td>

        {/* Source + name */}
        <td style={{ padding: '20px 18px 20px 0', verticalAlign: 'middle', maxWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              flexShrink: 0,
              fontSize: 15, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: kaggle ? '#20b2aa' : '#ffc300',
              background: kaggle ? 'rgba(32,178,170,0.09)' : 'rgba(255,195,0,0.07)',
              border: `1px solid ${kaggle ? 'rgba(32,178,170,0.2)' : 'rgba(255,195,0,0.16)'}`,
              borderRadius: 4, padding: '2px 6px',
            }}>
              {kaggle ? 'KGL' : 'HF'}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#8080b0', fontSize: 15 }}>{owner}/</span>
                <span style={{ color: '#d0d0e8', fontSize: 16, fontWeight: 700 }}>{name}</span>
              </div>
            </div>
          </div>
        </td>

        {/* Tasks */}
        <td style={{ padding: '0 18px 0 0', verticalAlign: 'middle', width: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {task1 && (
              <span style={{
                fontSize: 16, fontWeight: 700, letterSpacing: '0.03em',
                color: '#7c6aff',
                background: 'rgba(124,106,255,0.09)',
                border: '1px solid rgba(124,106,255,0.18)',
                borderRadius: 5, padding: '3px 8px',
              }}>
                {TASK_LABELS[task1] ?? task1}
              </span>
            )}
            {task2 && (
              <span style={{
                fontSize: 16, fontWeight: 700, letterSpacing: '0.03em',
                color: '#7c6aff',
                background: 'rgba(124,106,255,0.09)',
                border: '1px solid rgba(124,106,255,0.18)',
                borderRadius: 5, padding: '3px 8px',
              }}>
                {TASK_LABELS[task2] ?? task2}
              </span>
            )}
            {extra > 0 && (
              <span style={{ fontSize: 16, color: '#8080b0', fontWeight: 700 }}>+{extra}</span>
            )}
          </div>
        </td>

        {/* Downloads — bar + number */}
        <td style={{ padding: '0 18px 0 0', verticalAlign: 'middle', width: 160 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.round(pct * 100)}%`,
                background: `rgba(${meta.rgb},0.75)`,
                borderRadius: 99,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{ fontSize: 15, color: '#6060a0', fontWeight: 700, whiteSpace: 'nowrap', minWidth: 40, textAlign: 'right' }}>
              {fmt(d.downloads)}
            </span>
          </div>
        </td>

        {/* Likes */}
        <td style={{ padding: '0 18px 0 0', verticalAlign: 'middle', width: 70, textAlign: 'right' }}>
          <span style={{ fontSize: 15, color: '#4a4a6a', fontWeight: 700 }}>
            <span style={{ color: '#f87171', marginRight: 3 }}>♥</span>{fmt(d.likes)}
          </span>
        </td>

        {/* Size */}
        <td style={{ padding: '0 18px 0 0', verticalAlign: 'middle', width: 80 }}>
          {sizeShort(d.size_category) && (
            <span style={{
              fontSize: 16, fontWeight: 700, color: '#8080b0',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 5, padding: '3px 8px',
            }}>
              {sizeShort(d.size_category)}
            </span>
          )}
        </td>

        {/* Expand toggle */}
        <td style={{ width: 36, verticalAlign: 'middle', textAlign: 'right', paddingRight: 18 }}>
          <span style={{
            fontSize: 16,
            color: open ? meta.color : '#8080b0',
            display: 'inline-block',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s, color 0.2s',
          }}>
            ▼
          </span>
        </td>
      </tr>

      {/* Expanded detail */}
      {open && (
        <tr style={{ background: `rgba(${meta.rgb},0.03)`, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <td />
          <td colSpan={6} style={{ padding: '14px 18px 18px 0' }}>
            {d.description && (
              <p style={{ color: '#6868a0', fontSize: 15, lineHeight: 1.75, marginBottom: 12, maxWidth: 660 }}>
                {d.description}
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {d.task_categories.map(t => (
                  <span key={t} style={{
                    fontSize: 16, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                    color: '#7c6aff',
                    background: 'rgba(124,106,255,0.08)',
                    border: '1px solid rgba(124,106,255,0.16)',
                    borderRadius: 5, padding: '3px 9px',
                  }}>
                    {TASK_LABELS[t] ?? t}
                  </span>
                ))}
              </div>

              {d.license && (
                <span style={{
                  fontSize: 16, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                  color: licColor,
                  background: `rgba(${licColor === '#34d399' ? '52,211,153' : '251,191,36'},0.08)`,
                  border: `1px solid ${licColor === '#34d399' ? 'rgba(52,211,153,0.2)' : 'rgba(251,191,36,0.2)'}`,
                  borderRadius: 5, padding: '3px 9px',
                }}>
                  {d.license}
                </span>
              )}

              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{
                  marginLeft: 'auto', marginRight: 18,
                  fontSize: 16, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: meta.color,
                  background: `rgba(${meta.rgb},0.09)`,
                  border: `1px solid rgba(${meta.rgb},0.22)`,
                  borderRadius: 7, padding: '6px 14px',
                  textDecoration: 'none',
                }}
              >
                Open ↗
              </a>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DatasetsPage() {
  const [datasets,   setDatasets]   = useState<Dataset[]>([])
  const [loading,    setLoading]    = useState(true)
  const [activeTask, setActiveTask] = useState('all')
  const [activeSort, setActiveSort] = useState('likes')

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort: activeSort, limit: '60' })
    if (activeTask !== 'all') params.set('task', activeTask)
    fetch(`/api/datasets?${params}`)
      .then(r => r.json())
      .then(d => setDatasets(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [activeTask, activeSort])

  const totalDownloads = useMemo(() => datasets.reduce((s, d) => s + d.downloads, 0), [datasets])
  const maxDownloads   = useMemo(() => Math.max(...datasets.map(d => d.downloads), 1), [datasets])

  const modalityCount = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of datasets) {
      const m = d.modalities[0] ?? 'unknown'
      counts[m] = (counts[m] ?? 0) + 1
    }
    return counts
  }, [datasets])

  const topModality = useMemo(() => {
    const entries = Object.entries(modalityCount)
    if (!entries.length) return null
    const [key, count] = entries.sort((a, b) => b[1] - a[1])[0]
    return { key, count, pct: Math.round(count / datasets.length * 100) }
  }, [modalityCount, datasets.length])

  const topMeta  = topModality ? (MODALITY_META[topModality.key] ?? { label: topModality.key.toUpperCase(), color: '#8080b0', rgb: '61,61,90' }) : null
  const taskLabel = TASK_FILTERS.find(f => f.key === activeTask)?.label ?? activeTask

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="mb-7">
        <p className="eyebrow mb-2">Data Vault</p>
        <h1 style={{ color: '#e8e8f0', fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 18 }}>
          AI Datasets
        </h1>

        {/* Metrics strip */}
        <div
          className="grid grid-cols-3 gap-px overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}
        >
          {[
            { label: 'RECORDS',   value: datasets.length,      sub: 'datasets loaded',                   color: undefined },
            { label: 'DOWNLOADS', value: fmt(totalDownloads),  sub: 'cumulative',                        color: undefined },
            { label: 'TOP TYPE',  value: topMeta?.label ?? '—', sub: topModality ? `${topModality.pct}% of results` : '', color: topMeta?.color },
          ].map((m, i) => (
            <div key={i} style={{ background: '#05050e', padding: '18px 24px' }}>
              <p style={{ fontSize: 15, fontWeight: 900, letterSpacing: '0.2em', color: '#7878a8', marginBottom: 5 }}>
                {m.label}
              </p>
              <p style={{ fontSize: 26, fontWeight: 900, color: m.color ?? '#e8e8f0', letterSpacing: '-0.02em', lineHeight: 1, fontFamily: 'monospace' }}>
                {m.value}
              </p>
              <p style={{ fontSize: 15, color: '#8080b0', marginTop: 4 }}>{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Query builder ──────────────────────────────────────────── */}
      <div
        className="mb-6 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.016)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}
      >
        {/* Terminal title bar */}
        <div
          style={{
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.025)',
            padding: '8px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            {['#f87171', '#fbbf24', '#34d399'].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.5 }} />
            ))}
          </div>
          <span style={{ fontSize: 16, color: '#7878a8', fontFamily: 'monospace', marginLeft: 6, letterSpacing: '0.04em' }}>
            query_builder.sql
          </span>
        </div>

        {/* SQL query */}
        <div style={{ padding: '16px 22px', fontFamily: 'monospace', fontSize: 16, lineHeight: 2.1 }}>
          <div>
            <span style={{ color: '#60a5fa' }}>SELECT </span>
            <span style={{ color: '#e8e8f0' }}>* </span>
            <span style={{ color: '#60a5fa' }}>FROM </span>
            <span style={{ color: '#34d399' }}>datasets</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            <span style={{ color: '#60a5fa', marginLeft: 24 }}>WHERE </span>
            <span style={{ color: '#a78bfa' }}>task_category </span>
            <span style={{ color: '#8080b0' }}>=&nbsp;</span>
            {TASK_FILTERS.map(f => {
              const active = activeTask === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setActiveTask(f.key)}
                  style={{
                    fontFamily: 'monospace', fontSize: 15,
                    fontWeight: active ? 900 : 400,
                    color: active ? '#fbbf24' : '#8080b0',
                    background: active ? 'rgba(251,191,36,0.12)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(251,191,36,0.32)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 5, padding: '2px 9px',
                    lineHeight: '24px', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  '{f.label}'
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#60a5fa', marginLeft: 24 }}>ORDER BY </span>
            {['likes', 'recent'].map(s => {
              const active = activeSort === s
              return (
                <button
                  key={s}
                  onClick={() => setActiveSort(s)}
                  style={{
                    fontFamily: 'monospace', fontSize: 15,
                    fontWeight: active ? 900 : 400,
                    color: active ? '#a78bfa' : '#8080b0',
                    background: 'transparent', border: 'none',
                    cursor: 'pointer', padding: '0 4px', transition: 'color 0.15s',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {active
                    ? <><span style={{ color: '#a78bfa' }}>{s === 'likes' ? 'likes' : 'last_modified'}</span><span style={{ color: '#60a5fa' }}> DESC</span></>
                    : <span style={{ color: '#8080b0' }}>{s === 'likes' ? 'likes' : 'last_modified'}</span>
                  }
                </button>
              )
            })}
            <span style={{ color: '#8080b0' }}>LIMIT 60;</span>
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: 16 }}>
          <div className="h-7 w-7 rounded-full border border-violet-500 border-t-transparent animate-spin" />
          <p style={{ fontFamily: 'monospace', fontSize: 15, color: '#8080b0', letterSpacing: '0.12em' }}>EXECUTING QUERY…</p>
        </div>
      ) : datasets.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '80px 0', textAlign: 'center',
          background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14,
        }}>
          <p style={{ fontFamily: 'monospace', color: '#f87171', fontSize: 15, marginBottom: 8 }}>ERROR: no records found</p>
          <p style={{ color: '#8080b0', fontSize: 15 }}>Restart the server to trigger a fresh fetch</p>
        </div>
      ) : (
        <div style={{ overflow: 'hidden', background: 'rgba(255,255,255,0.016)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14 }}>

          {/* Table header */}
          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[
                    { label: 'TYPE',    w: 110  },
                    { label: 'DATASET', w: 'auto' },
                    { label: 'TASKS',   w: 200  },
                    { label: '↓ DL',    w: 160  },
                    { label: '♥',       w: 70   },
                    { label: 'SIZE',    w: 80   },
                    { label: '',        w: 36   },
                  ].map((col, i) => (
                    <th key={i} style={{
                      textAlign: 'left',
                      padding: i === 0 ? '14px 14px 14px 18px' : '14px 18px 14px 0',
                      fontSize: 15, fontWeight: 900, letterSpacing: '0.18em',
                      color: '#7878a8',
                      width: col.w !== 'auto' ? col.w : undefined,
                      whiteSpace: 'nowrap',
                    }}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>

          {/* Data rows */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {datasets.map(d => (
                <DataRow key={d.id} d={d} maxDownloads={maxDownloads} />
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)', padding: '10px 18px' }}>
            <p style={{ fontFamily: 'monospace', fontSize: 16, color: '#7878a8', letterSpacing: '0.1em' }}>
              {datasets.length} RECORDS · task = {taskLabel.toUpperCase()} · ORDER BY {activeSort === 'likes' ? 'LIKES' : 'LAST_MODIFIED'} DESC
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
