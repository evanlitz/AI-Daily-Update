'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import type { FeedItem } from '@/lib/types'
import { relTime } from '@/lib/utils'
import { useIsMobile } from '@/hooks/useIsMobile'

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
  rss:         { code: 'RSS·', label: 'RSS',          color: '#22c55e', rgb: '34,197,94'   },
  youtube:     { code: 'YT··', label: 'YouTube',     color: '#a78bfa', rgb: '167,139,250' },
}

const ALL_STATIONS = ['arxiv', 'hn', 'github', 'huggingface', 'rss', 'youtube']

const TOPIC_META: Record<string, { color: string; rgb: string }> = {
  models:   { color: '#a78bfa', rgb: '167,139,250' },
  tools:    { color: '#fb923c', rgb: '251,146,60'  },
  research: { color: '#60a5fa', rgb: '96,165,250'  },
  industry: { color: '#22c55e', rgb: '34,197,94'   },
}

const TAG_LIST  = ['all', 'models', 'tools', 'research', 'industry']
const SORT_LIST = [
  { key: 'mixed',    label: 'Mixed'  },
  { key: 'recent',   label: 'Latest' },
  { key: 'velocity', label: 'Top'    },
]

// ── Helpers ────────────────────────────────────────────────────────────────

function stationMeta(source: string) {
  if (source in STATION_CONFIG)       return STATION_CONFIG[source]
  if (source.startsWith('rss:'))      return STATION_CONFIG.rss
  if (source.startsWith('youtube:'))  return STATION_CONFIG.youtube
  return { code: source.slice(0, 4).toUpperCase(), label: source, color: '#60a5fa', rgb: '96,165,250' }
}

function srcKey(source: string): string {
  if (source.startsWith('rss:'))     return 'rss'
  if (source.startsWith('youtube:')) return 'youtube'
  return source
}

function priorityColor(vel: number): string {
  if (vel >= 2.0) return '#f87171'
  if (vel >= 0.8) return '#fbbf24'
  if (vel >= 0.1) return '#3b82f6'
  return 'transparent'
}

function isRecent(publishedAt?: string): boolean {
  if (!publishedAt) return false
  return Date.now() - new Date(publishedAt).getTime() < 2 * 60 * 60 * 1000
}

// ── Source logo icons (inline SVG — brand-accurate marks) ─────────────────

function SourceIcon({ source, size = 18 }: { source: string; size?: number }) {
  const s = size
  switch (source) {
    case 'github': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
      </svg>
    )
    case 'youtube': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    )
    case 'rss': return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
        <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
      </svg>
    )
    case 'arxiv': return (
      // Document icon — conveys "preprint paper"
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/>
        <line x1="9" y1="17" x2="12" y2="17"/>
      </svg>
    )
    case 'hn': return (
      // Y-combinator Y mark in a rounded box
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
        <rect x="1.5" y="1.5" width="21" height="21" rx="4" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M7 7L12 14L17 7M12 14V18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
    case 'huggingface': return (
      // Simplified smiley face — HF's brand shape
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="9.5"/>
        <circle cx="9" cy="10.5" r="1" fill="currentColor" stroke="none"/>
        <circle cx="15" cy="10.5" r="1" fill="currentColor" stroke="none"/>
        <path d="M8.5 15.5 Q12 18.5 15.5 15.5" strokeLinejoin="round"/>
      </svg>
    )
    default: return (
      <span style={{ fontSize: s * 0.55, fontWeight: 800, letterSpacing: '0.04em', flexShrink: 0 }}>
        {source.slice(0, 2).toUpperCase()}
      </span>
    )
  }
}

// ── Source logo toggle bar ─────────────────────────────────────────────────

