'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { relTime } from '@/lib/utils'

interface Entity {
  id: string
  name: string
  type: string
  aliases: string[]
  first_seen: string
  mention_count: number
}

interface FeedItem {
  id: string
  title: string
  url: string
  source: string
  hook: string | null
  published_at: string | null
  velocity_score: number
}

interface RelatedStory {
  id: string
  title: string
  category: string
  last_updated: string
}

interface RelatedEntity {
  related_id: string
  name: string
  type: string
  weight: number
}

interface EntityDetail {
  entity: Entity
  feedItems: FeedItem[]
  relatedStories: RelatedStory[]
  relatedEntities: RelatedEntity[]
}

const TYPE_META: Record<string, { color: string; rgb: string; label: string }> = {
  company:    { color: '#34d399', rgb: '52,211,153',  label: 'Company' },
  model:      { color: '#a78bfa', rgb: '167,139,250', label: 'Model' },
  researcher: { color: '#fbbf24', rgb: '251,191,36',  label: 'Researcher' },
  paper:      { color: '#60a5fa', rgb: '96,165,250',  label: 'Paper' },
}
const DEFAULT_TYPE = { color: '#71717a', rgb: '113,113,122', label: 'Other' }

function cleanSource(src: string): string {
  return src.replace(/^rss:/, '').replace(/_/g, ' ')
}

export default function EntityDetailPage() {
  const params = useParams<{ id: string }>()
  const [data, setData] = useState<EntityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/entities/${params.id}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); return null }
        return r.json()
      })
      .then(json => { if (json) setData(json) })
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <main className="mx-auto max-w-screen-2xl px-4 sm:px-10 py-8">
        <div className="flex items-center justify-center py-24">
          <div className="h-6 w-6 rounded-full border border-blue-500 border-t-transparent animate-spin" />
        </div>
      </main>
    )
  }

  if (notFound || !data) {
    return (
      <main className="mx-auto max-w-screen-2xl px-4 sm:px-10 py-8">
        <p style={{ color: 'var(--muted)' }}>Entity not found. <Link href="/entities" style={{ color: 'var(--accent)' }}>Back to entities</Link></p>
      </main>
    )
  }

  const { entity, feedItems, relatedStories, relatedEntities } = data
  const meta = TYPE_META[entity.type] ?? DEFAULT_TYPE

  return (
    <main className="mx-auto max-w-screen-2xl px-4 sm:px-10 py-8">
      <Link href="/entities" style={{ color: 'var(--muted)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20 }}>
        ← All entities
      </Link>

      {/* Header */}
      <div className="mb-8" style={{ borderLeft: `3px solid ${meta.color}`, paddingLeft: 20 }}>
        <div className="flex items-center gap-2 mb-2">
          <span style={{
            fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', color: meta.color,
            background: `rgba(${meta.rgb},0.12)`, border: `1px solid rgba(${meta.rgb},0.3)`,
            borderRadius: 4, padding: '2px 8px', textTransform: 'uppercase',
          }}>
            {meta.label}
          </span>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', color: '#f4f4f5' }}>{entity.name}</h1>
        {entity.aliases.length > 0 && (
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>
            Also known as: {entity.aliases.join(', ')}
          </p>
        )}
        <div className="flex items-center gap-2.5 mt-3" style={{ color: 'var(--muted)', fontSize: 13 }}>
          <span>{entity.mention_count} total mention{entity.mention_count !== 1 ? 's' : ''}</span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-2)' }} />
          <span>First seen {relTime(entity.first_seen)}</span>
        </div>
      </div>

      <div className="grid gap-8" style={{ gridTemplateColumns: (relatedStories.length || relatedEntities.length) ? '1fr 340px' : '1fr' }}>
        {/* Feed items */}
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            Recent mentions
          </h2>
          {feedItems.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>No recent articles found.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {feedItems.map(item => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block', background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, padding: '13px 16px', transition: 'border-color 0.15s ease',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                >
                  <div className="flex items-center gap-2 mb-1.5" style={{ fontSize: 11, color: 'var(--muted)' }}>
                    <span style={{ textTransform: 'capitalize' }}>{cleanSource(item.source)}</span>
                    <span>· {relTime(item.published_at)}</span>
                  </div>
                  <p style={{ fontSize: 14.5, fontWeight: 600, color: '#e4e4e7', lineHeight: 1.4 }}>{item.title}</p>
                  {item.hook && (
                    <p style={{ fontSize: 13, color: 'var(--dim)', marginTop: 4, lineHeight: 1.5 }}>{item.hook}</p>
                  )}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: related entities + related story threads */}
        {(relatedEntities.length > 0 || relatedStories.length > 0) && (
          <div className="flex flex-col gap-8">
            {relatedEntities.length > 0 && (
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
                  Related entities
                </h2>
                <div className="flex flex-col gap-2">
                  {relatedEntities.map(re => {
                    const rm = TYPE_META[re.type] ?? DEFAULT_TYPE
                    return (
                      <Link
                        key={re.related_id}
                        href={`/entities/${re.related_id}`}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderLeft: `3px solid ${rm.color}`, borderRadius: 8, padding: '10px 14px',
                        }}
                      >
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#e4e4e7' }}>{re.name}</span>
                        <span style={{ fontSize: 10, color: rm.color, textTransform: 'uppercase', fontWeight: 700 }}>
                          {rm.label}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {relatedStories.length > 0 && (
              <div>
                <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
                  Related story threads
                </h2>
                <div className="flex flex-col gap-2">
                  {relatedStories.map(s => (
                    <Link
                      key={s.id}
                      href="/stories"
                      style={{
                        display: 'block', background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: 8, padding: '12px 14px',
                      }}
                    >
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: '#e4e4e7', lineHeight: 1.4 }}>{s.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textTransform: 'capitalize' }}>
                        {s.category} · {relTime(s.last_updated)}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
