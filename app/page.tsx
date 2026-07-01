import Link from 'next/link'
import db from '@/lib/db'
import { relTime } from '@/lib/utils'
import { getLatestBrief } from '@/lib/intelligence/brief'
import { BriefAudio } from '@/components/BriefAudio'
import { CollapsibleAbout } from '@/components/CollapsibleAbout'

export const dynamic = 'force-dynamic'

// ── Page directory ────────────────────────────────────────────────────────────

const PAGE_DIRECTORY = [
  {
    href: '/feed', label: 'Feed',
    desc: 'Real-time articles from 12+ sources, screened by Claude for relevance. Updated at 8am and 8pm UTC.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="10" width="3" height="6" rx="1"/><rect x="7.5" y="6" width="3" height="10" rx="1"/><rect x="13" y="2" width="3" height="14" rx="1"/>
      </svg>
    ),
  },
  {
    href: '/digest', label: 'Digest',
    desc: 'Weekly briefing generated from the past 7 days. Macro trends, research summaries, and a tools roundup.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
        <rect x="3" y="2" width="12" height="14" rx="2"/>
        <line x1="6" y1="6" x2="12" y2="6"/><line x1="6" y1="9" x2="12" y2="9"/><line x1="6" y1="12" x2="10" y2="12"/>
      </svg>
    ),
  },
  {
    href: '/stories', label: 'Stories',
    desc: 'Narrative threads connecting related articles over time, with significance levels and weekly arc graphs.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="var(--accent)" strokeWidth="1.5">
        <circle cx="4" cy="9" r="2"/><circle cx="14" cy="4" r="2"/><circle cx="14" cy="14" r="2"/>
        <line x1="6" y1="8.2" x2="12" y2="4.8"/><line x1="6" y1="9.8" x2="12" y2="13.2"/>
      </svg>
    ),
  },
  {
    href: '/models', label: 'Models',
    desc: 'Release tracker for every major AI model — GPT, Claude, Gemini, Llama. Benchmarks, pricing, score charts.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="2" width="6" height="6" rx="1.5"/><rect x="10" y="2" width="6" height="6" rx="1.5"/>
        <rect x="2" y="10" width="6" height="6" rx="1.5"/><rect x="10" y="10" width="6" height="6" rx="1.5"/>
      </svg>
    ),
  },
  {
    href: '/repos', label: 'Repos',
    desc: 'Trending GitHub repositories in AI/ML ranked by star velocity. Daily gains and last-updated timestamps.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="9,2 11.2,6.5 16.5,7.3 12.7,11 13.6,16.3 9,13.9 4.4,16.3 5.3,11 1.5,7.3 6.8,6.5"/>
      </svg>
    ),
  },
  {
    href: '/datasets', label: 'Datasets',
    desc: 'HuggingFace and Kaggle datasets relevant to AI research, filterable by modality and task type.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="3" width="14" height="3" rx="1"/><rect x="2" y="8" width="14" height="3" rx="1"/><rect x="2" y="13" width="14" height="3" rx="1"/>
      </svg>
    ),
  },
  {
    href: '/predictions', label: 'Predictions',
    desc: 'A ledger of AI milestone predictions with confidence levels. Status updates automatically from the feed.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="9" cy="9" r="7"/><circle cx="9" cy="9" r="3"/>
        <line x1="9" y1="2" x2="9" y2="5"/><line x1="9" y1="13" x2="9" y2="16"/>
        <line x1="2" y1="9" x2="5" y2="9"/><line x1="13" y1="9" x2="16" y2="9"/>
      </svg>
    ),
  },
  {
    href: '/advisor', label: 'Advisor',
    desc: 'Claude generates personalized AI project briefs based on trending developments and your skill level.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M9 2v3M9 13v3M2 9h3M13 9h3M4.2 4.2l2.1 2.1M11.7 11.7l2.1 2.1M13.8 4.2l-2.1 2.1M6.3 11.7l-2.1 2.1"/>
        <circle cx="9" cy="9" r="2.5"/>
      </svg>
    ),
  },
  {
    href: '/timeline', label: 'Timeline',
    desc: 'Full-screen visualization of AI events from 2015 through projected 2030+ milestones.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 18 18" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round">
        <line x1="1" y1="9" x2="17" y2="9"/>
        <circle cx="4.5" cy="9" r="2" fill="var(--accent)" stroke="none"/>
        <circle cx="9" cy="9" r="2" fill="var(--accent)" stroke="none"/>
        <circle cx="13.5" cy="9" r="2" fill="var(--accent)" stroke="none"/>
        <line x1="4.5" y1="9" x2="4.5" y2="5"/><line x1="9" y1="9" x2="9" y2="13"/><line x1="13.5" y1="9" x2="13.5" y2="5"/>
      </svg>
    ),
  },
]

