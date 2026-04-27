'use client'

import { useState, useEffect, useCallback } from 'react'
import { relTime } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────

interface StoryThread {
  id: string
  title: string
  category: string
  status: string
  current_summary: string | null
  watch_for: string | null
  is_pinned: number
  first_seen: string
  last_updated: string
  event_count: number
  latest_update: string | null
  latest_significance: string | null
  latest_week: string | null
}

interface StoryEvent {
  id: string
  thread_id: string
  week: string
  update_text: string
  significance: string
  feed_item_ids: string[]
  created_at: string
}

interface FeedItem {
  id: string
  source: string
  title: string
  url: string
  summary: string | null
  published_at: string | null
  hook: string | null
  velocity_score: number
}

interface TopEntity {
  id: string
  name: string
  type: string
  item_count: number
}

interface StoryDetail extends StoryThread {
  events: StoryEvent[]
  related_items: FeedItem[]
  topEntities?: TopEntity[]
}

interface RelatedThread {
  related_id: string
  title: string
  category: string
  current_summary: string | null
  last_updated: string
  strength: number
  label: string | null
  shared_tags: string[]
}

// ── Constants ──────────────────────────────────────────────────────────────

const CAT_META: Record<string, { color: string; rgb: string }> = {
  capability: { color: '#a78bfa', rgb: '167,139,250' },
  safety:     { color: '#f87171', rgb: '248,113,113' },
  policy:     { color: '#fbbf24', rgb: '251,191,36'  },
  market:     { color: '#34d399', rgb: '52,211,153'  },
  tooling:    { color: '#60a5fa', rgb: '96,165,250'  },
  research:   { color: '#fb923c', rgb: '251,146,60'  },
}

const DEFAULT_CAT = { color: '#7c6aff', rgb: '124,106,255' }

const ENTITY_COLORS: Record<string, { color: string; rgb: string }> = {
  company:    { color: '#34d399', rgb: '52,211,153'  },
  model:      { color: '#a78bfa', rgb: '167,139,250' },
  researcher: { color: '#fbbf24', rgb: '251,191,36'  },
  paper:      { color: '#60a5fa', rgb: '96,165,250'  },
}

const SIG_COLOR: Record<string, string> = {
  high:   '#f87171',
  medium: '#fbbf24',
  low:    '#5a5a8a',
}

const SIG_LABEL: Record<string, string> = {
  high:   'High',
  medium: 'Medium',
  low:    'Low',
}

// ── CSS animations ─────────────────────────────────────────────────────────

const ANIM_CSS = `
@keyframes ai-fadeUp {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ai-fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes ai-slideRight {
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes ai-spotlightIn {
  from { opacity: 0; transform: translateY(10px) scale(0.995); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.story-card-anim {
  animation: ai-fadeUp 0.32s cubic-bezier(0.22,1,0.36,1) both;
}
.story-detail-anim {
  animation: ai-fadeIn 0.22s ease both;
}
.timeline-item-anim {
  animation: ai-slideRight 0.28s cubic-bezier(0.22,1,0.36,1) both;
}
.story-spotlight-anim {
  animation: ai-spotlightIn 0.38s cubic-bezier(0.22,1,0.36,1) both;
}
`

// ── Helpers ────────────────────────────────────────────────────────────────

function weekLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function cleanSource(src: string): string {
  return src.replace(/^rss:/, '').replace(/_/g, ' ')
}

// ── Story card ─────────────────────────────────────────────────────────────

