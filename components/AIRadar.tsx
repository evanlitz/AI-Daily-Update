'use client'

import { useState } from 'react'
import type { TechRadarItem } from '@/lib/types'

const QUADRANTS = [
  {
    key: 'adopt',
    label: 'Adopt',
    subtitle: 'Deploy now',
    color: '#34d399',
    rgb: '52,211,153',
    rank: 1,
  },
  {
    key: 'trial',
    label: 'Trial',
    subtitle: 'Hands-on test',
    color: '#60a5fa',
    rgb: '96,165,250',
    rank: 2,
  },
  {
    key: 'assess',
    label: 'Assess',
    subtitle: 'Watch closely',
    color: '#fbbf24',
    rgb: '251,191,36',
    rank: 3,
  },
  {
    key: 'hold',
    label: 'Hold',
    subtitle: 'Not yet',
    color: '#f87171',
    rgb: '248,113,113',
    rank: 4,
  },
] as const

const CATEGORIES = ['all', 'model', 'tool', 'framework', 'technique', 'infra']
const CAT_LABELS: Record<string, string> = {
  all: 'All', model: 'Models', tool: 'Tools',
  framework: 'Frameworks', technique: 'Techniques', infra: 'Infra',
}

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return '100,100,100'
  return m.map(x => parseInt(x, 16)).join(',')
}

function ItemRow({ item, q }: { item: TechRadarItem; q: typeof QUADRANTS[number] }) {
  const [open, setOpen] = useState(false)

  return (
    <button
      onClick={() => setOpen(!open)}
      className="w-full text-left transition-all duration-150"
      style={{
        background: open ? `rgba(${q.rgb},0.07)` : 'transparent',
        border: `1px solid ${open ? `rgba(${q.rgb},0.2)` : 'rgba(255,255,255,0.04)'}`,
        borderRadius: 10,
        padding: '8px 10px',
        marginBottom: 4,
      }}
    >
      <div className="flex items-center gap-2">
        <div
          style={{
            width: 5, height: 5, borderRadius: '50%',
            background: q.color, flexShrink: 0,
            boxShadow: `0 0 6px ${q.color}`,
          }}
        />
        <span style={{ color: '#c8c8e0', fontSize: 12, fontWeight: 600, flex: 1 }}>
          {item.name}
        </span>
        <span
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: '#3d3d5a', padding: '1px 6px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 4,
          }}
        >
          {item.category}
        </span>
      </div>
      {open && item.rationale && (
        <p
          className="mt-2 leading-relaxed"
          style={{ color: '#5a5a7a', fontSize: 11, paddingLeft: 13 }}
        >
          {item.rationale}
        </p>
      )}
    </button>
  )
}

export function AIRadar({
  radarItems,
  total,
}: {
  radarItems: Record<string, TechRadarItem[]>
  total: number
}) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const [items, setItems] = useState(radarItems)
  const [localTotal, setLocalTotal] = useState(total)

  function filterItems(list: TechRadarItem[]) {
    if (activeCategory === 'all') return list
    return list.filter(i => i.category === activeCategory)
  }

  async function scan() {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch('/api/radar/scan', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setScanResult(`${data.total} signals classified`)
        setLocalTotal(data.total)
        const fresh = await fetch('/api/radar')
        if (fresh.ok) {
          const freshData = await fresh.json()
          setItems(freshData.grouped)
        }
      }
    } catch {
      setScanResult('Scan failed')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="transition-all duration-150"
                style={{
                  background: active ? 'rgba(124,106,255,0.12)' : 'transparent',
                  color: active ? '#a78bfa' : '#3d3d5a',
                  border: `1px solid ${active ? 'rgba(124,106,255,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: 8,
                  padding: '5px 10px',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {CAT_LABELS[cat]}
              </button>
            )
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {scanResult && (
            <span style={{ color: '#34d399', fontSize: 11 }}>{scanResult}</span>
          )}
          <button
            onClick={scan}
            disabled={scanning}
            className="flex items-center gap-2 transition-all disabled:opacity-40"
            style={{
              background: 'rgba(124,106,255,0.08)',
              color: '#7c6aff',
              border: '1px solid rgba(124,106,255,0.2)',
              borderRadius: 10,
              padding: '6px 12px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {scanning ? (
              <>
                <span className="inline-block h-3 w-3 rounded-full border border-violet-500 border-t-transparent animate-spin" />
                Scanning
              </>
            ) : '⟳ Scan Feed'}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {localTotal === 0 && !scanning && (
        <div
          className="flex flex-col items-center justify-center py-20 text-center rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="eyebrow mb-3">Radar empty</p>
          <p style={{ color: '#3d3d5a', fontSize: 13 }} className="mb-6 max-w-sm">
            Scan the feed to auto-classify tools and models. Takes ~15 seconds.
          </p>
          <button
            onClick={scan}
            style={{
              background: 'rgba(124,106,255,0.15)',
              color: '#a78bfa',
              border: '1px solid rgba(124,106,255,0.3)',
              borderRadius: 12,
              padding: '10px 20px',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Scan now →
          </button>
        </div>
      )}

      {/* Quadrant grid */}
      {localTotal > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {QUADRANTS.map(q => {
            const filtered = filterItems(items[q.key] ?? [])
            return (
              <div
                key={q.key}
                className="relative overflow-hidden rounded-2xl"
                style={{
                  background: `rgba(${q.rgb},0.028)`,
                  border: `1px solid rgba(${q.rgb},0.1)`,
                  padding: '18px 16px',
                }}
              >
                {/* Faded quadrant label watermark */}
                <div
                  className="absolute right-3 top-3 font-black select-none pointer-events-none"
                  style={{
                    fontSize: 56,
                    color: q.color,
                    opacity: 0.04,
                    lineHeight: 1,
                    letterSpacing: '-0.04em',
                  }}
                >
                  {q.label.toUpperCase()}
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <div
                        style={{
                          width: 8, height: 8, borderRadius: 2,
                          background: q.color,
                          boxShadow: `0 0 8px ${q.color}`,
                        }}
                      />
                      <span style={{ color: q.color, fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        {q.label}
                      </span>
                    </div>
                    <p style={{ color: '#3d3d5a', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', paddingLeft: 14 }}>
                      {q.subtitle}
                    </p>
                  </div>
                  <span
                    style={{
                      background: `rgba(${q.rgb},0.1)`,
                      color: q.color,
                      border: `1px solid rgba(${q.rgb},0.2)`,
                      borderRadius: 8,
                      padding: '2px 8px',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {filtered.length}
                  </span>
                </div>

                {/* Items */}
                {filtered.length === 0 ? (
                  <p style={{ color: '#2a2a3e', fontSize: 11, fontStyle: 'italic' }}>
                    {activeCategory === 'all' ? 'Nothing here yet' : `No ${activeCategory}s`}
                  </p>
                ) : (
                  <div>
                    {filtered.map(item => (
                      <ItemRow key={item.id} item={item} q={q} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
