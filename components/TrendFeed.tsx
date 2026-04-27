'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import type { FeedItem } from '@/lib/types'
import { relTime } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────

type Stats = {
  itemsThisWeek?: number
  topTopic?: string
  topVelocityItem?: { title: string }
} | null

// ── Constants ──────────────────────────────────────────────────────────────

const STATION_CONFIG: Record<string, { code: string; label: string; color: string; rgb: string }> = {
  arxiv:       { code: 'ARXV', label: 'ArXiv',       color: '#60a5fa', rgb: '96,165,250'  },
  huggingface: { code: 'HGFC', label: 'HuggingFace', color: '#fbbf24', rgb: '251,191,36'  },
  github:      { code: 'GTHB', label: 'GitHub',      color: '#fb923c', rgb: '251,146,60'  },
  hn:          { code: 'HNWS', label: 'HackerNews',  color: '#f87171', rgb: '248,113,113' },
  rss:         { code: 'RSS·', label: 'RSS Feeds',   color: '#34d399', rgb: '52,211,153'  },
}

const ALL_STATIONS = ['arxiv', 'hn', 'github', 'huggingface', 'rss']

const TOPIC_META: Record<string, { color: string; rgb: string }> = {
  models:   { color: '#a78bfa', rgb: '167,139,250' },
  tools:    { color: '#fb923c', rgb: '251,146,60'  },
  research: { color: '#60a5fa', rgb: '96,165,250'  },
  industry: { color: '#34d399', rgb: '52,211,153'  },
}

const TAG_LIST  = ['all', 'models', 'tools', 'research', 'industry']
const SORT_LIST = [
  { key: 'mixed',    label: 'Mixed'   },
  { key: 'recent',   label: 'Latest'  },
  { key: 'velocity', label: 'Top'     },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function stationMeta(source: string) {
  if (source in STATION_CONFIG) return STATION_CONFIG[source]
  if (source.startsWith('rss:')) return STATION_CONFIG.rss
  return { code: source.slice(0, 4).toUpperCase(), label: source, color: '#a78bfa', rgb: '167,139,250' }
}

function priorityColor(vel: number): string {
  if (vel >= 2.0) return '#f87171'
  if (vel >= 0.8) return '#fbbf24'
  if (vel >= 0.1) return '#60a5fa'
  return 'transparent'
}


// ── Sub-components ─────────────────────────────────────────────────────────

function EqBars({ color, active }: { color: string; active: boolean }) {
  const bars = ['0.55s', '0.70s', '0.42s', '0.63s']
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 12 }}>
      {bars.map((dur, i) => (
        <div key={i} style={{
          width: 2, borderRadius: 1,
          background: active ? color : '#1a1a2a',
          height: active ? '60%' : '15%',
          animation: active ? `eq${i + 1} ${dur} ease-in-out infinite alternate` : 'none',
          transition: 'height 0.4s, background 0.3s',
        }} />
      ))}
    </div>
  )
}