function SourceToggleBar({
  stations,
  activeSources,
  onToggle,
  onClear,
  counts,
}: {
  stations: string[]
  activeSources: Set<string>
  onToggle: (key: string) => void
  onClear: () => void
  counts: Record<string, number>
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 10, padding: '10px 16px',
      marginBottom: 16, flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
        color: '#52525b', textTransform: 'uppercase',
        paddingRight: 12, borderRight: '1px solid rgba(255,255,255,0.07)',
        marginRight: 2, whiteSpace: 'nowrap', flexShrink: 0,
      }}>
        Sources
      </span>

      {stations.map(key => {
        const st       = STATION_CONFIG[key]
        const count    = counts[key] ?? 0
        const selected = activeSources.has(key)
        const dimmed   = activeSources.size > 0 && !selected
        return (
          <button
            key={key}
            onClick={() => count > 0 && onToggle(key)}
            title={`${st.label} · ${count} items`}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 13px', borderRadius: 8,
              cursor: count === 0 ? 'default' : 'pointer',
              background: selected
                ? `rgba(${st.rgb},0.13)`
                : 'rgba(255,255,255,0.03)',
              border: `1px solid ${selected
                ? `rgba(${st.rgb},0.32)`
                : 'rgba(255,255,255,0.07)'}`,
              color: dimmed ? '#3f3f46' : st.color,
              boxShadow: selected ? `0 0 0 3px rgba(${st.rgb},0.07)` : 'none',
              opacity: count === 0 ? 0.22 : 1,
              transition: 'all 0.15s',
            }}
          >
            <SourceIcon source={key} size={15} />
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: 'inherit' }}>
              {st.label}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: dimmed ? '#3f3f46' : `rgba(${st.rgb},0.65)`,
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 4, padding: '1px 5px',
              transition: 'color 0.15s',
            }}>
              {count}
            </span>
          </button>
        )
      })}

      {activeSources.size > 0 && (
        <button
          onClick={onClear}
          style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
            color: '#71717a', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '5px 11px',
            cursor: 'pointer', marginLeft: 'auto',
            transition: 'color 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.color = '#e4e4e7'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.18)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.color = '#71717a'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'
          }}
        >
          Clear
        </button>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

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
              background: isToday ? '#3b82f6' : 'rgba(255,255,255,0.08)',
              cursor: 'default',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
        {data.map(({ label, isToday }) => (
          <span key={label} style={{
            flex: 1, textAlign: 'center',
            fontSize: 8, fontWeight: isToday ? 700 : 500,
            color: isToday ? '#60a5fa' : '#3f3f46',
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
  const color  = score >= 2 ? '#f87171' : score >= 0.8 ? '#fbbf24' : '#3b82f6'
  return (
    <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', flexShrink: 0 }}>
      {Array.from({ length: segs }, (_, i) => (
        <div key={i} style={{
          width: 3,
          height: 5 + i * 1.8,
          borderRadius: 1,
          background: i < filled ? color : '#1c1c1f',
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

function SummaryBullets({ summary }: { summary: string }) {
  const lines = summary.split('\n').map(l => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lines.map((line, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ color: '#60a5fa', fontSize: 12, lineHeight: 1.7, flexShrink: 0, marginTop: 1 }}>▸</span>
          <span style={{ fontSize: 14, color: '#d4d4d8', lineHeight: 1.7 }}>{line}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Reading drawer ─────────────────────────────────────────────────────────

function ReadingDrawer({
  item, onClose, onPrev, onNext, hasPrev, hasNext, isMobile,
}: {
  item: FeedItem; onClose: () => void
  onPrev: () => void; onNext: () => void
  hasPrev: boolean; hasNext: boolean
  isMobile: boolean
}) {
  const src    = stationMeta(item.source)
  const sk     = srcKey(item.source)
  const tag    = item.topic_tags[0]
  const topicM = TOPIC_META[tag] ?? { color: '#71717a', rgb: '113,113,122' }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 49,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
        } as React.CSSProperties}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        ...(isMobile
          ? { inset: 0 }
          : { right: 0, top: 0, bottom: 0, width: 360, borderLeft: `1px solid rgba(${src.rgb},0.2)` }
        ),
        background: '#0d0d10',
        zIndex: isMobile ? 51 : 50, display: 'flex', flexDirection: 'column',
        animation: 'drawer-slide-in 0.2s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 16px', flexShrink: 0,
          borderBottom: `1px solid rgba(${src.rgb},0.12)`,
          background: `rgba(${src.rgb},0.05)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ color: src.color }}><SourceIcon source={sk} size={13} /></div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', color: src.color, textTransform: 'uppercase' }}>
              {src.label}
            </span>
            {tag && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: topicM.color,
                background: `rgba(${topicM.rgb},0.1)`, border: `1px solid rgba(${topicM.rgb},0.2)`,
                borderRadius: 3, padding: '1px 6px', textTransform: 'capitalize',
              }}>{tag}</span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              width: isMobile ? 44 : 26, height: isMobile ? 44 : 26,
              borderRadius: isMobile ? 10 : 6, cursor: 'pointer',
              background: 'none', border: '1px solid rgba(255,255,255,0.08)',
              color: '#71717a', fontSize: isMobile ? 20 : 16, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.color = '#e4e4e7'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.color = '#71717a'
              ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'
            }}
          >×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 20px 16px' }}>
          <a
            href={item.url} target="_blank" rel="noopener noreferrer"
            style={{
              display: 'block', fontSize: 20, fontWeight: 800, lineHeight: 1.32,
              color: '#f4f4f5', textDecoration: 'none', letterSpacing: '-0.02em',
              marginBottom: 18, transition: 'color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ffffff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#f4f4f5' }}
          >
            {item.title}
          </a>

          {item.hook && (
            <div style={{ borderLeft: `3px solid ${src.color}`, paddingLeft: 14, marginBottom: 22 }}>
              <p style={{ fontSize: 14, lineHeight: 1.72, margin: 0, color: `rgba(${src.rgb},0.88)`, fontStyle: 'italic' }}>
                {item.hook}
              </p>
            </div>
          )}

          {item.summary && (
            <div style={{ marginBottom: 22 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#60a5fa', textTransform: 'uppercase', marginBottom: 10 }}>
                Key Takeaways
              </p>
              <SummaryBullets summary={item.summary} />
            </div>
          )}

          {!item.summary && item.raw_content && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#52525b', textTransform: 'uppercase', marginBottom: 10 }}>
                Excerpt
              </p>
              <p style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.8, margin: 0 }}>
                {item.raw_content.slice(0, 700)}{item.raw_content.length > 700 ? '…' : ''}
              </p>
            </div>
          )}

          {item.published_at && (
            <p style={{ fontSize: 11, color: '#3f3f46', marginTop: 20 }}>
              {new Date(item.published_at).toLocaleString()}
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)', padding: '11px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, background: 'rgba(0,0,0,0.25)',
        }}>
          <a
            href={item.url} target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
              color: src.color, textDecoration: 'none',
              padding: isMobile ? '11px 18px' : '6px 14px',
              background: `rgba(${src.rgb},0.1)`, border: `1px solid rgba(${src.rgb},0.22)`,
              borderRadius: 7, display: 'inline-flex', alignItems: 'center',
            }}
          >
            Open ↗
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={onPrev} disabled={!hasPrev} title="Previous (k)"
              style={{
                width: isMobile ? 44 : 26, height: isMobile ? 44 : 26,
                borderRadius: 5, cursor: hasPrev ? 'pointer' : 'default',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
                color: hasPrev ? '#71717a' : '#3f3f46',
                fontSize: isMobile ? 16 : 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >↑</button>
            <button onClick={onNext} disabled={!hasNext} title="Next (j)"
              style={{
                width: isMobile ? 44 : 26, height: isMobile ? 44 : 26,
                borderRadius: 5, cursor: hasNext ? 'pointer' : 'default',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
                color: hasNext ? '#71717a' : '#3f3f46',
                fontSize: isMobile ? 16 : 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >↓</button>
            {!isMobile && <span style={{ fontSize: 10, color: '#3f3f46', marginLeft: 2, letterSpacing: '0.05em' }}>j / k · esc</span>}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Feed card (Broadsheet layout) ─────────────────────────────────────────

function FeedCard({
  item,
  isRead,
  expanded,
  onExpand,
  onRead,
}: {
  item: FeedItem
  isRead: boolean
  expanded: boolean
  onExpand: () => void
  onRead: () => void
}) {
  const src    = stationMeta(item.source)
  const sk     = srcKey(item.source)
  const tag    = item.topic_tags[0]
  const topicM = TOPIC_META[tag] ?? { color: '#71717a', rgb: '113,113,122' }
  const vel    = item.velocity_score ?? 0

  // Compact horizontal card — items with no hook and no raw content
  if (!item.hook && !item.raw_content) {
    return (
      <div
        onClick={() => { window.open(item.url, '_blank', 'noopener,noreferrer'); onRead() }}
        data-feed-id={item.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 13px',
          borderRadius: 9,
          background: isRead ? 'rgba(255,255,255,0.015)' : 'var(--surface)',
          border: `1px solid ${isRead ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.07)'}`,
          borderLeft: `3px solid ${expanded ? src.color : isRead ? 'rgba(255,255,255,0.06)' : src.color}`,
          boxShadow: expanded ? `0 0 0 2px rgba(${src.rgb},0.3)` : 'none',
          cursor: 'pointer',
          minHeight: 44,
          transition: 'background 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => {
          if (!isRead) {
            const el = e.currentTarget as HTMLElement
            el.style.background = `rgba(${src.rgb},0.04)`
            el.style.boxShadow = `0 0 0 1px rgba(${src.rgb},0.14)`
          }
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement
          el.style.background = isRead ? 'rgba(255,255,255,0.015)' : 'var(--surface)'
          el.style.boxShadow = 'none'
        }}
      >
        <div style={{ color: isRead ? '#3f3f46' : src.color, flexShrink: 0 }}>
          <SourceIcon source={sk} size={13} />
        </div>
        {isRecent(item.published_at) && !isRead && (
          <div style={{ position: 'relative', width: 6, height: 6, flexShrink: 0 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            <div className="ping-slow" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e' }} />
          </div>
        )}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1, minWidth: 0,
            fontSize: 14, fontWeight: 600, lineHeight: 1.4,
            color: isRead ? '#52525b' : '#d4d4d8',
            textDecoration: 'none',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            transition: 'color 0.15s',
          } as React.CSSProperties}
          onMouseEnter={e => { if (!isRead) (e.currentTarget as HTMLElement).style.color = '#ffffff' }}
          onMouseLeave={e => { if (!isRead) (e.currentTarget as HTMLElement).style.color = '#d4d4d8' }}
        >
          {item.title}
        </a>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          {tag && !isRead && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: topicM.color,
              background: `rgba(${topicM.rgb},0.08)`,
              border: `1px solid rgba(${topicM.rgb},0.16)`,
              borderRadius: 3, padding: '1px 5px',
              textTransform: 'capitalize',
            }}>
              {tag}
            </span>
          )}
          {isRead && <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700 }}>✓</span>}
          <span style={{ fontSize: 10, color: '#52525b', whiteSpace: 'nowrap' }}>
            {relTime(item.published_at)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => { onExpand(); onRead() }}
      data-feed-id={item.id}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '14px 15px',
        borderRadius: 10,
        background: isRead ? 'rgba(255,255,255,0.015)' : 'var(--surface)',
        border: `1px solid ${isRead ? 'rgba(255,255,255,0.05)' : `rgba(${src.rgb},0.18)`}`,
        borderLeft: `3px solid ${isRead ? 'rgba(255,255,255,0.07)' : src.color}`,
        boxShadow: expanded ? `0 0 0 2px rgba(${src.rgb},0.35)` : 'none',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        if (!isRead) {
          const el = e.currentTarget as HTMLElement
          el.style.background = `rgba(${src.rgb},0.05)`
          el.style.boxShadow = `0 0 0 1px rgba(${src.rgb},0.2)`
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.background = isRead ? 'rgba(255,255,255,0.015)' : 'var(--surface)'
        el.style.boxShadow = 'none'
      }}
    >
      {/* Header: source identity | topic pill */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{ color: isRead ? '#3f3f46' : src.color, flexShrink: 0 }}>
            <SourceIcon source={sk} size={13} />
          </div>
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.07em',
            color: isRead ? '#3f3f46' : src.color,
            textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            {src.label}
          </span>
          {isRead && (
            <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700, flexShrink: 0 }}>✓</span>
          )}
          {isRecent(item.published_at) && !isRead && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <div style={{ position: 'relative', width: 6, height: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                <div className="ping-slow" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e' }} />
              </div>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                color: '#22c55e', background: 'rgba(34,197,94,0.1)',
                border: '1px solid rgba(34,197,94,0.22)',
                borderRadius: 3, padding: '1px 5px', textTransform: 'uppercase',
              }}>new</span>
            </div>
          )}
        </div>
        {tag && (
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: isRead ? '#3f3f46' : topicM.color,
            background: isRead ? 'transparent' : `rgba(${topicM.rgb},0.08)`,
            border: `1px solid ${isRead ? 'transparent' : `rgba(${topicM.rgb},0.18)`}`,
            borderRadius: 4, padding: '2px 7px',
            textTransform: 'capitalize', letterSpacing: '0.02em',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {tag}
          </span>
        )}
      </div>

      {/* Title */}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          fontSize: 15, fontWeight: 700, lineHeight: 1.42,
          color: isRead ? '#52525b' : '#e4e4e7',
          textDecoration: 'none',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { if (!isRead) (e.currentTarget as HTMLElement).style.color = '#ffffff' }}
        onMouseLeave={e => { if (!isRead) (e.currentTarget as HTMLElement).style.color = '#e4e4e7' }}
      >
        {item.title}
      </a>

      {/* Hook — always visible, no click required */}
      {item.hook && (
        <p style={{
          fontSize: 13, lineHeight: 1.65, margin: 0,
          color: isRead ? '#3f3f46' : `rgba(${src.rgb},0.78)`,
        }}>
          {item.hook}
        </p>
      )}

      {/* Raw excerpt fallback when no hook */}
      {!item.hook && item.raw_content && !isRead && (
        <p style={{ fontSize: 13, lineHeight: 1.65, margin: 0, color: '#52525b' }}>
          {item.raw_content.slice(0, 130)}{item.raw_content.length > 130 ? '…' : ''}
        </p>
      )}

      {/* Footer: velocity + details button | timestamp */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {vel > 0 && !isRead && <VelBar score={vel} />}
          {(item.summary || item.raw_content) && (
            <button
              onClick={e => { e.stopPropagation(); onExpand() }}
              style={{
                fontSize: 11, fontWeight: 600, padding: 0,
                background: 'none', border: 'none', cursor: 'pointer',
                color: expanded ? src.color : '#60a5fa',
                transition: 'color 0.15s',
              }}
            >
              {expanded ? '▸ details open' : '▸ more details'}
            </button>
          )}
        </div>
        <span style={{ fontSize: 11, color: '#52525b', whiteSpace: 'nowrap' }}>
          {relTime(item.published_at)}
        </span>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function TrendFeed({ items: init, stats }: { items: FeedItem[]; stats: Stats }) {
  const isMobile = useIsMobile()
  const [items,         setItems]         = useState(init)
  const [activeTag,     setActiveTag]     = useState('all')
  const [activeSort,    setActiveSort]    = useState('mixed')
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set())
  const [loading,       setLoading]       = useState(false)
  const [loadingMore,   setLoadingMore]   = useState(false)
  const [page,          setPage]          = useState(1)
  const [hasMore,       setHasMore]       = useState(init.length >= 40)
  const [readIds,       setReadIds]       = useState<Set<string>>(new Set())
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
  const [refreshing,    setRefreshing]    = useState(false)
  const [refreshMsg,    setRefreshMsg]    = useState<string | null>(null)
  const [search,        setSearch]        = useState('')
  const [sparkline,     setSparkline]     = useState<{ label: string; count: number; isToday: boolean }[]>([])
  const [searchFocused, setSearchFocused] = useState(false)
  const searchTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const expandedIdRef = useRef<string | null>(null)
  const filteredRef   = useRef<FeedItem[]>([])

  useEffect(() => {
    if (!refreshMsg) return
    const id = setTimeout(() => setRefreshMsg(null), 3000)
    return () => clearTimeout(id)
  }, [refreshMsg])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const eid = expandedIdRef.current
      if (!eid) return
      if (e.key === 'Escape') { setExpandedId(null); return }
      const fl  = filteredRef.current
      const idx = fl.findIndex(i => i.id === eid)
      if ((e.key === 'j' || e.key === 'ArrowDown') && idx < fl.length - 1) {
        e.preventDefault(); setExpandedId(fl[idx + 1].id)
      }
      if ((e.key === 'k' || e.key === 'ArrowUp') && idx > 0) {
        e.preventDefault(); setExpandedId(fl[idx - 1].id)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    if (!expandedId) return
    const el = document.querySelector(`[data-feed-id="${expandedId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [expandedId])

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
      const key = srcKey(item.source)
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

  function toggleSource(key: string) {
    setActiveSources(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const filtered = items.filter(i => {
    if (activeSources.size > 0 && !activeSources.has(srcKey(i.source))) return false
    if (activeTag !== 'all' && !i.topic_tags.includes(activeTag)) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      return i.title.toLowerCase().includes(q)
        || (i.hook        ?? '').toLowerCase().includes(q)
        || (i.raw_content ?? '').toLowerCase().includes(q)
    }
    return true
  })

  // Keep refs current for the keyboard-nav effect (stale-closure-free)
  expandedIdRef.current = expandedId
  filteredRef.current   = filtered

  const expandedIdx  = expandedId ? filtered.findIndex(i => i.id === expandedId) : -1
  const expandedItem = expandedIdx >= 0 ? filtered[expandedIdx] : null

  const tickerContent = items.slice(0, 24).map(i => i.title).join('   ·   ')

  return (
    <div>
      {/* ── Ticker ─────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8, padding: '6px 0', marginBottom: 16,
      }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 48, background: 'linear-gradient(to right, #09090b, transparent)', zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 48, background: 'linear-gradient(to left, #09090b, transparent)', zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ display: 'inline-flex', whiteSpace: 'nowrap', animation: 'ticker 55s linear infinite' }}>
          <span style={{ fontSize: 12, color: '#52525b', fontWeight: 500, letterSpacing: '0.04em', paddingRight: 40 }}>{tickerContent}</span>
          <span style={{ fontSize: 12, color: '#52525b', fontWeight: 500, letterSpacing: '0.04em', paddingRight: 40 }}>{tickerContent}</span>
        </div>
      </div>

      {/* ── Source toggle bar ───────────────────────────────────── */}
      <SourceToggleBar
        stations={ALL_STATIONS}
        activeSources={activeSources}
        onToggle={toggleSource}
        onClear={() => setActiveSources(new Set())}
        counts={stationCounts}
      />

      {/* ── Main grid: sidebar + feed ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '200px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Sidebar (desktop only) ───────────────────────────── */}
        {!isMobile && <div style={{
          position: 'sticky', top: 16,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          {/* Live count header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, letterSpacing: '0.08em' }}>LIVE</span>
            </div>
            <span style={{ fontSize: 12, color: '#71717a', fontWeight: 600 }}>
              {filtered.length} / {items.length}
            </span>
          </div>

          {/* Topic breakdown */}
          {topicFreq.length > 0 && (
            <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#71717a', textTransform: 'uppercase', marginBottom: 10 }}>Topics</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {topicFreq.map(({ tag, pct }) => {
                  const m = TOPIC_META[tag]
                  if (!m) return null
                  return (
                    <div key={tag}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: m.color, textTransform: 'capitalize', letterSpacing: '0.03em' }}>{tag}</span>
                        <span style={{ fontSize: 12, color: '#71717a', fontFamily: 'monospace' }}>{Math.round(pct)}%</span>
                      </div>
                      <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: m.color, opacity: 0.55, borderRadius: 1 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.itemsThisWeek != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#71717a', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>This week</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>{stats.itemsThisWeek}</span>
                </div>
              )}
              {stats.topTopic && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#71717a', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Hot topic</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', textTransform: 'capitalize' }}>{stats.topTopic}</span>
                </div>
              )}
            </div>
          )}

          {/* Daily volume sparkline */}
          {sparkline.length > 0 && (
            <div style={{ padding: '10px 14px 16px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#71717a', textTransform: 'uppercase', marginBottom: 10 }}>Daily Volume</p>
              <SparkChart data={sparkline} />
            </div>
          )}
        </div>}

        {/* ── Feed content (Broadsheet card grid) ────────────── */}
        <div>

          {/* Controls bar */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center',
            justifyContent: 'space-between',
            marginBottom: 10, flexWrap: 'wrap', gap: 8,
          }}>
            {/* Topic filters */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
              {TAG_LIST.map(tag => {
                const active = activeTag === tag
                const m      = TOPIC_META[tag]
                const color  = m?.color ?? '#60a5fa'
                const rgb    = m?.rgb   ?? '96,165,250'
                return (
                  <button key={tag} onClick={() => changeTag(tag)} style={{
                    fontSize: 12, fontWeight: 600, letterSpacing: '0.03em',
                    textTransform: 'capitalize',
                    padding: '4px 11px', borderRadius: 6, cursor: 'pointer',
                    background: active ? `rgba(${rgb},0.12)` : 'transparent',
                    color: active ? color : '#71717a',
                    border: `1px solid ${active ? `rgba(${rgb},0.25)` : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}>
                    {tag === 'all' ? 'All' : tag}
                  </button>
                )
              })}
            </div>

            {/* Sort + refresh + status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(loading || refreshing) && <span className="inline-block h-3 w-3 rounded-full border border-blue-500 border-t-transparent animate-spin" />}
              {refreshMsg && !refreshing && (
                <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>{refreshMsg}</span>
              )}
              <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
                {SORT_LIST.map(s => (
                  <button key={s.key} onClick={() => changeSort(s.key)} style={{
                    fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                    background: activeSort === s.key ? 'rgba(59,130,246,0.12)' : 'transparent',
                    color: activeSort === s.key ? '#60a5fa' : '#71717a',
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
                  fontSize: 14, lineHeight: 1, padding: '5px 9px', borderRadius: 7,
                  cursor: refreshing ? 'not-allowed' : 'pointer',
                  background: 'var(--surface)', color: refreshing ? '#3f3f46' : '#71717a',
                  border: '1px solid var(--border)',
                  transition: 'all 0.15s', opacity: refreshing ? 0.5 : 1,
                }}
              >
                ⟳
              </button>
              <span style={{ fontSize: 12, color: '#71717a', fontWeight: 500 }}>
                {filtered.length} items
              </span>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#52525b', pointerEvents: 'none' }}>
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
                background: searchFocused ? 'rgba(255,255,255,0.05)' : 'var(--surface)',
                border: `1px solid ${searchFocused || search ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
                borderRadius: 9, padding: '8px 36px',
                color: '#e4e4e7', fontSize: 14, outline: 'none',
                transition: 'border-color 0.15s, background 0.15s',
                boxShadow: searchFocused ? '0 0 0 3px rgba(59,130,246,0.08)' : 'none',
              }}
            />
            {search && (
              <button
                onClick={() => onSearchChange('')}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#52525b', fontSize: 16, lineHeight: 1, padding: 2,
                }}
              >×</button>
            )}
          </div>

          {/* Card grid or empty state */}
          {filtered.length === 0 ? (
            <div style={{
              padding: '64px 20px', textAlign: 'center',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10,
            }}>
              <p style={{ color: '#71717a', fontSize: 14 }}>
                {search.trim()
                  ? `No results for "${search.trim()}"`
                  : activeSources.size > 0
                  ? 'No items from selected sources — try clearing the filter'
                  : activeTag !== 'all'
                  ? `No ${activeTag} items — try a different filter`
                  : 'No items yet — check back after the first fetch'}
              </p>
            </div>
          ) : (
            <>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: isMobile ? 10 : 14,
                alignItems: 'start',
              }}>
                {filtered.map(item => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    isRead={readIds.has(item.id) || item.is_read === 1}
                    expanded={expandedId === item.id}
                    onExpand={() => setExpandedId(prev => prev === item.id ? null : item.id)}
                    onRead={() => markRead(item)}
                  />
                ))}
              </div>

              {hasMore && (
                <div style={{ padding: '28px 0', textAlign: 'center' }}>
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{
                      fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
                      color: loadingMore ? '#52525b' : '#60a5fa',
                      background: 'rgba(59,130,246,0.07)',
                      border: '1px solid rgba(59,130,246,0.18)',
                      borderRadius: 8, padding: '9px 24px',
                      cursor: loadingMore ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      transition: 'all 0.15s',
                    }}
                  >
                    {loadingMore && <span className="inline-block h-3 w-3 rounded-full border border-blue-500 border-t-transparent animate-spin" />}
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reading Drawer */}
      {expandedItem && (
        <ReadingDrawer
          item={expandedItem}
          onClose={() => setExpandedId(null)}
          onPrev={() => {
            if (expandedIdx > 0) setExpandedId(filtered[expandedIdx - 1].id)
          }}
          onNext={() => {
            if (expandedIdx < filtered.length - 1) setExpandedId(filtered[expandedIdx + 1].id)
          }}
          hasPrev={expandedIdx > 0}
          hasNext={expandedIdx < filtered.length - 1}
          isMobile={isMobile ?? false}
        />
      )}
    </div>
  )
}
