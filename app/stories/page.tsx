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
  acceleration_score: number | null
}

interface StoryEvent {
  id: string
  thread_id: string
  week: string
  update_text: string
  significance: string
  feed_item_ids: string[]
  source: string
  source_url: string | null
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

interface SnapshotEntry {
  week: string
  summary: string
  watch_for: string | null
}

interface StoryDetail extends StoryThread {
  events: StoryEvent[]
  related_items: FeedItem[]
  topEntities?: TopEntity[]
  snapshots?: SnapshotEntry[]
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

const DEFAULT_CAT = { color: '#3b82f6', rgb: '59,130,246' }

const ENTITY_COLORS: Record<string, { color: string; rgb: string }> = {
  company:    { color: '#34d399', rgb: '52,211,153'  },
  model:      { color: '#a78bfa', rgb: '167,139,250' },
  researcher: { color: '#fbbf24', rgb: '251,191,36'  },
  paper:      { color: '#60a5fa', rgb: '96,165,250'  },
}

const SIG_COLOR: Record<string, string> = {
  high:   '#f87171',
  medium: '#fbbf24',
  low:    '#71717a',
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
@media (max-width: 767px) {
  .stories-main         { padding: 20px 16px !important; }
  .spotlight-card       { grid-template-columns: 1fr !important; padding: 20px 20px !important; margin-bottom: 20px !important; }
  .spotlight-right      { display: none !important; }
  .stories-grid         { grid-template-columns: 1fr !important; gap: 14px !important; }
  .story-body-grid      { grid-template-columns: 1fr !important; }
  .story-header-card    { padding: 20px 18px !important; margin-bottom: 20px !important; }
  .story-header-h2      { font-size: 22px !important; margin-bottom: 10px !important; }
  .story-arc-card       { padding: 16px 14px !important; }
  .story-timeline-panel { padding: 18px 16px !important; }
  .story-coverage-panel { padding: 18px 16px !important; }
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
  const sigColor = SIG_COLOR[sig] ?? '#71717a'
  const isHigh   = sig === 'high'

  return (
    <div
      className="story-card-anim"
      onClick={onSelect}
      style={{
        animationDelay: `${index * 45}ms`,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${cat.color}`,
        borderRadius: 10,
        padding: '22px 24px',
        cursor: 'pointer',
        transition: 'transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, border-color 0.16s ease',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
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
        el.style.background = 'var(--surface)'
        el.style.borderColor = 'rgba(255,255,255,0.08)'
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

        {(story.acceleration_score ?? 0) >= 1.5 && (
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
            color: '#fb923c', background: 'rgba(251,146,60,0.1)',
            border: '1px solid rgba(251,146,60,0.25)',
            borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase', flexShrink: 0,
          }}>
            ↑ RISING
          </span>
        )}

        {!isHigh && story.latest_significance && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: sigColor, flexShrink: 0,
          }} />
        )}

        <span style={{ fontSize: 10, color: '#52525b', marginLeft: 'auto', flexShrink: 0 }}>
          {relTime(story.last_updated)}
        </span>
      </div>

      {/* Title */}
      <p style={{
        fontSize: 16, fontWeight: 700, color: '#e4e4e7',
        lineHeight: 1.4, letterSpacing: '-0.015em',
      }}>
        {story.title}
      </p>

      {/* Latest update snippet */}
      {story.latest_update && (
        <p style={{
          fontSize: 14, color: '#a1a1aa', lineHeight: 1.7,
          display: '-webkit-box', WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {story.latest_update}
        </p>
      )}

      {/* Footer: event count + first seen + open arrow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: '#52525b',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 4, padding: '2px 7px',
        }}>
          {story.event_count} update{story.event_count !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 11, color: '#3f3f46' }}>·</span>
        <span style={{ fontSize: 11, color: '#52525b' }}>since {weekLabel(story.first_seen)}</span>
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
  onRefresh,
}: {
  detail: StoryDetail
  relatedThreads: RelatedThread[]
  onBack: () => void
  onResolve: () => void
  onDelete: () => void
  onSelectThread: (id: string, category?: string) => void
  onRefresh: () => void
}) {
  const [confirmDelete,   setConfirmDelete]   = useState(false)
  const [editingWatch,    setEditingWatch]    = useState(false)
  const [watchDraft,      setWatchDraft]      = useState(detail.watch_for ?? '')
  const [savingWatch,     setSavingWatch]     = useState(false)
  const [showLogForm,     setShowLogForm]     = useState(false)
  const [logText,         setLogText]         = useState('')
  const [logSig,          setLogSig]          = useState('medium')
  const [logDate,         setLogDate]         = useState('')
  const [logUrl,          setLogUrl]          = useState('')
  const [submittingLog,   setSubmittingLog]   = useState(false)
  const cat = CAT_META[detail.category] ?? DEFAULT_CAT

  useEffect(() => {
    if (!confirmDelete) return
    const t = setTimeout(() => setConfirmDelete(false), 3000)
    return () => clearTimeout(t)
  }, [confirmDelete])

  async function saveWatchFor() {
    setSavingWatch(true)
    await fetch(`/api/stories/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watch_for: watchDraft }),
    })
    setSavingWatch(false)
    setEditingWatch(false)
    onRefresh()
  }

