import Link from 'next/link'
import db from '@/lib/db'
import { relTime } from '@/lib/utils'
import { StatCard, QuickNavCard } from '@/components/HomeCards'

// ── Data fetching ─────���────────────────────────────────────────────────────

const CAT_COLOR: Record<string, { color: string; rgb: string }> = {
  capability: { color: '#a78bfa', rgb: '167,139,250' },
  safety:     { color: '#f87171', rgb: '248,113,113' },
  policy:     { color: '#fbbf24', rgb: '251,191,36'  },
  market:     { color: '#34d399', rgb: '52,211,153'  },
  tooling:    { color: '#60a5fa', rgb: '96,165,250'  },
  research:   { color: '#fb923c', rgb: '251,146,60'  },
}
const DEFAULT_CAT = { color: '#7c6aff', rgb: '124,106,255' }

async function getHomeData() {
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()
  const since6h  = new Date(Date.now() -  6 * 3600_000).toISOString()

  const [
    feedTodayRes,
    trendingRes,
    storiesRes,
    digestRes,
    modelCountRes,
    radarCountRes,
    pipelineRes,
    predEvidenceRes,
  ] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) as count FROM feed_items WHERE fetched_at >= ?`, args: [since24h] }),
    db.execute({
      sql: `SELECT id, title, source, url, hook, velocity_score, published_at
            FROM feed_items WHERE velocity_score > 0
            ORDER BY velocity_score DESC LIMIT 6`,
      args: [],
    }),
    db.execute({
      sql: `WITH latest AS (
              SELECT thread_id, significance,
                     ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY created_at DESC) AS rn
              FROM story_events
            )
            SELECT st.id, st.title, st.category, st.last_updated, st.is_pinned,
                   l.significance as latest_sig
            FROM story_threads st
            LEFT JOIN latest l ON l.thread_id = st.id AND l.rn = 1
            LEFT JOIN user_affinity ua ON ua.category = st.category AND ua.source = 'story'
            WHERE st.status = 'active'
            ORDER BY st.is_pinned DESC, COALESCE(ua.open_count, 0) DESC, st.last_updated DESC
            LIMIT 5`,
      args: [],
    }),
    db.execute({ sql: `SELECT week_start, highlights, created_at FROM weekly_digest ORDER BY created_at DESC LIMIT 1`, args: [] }),
    db.execute({ sql: `SELECT COUNT(*) as count FROM ai_models`, args: [] }),
    db.execute({ sql: `SELECT COUNT(*) as count FROM tech_radar`, args: [] }),
    db.execute({ sql: `SELECT MAX(fetched_at) as last_fetch, COUNT(*) as recent FROM feed_items WHERE fetched_at >= ?`, args: [since6h] }),
    db.execute({
      sql: `SELECT id, title, category, confidence, evidence, updated_at
            FROM ai_predictions
            WHERE status != 'past' AND evidence != '[]' AND updated_at >= ?
            ORDER BY updated_at DESC LIMIT 3`,
      args: [new Date(Date.now() - 7 * 24 * 3600_000).toISOString()],
    }),
  ])

  const feedToday   = (feedTodayRes.rows[0] as any)?.count ?? 0
  const trending    = trendingRes.rows as any[]
  const stories     = storiesRes.rows as any[]
  const modelCount  = (modelCountRes.rows[0] as any)?.count ?? 0
  const radarCount  = (radarCountRes.rows[0] as any)?.count ?? 0

  const digestRow   = digestRes.rows[0] as any ?? null
  let highlights: string[] = []
  if (digestRow?.highlights) {
    try { highlights = JSON.parse(digestRow.highlights) } catch {}
  }

  const pipelineRow  = pipelineRes.rows[0] as any ?? null
  const lastFetch    = pipelineRow?.last_fetch as string | null
  const recentCount  = (pipelineRow?.recent as number) ?? 0
  const ageMs        = lastFetch ? Date.now() - new Date(lastFetch).getTime() : Infinity
  const freshnessColor = ageMs < 7 * 3600_000 ? '#34d399' : ageMs < 14 * 3600_000 ? '#fbbf24' : '#f87171'
  const freshnessLabel = ageMs < 7 * 3600_000 ? 'Fresh' : ageMs < 14 * 3600_000 ? 'Delayed' : 'Stale'

  const predEvidence = (predEvidenceRes.rows as any[]).map(r => {
    let latestEvidence: { title: string; url?: string } | null = null
    try {
      const arr = JSON.parse(r.evidence ?? '[]')
      latestEvidence = arr.length ? arr[arr.length - 1] : null
    } catch {}
    return { ...r, latestEvidence }
  })

  return { feedToday, trending, stories, digest: digestRow, highlights, modelCount, radarCount, lastFetch, recentCount, freshnessColor, freshnessLabel, predEvidence }
}


// ── Page ─────��─────────────────────────────────��───────────────────────────

const CONF_COLOR: Record<string, string> = {
  speculative: '#5a5a7a',
  low:         '#60a5fa',
  medium:      '#fbbf24',
  high:        '#34d399',
  confirmed:   '#7c6aff',
}

export default async function HomePage() {
  const { feedToday, trending, stories, digest, highlights, modelCount, radarCount, lastFetch, recentCount, freshnessColor, freshnessLabel, predEvidence } = await getHomeData()

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <main style={{ padding: '36px 28px', maxWidth: 1400, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', color: '#5a5a7a', textTransform: 'uppercase', marginBottom: 10 }}>
          {today}
        </p>
        <h1 style={{ fontSize: 34, fontWeight: 900, color: '#e8e8f4', letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 8 }}>
          AI Daily Update
        </h1>
        <p style={{ fontSize: 15, color: '#6060a0', maxWidth: 520 }}>
          Your personal command center for tracking the AI landscape — stories, models, papers, and signals.
        </p>
      </div>

      {/* Pipeline health strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28,
        padding: '9px 16px', borderRadius: 8,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: freshnessColor, flexShrink: 0,
            boxShadow: `0 0 6px ${freshnessColor}`,
          }} />
          <span style={{ fontSize: 11, fontWeight: 900, color: freshnessColor, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {freshnessLabel}
          </span>
        </div>
        <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
        <span style={{ fontSize: 12, color: '#5a5a7a' }}>
          Last fetch: <span style={{ color: '#8080b0', fontWeight: 700 }}>{lastFetch ? relTime(lastFetch) : 'never'}</span>
        </span>
        <span style={{ fontSize: 12, color: '#5a5a7a' }}>
          Last 6h: <span style={{ color: '#8080b0', fontWeight: 700 }}>{recentCount} items</span>
        </span>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14, marginBottom: 36 }}>
        <StatCard label="New Today"     value={feedToday}   sub="articles fetched"        href="/feed"        accent="124,106,255" />
        <StatCard label="Active Stories" value={stories.length > 0 ? '✓' : '—'} sub={`${stories.length} threads`} href="/stories" accent="167,139,250" />
        <StatCard label="Models Tracked" value={modelCount}  sub="across all labs"         href="/models"      accent="96,165,250"  />
        <StatCard label="Radar Signals"  value={radarCount}  sub="technologies tracked"    href="/radar"       accent="52,211,153"  />
        <StatCard label="Weekly Digest"  value={digest ? '✓' : '—'} sub={digest ? `w/o ${digest.week_start}` : 'Not generated'} href="/digest" accent="251,191,36" />
      </div>

      {/* Main content: two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 24, alignItems: 'start' }}>

        {/* Left: trending + digest highlights */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Trending feed items */}
          <section style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 22px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', color: '#5a5a7a', textTransform: 'uppercase' }}>
                Trending Now
              </p>
              <Link href="/feed" style={{ fontSize: 12, color: '#5a5a7a', textDecoration: 'none', fontWeight: 700 }}>
                View all →
              </Link>
            </div>

            {trending.length === 0 ? (
              <p style={{ padding: '20px 22px', fontSize: 13, color: '#4a4a6a', fontStyle: 'italic' }}>
                No trending items yet — run a feed fetch to populate.
              </p>
            ) : (
              <div>
                {trending.map((item: any, i: number) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      textDecoration: 'none', display: 'block',
                      padding: '14px 22px',
                      borderBottom: i < trending.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                        color: '#7c6aff', background: 'rgba(124,106,255,0.1)',
                        border: '1px solid rgba(124,106,255,0.2)',
                        borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase', flexShrink: 0,
                      }}>
                        {item.source.replace('rss:', '')}
                      </span>
                      {item.velocity_score > 1.5 && (
                        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.1em', color: '#f87171', textTransform: 'uppercase' }}>
                          HOT
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: '#4a4a6a', marginLeft: 'auto', flexShrink: 0 }}>
                        {relTime(item.published_at)}
                      </span>
                    </div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#c8c8e0', lineHeight: 1.4, marginBottom: item.hook ? 4 : 0 }}>
                      {item.title}
                    </p>
                    {item.hook && (
                      <p style={{ fontSize: 12, color: '#5a5a7a', lineHeight: 1.55 }}>
                        {item.hook.length > 130 ? `${item.hook.slice(0, 130)}…` : item.hook}
                      </p>
                    )}
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* Digest highlights */}
          <section style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 16, overflow: 'hidden',
          }}>
            <div style={{
              padding: '16px 22px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', color: '#5a5a7a', textTransform: 'uppercase' }}>
                This Week's Digest
              </p>
              <Link href="/digest" style={{ fontSize: 12, color: '#5a5a7a', textDecoration: 'none', fontWeight: 700 }}>
                Read full →
              </Link>
            </div>

            {!digest ? (
              <p style={{ padding: '20px 22px', fontSize: 13, color: '#4a4a6a', fontStyle: 'italic' }}>
                No digest generated yet — go to Digest and click Generate.
              </p>
            ) : (
              <div style={{ padding: '18px 22px' }}>
                <p style={{ fontSize: 11, color: '#5a5a7a', marginBottom: 14, fontWeight: 700 }}>
                  Week of {digest.week_start} · {relTime(digest.created_at)}
                </p>
                {highlights.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {highlights.map((h: string, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: '#7c6aff', flexShrink: 0, marginTop: 6,
                          boxShadow: '0 0 6px rgba(124,106,255,0.6)',
                        }} />
                        <p style={{ fontSize: 14, color: '#9090c0', lineHeight: 1.6 }}>{h}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: '#4a4a6a', fontStyle: 'italic' }}>Digest available — open it to read.</p>
                )}
              </div>
            )}
          </section>

        </div>

        {/* Right: active story threads */}
        <section style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16, overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 22px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', color: '#5a5a7a', textTransform: 'uppercase' }}>
              Active Stories
            </p>
            <Link href="/stories" style={{ fontSize: 12, color: '#5a5a7a', textDecoration: 'none', fontWeight: 700 }}>
              View all →
            </Link>
          </div>

          {stories.length === 0 ? (
            <p style={{ padding: '20px 22px', fontSize: 13, color: '#4a4a6a', fontStyle: 'italic' }}>
              No story threads yet — go to Stories and click Update Now.
            </p>
          ) : (
            <div>
              {stories.map((s: any, i: number) => {
                const cat = CAT_COLOR[s.category] ?? DEFAULT_CAT
                const sigColors: Record<string, string> = { high: '#f87171', medium: '#fbbf24', low: '#5a5a8a' }
                const sigColor = sigColors[s.latest_sig] ?? '#5a5a8a'
                return (
                  <Link
                    key={s.id}
                    href="/stories"
                    style={{
                      textDecoration: 'none', display: 'block',
                      padding: '14px 22px',
                      borderBottom: i < stories.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                        color: cat.color, background: `rgba(${cat.rgb},0.1)`,
                        border: `1px solid rgba(${cat.rgb},0.2)`,
                        borderRadius: 3, padding: '1px 6px',
                        textTransform: 'uppercase', flexShrink: 0,
                      }}>
                        {s.category}
                      </span>
                      {s.latest_sig && (
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: sigColor, flexShrink: 0,
                          boxShadow: s.latest_sig === 'high' ? `0 0 5px ${sigColor}` : 'none',
                        }} />
                      )}
                      <span style={{ fontSize: 10, color: '#4a4a6a', marginLeft: 'auto', flexShrink: 0 }}>
                        {relTime(s.last_updated)}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#c0c0dc', lineHeight: 1.4 }}>
                      {s.title}
                    </p>
                  </Link>
                )
              })}
            </div>
          )}
        </section>

      </div>

      {/* Prediction signals */}
      {predEvidence.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', color: '#5a5a7a', textTransform: 'uppercase' }}>
              Prediction Signals This Week
            </p>
            <Link href="/predictions" style={{ fontSize: 12, color: '#5a5a7a', textDecoration: 'none', fontWeight: 700 }}>
              View all →
            </Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {predEvidence.map((p: any) => {
              const confColor = CONF_COLOR[p.confidence] ?? '#5a5a7a'
              const cat = CAT_COLOR[p.category] ?? DEFAULT_CAT
              return (
                <Link key={p.id} href="/predictions" style={{ textDecoration: 'none' }}>
                  <div style={{
                    padding: '14px 18px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{
                        fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                        color: cat.color, background: `rgba(${cat.rgb},0.1)`,
                        border: `1px solid rgba(${cat.rgb},0.2)`,
                        borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase',
                      }}>
                        {p.category}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
                        color: confColor, textTransform: 'uppercase', marginLeft: 'auto',
                      }}>
                        {p.confidence}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#c0c0dc', lineHeight: 1.4, marginBottom: 8 }}>
                      {p.title}
                    </p>
                    {p.latestEvidence && (
                      <p style={{ fontSize: 11, color: '#5a5a7a', lineHeight: 1.5 }}>
                        New signal: {p.latestEvidence.title?.slice(0, 80) ?? '—'}
                      </p>
                    )}
                    <p style={{ fontSize: 10, color: '#3a3a5a', marginTop: 6 }}>
                      {relTime(p.updated_at)}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Quick nav */}
      <div style={{ marginTop: 36 }}>
        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.16em', color: '#5a5a7a', textTransform: 'uppercase', marginBottom: 16 }}>
          All Sections
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {[
            { href: '/feed',        label: 'Feed',        desc: 'Latest articles & papers'        },
            { href: '/digest',      label: 'Digest',      desc: 'Weekly AI briefing'              },
            { href: '/stories',     label: 'Stories',     desc: 'Ongoing narrative threads'       },
            { href: '/radar',       label: 'Radar',       desc: 'Technology tracking signals'     },
            { href: '/models',      label: 'Models',      desc: 'AI model release tracker'        },
            { href: '/repos',       label: 'Repos',       desc: 'Trending GitHub repositories'    },
            { href: '/datasets',    label: 'Datasets',    desc: 'HuggingFace & Kaggle datasets'   },
            { href: '/predictions', label: 'Predictions', desc: 'AI milestone timeline bets'      },
            { href: '/entities',    label: 'Entities',    desc: 'Companies, models, researchers'  },
            { href: '/advisor',     label: 'Advisor',     desc: 'Personalized AI learning path'   },
            { href: '/timeline',    label: 'Timeline',    desc: 'Historical AI events'            },
          ].map(({ href, label, desc }) => (
            <QuickNavCard key={href} href={href} label={label} desc={desc} />
          ))}
        </div>
      </div>

    </main>
  )
}