// ── Constants ─────────────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  capability: '#a78bfa',
  safety:     '#f87171',
  policy:     '#fbbf24',
  market:     '#34d399',
  tooling:    '#60a5fa',
  research:   '#fb923c',
}

const CONF_COLOR: Record<string, string> = {
  speculative: '#52525b',
  low:         '#60a5fa',
  medium:      '#f59e0b',
  high:        '#22c55e',
  confirmed:   '#3b82f6',
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getHomeData() {
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()
  const since6h  = new Date(Date.now() -  6 * 3600_000).toISOString()

  const [
    feedTodayRes,
    trendingRes,
    storiesRes,
    digestRes,
    modelCountRes,
    pipelineRes,
    predEvidenceRes,
    storyCountRes,
    predCountRes,
  ] = await Promise.all([
    db.execute({ sql: `SELECT COUNT(*) as count FROM feed_items WHERE fetched_at >= ?`, args: [since24h] }),
    db.execute({
      sql: `SELECT id, title, source, url, hook, velocity_score, published_at
            FROM feed_items
            WHERE velocity_score > 0 AND screened = 1 AND fetched_at >= ?
            ORDER BY velocity_score DESC LIMIT 6`,
      args: [new Date(Date.now() - 72 * 3600_000).toISOString()],
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
    db.execute({ sql: `SELECT MAX(fetched_at) as last_fetch, COUNT(*) as recent FROM feed_items WHERE fetched_at >= ?`, args: [since6h] }),
    db.execute({
      sql: `SELECT id, title, category, confidence, evidence, updated_at,
                   year_min, year_max, year_guess, month_guess, date_guess
            FROM ai_predictions
            WHERE status != 'past' AND evidence != '[]' AND updated_at >= ?
            ORDER BY updated_at DESC LIMIT 8`,
      args: [new Date(Date.now() - 30 * 24 * 3600_000).toISOString()],
    }),
    db.execute({ sql: `SELECT COUNT(*) as count FROM story_threads WHERE status = 'active'`, args: [] }),
    db.execute({ sql: `SELECT COUNT(*) as count FROM ai_predictions WHERE status != 'past'`, args: [] }),
  ])

  const feedToday    = (feedTodayRes.rows[0] as any)?.count ?? 0
  const trending     = trendingRes.rows as any[]
  const stories      = storiesRes.rows as any[]
  const modelCount   = (modelCountRes.rows[0] as any)?.count ?? 0
  const totalStories = (storyCountRes.rows[0] as any)?.count ?? 0
  const totalPreds   = (predCountRes.rows[0] as any)?.count ?? 0

  const digestRow = digestRes.rows[0] as any ?? null
  let highlights: string[] = []
  if (digestRow?.highlights) {
    try { highlights = JSON.parse(digestRow.highlights) } catch {}
  }

  const pipelineRow = pipelineRes.rows[0] as any ?? null
  const lastFetch   = pipelineRow?.last_fetch as string | null
  const ageMs       = lastFetch ? Date.now() - new Date(lastFetch).getTime() : Infinity
  const freshnessColor = ageMs < 7 * 3600_000 ? '#34d399' : ageMs < 14 * 3600_000 ? '#f59e0b' : '#ef4444'

  const predEvidence = (predEvidenceRes.rows as any[]).map(r => {
    let latestEvidence: { title: string; url?: string } | null = null
    try {
      const arr = JSON.parse(r.evidence ?? '[]')
      latestEvidence = arr.length ? arr[arr.length - 1] : null
    } catch {}
    return { ...r, latestEvidence }
  })

  return {
    feedToday, trending, stories, digest: digestRow, highlights,
    modelCount, lastFetch, freshnessColor,
    predEvidence, totalStories, totalPreds,
  }
}

// ── Home chip ─────────────────────────────────────────────────────────────────

function HomeChip() {
  const BOARD = '#0c1425'
  const TRACE = '#1e3358'
  const PIN   = '#64748b'
  const GLOW  = '#3b82f6'
  const pinYs = [20, 30, 40, 50, 60, 70]
  const pinXs = [20, 30, 40, 50, 60, 70]
  return (
    <svg width="156" height="156" viewBox="0 0 90 90"
      style={{ filter: 'drop-shadow(0 12px 28px rgba(59,130,246,0.22)) drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }}>
      {/* PCB */}
      <rect x="0" y="0" width="90" height="90" rx="6" fill={BOARD} />
      {/* Trace lines */}
      {pinYs.map((y, i) => (
        <g key={`h${i}`}>
          <line x1="0" y1={y} x2="15" y2={y} stroke={TRACE} strokeWidth="1.5" />
          <line x1="75" y1={y} x2="90" y2={y} stroke={TRACE} strokeWidth="1.5" />
        </g>
      ))}
      {pinXs.map((x, i) => (
        <g key={`v${i}`}>
          <line x1={x} y1="0" x2={x} y2="15" stroke={TRACE} strokeWidth="1.5" />
          <line x1={x} y1="75" x2={x} y2="90" stroke={TRACE} strokeWidth="1.5" />
        </g>
      ))}
      {/* Chip package */}
      <rect x="15" y="15" width="60" height="60" rx="3" fill="#060d1c" />
      <rect x="17" y="17" width="56" height="56" rx="2" fill="#0d1a30" />
      {/* Die cells */}
      <rect x="21" y="21" width="22" height="22" rx="1" fill="#101f38" />
      <rect x="47" y="21" width="22" height="22" rx="1" fill="#0b1830" />
      <rect x="21" y="47" width="22" height="22" rx="1" fill="#0b1830" />
      <rect x="47" y="47" width="22" height="22" rx="1" fill="#101f38" />
      {/* Central compute core */}
      <rect x="27" y="27" width="36" height="36" rx="2" fill="#060e1c" />
      <rect x="30" y="30" width="30" height="30" rx="1" fill="#040b18" />
      {/* AI glyph + glow */}
      <rect x="32" y="38" width="26" height="15" rx="2" fill={GLOW} opacity="0.08" />
      <text x="45" y="47" textAnchor="middle" dominantBaseline="middle"
        fontSize="13" fontWeight="900" fontFamily="'Courier New', monospace"
        fill={GLOW} letterSpacing="2">AI</text>
      {/* Pins */}
      {pinYs.map((y, i) => <rect key={`pl${i}`} x="1"  y={y - 3} width="13" height="5" rx="2" fill={PIN} />)}
      {pinYs.map((y, i) => <rect key={`pr${i}`} x="76" y={y - 3} width="13" height="5" rx="2" fill={PIN} />)}
      {pinXs.map((x, i) => <rect key={`pt${i}`} x={x - 3} y="1"  width="5" height="13" rx="2" fill={PIN} />)}
      {pinXs.map((x, i) => <rect key={`pb${i}`} x={x - 3} y="76" width="5" height="13" rx="2" fill={PIN} />)}
      {/* Status LED — animated pulse ring */}
      <circle cx="80" cy="10" r="4.5" fill="#22c55e" opacity="0.15" />
      <circle cx="80" cy="10" r="2.5" fill="#22c55e" opacity="0.9" />
      <circle cx="80" cy="10" r="1.5" fill="#86efac" />
      <circle cx="80" cy="10" r="2.5" fill="none" stroke="#22c55e" strokeWidth="1.2" opacity="0.7">
        <animate attributeName="r" values="2.5;7;2.5" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.7;0;0.7" dur="2.2s" repeatCount="indefinite" />
      </circle>
      {/* Part label */}
      <text x="6" y="10" fontSize="4.5" fontFamily="'Courier New', monospace"
        fill={GLOW} opacity="0.55" letterSpacing="0.3">DU-1A</text>
    </svg>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionHeader({ label, href, linkLabel, large }: { label: string; href?: string; linkLabel?: string; large?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: large ? 16 : 14 }}>
      <span style={{
        fontSize: large ? 20 : 12, fontWeight: large ? 700 : 600,
        color: large ? 'var(--text)' : 'var(--muted)',
        letterSpacing: large ? '-0.02em' : undefined,
      }}>{label}</span>
      {href && linkLabel && (
        <Link href={href} style={{
          fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500,
          border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6,
          padding: '4px 10px', lineHeight: 1,
        }}>
          {linkLabel}
        </Link>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const [data, brief] = await Promise.all([getHomeData(), getLatestBrief()])
  const {
    feedToday, trending, stories, digest, highlights,
    modelCount, lastFetch, freshnessColor,
    predEvidence, totalStories,
  } = data

  return (
    <main className="home-wrap" style={{ padding: '36px 48px', maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="home-header" style={{
        marginBottom: 36, paddingBottom: 32, borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 48,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Date + freshness — single compact line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <span style={{ fontSize: 15, color: 'var(--muted)', fontWeight: 500 }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: freshnessColor, flexShrink: 0 }} />
              <span style={{ fontSize: 15, color: '#3f3f46' }}>
                {lastFetch ? `Updated ${relTime(lastFetch)}` : 'Pipeline pending'}
              </span>
            </div>
          </div>

          {/* Title */}
          <h1 className="home-title" style={{
            fontSize: 72, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 36,
            background: 'linear-gradient(135deg, #f4f4f5 30%, #71717a 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            AI Daily Update
          </h1>

          {/* Big stat numbers */}
          <div className="home-stats" style={{ display: 'flex', gap: 44, alignItems: 'flex-start' }}>
            {([
              { value: feedToday,    label: 'signals today',  href: '/feed'    },
              { value: totalStories, label: 'active threads', href: '/stories' },
              { value: modelCount,   label: 'models tracked', href: '/models'  },
            ] as const).map(({ value, label, href }) => (
              <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <p className="home-stat-value" style={{
                  fontSize: 48, fontWeight: 800, color: '#f4f4f5',
                  letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 7,
                }}>
                  {value}
                </p>
                <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
                  {label}
                </p>
              </Link>
            ))}
          </div>

        </div>

        {/* Chip */}
        <div className="home-chip-wrap" style={{ flexShrink: 0, position: 'relative' }}>
          <div style={{
            position: 'absolute', inset: -28, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <HomeChip />
        </div>
      </header>

      {/* ── Daily Brief ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 36 }}>
        {brief ? (
          <div className="home-brief-card" style={{
            background: 'var(--surface)', border: '1px solid rgba(59,130,246,0.45)',
            borderRadius: 14, padding: '28px 32px',
          }}>

            {/* Card header */}
            <div className="home-brief-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>Today&apos;s Briefing</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ position: 'relative', display: 'flex', width: 7, height: 7 }}>
                    <span className="ping-slow" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(34,197,94,0.4)' }} />
                    <span style={{ position: 'relative', width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                  </div>
                  <span style={{ fontSize: 13, color: '#52525b' }}>Generated {relTime(brief.created_at)}</span>
                </div>
                <BriefAudio signal={brief.signal} rising={brief.rising} watch={brief.watch} shift={brief.shift} />
              </div>
            </div>

            {/* Two-column layout: Signal (lead) + Rising/Watch/Shift (sidebar) */}
            <div className="home-brief-layout" style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>

              {/* Left — Signal */}
              <div className="home-brief-signal" style={{ flex: '0 0 58%', paddingRight: 36, borderRight: '1px solid var(--border)' }}>
                <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.01em', marginBottom: 14 }}>
                  Signal
                </p>
                <p style={{ fontSize: 20, color: '#e4e4e7', lineHeight: 1.75 }}>
                  {brief.signal}
                </p>
              </div>

              {/* Right — Rising / Watch / Shift */}
              <div className="home-brief-sidebar" style={{ flex: 1, paddingLeft: 36, display: 'flex', flexDirection: 'column' }}>
                {[
                  { label: 'Rising', text: brief.rising },
                  { label: 'Watch',  text: brief.watch  },
                  { label: 'Shift',  text: brief.shift  },
                ].map(({ label, text }, i) => (
                  <div
                    key={label}
                    style={{
                      flex: 1,
                      paddingTop:    i > 0 ? 20 : 0,
                      paddingBottom: i < 2  ? 20 : 0,
                      borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.01em', marginBottom: 8 }}>
                      {label}
                    </p>
                    <p style={{ fontSize: 15, color: '#d4d4d8', lineHeight: 1.7 }}>
                      {text}
                    </p>
                  </div>
                ))}
              </div>

            </div>
          </div>
        ) : (
          <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7 }}>
            No briefing generated yet — pipeline runs at 8am and 8pm UTC.
          </p>
        )}
      </section>

      {/* ── Signal Feed + Active Threads ────────────────────────────────── */}
      <section className="home-feed-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 440px', gap: 20, marginBottom: 36 }}>

        <div>
          <SectionHeader label="Signal Feed" href="/feed" linkLabel="View All" large />
          <div style={{
            background: 'var(--surface)',
            border: '1px solid rgba(59,130,246,0.45)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            {trending.length === 0 ? (
              <p style={{ padding: '20px 22px', fontSize: 13, color: '#52525b', fontStyle: 'italic' }}>
                No recent signals — pipeline runs at 8am and 8pm UTC.
              </p>
            ) : trending.map((item: any, i: number) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  textDecoration: 'none', display: 'block',
                  padding: '16px 20px 16px 18px',
                  borderLeft: '3px solid rgba(59,130,246,0.35)',
                  borderBottom: i < trending.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 6 }}>
                  {item.source.replace('rss:', '')} · {relTime(item.published_at)}
                </p>
                <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45, marginBottom: item.hook ? 6 : 0 }}>
                  {item.title}
                </p>
                {item.hook && (
                  <p style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.6 }}>
                    {item.hook.length > 140 ? `${item.hook.slice(0, 140)}…` : item.hook}
                  </p>
                )}
              </a>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader label="Active Threads" href="/stories" linkLabel="View All" large />
          <div style={{ background: 'var(--surface)', border: '1px solid rgba(59,130,246,0.45)', borderRadius: 12, overflow: 'hidden' }}>
            {stories.length === 0 ? (
              <p style={{ padding: '20px 22px', fontSize: 13, color: '#52525b', fontStyle: 'italic' }}>
                No active threads — go to Stories and run an update.
              </p>
            ) : stories.map((s: any, i: number) => {
              const catColor = CAT_COLOR[s.category] ?? 'var(--muted)'
              return (
                <Link
                  key={s.id}
                  href="/stories"
                  style={{
                    textDecoration: 'none', display: 'block', padding: '16px 20px',
                    borderBottom: i < stories.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <p style={{ fontSize: 13, color: catColor, fontWeight: 600, marginBottom: 6 }}>
                    {s.category} · {relTime(s.last_updated)}
                  </p>
                  <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--dim)', lineHeight: 1.45 }}>
                    {s.title}
                  </p>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── This Week's Digest ──────────────────────────────────────────── */}
      {digest && highlights.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <div className="home-digest-hdr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>
                This Week&apos;s Digest
              </span>
              <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>
                Week of {digest.week_start}
              </span>
            </div>
            <Link href="/digest" style={{
              fontSize: 13, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600,
              border: '1px solid rgba(59,130,246,0.4)', borderRadius: 6,
              padding: '7px 16px', lineHeight: 1,
            }}>
              Read Newsletter
            </Link>
          </div>
          <div style={{
            background: 'var(--surface)',
            border: '1px solid rgba(59,130,246,0.45)',
            borderRadius: 12, padding: '22px 28px',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {highlights.slice(0, 3).map((h: string, i: number) => (
                <p key={i} style={{ fontSize: 16, color: '#e4e4e7', lineHeight: 1.75 }}>{h}</p>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Signal Watch ────────────────────────────────────────────────── */}
      {predEvidence.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <SectionHeader label="Signal Watch" href="/predictions" linkLabel="All Predictions" large />
          <div className="home-pred-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {predEvidence.slice(0, 8).map((p: any) => {
              const catColor  = CAT_COLOR[p.category]  ?? 'var(--muted)'
              const confColor = CONF_COLOR[p.confidence] ?? 'var(--muted)'
              const dateRange = p.date_guess
                ? p.date_guess
                : p.year_min === p.year_max
                  ? String(p.year_guess)
                  : `${p.year_min} – ${p.year_max}`
              return (
                <Link key={p.id} href="/predictions" style={{ textDecoration: 'none' }}>
                  <div style={{
                    height: '100%', padding: '16px 18px',
                    background: 'var(--surface)',
                    border: '1px solid rgba(59,130,246,0.35)',
                    borderRadius: 10,
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    {/* Category + confidence */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: catColor, fontWeight: 600, textTransform: 'capitalize' }}>
                        {p.category}
                      </span>
                      <span style={{ fontSize: 11, color: confColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {p.confidence}
                      </span>
                    </div>

                    {/* Title */}
                    <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45, flex: 1 }}>
                      {p.title}
                    </p>

                    {/* Date range + latest evidence */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: p.latestEvidence ? 6 : 0 }}>
                        {dateRange}
                      </p>
                      {p.latestEvidence && (
                        <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                          {p.latestEvidence.title?.slice(0, 72) ?? '—'}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* ── About ───────────────────────────────────────────────────────── */}
      <CollapsibleAbout pages={PAGE_DIRECTORY} />

      <style>{`
        @media (max-width: 767px) {
          .home-wrap          { padding: 20px 16px !important; }
          .home-header        { flex-direction: column !important; align-items: stretch !important; gap: 0 !important; padding-bottom: 24px !important; margin-bottom: 24px !important; }
          .home-chip-wrap     { display: none !important; }
          .home-title         { font-size: 42px !important; margin-bottom: 24px !important; }
          .home-stats         { gap: 24px !important; flex-wrap: wrap !important; }
          .home-stat-value    { font-size: 34px !important; }
          .home-brief-card    { padding: 20px !important; }
          .home-brief-header  { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; margin-bottom: 20px !important; }
          .home-brief-layout  { flex-direction: column !important; }
          .home-brief-signal  { flex: none !important; padding-right: 0 !important; border-right: none !important; padding-bottom: 20px !important; border-bottom: 1px solid var(--border) !important; }
          .home-brief-sidebar { padding-left: 0 !important; padding-top: 20px !important; }
          .home-feed-grid     { grid-template-columns: 1fr !important; }
          .home-digest-hdr    { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
          .home-pred-grid     { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

    </main>
  )
}
