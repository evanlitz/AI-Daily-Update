'use client'

import type { GithubRepo } from '@/lib/types'

const LANG_COLORS: Record<string, { color: string; rgb: string }> = {
  python:     { color: '#60a5fa', rgb: '96,165,250' },
  typescript: { color: '#38bdf8', rgb: '56,189,248' },
  javascript: { color: '#fbbf24', rgb: '251,191,36' },
  rust:       { color: '#fb923c', rgb: '251,146,60' },
  go:         { color: '#34d399', rgb: '52,211,153' },
  'c++':      { color: '#c084fc', rgb: '192,132,252' },
  java:       { color: '#f87171', rgb: '248,113,113' },
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function starsToColor(n: number): { color: string; rgb: string } {
  if (n > 100) return { color: '#34d399', rgb: '52,211,153' }
  if (n > 10)  return { color: '#fbbf24', rgb: '251,191,36' }
  return { color: '#8080b0', rgb: '61,61,90' }
}

export function RepoCard({ repo }: { repo: GithubRepo }) {
  const langKey = repo.language?.toLowerCase() ?? ''
  const lang    = LANG_COLORS[langKey] ?? { color: '#8080b0', rgb: '61,61,90' }
  const stars   = starsToColor(repo.stars_today)
  const displayTopics = repo.topics.slice(0, 3)
  const extra   = repo.topics.length - 3

  return (
    <a
      href={repo.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block relative overflow-hidden transition-all duration-200 group"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = `rgba(${lang.rgb},0.25)`
        el.style.boxShadow   = `0 0 24px rgba(${lang.rgb},0.06)`
        el.style.transform   = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = 'rgba(255,255,255,0.06)'
        el.style.boxShadow   = 'none'
        el.style.transform   = 'translateY(0)'
      }}
    >
      {/* Top accent line in lang color */}
      <div
        style={{
          height: 2,
          background: `rgba(${lang.rgb},0.5)`,
          width: '100%',
        }}
      />

      <div style={{ padding: '14px 16px 14px' }}>
        {/* Repo path + language */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p style={{ color: '#7878a8', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>
              {repo.full_name.split('/')[0]}/
            </p>
            <p style={{ color: '#e8e8f0', fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }} className="truncate">
              {repo.name}
            </p>
          </div>
          {repo.language && (
            <span
              style={{
                flexShrink: 0,
                background: `rgba(${lang.rgb},0.1)`,
                color: lang.color,
                border: `1px solid rgba(${lang.rgb},0.2)`,
                borderRadius: 8,
                padding: '3px 8px',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              {repo.language}
            </span>
          )}
        </div>

        {/* Stars today — hero */}
        <div
          className="inline-flex items-center gap-2 mb-3"
          style={{
            background: `rgba(${stars.rgb},0.08)`,
            border: `1px solid rgba(${stars.rgb},0.15)`,
            borderRadius: 10,
            padding: '5px 10px',
          }}
        >
          <svg viewBox="0 0 10 10" style={{ width: 11, height: 11, flexShrink: 0 }} fill={stars.color}>
            <polygon points="5,1 6.2,3.8 9.5,4.1 7.2,6.3 7.9,9.5 5,7.8 2.1,9.5 2.8,6.3 0.5,4.1 3.8,3.8" />
          </svg>
          <span style={{ color: stars.color, fontSize: 13, fontWeight: 900, letterSpacing: '-0.01em' }}>
            +{repo.stars_today}
          </span>
          <span style={{ color: stars.color, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7, textTransform: 'uppercase' }}>
            today
          </span>
        </div>

        {/* Description */}
        {repo.description && (
          <p
            className="line-clamp-2 mb-3"
            style={{ color: '#9090c0', fontSize: 14, lineHeight: 1.6 }}
          >
            {repo.description}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2">
          <span style={{ color: '#7878a8', fontSize: 13, fontWeight: 600 }}>
            {formatStars(repo.stars_total)} total
          </span>
          <div className="flex flex-wrap gap-1 justify-end">
            {displayTopics.map(t => (
              <span
                key={t}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  color: '#8080b0',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 20,
                  padding: '1px 7px',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {t}
              </span>
            ))}
            {extra > 0 && (
              <span
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  color: '#7878a8',
                  borderRadius: 20,
                  padding: '1px 7px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                +{extra}
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  )
}
