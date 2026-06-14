'use client'

import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import type { WeeklyDigest, DigestChange } from '@/lib/types'

// ── Section palette — cycles through for each H2 ──────────────────────────

const PALETTE = [
  { color: '#3b82f6', rgb: '59,130,246'   },
  { color: '#38bdf8', rgb: '56,189,248'   },
  { color: '#60a5fa', rgb: '96,165,250'   },
  { color: '#34d399', rgb: '52,211,153'   },
  { color: '#fb923c', rgb: '251,146,60'   },
]

// ── Custom markdown renderer ────────────────────────────────────────────────

function DigestDocument({ markdown }: { markdown: string }) {
  let idx = 0

  return (
    <ReactMarkdown
      components={{
        h2: ({ children }) => {
          const i   = idx++
          const pal = PALETTE[i % PALETTE.length]
          return (
            <div style={{ marginTop: i > 0 ? 48 : 0, marginBottom: 20 }}>
              {/* Section marker row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11 }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.14em',
                  color: pal.color,
                  background: `rgba(${pal.rgb},0.08)`,
                  border: `1px solid rgba(${pal.rgb},0.22)`,
                  borderRadius: 4, padding: '2px 9px', flexShrink: 0,
                  fontFamily: 'monospace',
                }}>
                  §{String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ flex: 1, height: 1, background: `rgba(${pal.rgb},0.12)` }} />
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: pal.color, opacity: 0.35 }} />
              </div>
              {/* Section title */}
              <h2 style={{
                fontSize: 20, fontWeight: 800, color: '#e4e4e7',
                letterSpacing: '-0.025em', lineHeight: 1.2, margin: 0,
              }}>
                {children}
              </h2>
            </div>
          )
        },

        h3: ({ children }) => (
          <h3 style={{
            fontSize: 13, fontWeight: 700, color: '#a1a1aa',
            letterSpacing: '-0.01em', lineHeight: 1.3,
            marginTop: 24, marginBottom: 8,
          }}>
            ↳ {children}
          </h3>
        ),

        p: ({ children }) => (
          <p style={{
            color: '#a1a1aa', fontSize: 14.5, lineHeight: 1.9,
            marginBottom: 16, margin: '0 0 16px',
          }}>
            {children}
          </p>
        ),

        ul: ({ children }) => (
          <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 18px' }}>
            {children}
          </ul>
        ),

        li: ({ children }) => (
          <li style={{ display: 'flex', gap: 11, alignItems: 'flex-start', marginBottom: 9 }}>
            <span style={{ color: '#3b82f6', fontSize: 6, marginTop: 9, flexShrink: 0 }}>◆</span>
            <span style={{ color: '#a1a1aa', fontSize: 14, lineHeight: 1.85 }}>{children}</span>
          </li>
        ),

        strong: ({ children }) => (
          <strong style={{ color: '#e4e4e7', fontWeight: 600 }}>{children}</strong>
        ),

        code: ({ children }) => (
          <code style={{
            background: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: 4, padding: '1px 7px',
            fontSize: 12, color: '#60a5fa', fontFamily: 'monospace',
          }}>
            {children}
          </code>
        ),

        blockquote: ({ children }) => (
          <blockquote style={{
            borderLeft: '2px solid rgba(59,130,246,0.25)',
            paddingLeft: 16, margin: '18px 0',
          }}>
            {children}
          </blockquote>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function DigestPage() {
  const [digest,     setDigest]     = useState<WeeklyDigest | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    fetch('/api/digest')
      .then(r => r.ok ? r.json() : null)
      .then(d  => { setDigest(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/digest/generate', { method: 'POST' })
      if (res.ok) setDigest(await res.json())
    } finally {
      setGenerating(false)
    }
  }

  // Derived values
  const sections = digest?.content_md
    ? (digest.content_md.match(/^## .+$/gm) ?? []).map(s => s.replace('## ', ''))
    : []

  const weekOf  = digest
    ? new Date(digest.week_start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null
  const genDate = digest
    ? new Date(digest.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  const docRef  = digest
    ? `WKL-${digest.week_start.replace(/-/g, '').slice(0, 8)}`
    : 'WKL-PENDING'

  return (
    <main style={{ minHeight: '100vh' }}>

      {/* ── Classification bar ──────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'rgba(9,9,11,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '5px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.16em',
            color: '#71717a', textTransform: 'uppercase',
          }}>
            WEEKLY INTELLIGENCE BRIEF
          </span>
          <span style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.08)', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: '#52525b', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            REF: {docRef}
          </span>
          <span style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.08)', display: 'inline-block' }} />
          <span style={{ fontSize: 12, color: '#52525b', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            ANALYST: CLAUDE SONNET
          </span>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.16em',
          color: '#71717a', textTransform: 'uppercase',
        }}>
          RESTRICTED
        </span>
      </div>

      {/* ── Page body ───────────────────────────────────────── */}
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '32px 20px 60px' }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>Weekly Briefing</p>
          <h1 style={{
            color: '#f4f4f5', fontSize: 28, fontWeight: 800,
            letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 5,
          }}>
            AI Digest
          </h1>
          <p style={{ color: '#71717a', fontSize: 14 }}>
            {weekOf ? `Week of ${weekOf}` : "Claude's analysis of this week's AI developments"}
          </p>
        </div>

        {/* ── Loading ──────────────────────────────────────── */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '120px 0' }}>
            <div className="h-7 w-7 rounded-full border border-blue-500 border-t-transparent animate-spin" />
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────── */}
        {!loading && !digest && !generating && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: 400, textAlign: 'center',
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12, gap: 16,
          }}>
            <div style={{
              fontSize: 42, fontWeight: 900, letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.04)',
              border: '3px solid rgba(255,255,255,0.06)',
              borderRadius: 8, padding: '8px 24px',
              fontFamily: 'monospace',
            }}>
              VOID
            </div>
            <p className="eyebrow">No Intelligence Available</p>
            <p style={{ color: '#71717a', fontSize: 13, maxWidth: 320, lineHeight: 1.7 }}>
              Generate this week's briefing. Claude will analyze the latest AI developments and compile a structured report.
            </p>
            <button onClick={generate} style={{
              background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
              border: '1px solid rgba(59,130,246,0.25)',
              borderRadius: 10, padding: '11px 24px',
              fontSize: 14, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}>
              Generate Briefing →
            </button>
          </div>
        )}

        {/* ── Generating placeholder ────────────────────────── */}
        {generating && !digest && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', minHeight: 400, gap: 20,
            background: 'rgba(255,255,255,0.015)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
          }}>
            {/* Spinner */}
            <div style={{ position: 'relative', width: 64, height: 64 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '1px solid rgba(59,130,246,0.1)',
              }} />
              <div style={{
                position: 'absolute', inset: 8, borderRadius: '50%',
                border: '1px solid rgba(59,130,246,0.15)',
              }} />
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '2px solid transparent', borderTopColor: '#3b82f6',
              }} className="animate-spin" />
              <div style={{
                position: 'absolute', inset: 8, borderRadius: '50%',
                border: '2px solid transparent', borderBottomColor: '#38bdf8',
                animationDirection: 'reverse', animationDuration: '0.6s',
              }} className="animate-spin" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{
                color: '#60a5fa', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 5,
              }}>
                Compiling Intelligence Brief
              </p>
              <p style={{ color: '#71717a', fontSize: 13, fontFamily: 'monospace' }}>
                Analyzing this week's AI signals · ~15–20 seconds
              </p>
            </div>
          </div>
        )}

        {/* ── Digest content ───────────────────────────────── */}
        {digest && (
          <div style={{ display: 'grid', gridTemplateColumns: '268px 1fr', gap: 16, alignItems: 'start' }}>

            {/* ── LEFT: Control panel ───────────────────────── */}
            <div style={{ position: 'sticky', top: 44, display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Signal status */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: '11px 13px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <span className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Signal Quality</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5 }}>
                    {[5, 7, 9, 11, 13].map((h, i) => (
                      <div key={i} style={{
                        width: 4, height: h, borderRadius: 1.5,
                        background: '#22c55e', opacity: 0.45 + i * 0.11,
                      }} />
                    ))}
                    <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, letterSpacing: '0.1em', marginLeft: 6 }}>
                      STRONG
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Status</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                    <div style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: '#22c55e',
                    }} />
                    <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, letterSpacing: '0.1em' }}>
                      CURRENT
                    </span>
                  </div>
                </div>
              </div>

              {/* Document metadata */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: '11px 13px',
              }}>
                <span className="eyebrow" style={{ display: 'block', marginBottom: 9 }}>Document Info</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    { label: 'Doc Ref',   value: docRef              },
                    { label: 'Week Of',   value: weekOf ?? '—'       },
                    { label: 'Generated', value: genDate ?? '—'      },
                    { label: 'Sections',  value: String(sections.length) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{
                        fontSize: 12, color: '#71717a', fontWeight: 700,
                        letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0,
                      }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 13, color: '#a1a1aa', fontFamily: 'monospace', textAlign: 'right', lineHeight: 1.4 }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Key findings */}
              {digest.highlights.length > 0 && (
                <div style={{
                  position: 'relative', overflow: 'hidden',
                  background: 'var(--surface)',
                  border: '1px solid rgba(59,130,246,0.18)',
                  borderRadius: 10, padding: '11px 13px 13px 16px',
                }}>
                  {/* Blue left accent */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: 2.5,
                    background: '#3b82f6',
                  }} />
                  <span className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>Key Findings</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {digest.highlights.map((h, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{
                          flexShrink: 0, width: 18, height: 18,
                          background: 'rgba(59,130,246,0.08)',
                          border: '1px solid rgba(59,130,246,0.2)',
                          borderRadius: 4,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 700, color: '#60a5fa',
                          fontFamily: 'monospace', marginTop: 1,
                        }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.65, margin: 0 }}>
                          {h}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Changes from last week */}
              {digest.changes?.length > 0 && (
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10, padding: '11px 13px',
                }}>
                  <span className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>vs Last Week</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {digest.changes.map((c: DigestChange, i: number) => {
                      const meta = {
                        escalated: { label: '↑ Escalated', color: '#f87171', rgb: '248,113,113' },
                        resolved:  { label: '✓ Resolved',  color: '#22c55e', rgb: '34,197,94'  },
                        new:       { label: '★ New',        color: '#60a5fa', rgb: '96,165,250' },
                      }[c.type] ?? { label: c.type, color: '#71717a', rgb: '113,113,122' }
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                            color: meta.color,
                            background: `rgba(${meta.rgb},0.1)`,
                            border: `1px solid rgba(${meta.rgb},0.2)`,
                            borderRadius: 3, padding: '1px 6px',
                            textTransform: 'uppercase', alignSelf: 'flex-start',
                          }}>
                            {meta.label}
                          </span>
                          <p style={{ fontSize: 12, color: '#a1a1aa', lineHeight: 1.6, margin: 0 }}>
                            {c.text}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Section index */}
              {sections.length > 0 && (
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 10, padding: '11px 13px',
                }}>
                  <span className="eyebrow" style={{ display: 'block', marginBottom: 9 }}>Section Index</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {sections.map((title, i) => {
                      const pal = PALETTE[i % PALETTE.length]
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                            color: pal.color, fontFamily: 'monospace', flexShrink: 0,
                            background: `rgba(${pal.rgb},0.07)`,
                            border: `1px solid rgba(${pal.rgb},0.18)`,
                            borderRadius: 3, padding: '1px 5px',
                          }}>
                            §{String(i + 1).padStart(2, '0')}
                          </span>
                          <span style={{ fontSize: 12, color: '#a1a1aa', lineHeight: 1.3 }}>
                            {title}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Regenerate */}
              <button
                onClick={generate}
                disabled={generating}
                style={{
                  background: generating ? 'rgba(255,255,255,0.02)' : 'rgba(59,130,246,0.07)',
                  color: generating ? '#71717a' : '#60a5fa',
                  border: '1px solid rgba(59,130,246,0.18)',
                  borderRadius: 10, padding: '10px 14px',
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: generating ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                {generating ? (
                  <>
                    <span className="inline-block h-3 w-3 rounded-full border border-blue-500 border-t-transparent animate-spin" />
                    Generating…
                  </>
                ) : '↻ Regenerate Brief'}
              </button>
            </div>

            {/* ── RIGHT: Document viewer ────────────────────── */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12, overflow: 'hidden',
              position: 'relative',
            }}>
              {/* Faint watermark */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%) rotate(-30deg)',
                fontSize: 128, fontWeight: 900, letterSpacing: '0.08em',
                color: 'rgba(255,255,255,0.02)',
                pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap',
                fontFamily: 'monospace',
              }}>
                WEEKLY-ALPHA
              </div>

              {/* Document header strip */}
              <div style={{
                padding: '18px 28px',
                borderBottom: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.12)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, letterSpacing: '0.14em',
                      color: '#60a5fa',
                      background: 'rgba(59,130,246,0.08)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      borderRadius: 4, padding: '2px 9px',
                    }}>
                      WEEKLY INTELLIGENCE BRIEF
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: '#71717a', fontFamily: 'monospace', letterSpacing: '0.06em' }}>
                    {weekOf?.toUpperCase() ?? 'PENDING'} · GENERATED BY CLAUDE SONNET
                  </p>
                </div>
                {/* "CURRENT" stamp */}
                <div style={{
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.16em',
                  color: 'rgba(34,197,94,0.6)',
                  border: '2px solid rgba(34,197,94,0.2)',
                  borderRadius: 4, padding: '5px 10px',
                  transform: 'rotate(-2.5deg)',
                  fontFamily: 'monospace', flexShrink: 0,
                }}>
                  CURRENT
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* Document body */}
              <div style={{ padding: '32px 36px 48px', position: 'relative' }}>
                <DigestDocument markdown={digest.content_md} />
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
