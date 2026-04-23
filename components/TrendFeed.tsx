'use client'

import { useState, useMemo } from 'react'
import type { FeedItem } from '@/lib/types'

// ── Types ──────────────────────────────────────────────────────────────────

type Stats = {
  itemsThisWeek?: number
  topTopic?: string
  topVelocityItem?: { title: string }
} | null

// ── Constants ──────────────────────────────────────────────────────────────

const STATION_CONFIG: Record<string, { code: string; color: string; rgb: string }> = {
  arxiv:       { code: 'ARXV', color: '#60a5fa', rgb: '96,165,250'  },
  huggingface: { code: 'HGFC', color: '#fbbf24', rgb: '251,191,36'  },
  github:      { code: 'GTHB', color: '#fb923c', rgb: '251,146,60'  },
  hn:          { code: 'HNWS', color: '#f87171', rgb: '248,113,113' },
  rss:         { code: 'RSS·', color: '#34d399', rgb: '52,211,153'  },
}

const ALL_STATIONS = [
  { key: 'arxiv',       label: 'ArXiv',       ...STATION_CONFIG.arxiv       },
  { key: 'hn',          label: 'HackerNews',  ...STATION_CONFIG.hn          },
  { key: 'github',      label: 'GitHub',      ...STATION_CONFIG.github      },
  { key: 'huggingface', label: 'HuggingFace', ...STATION_CONFIG.huggingface },
  { key: 'rss',         label: 'RSS Feeds',   ...STATION_CONFIG.rss         },
]

const TOPIC_META: Record<string, { color: string; rgb: string }> = {
  models:   { color: '#7c6aff', rgb: '124,106,255' },
  tools:    { color: '#fb923c', rgb: '251,146,60'  },
  research: { color: '#60a5fa', rgb: '96,165,250'  },
  industry: { color: '#34d399', rgb: '52,211,153'  },
}

