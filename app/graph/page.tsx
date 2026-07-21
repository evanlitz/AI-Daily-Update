'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

// next/dynamic's wrapper type doesn't preserve ref-forwarding for a plain
// class-component default export, so `ref` on the JSX below fails to
// type-check even though it works fine at runtime — cast to `any` here
// rather than fighting dynamic()'s generic inference.
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false }) as any

interface GNode {
  id: string
  type: string
  label: string
  url?: string
  [key: string]: unknown
}

interface GLink {
  source: string
  target: string
  edgeType: string
  weight: number
  label: string | null
  [key: string]: unknown
}

interface GraphResponse {
  nodes: GNode[]
  edges: GLink[]
}

const NODE_META: Record<string, { label: string; color: string }> = {
  entity: { label: 'Entity', color: '#60a5fa' },
  story_thread: { label: 'Story Thread', color: '#f97316' },
  prediction: { label: 'Prediction', color: '#f59e0b' },
  ai_model: { label: 'AI Model', color: '#06b6d4' },
  tech_radar: { label: 'Radar Tool', color: '#22c55e' },
  feed_item: { label: 'Feed Item', color: '#71717a' },
}

const NODE_TYPES = ['entity', 'story_thread', 'prediction', 'ai_model', 'tech_radar']

const EDGE_META: Record<string, { label: string; color: string; dash: number[] | null }> = {
  evidence_for: { label: 'Evidence for', color: '#f59e0b', dash: null },
  co_mentioned: { label: 'Co-mentioned', color: '#60a5fa', dash: null },
  mentions: { label: 'Mentions', color: '#22c55e', dash: [2, 3] },
  introduced_by: { label: 'Introduced by', color: '#06b6d4', dash: null },
  supersedes: { label: 'Supersedes', color: '#06b6d4', dash: [6, 3] },
  entity_mention: { label: 'Entity mention (high volume)', color: '#71717a', dash: [1, 4] },
  thread_relation: { label: 'Thread relation', color: '#f97316', dash: [4, 4] },
}

const EDGE_TYPES = Object.keys(EDGE_META)

const SELECTED_COLOR = '#ef4444'
const DIMMED_COLOR = 'rgba(113,113,122,0.15)'

function nodeRawId(n: GNode): string {
  return n.id.slice(n.type.length + 1)
}

const TYPE_ROUTE: Record<string, (n: GNode) => { href: string; label: string; external?: boolean } | null> = {
  entity: n => ({ href: `/entities/${nodeRawId(n)}`, label: 'Open entity' }),
  feed_item: n => (n.url ? { href: n.url, label: 'Open source ↗', external: true } : null),
  story_thread: () => ({ href: '/stories', label: 'Open Stories (no per-thread page yet)' }),
  prediction: () => ({ href: '/predictions', label: 'Open Predictions (no per-item page yet)' }),
  ai_model: () => ({ href: '/models', label: 'Open Models (no per-model page yet)' }),
  tech_radar: () => ({ href: '/radar', label: 'Open Radar (no per-item page yet)' }),
}

