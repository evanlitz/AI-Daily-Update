import Link from 'next/link'
import { notFound } from 'next/navigation'
import db from '@/lib/db'
import { relTime } from '@/lib/utils'

const TYPE_META: Record<string, { color: string; rgb: string }> = {
  company:    { color: '#34d399', rgb: '52,211,153'   },
  model:      { color: '#a78bfa', rgb: '167,139,250'  },
  researcher: { color: '#fbbf24', rgb: '251,191,36'   },
  paper:      { color: '#60a5fa', rgb: '96,165,250'   },
}
const DEFAULT_TYPE = { color: '#7c6aff', rgb: '124,106,255' }

function cleanSource(src: string) {
  return src.replace(/^rss:/, '').replace(/_/g, ' ')
}

async function getEntity(id: string) {
  const [entityRes, feedItemsRes, storiesRes] = await Promise.all([
    db.execute({ sql: `SELECT * FROM entities WHERE id = ?`, args: [id] }),
    db.execute({
      sql: `SELECT fi.id, fi.title, fi.url, fi.source, fi.hook, fi.published_at, fi.velocity_score
            FROM entity_mentions em
            JOIN feed_items fi ON fi.id = em.source_id
            WHERE em.entity_id = ? AND em.source_type = 'feed_item'
            ORDER BY fi.fetched_at DESC
            LIMIT 40`,
      args: [id],
    }),
    db.execute({
      sql: `SELECT DISTINCT st.id, st.title, st.category, st.last_updated
            FROM story_threads st
            JOIN story_events se ON se.thread_id = st.id
            WHERE st.status = 'active'
              AND EXISTS (
                SELECT 1 FROM json_each(se.feed_item_ids) j
                JOIN entity_mentions em ON em.source_id = j.value
                WHERE em.entity_id = ? AND em.source_type = 'feed_item'
              )
            ORDER BY st.last_updated DESC
            LIMIT 5`,
      args: [id],
    }),
  ])

  const entity = entityRes.rows[0] as any
  if (!entity) return null
  return {
    entity: { ...entity, aliases: JSON.parse(entity.aliases ?? '[]') as string[] },
    feedItems: feedItemsRes.rows as any[],
    relatedStories: storiesRes.rows as any[],
  }
}

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getEntity(id)
  if (!data) notFound()

  const { entity, feedItems, relatedStories } = data
  const meta = TYPE_META[entity.type] ?? DEFAULT_TYPE

  return (
    <main style={{
      padding: '36px 28px', maxWidth: 1100, margin: '0 auto',
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.022) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
    }}>
      <style>{`
        .entity-feed-item:hover { background: rgba(255,255,255,0.028) !important; }
        .entity-back-btn:hover { color: #c0c0e0 !important; background: rgba(255,255,255,0.06) !important; }
      `}</style>

      {/* Back */}
      <Link
        href="/entities"
        className="entity-back-btn"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 13, fontWeight: 700, color: '#6060a0',
          textDecoration: 'none', marginBottom: 28,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '7px 14px',
          transition: 'color 0.15s, background 0.15s',
        }}
      >
        ← Entities
      </Link>

      {/* Header card */}
      <div style={{
        padding: '28px 32px',
        background: `linear-gradient(135deg, rgba(${meta.rgb},0.08) 0%, rgba(${meta.rgb},0.02) 60%, rgba(255,255,255,0.01) 100%)`,
        border: `1px solid rgba(${meta.rgb},0.18)`,
        borderLeft: `4px solid ${meta.color}`,
        borderRadius: 18, marginBottom: 32,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -60, right: -60,
          width: 220, height: 220, borderRadius: '50%',
          background: `rgba(${meta.rgb},0.06)`,
          filter: 'blur(40px)', pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 900, letterSpacing: '0.15em',
            color: meta.color, background: `rgba(${meta.rgb},0.14)`,
            border: `1px solid rgba(${meta.rgb},0.3)`,
            borderRadius: 5, padding: '3px 10px', textTransform: 'uppercase',
          }}>
            {entity.type}
          </span>
          <span style={{ fontSize: 12, color: '#5a5a7a', marginLeft: 'auto' }}>
            First seen {relTime(entity.first_seen)}
          </span>
        </div>

        <h1 style={{
          fontSize: 30, fontWeight: 900, color: '#eeeef8',
          letterSpacing: '-0.025em', lineHeight: 1.15, marginBottom: 10,
        }}>
          {entity.name}
        </h1>

        {entity.aliases.length > 0 && (
          <p style={{ fontSize: 12, color: '#5a5a7a', marginBottom: 18 }}>
            Also seen as: {entity.aliases.slice(0, 6).join(', ')}
          </p>
        )}

        <div style={{
          display: 'flex', gap: 24, paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap',
        }}>
          {[
            { label: 'Total mentions', value: String(entity.mention_count) },
            { label: 'Feed items', value: String(feedItems.length) },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#4a4a6a', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>
                {label}
              </p>
              <p style={{ fontSize: 18, fontWeight: 900, color: '#c0c0e0' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Related story threads */}
      {relatedStories.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <p style={{
              fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
              color: '#5a5a7a', textTransform: 'uppercase', flexShrink: 0,
            }}>
              Related Stories
            </p>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {relatedStories.map((s: any) => {
              const CAT: Record<string, { color: string; rgb: string }> = {
                capability: { color: '#a78bfa', rgb: '167,139,250' },
                safety:     { color: '#f87171', rgb: '248,113,113' },
                policy:     { color: '#fbbf24', rgb: '251,191,36'  },
                market:     { color: '#34d399', rgb: '52,211,153'  },
                tooling:    { color: '#60a5fa', rgb: '96,165,250'  },
                research:   { color: '#fb923c', rgb: '251,146,60'  },
              }
              const cat = CAT[s.category] ?? { color: '#7c6aff', rgb: '124,106,255' }
              return (
                <Link
                  key={s.id}
                  href="/stories"
                  className="entity-back-btn"
                  style={{
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderLeft: `3px solid ${cat.color}`,
                    borderRadius: 10,
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{
                    fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
                    color: cat.color, background: `rgba(${cat.rgb},0.1)`,
                    border: `1px solid rgba(${cat.rgb},0.2)`,
                    borderRadius: 3, padding: '1px 6px',
                    textTransform: 'uppercase', flexShrink: 0,
                  }}>
                    {s.category}
                  </span>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#c4c4e0', lineHeight: 1.35 }}>
                    {s.title}
                  </p>
                  <span style={{ fontSize: 10, color: '#4a4a6a', marginLeft: 'auto', flexShrink: 0 }}>
                    {relTime(s.last_updated)}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Feed items timeline */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16, overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px 24px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: '#5a5a7a', textTransform: 'uppercase' }}>
            Feed Coverage · {feedItems.length}
          </p>
        </div>

        {feedItems.length === 0 ? (
          <p style={{ padding: '24px', fontSize: 13, color: '#4a4a6a', fontStyle: 'italic' }}>
            No feed items linked yet — entity mentions are extracted during each pipeline run.
          </p>
        ) : (
          <div>
            {feedItems.map((item: any, i: number) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="entity-feed-item"
                style={{
                  textDecoration: 'none', display: 'block',
                  padding: '16px 24px',
                  borderBottom: i < feedItems.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  transition: 'background 0.14s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                    color: meta.color, background: `rgba(${meta.rgb},0.1)`,
                    border: `1px solid rgba(${meta.rgb},0.22)`,
                    borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase', flexShrink: 0,
                  }}>
                    {cleanSource(item.source)}
                  </span>
                  {item.velocity_score > 1.5 && (
                    <span style={{ fontSize: 9, fontWeight: 900, color: '#f87171', textTransform: 'uppercase', flexShrink: 0 }}>
                      HOT
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: '#4a4a6a', marginLeft: 'auto', flexShrink: 0 }}>
                    {relTime(item.published_at)}
                  </span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#c8c8e0', lineHeight: 1.45, marginBottom: item.hook ? 5 : 0 }}>
                  {item.title}
                </p>
                {item.hook && (
                  <p style={{ fontSize: 12, color: '#5a5a7a', lineHeight: 1.65 }}>
                    {item.hook}
                  </p>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