function StoryCard({
  story,
  index,
  onSelect,
}: {
  story: StoryThread
  index: number
  onSelect: () => void
}) {
  const cat      = CAT_META[story.category] ?? DEFAULT_CAT
  const sig      = story.latest_significance ?? 'low'
  const sigColor = SIG_COLOR[sig] ?? '#5a5a8a'
  const isHigh   = sig === 'high'

  return (
    <div
      className="story-card-anim"
      onClick={onSelect}
      style={{
        animationDelay: `${index * 45}ms`,
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderLeft: `3px solid ${cat.color}`,
        borderRadius: 14,
        padding: '18px 20px',
        cursor: 'pointer',
        transition: 'transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'translateY(-2px) scale(1.01)'
        el.style.boxShadow = `0 8px 28px rgba(${cat.rgb},0.12), 0 2px 8px rgba(0,0,0,0.3)`
        el.style.background = `rgba(${cat.rgb},0.06)`
        el.style.borderColor = `rgba(${cat.rgb},0.45)`
        const arrow = el.querySelector('.card-arrow') as HTMLElement | null
        if (arrow) { arrow.style.opacity = '1'; arrow.style.transform = 'translateX(0)' }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = ''
        el.style.boxShadow = ''
        el.style.background = 'rgba(255,255,255,0.025)'
        el.style.borderColor = 'rgba(255,255,255,0.07)'
        const arrow = el.querySelector('.card-arrow') as HTMLElement | null
        if (arrow) { arrow.style.opacity = '0'; arrow.style.transform = 'translateX(-4px)' }
      }}
    >
      {/* Pin indicator */}
      {story.is_pinned === 1 && (
        <div style={{
          position: 'absolute', top: 10, right: 12,
          fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
          color: cat.color, opacity: 0.55, textTransform: 'uppercase',
        }}>
          PINNED
        </div>
      )}

      {/* Category + significance + age */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 900, letterSpacing: '0.13em',
          color: cat.color, background: `rgba(${cat.rgb},0.12)`,
          border: `1px solid rgba(${cat.rgb},0.3)`,
          borderRadius: 4, padding: '2px 8px', textTransform: 'uppercase', flexShrink: 0,
        }}>
          {story.category}
        </span>

        {isHigh && (
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
            color: sigColor, background: `rgba(248,113,113,0.1)`,
            border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase', flexShrink: 0,
          }}>
            HOT
          </span>
        )}

        {!isHigh && story.latest_significance && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: sigColor, flexShrink: 0,
          }} />
        )}

        <span style={{ fontSize: 10, color: '#4a4a6a', marginLeft: 'auto', flexShrink: 0 }}>
          {relTime(story.last_updated)}
        </span>
      </div>

      {/* Title */}
      <p style={{
        fontSize: 15, fontWeight: 800, color: '#d8d8ee',
        lineHeight: 1.35, letterSpacing: '-0.015em',
      }}>
        {story.title}
      </p>

      {/* Latest update snippet */}
      {story.latest_update && (
        <p style={{
          fontSize: 13, color: '#6868a8', lineHeight: 1.65,
          display: '-webkit-box', WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {story.latest_update}
        </p>
      )}

      {/* Footer: event count + first seen + open arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: '#4a4a6a',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 4, padding: '2px 7px',
        }}>
          {story.event_count} update{story.event_count !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 11, color: '#3a3a5a' }}>·</span>
        <span style={{ fontSize: 11, color: '#4a4a6a' }}>since {weekLabel(story.first_seen)}</span>
        <span
          className="card-arrow"
          style={{
            marginLeft: 'auto', fontSize: 14, color: cat.color,
            opacity: 0, transform: 'translateX(-4px)',
            transition: 'opacity 0.15s ease, transform 0.15s ease',
          }}
        >
          →
        </span>
      </div>
    </div>
  )
}

// ── Story detail view ──────────────────────────────────────────────────────

function StoryDetailView({
  detail,
  relatedThreads,
  onBack,
  onResolve,
  onDelete,
  onSelectThread,
}: {
  detail: StoryDetail
  relatedThreads: RelatedThread[]
  onBack: () => void
  onResolve: () => void
  onDelete: () => void
  onSelectThread: (id: string, category?: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const cat = CAT_META[detail.category] ?? DEFAULT_CAT

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDelete])

  return (
    <div className="story-detail-anim">

      {/* Nav bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, gap: 12, flexWrap: 'wrap',
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 8, padding: '8px 16px',
            fontSize: 13, fontWeight: 700, color: '#8080b0',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.color = '#c0c0e0'
            el.style.background = 'rgba(255,255,255,0.06)'
          }}
          onMouseLeave={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.color = '#8080b0'
            el.style.background = 'rgba(255,255,255,0.03)'
          }}
        >
          ← All Stories
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onResolve}
            style={{
              background: 'rgba(52,211,153,0.07)', color: '#34d399',
              border: '1px solid rgba(52,211,153,0.22)',
              borderRadius: 8, padding: '8px 18px',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.07em',
              cursor: 'pointer', textTransform: 'uppercase', transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.14)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.07)' }}
          >
            Mark Resolved
          </button>
          <button
            onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}
            style={{
              background: confirmDelete ? 'rgba(248,113,113,0.12)' : 'transparent',
              color: confirmDelete ? '#f87171' : '#5a5a7a',
              border: `1px solid ${confirmDelete ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.09)'}`,
              borderRadius: 8, padding: '8px 18px',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.07em',
              cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s',
            }}
          >
            {confirmDelete ? 'Confirm Delete' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Story header card with gradient accent */}
      <div style={{
        padding: '28px 32px',
        background: `linear-gradient(135deg, rgba(${cat.rgb},0.07) 0%, rgba(${cat.rgb},0.02) 60%, rgba(255,255,255,0.01) 100%)`,
        border: `1px solid rgba(${cat.rgb},0.18)`,
        borderLeft: `4px solid ${cat.color}`,
        borderRadius: 18, marginBottom: 28,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Subtle glow spot */}
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 220, height: 220, borderRadius: '50%',
          background: `rgba(${cat.rgb},0.06)`,
          filter: 'blur(40px)', pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.15em',
            color: cat.color, background: `rgba(${cat.rgb},0.14)`,
            border: `1px solid rgba(${cat.rgb},0.3)`,
            borderRadius: 5, padding: '3px 10px', textTransform: 'uppercase',
          }}>
            {detail.category}
          </span>
          {detail.is_pinned === 1 && (
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
              color: cat.color, opacity: 0.55, textTransform: 'uppercase',
            }}>
              PINNED
            </span>
          )}
          <span style={{ fontSize: 12, color: '#5a5a7a', marginLeft: 'auto' }}>
            Active since {weekLabel(detail.first_seen)}
          </span>
        </div>

        <h2 style={{
          fontSize: 28, fontWeight: 900, color: '#eeeef8',
          letterSpacing: '-0.025em', lineHeight: 1.2, marginBottom: 14,
        }}>
          {detail.title}
        </h2>

        {detail.current_summary && (
          <p style={{ fontSize: 15, color: '#7878b0', lineHeight: 1.8, maxWidth: 800 }}>
            {detail.current_summary}
          </p>
        )}

        {detail.watch_for && (
          <div style={{
            marginTop: 18, padding: '12px 16px',
            background: `rgba(${cat.rgb},0.08)`,
            border: `1px solid rgba(${cat.rgb},0.2)`,
            borderRadius: 10, display: 'flex', gap: 14, alignItems: 'flex-start',
          }}>
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.14em',
              color: cat.color, textTransform: 'uppercase',
              marginTop: 3, flexShrink: 0,
            }}>
              Watch for
            </span>
            <p style={{ fontSize: 14, color: '#8888c0', lineHeight: 1.65 }}>
              {detail.watch_for}
            </p>
          </div>
        )}

        {/* Stats row */}
        <div style={{
          display: 'flex', gap: 20, marginTop: 20, paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap',
        }}>
          {[
            { label: 'Timeline events', value: String(detail.events.length) },
            { label: 'Related articles', value: String(detail.related_items.length) },
            { label: 'Last updated', value: relTime(detail.last_updated) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#4a4a6a', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
                {label}
              </p>
              <p style={{ fontSize: 16, fontWeight: 900, color: '#c0c0e0', letterSpacing: '-0.01em' }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Key entities */}
      {detail.topEntities && detail.topEntities.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
              color: '#5a5a7a', textTransform: 'uppercase', flexShrink: 0,
            }}>
              Key Entities
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {detail.topEntities.map(e => {
              const em = ENTITY_COLORS[e.type] ?? { color: '#7c6aff', rgb: '124,106,255' }
              return (
                <a key={e.id} href={`/entities/${e.id}`} style={{ textDecoration: 'none' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    fontSize: 12, fontWeight: 700,
                    color: em.color,
                    background: `rgba(${em.rgb},0.1)`,
                    border: `1px solid rgba(${em.rgb},0.25)`,
                    borderRadius: 8, padding: '5px 11px',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}>
                    {e.name}
                    <span style={{
                      fontSize: 9, fontWeight: 900,
                      color: em.color, opacity: 0.65,
                      background: `rgba(${em.rgb},0.15)`,
                      borderRadius: 3, padding: '1px 5px',
                    }}>
                      {e.item_count}
                    </span>
                  </span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Related threads */}
      {relatedThreads.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
              color: '#5a5a7a', textTransform: 'uppercase', flexShrink: 0,
            }}>
              Related Threads
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {relatedThreads.map(rt => {
              const rcat = CAT_META[rt.category] ?? DEFAULT_CAT
              return (
                <div
                  key={rt.related_id}
                  onClick={() => onSelectThread(rt.related_id, rt.category)}
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderLeft: `3px solid ${rcat.color}`,
                    borderRadius: 12, padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'background 0.15s, box-shadow 0.15s',
                    display: 'flex', flexDirection: 'column', gap: 7,
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.background = `rgba(${rcat.rgb},0.06)`
                    el.style.boxShadow  = `0 4px 16px rgba(${rcat.rgb},0.1)`
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.background = 'rgba(255,255,255,0.02)'
                    el.style.boxShadow  = ''
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 900, letterSpacing: '0.13em',
                      color: rcat.color, background: `rgba(${rcat.rgb},0.12)`,
                      border: `1px solid rgba(${rcat.rgb},0.28)`,
                      borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase', flexShrink: 0,
                    }}>
                      {rt.category}
                    </span>
                    <span style={{ fontSize: 10, color: '#4a4a6a', marginLeft: 'auto' }}>
                      {relTime(rt.last_updated)}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#c8c8e4', lineHeight: 1.35 }}>
                    {rt.title}
                  </p>
                  {rt.label && (
                    <p style={{ fontSize: 11, color: '#5a5a80', lineHeight: 1.55, fontStyle: 'italic' }}>
                      {rt.label}
                    </p>
                  )}
                  {rt.shared_tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {rt.shared_tags.slice(0, 4).map(tag => (
                        <span key={tag} style={{
                          fontSize: 9, fontWeight: 700, color: '#4a4a6a',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: 3, padding: '1px 5px',
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: 20, alignItems: 'start' }}>

        {/* Timeline */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: '24px 26px',
        }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
            color: '#5a5a7a', textTransform: 'uppercase', marginBottom: 24,
          }}>
            Timeline · {detail.events.length} update{detail.events.length !== 1 ? 's' : ''}
          </p>

          {detail.events.length === 0 ? (
            <p style={{ fontSize: 13, color: '#4a4a6a', fontStyle: 'italic', lineHeight: 1.6 }}>
              No AI-generated updates yet — next feed fetch will populate this.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {detail.events.map((event, i) => {
                const sigColor = SIG_COLOR[event.significance] ?? '#5a5a8a'
                const isLatest = i === 0
                const isLast   = i === detail.events.length - 1
                return (
                  <div
                    key={event.id}
                    className="timeline-item-anim"
                    style={{ animationDelay: `${i * 60}ms`, display: 'flex', gap: 16 }}
                  >
                    {/* Connector column */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 18 }}>
                      <div style={{
                        width: isLatest ? 12 : 9, height: isLatest ? 12 : 9,
                        borderRadius: '50%',
                        background: isLatest ? cat.color : sigColor,
                        border: isLatest ? `2px solid rgba(${cat.rgb},0.4)` : '2px solid rgba(255,255,255,0.07)',
                        marginTop: 4, flexShrink: 0,
                        boxShadow: isLatest ? `0 0 10px rgba(${cat.rgb},0.5)` : 'none',
                        transition: 'transform 0.15s',
                      }} />
                      {!isLast && (
                        <div style={{
                          width: 1, flex: 1, minHeight: 28,
                          background: isLatest
                            ? `linear-gradient(to bottom, rgba(${cat.rgb},0.3), rgba(255,255,255,0.05))`
                            : 'rgba(255,255,255,0.07)',
                        }} />
                      )}
                    </div>

                    {/* Event content */}
                    <div style={{ paddingBottom: isLast ? 0 : 26, flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, color: isLatest ? '#a0a0d0' : '#7070a8',
                          fontFamily: 'monospace', letterSpacing: '0.02em',
                        }}>
                          {weekLabel(event.week)}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                          color: sigColor,
                          background: `${sigColor}18`,
                          border: `1px solid ${sigColor}30`,
                          borderRadius: 3, padding: '1px 6px',
                          textTransform: 'uppercase',
                        }}>
                          {SIG_LABEL[event.significance] ?? event.significance}
                        </span>
                        {isLatest && (
                          <span style={{
                            fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                            color: cat.color, textTransform: 'uppercase',
                          }}>
                            Latest
                          </span>
                        )}
                      </div>
                      <p style={{
                        fontSize: 14, color: isLatest ? '#9090c8' : '#7878a8',
                        lineHeight: 1.75,
                      }}>
                        {event.update_text}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Related articles */}
        <div style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: '24px 26px',
        }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
            color: '#5a5a7a', textTransform: 'uppercase', marginBottom: 20,
          }}>
            Recent Coverage · {detail.related_items.length}
          </p>

          {detail.related_items.length === 0 ? (
            <p style={{ fontSize: 13, color: '#4a4a6a', fontStyle: 'italic', lineHeight: 1.6 }}>
              No matching feed articles yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {detail.related_items.map((item, i) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    textDecoration: 'none', display: 'block',
                    padding: '14px 0',
                    borderBottom: i < detail.related_items.length - 1
                      ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '0.75' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.opacity = '1' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                      color: cat.color, background: `rgba(${cat.rgb},0.1)`,
                      border: `1px solid rgba(${cat.rgb},0.22)`,
                      borderRadius: 3, padding: '1px 6px',
                      textTransform: 'uppercase', flexShrink: 0,
                    }}>
                      {cleanSource(item.source)}
                    </span>
                    {item.velocity_score > 1.5 && (
                      <span style={{
                        fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                        color: '#f87171', textTransform: 'uppercase', flexShrink: 0,
                      }}>
                        HOT
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: '#4a4a6a', marginLeft: 'auto', flexShrink: 0 }}>
                      {relTime(item.published_at)}
                    </span>
                  </div>
                  <p style={{
                    fontSize: 13, fontWeight: 700, color: '#c4c4e0',
                    lineHeight: 1.45, marginBottom: item.hook ? 5 : 0,
                  }}>
                    {item.title}
                  </p>
                  {item.hook && (
                    <p style={{
                      fontSize: 12, color: '#5a5a80', lineHeight: 1.65,
                      display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {item.hook}
                    </p>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Spotlight card (full-width featured story) ─────────────────────────────

function SpotlightCard({ story, onSelect }: { story: StoryThread; onSelect: () => void }) {
  const cat      = CAT_META[story.category] ?? DEFAULT_CAT
  const sig      = story.latest_significance ?? 'low'
  const sigColor = SIG_COLOR[sig] ?? '#5a5a8a'
  const isHigh   = sig === 'high'

  return (
    <div
      className="story-spotlight-anim"
      onClick={onSelect}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 260px',
        gap: 32,
        background: `linear-gradient(115deg, rgba(${cat.rgb},0.11) 0%, rgba(${cat.rgb},0.04) 55%, rgba(255,255,255,0.01) 100%)`,
        border: `1px solid rgba(${cat.rgb},0.22)`,
        borderLeft: `4px solid ${cat.color}`,
        borderRadius: 20,
        padding: '28px 32px',
        cursor: 'pointer',
        marginBottom: 28,
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform 0.18s ease, box-shadow 0.18s ease',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = 'translateY(-3px)'
        el.style.boxShadow = `0 16px 48px rgba(${cat.rgb},0.14), 0 4px 16px rgba(0,0,0,0.4)`
        const btn = el.querySelector('.spotlight-btn') as HTMLElement | null
        if (btn) {
          btn.style.background = cat.color
          btn.style.color = '#0e0e1a'
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLDivElement
        el.style.transform = ''
        el.style.boxShadow = ''
        const btn = el.querySelector('.spotlight-btn') as HTMLElement | null
        if (btn) {
          btn.style.background = `rgba(${cat.rgb},0.12)`
          btn.style.color = cat.color
        }
      }}
    >
      {/* Background glow orb */}
      <div style={{
        position: 'absolute', top: -80, right: 220,
        width: 320, height: 320, borderRadius: '50%',
        background: `rgba(${cat.rgb},0.07)`,
        filter: 'blur(60px)', pointerEvents: 'none',
      }} />
      {/* Second glow in corner */}
      <div style={{
        position: 'absolute', bottom: -40, left: -40,
        width: 180, height: 180, borderRadius: '50%',
        background: `rgba(${cat.rgb},0.04)`,
        filter: 'blur(40px)', pointerEvents: 'none',
      }} />

      {/* Left: content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: '0.18em',
            color: cat.color, textTransform: 'uppercase', opacity: 0.7,
          }}>
            Spotlight
          </span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#3a3a5a' }} />
          <span style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.13em',
            color: cat.color, background: `rgba(${cat.rgb},0.14)`,
            border: `1px solid rgba(${cat.rgb},0.3)`,
            borderRadius: 4, padding: '2px 8px', textTransform: 'uppercase',
          }}>
            {story.category}
          </span>
          {isHigh && (
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
              color: '#f87171', background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.25)',
              borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase',
            }}>
              HOT
            </span>
          )}
          {story.is_pinned === 1 && (
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
              color: cat.color, opacity: 0.55, textTransform: 'uppercase',
            }}>
              PINNED
            </span>
          )}
        </div>

        <h2 style={{
          fontSize: 22, fontWeight: 900, color: '#eeeef8',
          letterSpacing: '-0.02em', lineHeight: 1.25,
        }}>
          {story.title}
        </h2>

        {story.latest_update && (
          <p style={{
            fontSize: 14, color: '#7070a8', lineHeight: 1.75,
            display: '-webkit-box', WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {story.latest_update}
          </p>
        )}

        {story.watch_for && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '10px 14px',
            background: `rgba(${cat.rgb},0.07)`,
            border: `1px solid rgba(${cat.rgb},0.18)`,
            borderRadius: 8, marginTop: 2,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.13em',
              color: cat.color, textTransform: 'uppercase',
              marginTop: 2, flexShrink: 0,
            }}>
              Watch
            </span>
            <p style={{
              fontSize: 13, color: '#8080b8', lineHeight: 1.6,
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {story.watch_for}
            </p>
          </div>
        )}
      </div>

      {/* Right: stats + CTA */}
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        gap: 20, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'Updates', value: String(story.event_count) },
            { label: 'Significance', value: SIG_LABEL[sig] ?? sig, color: sigColor },
            { label: 'Last active', value: relTime(story.last_updated) },
            { label: 'Tracking since', value: weekLabel(story.first_seen) },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                color: '#4a4a6a', textTransform: 'uppercase', marginBottom: 2,
              }}>
                {label}
              </p>
              <p style={{
                fontSize: 15, fontWeight: 900, letterSpacing: '-0.01em',
                color: color ?? '#c0c0e0',
                textShadow: color && sig === 'high' ? `0 0 12px ${color}60` : 'none',
              }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <button
          className="spotlight-btn"
          style={{
            background: `rgba(${cat.rgb},0.12)`,
            color: cat.color,
            border: `1px solid rgba(${cat.rgb},0.3)`,
            borderRadius: 10, padding: '11px 0',
            fontSize: 13, fontWeight: 900, letterSpacing: '0.06em',
            cursor: 'pointer', width: '100%',
            transition: 'background 0.18s ease, color 0.18s ease',
          }}
        >
          Open Story →
        </button>
      </div>
    </div>
  )
}

// ── Category filter chips ──────────────────────────────────────────────────

function CategoryChips({
  threads,
  active,
  onChange,
}: {
  threads: StoryThread[]
  active: string
  onChange: (cat: string) => void
}) {
  const counts: Record<string, number> = {}
  for (const t of threads) counts[t.category] = (counts[t.category] ?? 0) + 1
  const cats = Object.keys(CAT_META).filter(c => counts[c] > 0)

  function Chip({ label, count, catKey }: { label: string; count: number; catKey: string }) {
    const isActive = active === catKey
    const meta     = catKey === 'all' ? DEFAULT_CAT : (CAT_META[catKey] ?? DEFAULT_CAT)
    return (
      <button
        onClick={() => onChange(catKey)}
        style={{
          background: isActive ? `rgba(${meta.rgb},0.15)` : 'rgba(255,255,255,0.03)',
          color: isActive ? meta.color : '#5a5a7a',
          border: isActive
            ? `1px solid rgba(${meta.rgb},0.35)`
            : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '6px 14px',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
          transition: 'all 0.15s ease',
          boxShadow: isActive ? `0 0 12px rgba(${meta.rgb},0.12)` : 'none',
          flexShrink: 0,
        }}
      >
        {isActive && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: meta.color, flexShrink: 0,
            boxShadow: `0 0 6px ${meta.color}`,
          }} />
        )}
        <span style={{ textTransform: 'capitalize' }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 900,
          color: isActive ? meta.color : '#3a3a5a',
          background: isActive ? `rgba(${meta.rgb},0.15)` : 'rgba(255,255,255,0.05)',
          borderRadius: 3, padding: '1px 5px',
          transition: 'all 0.15s',
        }}>
          {count}
        </span>
      </button>
    )
  }

  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24,
      paddingBottom: 20,
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <Chip label="All" count={threads.length} catKey="all" />
      {cats.map(cat => (
        <Chip key={cat} label={cat} count={counts[cat]} catKey={cat} />
      ))}
    </div>
  )
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <span style={{
        fontSize: 11, fontWeight: 900, letterSpacing: '0.18em',
        color: '#5a5a7a', textTransform: 'uppercase', flexShrink: 0,
      }}>
        {label}
      </span>
      {count !== undefined && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#3a3a5a',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 4, padding: '1px 7px',
        }}>
          {count}
        </span>
      )}
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
    </div>
  )
}

// ── Spinner ────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
      <div className="h-7 w-7 rounded-full border border-violet-500 border-t-transparent animate-spin" />
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function StoriesPage() {
  const [threads,         setThreads]         = useState<StoryThread[]>([])
  const [loading,         setLoading]         = useState(true)
  const [updating,        setUpdating]        = useState(false)
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [detail,          setDetail]          = useState<StoryDetail | null>(null)
  const [detailLoading,   setDetailLoading]   = useState(false)
  const [relatedThreads,  setRelatedThreads]  = useState<RelatedThread[]>([])
  const [activeCategory,  setActiveCategory]  = useState<string>('all')

  const fetchThreads = useCallback(async () => {
    const r = await fetch('/api/stories')
    if (r.ok) setThreads(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchThreads() }, [fetchThreads])

  async function selectStory(id: string, category?: string) {
    if (category) {
      fetch('/api/affinity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, source: 'story', type: 'open' }),
      })
    }
    setSelectedId(id)
    setDetail(null)
    setRelatedThreads([])
    setDetailLoading(true)
    const [detailRes, relatedRes] = await Promise.all([
      fetch(`/api/stories/${id}`),
      fetch(`/api/stories/${id}/related`),
    ])
    if (detailRes.ok)  setDetail(await detailRes.json())
    if (relatedRes.ok) setRelatedThreads(await relatedRes.json())
    setDetailLoading(false)
  }

  function goBack() {
    setSelectedId(null)
    setDetail(null)
    setRelatedThreads([])
  }

  async function handleResolve(id: string) {
    await fetch(`/api/stories/${id}/resolve`, { method: 'POST' })
    setThreads(prev => prev.filter(t => t.id !== id))
    goBack()
  }

  async function handleDelete(id: string) {
    await fetch(`/api/stories/${id}`, { method: 'DELETE' })
    setThreads(prev => prev.filter(t => t.id !== id))
    goBack()
  }

  async function handleUpdate() {
    setUpdating(true)
    await fetch('/api/stories/generate', { method: 'POST' })
    const [threadsRes, detailRes] = await Promise.all([
      fetch('/api/stories'),
      selectedId ? fetch(`/api/stories/${selectedId}`) : Promise.resolve(null),
    ])
    if (threadsRes.ok) setThreads(await threadsRes.json())
    if (detailRes?.ok) setDetail(await detailRes.json())
    setUpdating(false)
  }

  const total   = threads.length

  // Spotlight: first pinned, else first high-sig, else threads[0]
  const spotlight: StoryThread | null =
    threads.find(t => t.is_pinned === 1) ??
    threads.find(t => t.latest_significance === 'high') ??
    threads[0] ??
    null

  const filtered: StoryThread[] =
    activeCategory === 'all'
      ? threads
      : threads.filter(t => t.category === activeCategory)

  // In "all" view the spotlight is shown separately; remove it from the grid
  const gridStories: StoryThread[] =
    activeCategory === 'all' && spotlight
      ? filtered.filter(t => t.id !== spotlight.id)
      : filtered

  return (
    <main style={{
      padding: '32px 28px', maxWidth: 1500, margin: '0 auto',
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.028) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
    }}>
      <style>{ANIM_CSS}</style>

      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 32, gap: 16, flexWrap: 'wrap',
      }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>Narrative Intelligence</p>
          <h1 style={{
            color: '#e8e8f0', fontSize: 28, fontWeight: 900,
            letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 6,
          }}>
            Story Threads
          </h1>
          <p style={{ color: '#7070a8', fontSize: 14 }}>
            {loading
              ? 'Loading…'
              : `${total} active thread${total !== 1 ? 's' : ''} · auto-updated from feed`}
          </p>
        </div>

        <button
          onClick={handleUpdate}
          disabled={updating}
          style={{
            background: updating ? 'rgba(255,255,255,0.02)' : 'rgba(124,106,255,0.1)',
            color: updating ? '#5a5a7a' : '#a78bfa',
            border: '1px solid rgba(124,106,255,0.22)',
            borderRadius: 12, padding: '11px 22px',
            fontSize: 13, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: updating ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
          }}
        >
          {updating
            ? <><span className="inline-block h-3 w-3 rounded-full border border-violet-500 border-t-transparent animate-spin" />Updating…</>
            : '⟳ Update Now'}
        </button>
      </div>

      {loading && <Spinner />}

      {/* Detail view */}
      {!loading && selectedId && (
        <>
          {detailLoading && <Spinner />}
          {detail && !detailLoading && (
            <StoryDetailView
              detail={detail}
              relatedThreads={relatedThreads}
              onBack={goBack}
              onResolve={() => handleResolve(detail.id)}
              onDelete={() => handleDelete(detail.id)}
              onSelectThread={selectStory}
            />
          )}
        </>
      )}

      {/* Card grid */}
      {!loading && !selectedId && (
        <>
          {total === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minHeight: 320, textAlign: 'center',
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 18, gap: 14,
            }}>
              <p className="eyebrow">No Threads Yet</p>
              <p style={{ color: '#7070a8', fontSize: 13, maxWidth: 320, lineHeight: 1.7 }}>
                Click "Update Now" to seed the pinned threads and scan recent feed items for emerging stories.
              </p>
              <button
                onClick={handleUpdate}
                disabled={updating}
                style={{
                  background: 'rgba(124,106,255,0.1)', color: '#a78bfa',
                  border: '1px solid rgba(124,106,255,0.25)',
                  borderRadius: 10, padding: '10px 22px',
                  fontSize: 13, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Initialize Threads →
              </button>
            </div>
          ) : (
            <>
              {/* Category filter chips */}
              <CategoryChips
                threads={threads}
                active={activeCategory}
                onChange={setActiveCategory}
              />

              {/* Spotlight card — only in "all" view */}
              {activeCategory === 'all' && spotlight && (
                <SpotlightCard story={spotlight} onSelect={() => selectStory(spotlight.id, spotlight.category)} />
              )}

              {/* Grid of remaining stories */}
              {filtered.length === 0 ? (
                <p style={{ fontSize: 13, color: '#4a4a6a', fontStyle: 'italic', padding: '32px 0' }}>
                  No stories in this category yet.
                </p>
              ) : gridStories.length > 0 ? (
                <div>
                  <SectionHeader
                    label={activeCategory === 'all' ? 'All Stories' : activeCategory}
                    count={gridStories.length}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
                    {gridStories.map((story, i) => (
                      <StoryCard
                        key={story.id}
                        story={story}
                        index={i}
                        onSelect={() => selectStory(story.id, story.category)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </>
      )}

    </main>
  )
}