function SparkChart({ data }: { data: { label: string; count: number; isToday: boolean }[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 32 }}>
        {data.map(({ label, count, isToday }) => (
          <div
            key={label}
            title={`${label}: ${count} item${count !== 1 ? 's' : ''}`}
            style={{
              flex: 1,
              height: Math.max((count / max) * 32, 2),
              borderRadius: 2,
              background: isToday ? '#7c6aff' : 'rgba(255,255,255,0.1)',
              boxShadow: isToday ? '0 0 6px rgba(124,106,255,0.35)' : 'none',
              cursor: 'default',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
        {data.map(({ label, isToday }) => (
          <span key={label} style={{
            flex: 1, textAlign: 'center',
            fontSize: 8, fontWeight: isToday ? 900 : 700,
            color: isToday ? '#7c6aff' : '#3a3a5a',
            letterSpacing: '0.04em',
          }}>
            {label[0]}
          </span>
        ))}
      </div>
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
          width: 3,
          height: 5 + i * 1.8,
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
  const [items,       setItems]       = useState(init)
  const [activeTag,   setActiveTag]   = useState('all')
  const [activeSort,  setActiveSort]  = useState('mixed')
  const [loading,     setLoading]     = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page,        setPage]        = useState(1)
  const [hasMore,     setHasMore]     = useState(init.length >= 40)
  const [readIds,     setReadIds]     = useState<Set<string>>(new Set())
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [refreshing,  setRefreshing]  = useState(false)
  const [refreshMsg,  setRefreshMsg]  = useState<string | null>(null)
  const [search,        setSearch]        = useState('')
  const [sparkline,   setSparkline]   = useState<{ label: string; count: number; isToday: boolean }[]>([])
  const [searchFocused, setSearchFocused] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!refreshMsg) return
    const id = setTimeout(() => setRefreshMsg(null), 3000)
    return () => clearTimeout(id)
  }, [refreshMsg])

  function feedUrl(pg: number, sort: string, tag: string, q: string) {
    const tagParam = tag !== 'all' ? `&tags=${tag}` : ''
    const qParam   = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''
    return `/api/feed?page=${pg}&sort=${sort}${tagParam}${qParam}`
  }

  useEffect(() => {
    fetch('/api/feed/sparkline').then(r => r.ok ? r.json() : []).then(setSparkline)
  }, [])

  useEffect(() => {
    const savedSort = localStorage.getItem('feed-sort') ?? 'mixed'
    const savedTag  = localStorage.getItem('feed-tag')  ?? 'all'
    if (savedSort === 'mixed' && savedTag === 'all') return
    setActiveSort(savedSort)
    setActiveTag(savedTag)
    setLoading(true)
    fetch(feedUrl(1, savedSort, savedTag, ''))
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) { setItems(data); setPage(1); setHasMore(data.length >= 40) } })
      .finally(() => setLoading(false))
  }, [])

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
    localStorage.setItem('feed-sort', sort)
    setLoading(true); setPage(1)
    try {
      const r = await fetch(feedUrl(1, sort, activeTag, search))
      if (r.ok) { const data = await r.json(); setItems(data); setHasMore(data.length >= 40) }
    } finally { setLoading(false) }
  }

  async function changeTag(tag: string) {
    setActiveTag(tag)
    localStorage.setItem('feed-tag', tag)
    setLoading(true); setPage(1)
    try {
      const r = await fetch(feedUrl(1, activeSort, tag, search))
      if (r.ok) { const data = await r.json(); setItems(data); setHasMore(data.length >= 40) }
    } finally { setLoading(false) }
  }

  function onSearchChange(val: string) {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setLoading(true); setPage(1)
      try {
        const r = await fetch(feedUrl(1, activeSort, activeTag, val))
        if (r.ok) { const data = await r.json(); setItems(data); setHasMore(data.length >= 40) }
      } finally { setLoading(false) }
    }, 350)
  }

  async function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)
    try {
      const r = await fetch(feedUrl(nextPage, activeSort, activeTag, search))
      if (r.ok) {
        const data = await r.json()
        setItems(prev => [...prev, ...data])
        setPage(nextPage)
        setHasMore(data.length >= 40)
      }
    } finally { setLoadingMore(false) }
  }

  async function markRead(item: FeedItem) {
    if (readIds.has(item.id)) return
    setReadIds(p => new Set(p).add(item.id))
    fetch(`/api/feed/${item.id}/read`, { method: 'POST' })
    const category = item.topic_tags?.[0]
    if (category) {
      const src = item.source.startsWith('rss:') ? 'rss' : item.source
      fetch('/api/affinity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, source: src, type: 'read' }),
      })
    }
  }

  async function refresh() {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const r = await fetch('/api/feed/refresh', { method: 'POST' })
      if (r.ok) {
        const data = await r.json()
        setRefreshMsg(data.newItems > 0 ? `+${data.newItems} new` : 'Up to date')
        const fresh = await fetch(feedUrl(1, activeSort, activeTag, search))
        if (fresh.ok) { setItems(await fresh.json()); setPage(1) }
      }
    } finally { setRefreshing(false) }
  }

  const filtered = items.filter(i => {
    if (activeTag !== 'all' && !i.topic_tags.includes(activeTag)) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      return i.title.toLowerCase().includes(q)
        || (i.hook        ?? '').toLowerCase().includes(q)
        || (i.raw_content ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const tickerContent = items.slice(0, 24).map(i => i.title).join('   ·   ')

  return (
    <div>
      {/* ── Ticker ─────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'rgba(255,255,255,0.012)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8, padding: '6px 0', marginBottom: 16,
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 48, background: 'linear-gradient(to right, #05050e, transparent)', zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, background: 'linear-gradient(to left, #05050e, transparent)', zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ display: 'inline-flex', whiteSpace: 'nowrap', animation: 'ticker 55s linear infinite' }}>
          <span style={{ fontSize: 12, color: '#6060a0', fontWeight: 600, letterSpacing: '0.06em', paddingRight: 40 }}>{tickerContent}</span>
          <span style={{ fontSize: 12, color: '#6060a0', fontWeight: 600, letterSpacing: '0.06em', paddingRight: 40 }}>{tickerContent}</span>
        </div>
      </div>

      {/* ── Main grid: sidebar + feed ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <div style={{
          position: 'sticky', top: 16,
          background: 'rgba(255,255,255,0.016)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
            <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: '#5a5a8a', textTransform: 'uppercase', marginBottom: 6 }}>Sources</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px #34d399', animation: 'glow-pulse 2.2s ease-in-out infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#34d399', fontWeight: 700, letterSpacing: '0.1em' }}>
                LIVE · {items.length}
              </span>
            </div>
          </div>

          {/* Station rows */}
          {ALL_STATIONS.map(key => {
            const st     = STATION_CONFIG[key]
            const count  = stationCounts[key] ?? 0
            const active = count > 0
            return (
              <div key={key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                opacity: active ? 1 : 0.3,
                transition: 'opacity 0.3s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: active ? st.color : '#1a1a2a',
                    boxShadow: active ? `0 0 6px ${st.color}` : 'none',
                    transition: 'all 0.3s',
                  }} />
                  <div>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: active ? st.color : '#5a5a8a', letterSpacing: '0.08em' }}>
                      {st.label}
                    </span>
                    <span style={{ fontSize: 11, color: '#5a5a8a' }}>
                      {active ? `${count} items` : 'no signal'}
                    </span>
                  </div>
                </div>
                <EqBars color={st.color} active={active} />
              </div>
            )
          })}

          {/* Topic breakdown */}
          {topicFreq.length > 0 && (
            <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: '#5a5a8a', textTransform: 'uppercase', marginBottom: 10 }}>Topics</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topicFreq.map(({ tag, pct }) => {
                  const m = TOPIC_META[tag]
                  if (!m) return null
                  return (
                    <div key={tag}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: m.color, textTransform: 'capitalize', letterSpacing: '0.04em' }}>{tag}</span>
                        <span style={{ fontSize: 11, color: '#5a5a8a', fontFamily: 'monospace' }}>{Math.round(pct)}%</span>
                      </div>
                      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 1, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: m.color, opacity: 0.6, borderRadius: 1 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.itemsThisWeek != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#5a5a8a', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>This week</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#a78bfa' }}>{stats.itemsThisWeek}</span>
                </div>
              )}
              {stats.topTopic && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#5a5a8a', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Hot topic</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#fbbf24', textTransform: 'capitalize' }}>{stats.topTopic}</span>
                </div>
              )}
            </div>
          )}

          {/* Daily volume sparkline */}
          {sparkline.length > 0 && (
            <div style={{ padding: '10px 14px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: '#5a5a8a', textTransform: 'uppercase', marginBottom: 10 }}>Daily Volume</p>
              <SparkChart data={sparkline} />
            </div>
          )}
        </div>

        {/* ── Feed panel ──────────────────────────────────────── */}
        <div style={{
          background: 'rgba(255,255,255,0.016)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12, overflow: 'hidden',
        }}>

          {/* Toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px',
            background: 'rgba(0,0,0,0.2)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            flexWrap: 'wrap', gap: 8,
          }}>
            {/* Tag filters */}
            <div style={{ display: 'flex', gap: 4 }}>
              {TAG_LIST.map(tag => {
                const active = activeTag === tag
                const m      = TOPIC_META[tag]
                const color  = m?.color ?? '#a78bfa'
                const rgb    = m?.rgb   ?? '167,139,250'
                return (
                  <button key={tag} onClick={() => changeTag(tag)} style={{
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                    textTransform: 'capitalize',
                    padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                    background: active ? `rgba(${rgb},0.14)` : 'transparent',
                    color: active ? color : '#6060a0',
                    border: `1px solid ${active ? `rgba(${rgb},0.3)` : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}>
                    {tag === 'all' ? 'All' : tag}
                  </button>
                )
              })}
            </div>

            {/* Sort + refresh + count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {(loading || refreshing) && <span className="inline-block h-3 w-3 rounded-full border border-violet-500 border-t-transparent animate-spin" />}
              {refreshMsg && !refreshing && (
                <span style={{ fontSize: 12, color: '#34d399', fontWeight: 700 }}>{refreshMsg}</span>
              )}
              <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 3 }}>
                {SORT_LIST.map(s => (
                  <button key={s.key} onClick={() => changeSort(s.key)} style={{
                    fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                    background: activeSort === s.key ? 'rgba(167,139,250,0.18)' : 'transparent',
                    color: activeSort === s.key ? '#a78bfa' : '#6060a0',
                    border: 'none', transition: 'all 0.15s',
                  }}>
                    {s.label}
                  </button>
                ))}
              </div>
              <button
                onClick={refresh}
                disabled={refreshing}
                title="Fetch latest from all sources"
                style={{
                  fontSize: 14, lineHeight: 1, padding: '4px 8px', borderRadius: 6, cursor: refreshing ? 'not-allowed' : 'pointer',
                  background: 'transparent', color: refreshing ? '#4a4a6a' : '#6060a0',
                  border: '1px solid rgba(255,255,255,0.07)',
                  transition: 'all 0.15s', opacity: refreshing ? 0.5 : 1,
                }}
              >
                ⟳
              </button>
              <span style={{ fontSize: 12, color: '#5a5a8a', fontWeight: 600 }}>
                {filtered.length} items
              </span>
            </div>
          </div>

          {/* Search */}
          <div style={{
            padding: '8px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: 'rgba(0,0,0,0.1)',
          }}>
            <div style={{ position: 'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
                style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#4a4a6a', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => onSearchChange(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search titles and summaries…"
                suppressHydrationWarning
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: searchFocused ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${searchFocused || search ? 'rgba(124,106,255,0.38)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 8, padding: '6px 32px 6px 30px',
                  color: '#d0d0e8', fontSize: 13, outline: 'none',
                  transition: 'border-color 0.15s, background 0.15s',
                  boxShadow: searchFocused ? '0 0 0 3px rgba(124,106,255,0.1)' : 'none',
                }}
              />
              {search && (
                <button
                  onClick={() => onSearchChange('')}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#4a4a6a', fontSize: 16, lineHeight: 1, padding: 2,
                  }}
                >×</button>
              )}
            </div>
          </div>

          {/* Feed rows */}
          {filtered.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <p style={{ color: '#5a5a8a', fontSize: 14 }}>
                {search.trim()
                  ? `No results for "${search.trim()}"`
                  : activeTag !== 'all'
                  ? `No ${activeTag} items — try a different filter`
                  : 'No items yet — check back after the first fetch'}
              </p>
            </div>
          ) : (
            <div style={{ maxHeight: '76vh', overflowY: 'auto' }}>
              {filtered.map((item) => {

                const isRead   = readIds.has(item.id) || item.is_read === 1
                const src      = stationMeta(item.source)
                const tag      = item.topic_tags[0]
                const topicM   = TOPIC_META[tag] ?? { color: '#5a5a8a', rgb: '90,90,138' }
                const vel      = item.velocity_score ?? 0
                const expanded = expandedId === item.id
                const accentColor = priorityColor(vel)

                return (
                  <div
                    key={item.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      borderLeft: `3px solid ${isRead ? 'transparent' : accentColor}`,
                      opacity: isRead ? 0.3 : 1,
                      background: expanded ? `rgba(${src.rgb},0.04)` : 'transparent',
                      transition: 'opacity 0.2s, background 0.2s, border-color 0.2s',
                    }}
                  >
                    {/* Row */}
                    <div
                      onClick={() => { setExpandedId(item.id); markRead(item) }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '64px 1fr 48px',
                        gap: 14,
                        padding: '14px 16px 14px 13px',
                        cursor: 'pointer',
                        alignItems: 'start',
                      }}
                      onMouseEnter={e => {
                        if (!isRead) (e.currentTarget as HTMLElement).style.background = `rgba(${src.rgb},0.035)`
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.background = 'transparent'
                      }}
                    >
                      {/* Source + time */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, paddingTop: 2 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 900, letterSpacing: '0.1em',
                          color: src.color,
                          background: `rgba(${src.rgb},0.12)`,
                          border: `1px solid rgba(${src.rgb},0.25)`,
                          borderRadius: 5, padding: '3px 7px',
                          whiteSpace: 'nowrap',
                        }}>
                          {src.code}
                        </span>
                        <span style={{ fontSize: 11, color: '#5a5a8a', whiteSpace: 'nowrap' }}>
                          {relTime(item.published_at)}
                        </span>
                      </div>

                      {/* Main content */}
                      <div style={{ minWidth: 0 }}>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{
                            fontSize: 14, fontWeight: 700, lineHeight: 1.45,
                            color: isRead ? '#5a5a8a' : '#d0d0e8',
                            textDecoration: 'none',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            transition: 'color 0.15s',
                          } as React.CSSProperties}
                          onMouseEnter={e => { if (!isRead) (e.currentTarget as HTMLElement).style.color = '#ffffff' }}
                          onMouseLeave={e => { if (!isRead) (e.currentTarget as HTMLElement).style.color = '#d0d0e8' }}
                        >
                          {item.title}
                        </a>

                        {item.hook && !isRead && (
                          <p style={{
                            fontSize: 12, lineHeight: 1.5, margin: '5px 0 0',
                            color: `rgba(${src.rgb},0.9)`,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {item.hook}
                          </p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                          {tag && (
                            <span style={{
                              fontSize: 11, fontWeight: 700, color: topicM.color,
                              background: `rgba(${topicM.rgb},0.1)`,
                              border: `1px solid rgba(${topicM.rgb},0.2)`,
                              borderRadius: 4, padding: '1px 7px',
                              textTransform: 'capitalize', letterSpacing: '0.03em',
                            }}>
                              {tag}
                            </span>
                          )}
                          {item.raw_content && !expanded && (
                            <span style={{ fontSize: 11, color: '#5a5a8a' }}>
                              ▾ summary
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Velocity */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', paddingTop: 4 }}>
                        {vel > 0 && <VelBar score={vel} />}
                      </div>
                    </div>

                    {/* Expanded summary */}
                    {expanded && item.raw_content && (
                      <div className="fade-up" style={{ padding: '0 16px 16px', paddingLeft: 91 }}>
                        <div style={{
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 8, overflow: 'hidden',
                        }}>
                          <p style={{
                            fontSize: 13, color: '#b8b8d4', lineHeight: 1.8,
                            padding: '12px 16px', margin: 0,
                          }}>
                            {item.raw_content.slice(0, 400)}{item.raw_content.length > 400 ? '…' : ''}
                          </p>
                          <div style={{
                            borderTop: '1px solid rgba(255,255,255,0.05)',
                            padding: '8px 12px', display: 'flex', justifyContent: 'flex-end',
                          }}>
                            <button
                              onClick={e => { e.stopPropagation(); setExpandedId(null) }}
                              style={{
                                fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                                color: '#5a5a8a', background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 5, padding: '4px 10px',
                                cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s',
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLButtonElement).style.color = '#c0c0e0'
                                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.18)'
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLButtonElement).style.color = '#5a5a8a'
                                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'
                              }}
                            >
                              ▴ Collapse
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Load more */}
              {hasMore && (
                <div style={{ padding: '16px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{
                      fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
                      color: loadingMore ? '#4a4a6a' : '#7c6aff',
                      background: 'rgba(124,106,255,0.07)',
                      border: '1px solid rgba(124,106,255,0.18)',
                      borderRadius: 8, padding: '8px 20px',
                      cursor: loadingMore ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      transition: 'all 0.15s',
                    }}
                  >
                    {loadingMore && <span className="inline-block h-3 w-3 rounded-full border border-violet-500 border-t-transparent animate-spin" />}
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