export default function GraphPage() {
  const [data, setData] = useState<GraphResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [showFeedItems, setShowFeedItems] = useState(false)
  const [hideIsolated, setHideIsolated] = useState(true)
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
  const [hiddenEdgeTypes, setHiddenEdgeTypes] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<GNode | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<any>(null)
  const [dims, setDims] = useState({ width: 800, height: 600 })

  useEffect(() => {
    fetch('/api/graph')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) setDims({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toggleType = useCallback((t: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }, [])

  const toggleEdgeType = useCallback((t: string) => {
    setHiddenEdgeTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }, [])

  const filtered = useMemo(() => {
    if (!data) return { nodes: [] as GNode[], links: [] as GLink[] }
    const nodeAllowed = (n: GNode) => !hiddenTypes.has(n.type) && (n.type !== 'feed_item' || showFeedItems)
    const visibleIds = new Set(data.nodes.filter(nodeAllowed).map(n => n.id))
    const links = data.edges
      .filter(e => !hiddenEdgeTypes.has(e.edgeType))
      .filter(e => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map(e => ({ ...e }))

    // Hiding feed_item nodes (default) also drops every entity_mention/mentions
    // edge, since both terminate at feed_item — that leaves most entities and
    // radar tools with zero remaining edges. Without this, they'd render as a
    // field of disconnected dots rather than being dropped from view like the
    // feed_item nodes that orphaned them.
    let nodes = data.nodes.filter(nodeAllowed)
    if (hideIsolated) {
      const connected = new Set<string>()
      for (const l of links) { connected.add(l.source); connected.add(l.target) }
      nodes = nodes.filter(n => connected.has(n.id))
    }
    return { nodes: nodes.map(n => ({ ...n })), links }
  }, [data, hiddenTypes, hiddenEdgeTypes, showFeedItems, hideIsolated])

  const degree = useMemo(() => {
    const d = new Map<string, number>()
    for (const l of filtered.links) {
      d.set(l.source, (d.get(l.source) ?? 0) + 1)
      d.set(l.target, (d.get(l.target) ?? 0) + 1)
    }
    return d
  }, [filtered])

  const matchIds = useMemo(() => {
    if (!search.trim()) return null
    const q = search.trim().toLowerCase()
    return new Set(filtered.nodes.filter(n => n.label.toLowerCase().includes(q)).map(n => n.id))
  }, [search, filtered.nodes])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    if (data) for (const n of data.nodes) counts[n.type] = (counts[n.type] ?? 0) + 1
    return counts
  }, [data])

  const selectedRoute = selected ? TYPE_ROUTE[selected.type]?.(selected) ?? null : null

  return (
    <main className="mx-auto max-w-screen-2xl px-4 sm:px-10 py-8">
      <div className="mb-8">
        <p className="eyebrow mb-2">Intelligence · Relationship Graph</p>
        <h1 style={{
          fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em',
          background: 'linear-gradient(135deg, #f4f4f5 30%, #71717a 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Graph</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>
          Every entity, thread, prediction, model, and radar tool in the app, and how they connect — pulled from graph_edges, entity_mentions, and thread_relations.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 rounded-full border border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : !data || data.nodes.length === 0 ? (
        <p style={{ color: 'var(--muted)', padding: '40px 0', textAlign: 'center' }}>No graph data found.</p>
      ) : (
        <>
        <div className="sm:hidden mb-3">
          <button
            onClick={() => setMobileFiltersOpen(v => !v)}
            className="flex items-center justify-between w-full"
            style={{
              fontSize: 12.5, fontWeight: 700, padding: '9px 14px', borderRadius: 8,
              background: 'var(--surface)', border: '1px solid var(--border)', color: '#e4e4e7',
            }}
          >
            <span>Filters</span>
            <span style={{ color: 'var(--muted)' }}>{filtered.nodes.length} nodes · {mobileFiltersOpen ? '▲' : '▼'}</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 h-[65vh] sm:h-[calc(100vh-260px)]" style={{ minHeight: 420 }}>
          {/* Filter sidebar */}
          <div
            className={`${mobileFiltersOpen ? 'flex' : 'hidden'} sm:flex flex-col gap-4 overflow-y-auto`}
            style={{
              width: 260, flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16,
              maxHeight: mobileFiltersOpen ? '50vh' : undefined,
            }}
          >
            <div>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search nodes…"
                style={{
                  width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 6,
                  background: 'var(--surface-2)', border: '1px solid var(--border-2)', color: '#e4e4e7',
                }}
              />
            </div>

            <label className="flex items-center gap-2" style={{ fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={showFeedItems} onChange={() => setShowFeedItems(v => !v)} />
              <span>Show feed items ({typeCounts.feed_item ?? 0})</span>
            </label>
            <label className="flex items-center gap-2" style={{ fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={hideIsolated} onChange={() => setHideIsolated(v => !v)} />
              <span>Hide isolated nodes</span>
            </label>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Node types</p>
              <div className="flex flex-col gap-1.5">
                {NODE_TYPES.map(t => (
                  <label key={t} className="flex items-center gap-2" style={{ fontSize: 12.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!hiddenTypes.has(t)} onChange={() => toggleType(t)} />
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: NODE_META[t].color, flexShrink: 0 }} />
                    <span>{NODE_META[t].label} ({typeCounts[t] ?? 0})</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Edge types</p>
              <div className="flex flex-col gap-1.5">
                {EDGE_TYPES.map(t => (
                  <label key={t} className="flex items-center gap-2" style={{ fontSize: 12.5, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!hiddenEdgeTypes.has(t)} onChange={() => toggleEdgeType(t)} />
                    <span style={{ width: 14, height: 0, borderTop: `2px ${EDGE_META[t].dash ? 'dashed' : 'solid'} ${EDGE_META[t].color}`, flexShrink: 0 }} />
                    <span>{EDGE_META[t].label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 'auto', fontSize: 11.5, color: 'var(--muted)', borderTop: '1px solid var(--border-2)', paddingTop: 10 }}>
              {filtered.nodes.length} nodes · {filtered.links.length} edges shown
            </div>
          </div>

          {/* Canvas */}
          <div ref={containerRef} style={{ flex: 1, position: 'relative', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <ForceGraph2D
              ref={graphRef}
              graphData={filtered}
              width={dims.width}
              height={dims.height}
              nodeId="id"
              nodeLabel={(n: GNode) => `${n.label} (${NODE_META[n.type]?.label ?? n.type})`}
              nodeVal={(n: GNode) => Math.min(1 + Math.sqrt(degree.get(n.id) ?? 0), 14)}
              nodeColor={(n: GNode) => {
                if (matchIds && !matchIds.has(n.id)) return DIMMED_COLOR
                if (selected?.id === n.id) return SELECTED_COLOR
                return NODE_META[n.type]?.color ?? '#71717a'
              }}
              linkColor={(l: GLink) => EDGE_META[l.edgeType]?.color ?? 'rgba(255,255,255,0.15)'}
              linkWidth={(l: GLink) => 0.5 + Math.min(l.weight, 3) * 0.8}
              linkLineDash={(l: GLink) => EDGE_META[l.edgeType]?.dash ?? null}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              cooldownTicks={100}
              onEngineStop={() => graphRef.current?.zoomToFit?.(400, 60)}
              onNodeClick={(n: GNode) => setSelected(n)}
              onBackgroundClick={() => setSelected(null)}
            />

            {/* Selected node side panel */}
            {selected && (
              <div
                style={{
                  position: 'absolute', top: 12, right: 12, width: 260, maxWidth: 'calc(100% - 24px)',
                  background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10,
                  padding: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                }}
              >
                <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
                  <span style={{
                    fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: NODE_META[selected.type]?.color ?? '#71717a',
                  }}>
                    {NODE_META[selected.type]?.label ?? selected.type}
                  </span>
                  <button onClick={() => setSelected(null)} style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1 }}>×</button>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7', marginBottom: 6, wordBreak: 'break-word' }}>{selected.label}</p>
                <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 10 }}>{degree.get(selected.id) ?? 0} connection{(degree.get(selected.id) ?? 0) !== 1 ? 's' : ''}</p>
                {selectedRoute && (
                  selectedRoute.external ? (
                    <a href={selectedRoute.href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>
                      {selectedRoute.label}
                    </a>
                  ) : (
                    <Link href={selectedRoute.href} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)' }}>
                      {selectedRoute.label}
                    </Link>
                  )
                )}
              </div>
            )}
          </div>
        </div>
        </>
      )}
    </main>
  )
}