const TAG_LIST  = ['all', 'models', 'tools', 'research', 'industry']
const SORT_LIST = [
  { key: 'mixed',    label: 'STD'  },
  { key: 'recent',   label: 'TIME' },
  { key: 'velocity', label: 'PRIO' },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function stationMeta(source: string) {
  if (source in STATION_CONFIG) return STATION_CONFIG[source]
  if (source.startsWith('rss:')) return STATION_CONFIG.rss
  return { code: source.slice(0, 4).toUpperCase(), color: '#a78bfa', rgb: '167,139,250' }
}

function priorityMeta(vel: number) {
  if (vel >= 2.0) return { code: 'P1', color: '#f87171', rgb: '248,113,113' }
  if (vel >= 0.8) return { code: 'P2', color: '#fbbf24', rgb: '251,191,36'  }
  if (vel >= 0.1) return { code: 'P3', color: '#60a5fa', rgb: '96,165,250'  }
  return             { code: '——', color: '#7070a8', rgb: '30,30,46'    }
}

function relTime(s?: string): string {
  if (!s) return '——'
  const d = (Date.now() - new Date(s).getTime()) / 1000
  if (d < 3600)  return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

// ── Sub-components ─────────────────────────────────────────────────────────

function EqBars({ color, active }: { color: string; active: boolean }) {
  const anims = [
    { name: 'eq1', dur: '0.55s' },
    { name: 'eq2', dur: '0.70s' },
    { name: 'eq3', dur: '0.42s' },
    { name: 'eq4', dur: '0.63s' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 12 }}>
      {anims.map(({ name, dur }) => (
        <div
          key={name}
          style={{
            width: 2, borderRadius: 1,
            background: active ? color : '#1a1a2a',
            height: active ? '60%' : '15%',
            animation: active ? `${name} ${dur} ease-in-out infinite alternate` : 'none',
            transition: 'height 0.4s, background 0.3s',
          }}
        />
      ))}
    </div>
  )
}

function VelBar({ score }: { score: number }) {
  const segs   = 8
  const filled = Math.min(Math.round((score / 3) * segs), segs)
  const color  = score >= 2 ? '#f87171' : score >= 0.8 ? '#fbbf24' : '#60a5fa'
  return (
    <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', flexShrink: 0 }}>
      {Array.from({ length: segs }, (_, i) => (
        <div key={i} style={{
          width: 4,
          height: 6 + i * 2,
          borderRadius: 1,
          background: i < filled ? color : '#111120',
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function TrendFeed({ items: init, stats }: { items: FeedItem[]; stats: Stats }) {
  const [items,      setItems]      = useState(init)
  const [activeTag,  setActiveTag]  = useState('all')
  const [activeSort, setActiveSort] = useState('mixed')
  const [loading,    setLoading]    = useState(false)
  const [readIds,    setReadIds]    = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const stationCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      const key = item.source.startsWith('rss:') ? 'rss' : item.source
      counts[key] = (counts[key] ?? 0) + 1
    }
    return counts
  }, [items])

  const topicFreq = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      for (const tag of item.topic_tags) {
        if (tag in TOPIC_META) counts[tag] = (counts[tag] ?? 0) + 1
      }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
    return Object.entries(counts)
      .map(([tag, n]) => ({ tag, n, pct: (n / total) * 100 }))
      .sort((a, b) => b.n - a.n)
  }, [items])

  async function changeSort(sort: string) {
    setActiveSort(sort)
    setLoading(true)
    try {
      const r = await fetch(`/api/feed?page=1&sort=${sort}`)
      if (r.ok) setItems(await r.json())
    } finally { setLoading(false) }
  }

  async function markRead(id: string) {
    if (readIds.has(id)) return
    setReadIds(p => new Set(p).add(id))
    fetch(`/api/feed/${id}/read`, { method: 'POST' })
  }

  const filtered = activeTag === 'all'
    ? items
    : items.filter(i => i.topic_tags.includes(activeTag))

  // Ticker — duplicate content for seamless loop
  const tickerContent = items.slice(0, 24).map(i => i.title).join('   ·   ')

  return (
    <div>
      {/* ── Scrolling ticker ────────────────────────────────── */}
      <div style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'rgba(255,255,255,0.012)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8,
        padding: '6px 0',
        marginBottom: 14,
      }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 48,
          background: 'linear-gradient(to right, #05050e, transparent)',
          zIndex: 2, pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 48,
          background: 'linear-gradient(to left, #05050e, transparent)',
          zIndex: 2, pointerEvents: 'none',
        }} />
        <div style={{
          display: 'inline-flex',
          whiteSpace: 'nowrap',
          animation: 'ticker 55s linear infinite',
          gap: 0,
        }}>
          <span style={{ fontSize: 13, color: '#7070a8', fontWeight: 700, letterSpacing: '0.08em', paddingRight: 40 }}>
            {tickerContent}
          </span>
          <span style={{ fontSize: 13, color: '#7070a8', fontWeight: 700, letterSpacing: '0.08em', paddingRight: 40 }}>
            {tickerContent}
          </span>
        </div>
      </div>

      {/* ── Console grid ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '218px 1fr', gap: 14, alignItems: 'start' }}>

        {/* ── LEFT: Station panel ──────────────────────────── */}
        <div style={{
          position: 'sticky', top: 16,
          background: 'rgba(255,255,255,0.018)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '11px 13px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(0,0,0,0.2)',
          }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: 7 }}>Active Stations</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: '#34d399',
                boxShadow: '0 0 6px #34d399',
                animation: 'glow-pulse 2.2s ease-in-out infinite',
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, color: '#34d399', fontWeight: 700, letterSpacing: '0.12em' }}>
                LIVE · {items.length} SIGNALS
              </span>
            </div>
          </div>

          {/* Station rows */}
          <div>
            {ALL_STATIONS.map(st => {
              const count  = stationCounts[st.key] ?? 0
              const active = count > 0
              return (
                <div
                  key={st.key}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '9px 13px',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    opacity: active ? 1 : 0.25,
                    transition: 'opacity 0.3s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      background: active ? st.color : '#1a1a2a',
                      boxShadow: active ? `0 0 5px ${st.color}` : 'none',
                      transition: 'background 0.3s, box-shadow 0.3s',
                    }} />
                    <div>
                      <span style={{
                        display: 'block', fontSize: 13, fontWeight: 900,
                        letterSpacing: '0.12em', color: active ? st.color : '#7070a8',
                        transition: 'color 0.3s',
                      }}>
                        {st.code}
                      </span>
                      <span style={{ fontSize: 12, color: '#7070a8', letterSpacing: '0.04em' }}>
                        {active ? `${count} signals` : 'no signal'}
                      </span>
                    </div>
                  </div>
                  <EqBars color={st.color} active={active} />
                </div>
              )
            })}
          </div>

          {/* Frequency distribution */}
          {topicFreq.length > 0 && (
            <div style={{
              padding: '11px 13px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span className="eyebrow" style={{ display: 'block', marginBottom: 9 }}>Freq Distribution</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {topicFreq.map(({ tag, pct }) => {
                  const m = TOPIC_META[tag]
                  if (!m) return null
                  return (
                    <div key={tag}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.12em', color: m.color, textTransform: 'uppercase' }}>
                          {tag}
                        </span>
                        <span style={{ fontSize: 12, color: '#7070a8', fontFamily: 'monospace' }}>
                          {Math.round(pct)}%
                        </span>
                      </div>
                      <div style={{ height: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 1, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: m.color, borderRadius: 1, opacity: 0.65,
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div style={{
              padding: '10px 13px',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', flexDirection: 'column', gap: 7,
            }}>
              {stats.itemsThisWeek != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#7070a8', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    This Week
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#7c6aff' }}>
                    {stats.itemsThisWeek}
                  </span>
                </div>
              )}
              {stats.topTopic && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#7070a8', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    Hot Topic
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#fbbf24', textTransform: 'capitalize' }}>
                    {stats.topTopic}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Transmission log ───────────────────────── */}
        <div style={{
          background: 'rgba(255,255,255,0.018)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          overflow: 'hidden',
        }}>
          {/* Log header: filters + sort */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px',
            background: 'rgba(0,0,0,0.2)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            flexWrap: 'wrap', gap: 8,
          }}>
            {/* Tag filters */}
            <div style={{ display: 'flex', gap: 3 }}>
              {TAG_LIST.map(tag => {
                const active = activeTag === tag
                const m      = TOPIC_META[tag]
                const color  = m?.color ?? '#7c6aff'
                const rgb    = m?.rgb   ?? '124,106,255'
                return (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(tag)}
                    style={{
                      fontSize: 12, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase',
                      padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                      background: active ? `rgba(${rgb},0.12)` : 'transparent',
                      color: active ? color : '#7070a8',
                      border: `1px solid ${active ? `rgba(${rgb},0.3)` : 'transparent'}`,
                      transition: 'all 0.15s',
                    }}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>

            {/* Sort + count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {loading && (
                <span className="inline-block h-2.5 w-2.5 rounded-full border border-violet-500 border-t-transparent animate-spin" />
              )}
              <div style={{
                display: 'flex', overflow: 'hidden', borderRadius: 4,
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                {SORT_LIST.map(s => (
                  <button
                    key={s.key}
                    onClick={() => changeSort(s.key)}
                    style={{
                      fontSize: 14, fontWeight: 900, letterSpacing: '0.2em',
                      padding: '4px 8px', cursor: 'pointer',
                      background: activeSort === s.key ? 'rgba(124,106,255,0.14)' : 'transparent',
                      color: activeSort === s.key ? '#a78bfa' : '#7070a8',
                      border: 'none', transition: 'all 0.15s',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <span style={{ fontSize: 13, color: '#7070a8', fontFamily: 'monospace', fontWeight: 700 }}>
                {filtered.length}
              </span>
            </div>
          </div>

          {/* Column header strip */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '44px 54px 38px 82px 1fr 72px',
            gap: 0,
            padding: '5px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(0,0,0,0.15)',
          }}>
            {['TIER', 'SRC', 'AGO', 'FREQ', 'TRANSMISSION', 'SIG'].map(h => (
              <span key={h} style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.2em', color: '#5a5a8a', textTransform: 'uppercase' }}>
                {h}
              </span>
            ))}
          </div>

          {/* Rows */}
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 14px', textAlign: 'center' }}>
              <p style={{ color: '#7070a8', fontSize: 14 }}>No transmissions — check back after the first fetch.</p>
            </div>
          ) : (
            <div style={{ maxHeight: '74vh', overflowY: 'auto' }}>
              {filtered.map((item) => {
                const isRead   = readIds.has(item.id) || item.is_read === 1
                const src      = stationMeta(item.source)
                const prio     = priorityMeta(item.velocity_score ?? 0)
                const tag      = item.topic_tags[0]
                const topicM   = TOPIC_META[tag] ?? { color: '#2a2a3e', rgb: '42,42,62' }
                const vel      = item.velocity_score ?? 0
                const expanded = expandedId === item.id

                return (
                  <div
                    key={item.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.035)',
                      opacity: isRead ? 0.28 : 1,
                      background: expanded ? `rgba(${src.rgb},0.03)` : 'transparent',
                      transition: 'opacity 0.2s, background 0.2s',
                    }}
                  >
                    {/* Main transmission row */}
                    <div
                      onClick={() => { setExpandedId(expanded ? null : item.id); markRead(item.id) }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '44px 54px 38px 82px 1fr 72px',
                        alignItems: 'center',
                        padding: '13px 16px',
                        cursor: 'pointer',
                        transition: 'background 0.12s',
                      }}
                      onMouseEnter={e => {
                        if (!isRead) (e.currentTarget as HTMLElement).style.background = `rgba(${src.rgb},0.04)`
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent'
                      }}
                    >
                      {/* Priority tier badge */}
                      <div>
                        <span style={{
                          display: 'inline-block',
                          fontSize: 12, fontWeight: 900, letterSpacing: '0.1em',
                          color: prio.color,
                          background: vel > 0 ? `rgba(${prio.rgb},0.1)` : 'transparent',
                          border: `1px solid ${vel > 0 ? `rgba(${prio.rgb},0.22)` : 'transparent'}`,
                          borderRadius: 3, padding: '1px 5px',
                        }}>
                          {prio.code}
                        </span>
                      </div>

                      {/* Source code */}
                      <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.1em', color: src.color }}>
                        {src.code}
                      </span>

                      {/* Age */}
                      <span style={{ fontSize: 13, color: '#7070a8', fontFamily: 'monospace' }}>
                        {relTime(item.published_at)}
                      </span>

                      {/* Topic freq */}
                      <span style={{
                        fontSize: 14, fontWeight: 900, letterSpacing: '0.1em',
                        color: topicM.color, textTransform: 'uppercase',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {tag ?? '——'}
                      </span>

                      {/* Title + hook */}
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{
                              fontSize: 12, fontWeight: 600, lineHeight: 1.35,
                              color: isRead ? '#7070a8' : '#a8a8c8',
                              textDecoration: isRead ? 'line-through' : 'none',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              flex: 1, minWidth: 0,
                              transition: 'color 0.15s',
                            }}
                            onMouseEnter={e => { if (!isRead) (e.target as HTMLElement).style.color = '#e8e8f0' }}
                            onMouseLeave={e => { if (!isRead) (e.target as HTMLElement).style.color = '#a8a8c8' }}
                          >
                            {item.title}
                          </a>
                          {item.raw_content && (
                            <span style={{
                              fontSize: 12, flexShrink: 0,
                              color: expanded ? src.color : '#7070a8',
                              display: 'inline-block',
                              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.2s, color 0.2s',
                            }}>
                              ▾
                            </span>
                          )}
                        </div>
                        {item.hook && !isRead && (
                          <span style={{
                            fontSize: 11, color: `rgba(${src.rgb},0.55)`,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            letterSpacing: '0.01em', lineHeight: 1.3,
                          }}>
                            {item.hook}
                          </span>
                        )}
                      </div>

                      {/* Signal bar */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        {vel > 0 && <VelBar score={vel} />}
                      </div>
                    </div>

                    {/* Expanded payload */}
                    {expanded && item.raw_content && (
                      <div
                        className="fade-up"
                        style={{ padding: '4px 16px 16px 16px' }}
                      >
                        <div style={{
                          background: 'rgba(0,0,0,0.35)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          borderRadius: 7, padding: '9px 13px',
                        }}>
                          <span style={{
                            display: 'block', fontSize: 14, fontWeight: 900, letterSpacing: '0.2em',
                            color: '#7070a8', marginBottom: 6, fontFamily: 'monospace',
                          }}>
                            ─── DECODED PAYLOAD ───────────────────────
                          </span>
                          <p style={{
                            fontSize: 14, color: '#4a4a6a', lineHeight: 1.75,
                            fontFamily: 'monospace',
                          }}>
                            {item.raw_content.slice(0, 320)}{item.raw_content.length > 320 ? '…' : ''}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
