'use client'

import { useState, useEffect, useRef } from 'react'
import type { ProjectIdea } from '@/lib/types'

// ── Shared constants ──────────────────────────────────────────────────────────

const MISSION_META = [
  { code: 'C-01', color: '#7c6aff', rgb: '124,106,255' },
  { code: 'C-02', color: '#38bdf8', rgb: '56,189,248'  },
  { code: 'C-03', color: '#fb923c', rgb: '251,146,60'  },
]

const DIFF_LABELS = ['', 'Beginner', 'Easy', 'Moderate', 'Advanced', 'Expert']
const DIFF_COLORS = ['', '#34d399', '#34d399', '#fbbf24', '#fb923c', '#f87171']

type TechMeta = { color: string; rgb: string; cat: string }

function techMeta(name: string): TechMeta {
  const n = name.toLowerCase()
  if (/react|vue|svelte|next|html|css|tailwind|typescript|javascript|angular|frontend|vite/.test(n))
    return { color: '#38bdf8', rgb: '56,189,248',  cat: 'UI' }
  if (/claude|gpt|openai|anthropic|llm|embedding|ollama|hugging|diffusion|gemini|llama|ai api|ai sdk/.test(n))
    return { color: '#a78bfa', rgb: '167,139,250', cat: 'AI' }
  if (/python|node|express|fastapi|flask|django|go|rust|java|backend|api|server/.test(n))
    return { color: '#34d399', rgb: '52,211,153',  cat: 'BE' }
  if (/sql|database|postgres|mongo|redis|sqlite|supabase|firebase|db|storage|chroma|pinecone/.test(n))
    return { color: '#fbbf24', rgb: '251,191,36',  cat: 'DB' }
  if (/docker|vercel|aws|cloud|deploy|github|netlify|railway|fly/.test(n))
    return { color: '#fb923c', rgb: '251,146,60',  cat: 'OPS' }
  return { color: '#7c6aff', rgb: '124,106,255', cat: '···' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', color: '#7878a8', textTransform: 'uppercase' }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  )
}

function DiffMeter({ level, color }: { level: number; color: string }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} style={{
            flex: 1, height: 5, borderRadius: 3,
            background: i <= level ? color : 'rgba(255,255,255,0.06)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 14, color, fontWeight: 700 }}>{DIFF_LABELS[level]}</span>
    </div>
  )
}

function TechFlow({ techs }: { techs: string[] }) {
  if (!techs.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      {techs.map((tech, i) => {
        const m = techMeta(tech)
        return (
          <div key={tech} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              background: `rgba(${m.rgb},0.1)`,
              border: `1px solid rgba(${m.rgb},0.28)`,
              borderRadius: 8, padding: '6px 12px',
              display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <span style={{
                fontSize: 14, fontWeight: 900, letterSpacing: '0.1em', color: m.color,
                background: `rgba(${m.rgb},0.15)`, borderRadius: 3, padding: '1px 4px', textTransform: 'uppercase',
              }}>{m.cat}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#d8d8f0' }}>{tech}</span>
            </div>
            {i < techs.length - 1 && (
              <svg width={18} height={10} viewBox="0 0 18 10">
                <line x1={0} y1={5} x2={12} y2={5} stroke="#2a2a3e" strokeWidth={1.5} />
                <polyline points="10,2 14,5 10,8" fill="none" stroke="#2a2a3e" strokeWidth={1.5} strokeLinejoin="round" />
              </svg>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Download helper ───────────────────────────────────────────────────────────

function downloadPlan(idea: ProjectIdea) {
  const diffLabel = DIFF_LABELS[idea.difficulty] ?? 'Unknown'
  const lines: string[] = [
    `# ${idea.title}`,
    '',
    `**Difficulty:** ${diffLabel}`,
    `**Estimated Time:** ${idea.estimated_hours} hours`,
    '',
    '## Objective',
    idea.description,
    '',
  ]
  if (idea.tech_stack.length)        lines.push('## Tech Stack',          ...idea.tech_stack.map(t => `- ${t}`), '')
  if (idea.skills_learned.length)    lines.push('## Capabilities Gained', ...idea.skills_learned.map(s => `- ${s}`), '')
  if (idea.starter_checklist.length) lines.push('## Mission Phases',      ...idea.starter_checklist.map(s => `- [ ] ${s}`), '')

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `${idea.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md` })
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main component ────────────────────────────────────────────────────────────

export function CustomAdvisor() {
  const [ideas,     setIdeas]     = useState<ProjectIdea[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [checked,   setChecked]   = useState<Record<string, boolean>>({})
  const [loading,   setLoading]   = useState(false)
  const [input,     setInput]     = useState('')
  const [error,     setError]     = useState('')
  const [level,     setLevel]     = useState<'beginner' | 'intermediate' | 'advanced'>('beginner')
  const [hours,     setHours]     = useState(5)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('advisor-profile')
    if (saved) try {
      const p = JSON.parse(saved)
      if (p.level)       setLevel(p.level)
      if (p.hoursPerWeek) setHours(p.hoursPerWeek)
    } catch {}
    textareaRef.current?.focus()
  }, [])

  function saveProfile(next: { level: typeof level; hoursPerWeek: number }) {
    const existing = (() => { try { return JSON.parse(localStorage.getItem('advisor-profile') ?? '{}') } catch { return {} } })()
    localStorage.setItem('advisor-profile', JSON.stringify({ ...existing, ...next }))
  }

  async function generate() {
    const trimmed = input.trim()
    if (!trimmed) { setError('Describe a topic, problem, or idea first.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/advisor/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: trimmed, level, hoursPerWeek: hours }),
      })
      if (!res.ok) throw new Error('request failed')
      setIdeas(await res.json())
      setActiveIdx(0)
      setChecked({})
    } catch {
      setError('Generation failed — try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
  }

  const idea = ideas[activeIdx]
  const meta = MISSION_META[activeIdx] ?? MISSION_META[0]
  const diffColor = DIFF_COLORS[idea?.difficulty ?? 3]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Input panel ──────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16, padding: '20px 22px',
      }}>
        <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: '#7878a8', textTransform: 'uppercase', marginBottom: 10 }}>
          Describe Your Mission
        </p>

        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. I want to build a tool that summarizes my meeting notes, or I'm interested in fine-tuning small models, or something fun with voice + AI..."
          rows={3}
          style={{
            width: '100%', resize: 'vertical',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${error ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 10, padding: '12px 14px',
            color: '#d8d8f0', fontSize: 14, lineHeight: 1.65,
            outline: 'none', fontFamily: 'inherit',
            transition: 'border-color 0.2s',
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <p style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>{error}</p>
        )}

        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>

          {/* Level */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#5a5a7a', textTransform: 'uppercase' }}>Level</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['beginner', 'intermediate', 'advanced'] as const).map(lvl => {
                const active = level === lvl
                return (
                  <button key={lvl} onClick={() => { setLevel(lvl); saveProfile({ level: lvl, hoursPerWeek: hours }) }} style={{
                    fontSize: 10, fontWeight: 700, padding: '4px 9px', borderRadius: 6,
                    background: active ? 'rgba(124,106,255,0.16)' : 'transparent',
                    color: active ? '#a78bfa' : '#5a5a7a',
                    border: `1px solid ${active ? 'rgba(124,106,255,0.3)' : 'rgba(255,255,255,0.07)'}`,
                    cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
                  }}>{lvl}</button>
                )
              })}
            </div>
          </div>

          {/* Hours */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#5a5a7a', textTransform: 'uppercase' }}>Hrs/wk</span>
            <input
              type="number" min={1} max={40} value={hours}
              onChange={e => { const v = Math.max(1, Math.min(40, parseInt(e.target.value) || 5)); setHours(v); saveProfile({ level, hoursPerWeek: v }) }}
              style={{
                width: 52, background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: '4px 8px',
                color: '#a78bfa', fontSize: 13, fontWeight: 700, outline: 'none',
                MozAppearance: 'textfield',
              } as React.CSSProperties}
            />
          </div>

          {/* Spacer + Generate button */}
          <div style={{ flex: 1 }} />
          <button
            onClick={generate}
            disabled={loading}
            style={{
              background: loading ? 'rgba(124,106,255,0.08)' : 'rgba(124,106,255,0.15)',
              color: '#a78bfa',
              border: '1px solid rgba(124,106,255,0.3)',
              borderRadius: 10, padding: '9px 20px',
              fontSize: 12, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'all 0.2s',
            }}
          >
            {loading
              ? <><span className="inline-block h-3 w-3 rounded-full border border-violet-500 border-t-transparent animate-spin" />Generating…</>
              : 'Generate → ⌘↵'}
          </button>
        </div>
      </div>

      {/* ── Results ──────────────────────────────────────────────────── */}
      {ideas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>

          {/* LEFT: mission selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ideas.map((m, i) => {
              const mm     = MISSION_META[i] ?? MISSION_META[0]
              const active = activeIdx === i
              const dc     = DIFF_COLORS[m.difficulty] ?? '#7878a8'
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveIdx(i)}
                  style={{
                    position: 'relative', textAlign: 'left',
                    background: active ? `rgba(${mm.rgb},0.07)` : 'rgba(255,255,255,0.015)',
                    border: `1px solid ${active ? `rgba(${mm.rgb},0.28)` : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 14, padding: '16px 16px 14px 20px',
                    cursor: 'pointer', transition: 'all 0.18s', overflow: 'hidden',
                  }}
                >
                  {active && (
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: 3, background: mm.color, boxShadow: `0 0 12px ${mm.color}`,
                    }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.18em', color: active ? mm.color : '#7878a8', transition: 'color 0.18s' }}>
                      {mm.code}
                    </span>
                    <span style={{
                      fontSize: 13, fontWeight: 700, color: active ? '#6060a0' : '#7878a8',
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 5, padding: '1px 7px',
                    }}>~{m.estimated_hours}h</span>
                  </div>
                  <p style={{
                    fontSize: 13, fontWeight: 700, lineHeight: 1.35,
                    color: active ? '#e8e8f0' : '#5a5a7a', marginBottom: 10,
                    transition: 'color 0.18s',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>{m.title}</p>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[1, 2, 3, 4, 5].map(seg => (
                      <div key={seg} style={{
                        flex: 1, height: 3, borderRadius: 2,
                        background: seg <= m.difficulty ? (active ? dc : 'rgba(255,255,255,0.15)') : 'rgba(255,255,255,0.05)',
                        transition: 'background 0.18s',
                      }} />
                    ))}
                  </div>
                </button>
              )
            })}

            <button
              onClick={generate}
              disabled={loading}
              style={{
                marginTop: 4, background: 'transparent', color: '#7878a8',
                border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '9px 14px',
                fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'opacity 0.2s',
              }}
            >
              {loading
                ? <><span className="inline-block h-3 w-3 rounded-full border border-violet-500 border-t-transparent animate-spin" />Generating…</>
                : '↻ Regenerate'}
            </button>
          </div>

          {/* RIGHT: briefing detail */}
          {idea && (
            <div
              key={idea.id}
              className="detail-enter"
              style={{
                position: 'relative',
                background: 'rgba(255,255,255,0.018)',
                border: `1px solid rgba(${meta.rgb},0.2)`,
                borderRadius: 16, overflow: 'hidden',
              }}
            >
              <div style={{ height: 2.5, background: `linear-gradient(to right, ${meta.color}, rgba(${meta.rgb},0.1))` }} />

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 24px',
                background: `rgba(${meta.rgb},0.05)`,
                borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.22em', color: meta.color, textTransform: 'uppercase' }}>
                    {meta.code}
                  </span>
                  <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)', display: 'inline-block' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: '#7878a8', textTransform: 'uppercase' }}>
                    Custom Op
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => idea && downloadPlan(idea)}
                    style={{
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                      color: '#7878a8', background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.target as HTMLElement).style.color = '#a78bfa'; (e.target as HTMLElement).style.borderColor = 'rgba(124,106,255,0.3)' }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.color = '#7878a8'; (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
                  >
                    ↓ Save Plan
                  </button>
                  <span style={{
                    fontSize: 12, fontWeight: 900, letterSpacing: '0.14em', color: meta.color, opacity: 0.5,
                    background: `rgba(${meta.rgb},0.08)`, border: `1px solid rgba(${meta.rgb},0.18)`,
                    borderRadius: 4, padding: '2px 8px', textTransform: 'uppercase',
                  }}>Personalized</span>
                </div>
              </div>

              <div style={{ padding: '22px 24px 28px' }}>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'start', marginBottom: 24 }}>
                  <h2 style={{ color: '#e8e8f0', fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.25 }}>
                    {idea.title}
                  </h2>
                  <div style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 12, padding: '12px 16px',
                    display: 'flex', flexDirection: 'column', gap: 10, minWidth: 150,
                  }}>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.16em', color: '#7878a8', marginBottom: 6, textTransform: 'uppercase' }}>Difficulty</p>
                      <DiffMeter level={idea.difficulty} color={diffColor} />
                    </div>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.16em', color: '#7878a8', marginBottom: 5, textTransform: 'uppercase' }}>ETA</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', width: `${Math.min((idea.estimated_hours / 20) * 100, 100)}%`,
                            background: meta.color, borderRadius: 99, opacity: 0.8,
                          }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 800, color: meta.color, whiteSpace: 'nowrap' }}>{idea.estimated_hours}h</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 22 }}>
                  <SectionLabel>Objective</SectionLabel>
                  <p style={{ color: '#7070a0', fontSize: 14, lineHeight: 1.8 }}>{idea.description}</p>
                </div>

                {idea.tech_stack?.length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    <SectionLabel>Tech Stack</SectionLabel>
                    <TechFlow techs={idea.tech_stack} />
                  </div>
                )}

                {idea.skills_learned.length > 0 && (
                  <div style={{ marginBottom: 22 }}>
                    <SectionLabel>Capabilities Gained</SectionLabel>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {idea.skills_learned.map(s => (
                        <span key={s} style={{
                          fontSize: 12, fontWeight: 700, color: '#34d399',
                          background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)',
                          borderRadius: 8, padding: '5px 12px',
                        }}>{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {idea.starter_checklist.length > 0 && (
                  <div>
                    <SectionLabel>Mission Phases</SectionLabel>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {idea.starter_checklist.map((step, i) => {
                        const key  = `${idea.id}-${i}`
                        const done = !!checked[key]
                        return (
                          <label key={key} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
                            background: done ? 'rgba(124,106,255,0.05)' : 'transparent',
                            borderRadius: 10, padding: '9px 10px', transition: 'background 0.2s',
                          }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                              background: done ? `rgba(${meta.rgb},0.2)` : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${done ? `rgba(${meta.rgb},0.4)` : 'rgba(255,255,255,0.1)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              marginTop: 1, transition: 'all 0.2s',
                            }}>
                              {done ? (
                                <svg viewBox="0 0 10 10" style={{ width: 10, height: 10 }}>
                                  <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke={meta.color} strokeWidth={1.5} fill="none" strokeLinecap="round" />
                                </svg>
                              ) : (
                                <span style={{ fontSize: 12, fontWeight: 900, color: '#7878a8' }}>
                                  {String(i + 1).padStart(2, '0')}
                                </span>
                              )}
                            </div>
                            <input type="checkbox" className="sr-only" checked={done}
                              onChange={() => setChecked(p => ({ ...p, [key]: !p[key] }))} />
                            <span style={{
                              fontSize: 13, lineHeight: 1.65,
                              color: done ? '#7878a8' : '#9090b0',
                              textDecoration: done ? 'line-through' : 'none',
                              transition: 'color 0.2s',
                            }}>{step}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {ideas.length === 0 && !loading && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 220, gap: 10,
          background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 16,
        }}>
          <p style={{ color: '#7878a8', fontSize: 13 }}>Describe what you want to build above, then hit Generate.</p>
          <p style={{ color: '#5a5a7a', fontSize: 12 }}>Claude will use current AI trends and tools to tailor ideas to your description.</p>
        </div>
      )}
    </div>
  )
}