  async function submitLogEvent() {
    if (!logText.trim()) return
    setSubmittingLog(true)
    await fetch(`/api/stories/${detail.id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_text: logText,
        significance: logSig,
        event_date: logDate || undefined,
        source_url: logUrl || undefined,
      }),
    })
    setLogText('')
    setLogSig('medium')
    setLogDate('')
    setLogUrl('')
    setShowLogForm(false)
    setSubmittingLog(false)
    onRefresh()
  }

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
            fontSize: 13, fontWeight: 700, color: '#a1a1aa',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            transition: 'color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.color = '#d4d4d8'
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
              color: confirmDelete ? '#f87171' : '#71717a',
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
      <div className="story-header-card" style={{
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
          <span style={{ fontSize: 12, color: '#71717a', marginLeft: 'auto' }}>
            Active since {weekLabel(detail.first_seen)}
          </span>
        </div>

        <h2 className="story-header-h2" style={{
          fontSize: 28, fontWeight: 800, color: '#f4f4f5',
          letterSpacing: '-0.025em', lineHeight: 1.2, marginBottom: 14,
        }}>
          {detail.title}
        </h2>

        {detail.current_summary && (
          <p style={{ fontSize: 15, color: '#a1a1aa', lineHeight: 1.8, maxWidth: 800 }}>
            {detail.current_summary}
          </p>
        )}

        <div style={{
          marginTop: 18, padding: '12px 16px',
          background: `rgba(${cat.rgb},0.08)`,
          border: `1px solid rgba(${cat.rgb},0.2)`,
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: editingWatch ? 10 : 0 }}>
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.14em',
              color: cat.color, textTransform: 'uppercase', flexShrink: 0,
            }}>
              Watch for
            </span>
            {!editingWatch && (
              <button
                onClick={() => { setWatchDraft(detail.watch_for ?? ''); setEditingWatch(true) }}
                style={{
                  marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                  color: '#71717a', background: 'transparent', border: 'none',
                  cursor: 'pointer', padding: '2px 6px',
                  borderRadius: 4, transition: 'color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = cat.color }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#71717a' }}
              >
                Edit
              </button>
            )}
          </div>

          {editingWatch ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={watchDraft}
                onChange={e => setWatchDraft(e.target.value)}
                rows={3}
                style={{
                  width: '100%', background: 'rgba(0,0,0,0.3)',
                  border: `1px solid rgba(${cat.rgb},0.3)`,
                  borderRadius: 7, padding: '9px 12px',
                  fontSize: 13, color: '#d4d4d8', lineHeight: 1.65,
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setEditingWatch(false)}
                  style={{
                    fontSize: 12, fontWeight: 700, color: '#71717a',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '5px 14px', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveWatchFor}
                  disabled={savingWatch}
                  style={{
                    fontSize: 12, fontWeight: 700,
                    color: savingWatch ? '#71717a' : cat.color,
                    background: `rgba(${cat.rgb},0.12)`,
                    border: `1px solid rgba(${cat.rgb},0.3)`,
                    borderRadius: 6, padding: '5px 14px', cursor: 'pointer',
                  }}
                >
                  {savingWatch ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.65, marginTop: 6 }}>
              {detail.watch_for || <span style={{ color: '#52525b', fontStyle: 'italic' }}>Not set — click Edit to add a curation signal for the pipeline.</span>}
            </p>
          )}
        </div>

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
              <p style={{ fontSize: 10, fontWeight: 700, color: '#52525b', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
                {label}
              </p>
              <p style={{ fontSize: 16, fontWeight: 900, color: '#d4d4d8', letterSpacing: '-0.01em' }}>
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
              color: '#71717a', textTransform: 'uppercase', flexShrink: 0,
            }}>
              Key Entities
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {detail.topEntities.map(e => {
              const em = ENTITY_COLORS[e.type] ?? { color: '#3b82f6', rgb: '59,130,246' }
              return (
                <span key={e.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  fontSize: 12, fontWeight: 700,
                  color: em.color,
                  background: `rgba(${em.rgb},0.1)`,
                  border: `1px solid rgba(${em.rgb},0.25)`,
                  borderRadius: 8, padding: '5px 11px',
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
              color: '#71717a', textTransform: 'uppercase', flexShrink: 0,
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
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderLeft: `3px solid ${rcat.color}`,
                    borderRadius: 10, padding: '14px 16px',
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
                    el.style.background = 'var(--surface)'
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
                    <span style={{ fontSize: 10, color: '#52525b', marginLeft: 'auto' }}>
                      {relTime(rt.last_updated)}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#d4d4d8', lineHeight: 1.35 }}>
                    {rt.title}
                  </p>
                  {rt.label && (
                    <p style={{ fontSize: 11, color: '#71717a', lineHeight: 1.55, fontStyle: 'italic' }}>
                      {rt.label}
                    </p>
                  )}
                  {rt.shared_tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {rt.shared_tags.slice(0, 4).map(tag => (
                        <span key={tag} style={{
                          fontSize: 9, fontWeight: 700, color: '#52525b',
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

      {/* Story arc — weekly snapshot progression */}
      {detail.snapshots && detail.snapshots.length >= 2 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
              color: '#71717a', textTransform: 'uppercase', flexShrink: 0,
            }}>
              Story Arc · {detail.snapshots.length} week{detail.snapshots.length !== 1 ? 's' : ''}
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div className="story-arc-card" style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10, padding: '20px 22px',
          }}>
            {detail.snapshots.map((snap, i) => {
              const isLatest = i === detail.snapshots!.length - 1
              const isLast   = i === detail.snapshots!.length - 1
              return (
                <div key={snap.week} style={{ display: 'flex', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 16 }}>
                    <div style={{
                      width: isLatest ? 10 : 7, height: isLatest ? 10 : 7,
                      borderRadius: '50%',
                      background: isLatest ? cat.color : 'rgba(255,255,255,0.15)',
                      border: isLatest ? `2px solid rgba(${cat.rgb},0.4)` : '1px solid rgba(255,255,255,0.08)',
                      marginTop: 4, flexShrink: 0,
                      boxShadow: isLatest ? `0 0 8px rgba(${cat.rgb},0.4)` : 'none',
                    }} />
                    {!isLast && (
                      <div style={{ width: 1, flex: 1, minHeight: 20, background: 'rgba(255,255,255,0.06)' }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: isLast ? 0 : 20, flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, fontFamily: 'monospace',
                      letterSpacing: '0.02em', display: 'block', marginBottom: 5, marginTop: 2,
                      color: '#a1a1aa',
                    }}>
                      {weekLabel(snap.week)}
                    </span>
                    <p style={{
                      fontSize: 13, lineHeight: 1.75,
                      color: isLatest ? '#a1a1aa' : '#71717a',
                      display: '-webkit-box',
                      WebkitLineClamp: isLatest ? 5 : 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {snap.summary}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Two-column body */}
      <div className="story-body-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: 20, alignItems: 'start' }}>

        {/* Timeline */}
        <div className="story-timeline-panel" style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12, padding: '24px 26px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <p style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
              color: '#71717a', textTransform: 'uppercase',
            }}>
              Timeline · {detail.events.length} update{detail.events.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => setShowLogForm(v => !v)}
              style={{
                marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                color: showLogForm ? cat.color : '#71717a',
                background: showLogForm ? `rgba(${cat.rgb},0.1)` : 'transparent',
                border: `1px solid ${showLogForm ? `rgba(${cat.rgb},0.3)` : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              + Log observation
            </button>
          </div>

          {showLogForm && (
            <div style={{
              marginBottom: 24, padding: '16px 18px',
              background: `rgba(${cat.rgb},0.05)`,
              border: `1px solid rgba(${cat.rgb},0.2)`,
              borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <textarea
                placeholder="What did you notice or want the pipeline to know about this story?"
                value={logText}
                onChange={e => setLogText(e.target.value)}
                rows={3}
                style={{
                  width: '100%', background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 7, padding: '9px 12px',
                  fontSize: 13, color: '#d4d4d8', lineHeight: 1.65,
                  resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select
                  value={logSig}
                  onChange={e => setLogSig(e.target.value)}
                  style={{
                    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '5px 10px',
                    fontSize: 12, color: '#9090c0', cursor: 'pointer', outline: 'none',
                  }}
                >
                  <option value="low">Low significance</option>
                  <option value="medium">Medium significance</option>
                  <option value="high">High significance</option>
                </select>
                <input
                  type="date"
                  value={logDate}
                  onChange={e => setLogDate(e.target.value)}
                  placeholder="Date (optional)"
                  style={{
                    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '5px 10px',
                    fontSize: 12, color: '#9090c0', outline: 'none', flex: 1, minWidth: 140,
                  }}
                />
                <input
                  type="url"
                  value={logUrl}
                  onChange={e => setLogUrl(e.target.value)}
                  placeholder="Source URL (optional)"
                  style={{
                    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '5px 10px',
                    fontSize: 12, color: '#9090c0', outline: 'none', flex: 2, minWidth: 160,
                  }}
                />
                <button
                  onClick={submitLogEvent}
                  disabled={submittingLog || !logText.trim()}
                  style={{
                    fontSize: 12, fontWeight: 700,
                    color: (submittingLog || !logText.trim()) ? '#71717a' : cat.color,
                    background: `rgba(${cat.rgb},0.12)`,
                    border: `1px solid rgba(${cat.rgb},0.3)`,
                    borderRadius: 6, padding: '5px 16px',
                    cursor: (submittingLog || !logText.trim()) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submittingLog ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {detail.events.length === 0 ? (
            <p style={{ fontSize: 13, color: '#52525b', fontStyle: 'italic', lineHeight: 1.6 }}>
              No AI-generated updates yet — next feed fetch will populate this.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {detail.events.map((event, i) => {
                const isManual = event.source === 'manual'
                const sigColor = isManual ? '#60a5fa' : (SIG_COLOR[event.significance] ?? '#71717a')
                const dotColor = isManual ? '#60a5fa' : (i === 0 ? cat.color : sigColor)
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
                        borderRadius: isManual ? 3 : '50%',
                        background: dotColor,
                        border: isLatest && !isManual ? `2px solid rgba(${cat.rgb},0.4)` : `2px solid ${dotColor}40`,
                        marginTop: 4, flexShrink: 0,
                        boxShadow: 'none',
                        transition: 'transform 0.15s',
                      }} />
                      {!isLast && (
                        <div style={{
                          width: 1, flex: 1, minHeight: 28,
                          background: isLatest && !isManual
                            ? `linear-gradient(to bottom, rgba(${cat.rgb},0.3), rgba(255,255,255,0.05))`
                            : 'rgba(255,255,255,0.07)',
                        }} />
                      )}
                    </div>

                    {/* Event content */}
                    <div style={{ paddingBottom: isLast ? 0 : 26, flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 800, color: '#a1a1aa',
                          fontFamily: 'monospace', letterSpacing: '0.02em',
                        }}>
                          {weekLabel(event.week)}
                        </span>
                        {isManual ? (
                          <span style={{
                            fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                            color: '#60a5fa',
                            background: 'rgba(96,165,250,0.12)',
                            border: '1px solid rgba(96,165,250,0.28)',
                            borderRadius: 3, padding: '1px 6px',
                            textTransform: 'uppercase',
                          }}>
                            Manual
                          </span>
                        ) : (
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
                        )}
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
                        fontSize: 14, color: '#a1a1aa',
                        lineHeight: 1.75,
                      }}>
                        {event.update_text}
                      </p>
                      {isManual && event.source_url && (
                        <a
                          href={event.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-block', marginTop: 4,
                            fontSize: 11, color: '#60a5fa', opacity: 0.75,
                            textDecoration: 'underline', textDecorationColor: 'rgba(96,165,250,0.3)',
                          }}
                        >
                          Source →
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Related articles */}
        <div className="story-coverage-panel" style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12, padding: '24px 26px',
        }}>
          <p style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
            color: '#71717a', textTransform: 'uppercase', marginBottom: 20,
          }}>
            Recent Coverage · {detail.related_items.length}
          </p>

          {detail.related_items.length === 0 ? (
            <p style={{ fontSize: 13, color: '#52525b', fontStyle: 'italic', lineHeight: 1.6 }}>
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
                    <span style={{ fontSize: 10, color: '#52525b', marginLeft: 'auto', flexShrink: 0 }}>
                      {relTime(item.published_at)}
                    </span>
                  </div>
                  <p style={{
                    fontSize: 13, fontWeight: 700, color: '#d4d4d8',
                    lineHeight: 1.45, marginBottom: item.hook ? 5 : 0,
                  }}>
                    {item.title}
                  </p>
                  {item.hook && (
                    <p style={{
                      fontSize: 12, color: '#71717a', lineHeight: 1.65,
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
  const sigColor = SIG_COLOR[sig] ?? '#71717a'
  const isHigh   = sig === 'high'

  return (
    <div
      className="story-spotlight-anim spotlight-card"
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
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#3f3f46' }} />
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
          fontSize: 22, fontWeight: 800, color: '#f4f4f5',
          letterSpacing: '-0.02em', lineHeight: 1.25,
        }}>
          {story.title}
        </h2>

        {story.latest_update && (
          <p style={{
            fontSize: 14, color: '#a1a1aa', lineHeight: 1.75,
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
              fontSize: 13, color: '#a1a1aa', lineHeight: 1.6,
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {story.watch_for}
            </p>
          </div>
        )}
      </div>

      {/* Right: stats + CTA */}
      <div className="spotlight-right" style={{
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
                color: '#52525b', textTransform: 'uppercase', marginBottom: 2,
              }}>
                {label}
              </p>
              <p style={{
                fontSize: 15, fontWeight: 900, letterSpacing: '-0.01em',
                color: color ?? '#d4d4d8',
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
          color: isActive ? meta.color : '#71717a',
          border: isActive
            ? `1px solid rgba(${meta.rgb},0.35)`
            : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '6px 14px',
          fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
          transition: 'all 0.15s ease',
          boxShadow: 'none',
          flexShrink: 0,
        }}
      >
        {isActive && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: meta.color, flexShrink: 0,
          }} />
        )}
        <span style={{ textTransform: 'capitalize' }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 900,
          color: isActive ? meta.color : '#3f3f46',
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
        color: '#71717a', textTransform: 'uppercase', flexShrink: 0,
      }}>
        {label}
      </span>
      {count !== undefined && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#3f3f46',
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
      <div className="h-7 w-7 rounded-full border border-blue-500 border-t-transparent animate-spin" />
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

  async function refreshDetail() {
    if (!selectedId) return
    const r = await fetch(`/api/stories/${selectedId}`)
    if (r.ok) setDetail(await r.json())
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
    <main className="stories-main" style={{
      padding: '32px 48px', maxWidth: 1600, margin: '0 auto',
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
            color: '#f4f4f5', fontSize: 28, fontWeight: 800,
            letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 6,
          }}>
            Story Threads
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: 14 }}>
            {loading
              ? 'Loading…'
              : `${total} active thread${total !== 1 ? 's' : ''} · auto-updated from feed`}
          </p>
        </div>

        <button
          onClick={handleUpdate}
          disabled={updating}
          style={{
            background: updating ? 'rgba(255,255,255,0.02)' : 'rgba(59,130,246,0.1)',
            color: updating ? '#71717a' : '#60a5fa',
            border: '1px solid rgba(59,130,246,0.22)',
            borderRadius: 12, padding: '11px 22px',
            fontSize: 13, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: updating ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
          }}
        >
          {updating
            ? <><span className="inline-block h-3 w-3 rounded-full border border-blue-500 border-t-transparent animate-spin" />Updating…</>
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
              onRefresh={refreshDetail}
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
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12, gap: 14,
            }}>
              <p className="eyebrow">No Threads Yet</p>
              <p style={{ color: '#a1a1aa', fontSize: 13, maxWidth: 320, lineHeight: 1.7 }}>
                Click "Update Now" to seed the pinned threads and scan recent feed items for emerging stories.
              </p>
              <button
                onClick={handleUpdate}
                disabled={updating}
                style={{
                  background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
                  border: '1px solid rgba(59,130,246,0.25)',
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
                <p style={{ fontSize: 13, color: '#52525b', fontStyle: 'italic', padding: '32px 0' }}>
                  No stories in this category yet.
                </p>
              ) : gridStories.length > 0 ? (
                <div>
                  <SectionHeader
                    label={activeCategory === 'all' ? 'All Stories' : activeCategory}
                    count={gridStories.length}
                  />
                  <div className="stories-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
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
