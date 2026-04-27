'use client'

import { useState, useEffect } from 'react'
import type { ProjectIdea } from '@/lib/types'

interface AdvisorProfile {
  level: 'beginner' | 'intermediate' | 'advanced'
  interests: string[]
  hoursPerWeek: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const MISSION_META = [
  { code: 'M-01', color: '#7c6aff', rgb: '124,106,255' },
  { code: 'M-02', color: '#38bdf8', rgb: '56,189,248'  },
  { code: 'M-03', color: '#fb923c', rgb: '251,146,60'  },
]

const DIFF_LABELS = ['', 'Beginner', 'Easy', 'Moderate', 'Advanced', 'Expert']
const DIFF_COLORS = ['', '#34d399', '#34d399', '#fbbf24', '#fb923c', '#f87171']

// ── Tech stack coloring ────────────────────────────────────────────────────

type TechMeta = { color: string; rgb: string; cat: string }

function techMeta(name: string): TechMeta {
  const n = name.toLowerCase()
  if (/react|vue|svelte|next|html|css|tailwind|typescript|javascript|angular|frontend|vite/.test(n))
    return { color: '#38bdf8', rgb: '56,189,248',   cat: 'UI' }
  if (/claude|gpt|openai|anthropic|llm|embedding|ollama|hugging|diffusion|gemini|llama|ai api|ai sdk/.test(n))
    return { color: '#a78bfa', rgb: '167,139,250',  cat: 'AI' }
  if (/python|node|express|fastapi|flask|django|go|rust|java|backend|api|server/.test(n))
    return { color: '#34d399', rgb: '52,211,153',   cat: 'BE' }
  if (/sql|database|postgres|mongo|redis|sqlite|supabase|firebase|db|storage|chroma|pinecone/.test(n))
    return { color: '#fbbf24', rgb: '251,191,36',   cat: 'DB' }
  if (/docker|vercel|aws|cloud|deploy|github|netlify|railway|fly/.test(n))
    return { color: '#fb923c', rgb: '251,146,60',   cat: 'OPS' }
  return { color: '#7c6aff', rgb: '124,106,255', cat: '···' }
}

// ── Sub-components ─────────────────────────────────────────────────────────

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
          <div
            key={i}
            style={{
              flex: 1, height: 5, borderRadius: 3,
              background: i <= level ? color : 'rgba(255,255,255,0.06)',
              transition: 'background 0.3s',
            }}
          />
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
            <div
              style={{
                position: 'relative',
                background: `rgba(${m.rgb},0.1)`,
                border: `1px solid rgba(${m.rgb},0.28)`,
                borderRadius: 8,
                padding: '6px 12px',
                display: 'flex', alignItems: 'center', gap: 7,
              }}
            >
              {/* Category micro-badge */}
              <span style={{
                fontSize: 14, fontWeight: 900, letterSpacing: '0.1em',
                color: m.color,
                background: `rgba(${m.rgb},0.15)`,
                borderRadius: 3, padding: '1px 4px',
                textTransform: 'uppercase',
              }}>
                {m.cat}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#d8d8f0' }}>
                {tech}
              </span>
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

// ── Main component ─────────────────────────────────────────────────────────

const INTERESTS = ['models', 'tools', 'research', 'safety', 'infra']

export function ProjectAdvisor({ initialIdeas }: { initialIdeas: ProjectIdea[] }) {
  const [ideas,     setIdeas]     = useState(initialIdeas)
  const [activeIdx, setActiveIdx] = useState(0)
  const [checked,   setChecked]   = useState<Record<string, boolean>>({})
  const [loading,   setLoading]   = useState(false)
  const [profile,   setProfile]   = useState<AdvisorProfile>({ level: 'beginner', interests: [], hoursPerWeek: 5 })

  useEffect(() => {
    const saved = localStorage.getItem('advisor-profile')
    if (saved) try { setProfile(JSON.parse(saved)) } catch {}
  }, [])

  function saveProfile(next: AdvisorProfile) {
    setProfile(next)
    localStorage.setItem('advisor-profile', JSON.stringify(next))
  }

  function toggleInterest(t: string) {
    saveProfile({
      ...profile,
      interests: profile.interests.includes(t) ? profile.interests.filter(i => i !== t) : [...profile.interests, t],
    })
  }

  async function regenerate() {
    setLoading(true)
    try {
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      if (res.ok) { setIdeas(await res.json()); setActiveIdx(0); setChecked({}) }
    } finally { setLoading(false) }
  }

  if (ideas.length === 0 && !loading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: 360, gap: 16,
        background: 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
      }}>
        <p className="eyebrow">No missions queued</p>
        <p style={{ color: '#7878a8', fontSize: 13 }}>Generate project ideas based on what's trending in AI right now.</p>
        <button onClick={regenerate} style={{
          background: 'rgba(124,106,255,0.15)', color: '#a78bfa',
          border: '1px solid rgba(124,106,255,0.3)',
          borderRadius: 12, padding: '10px 22px',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>
          Generate missions →
        </button>
      </div>
    )
  }

  const idea = ideas[activeIdx]
  const meta = MISSION_META[activeIdx] ?? MISSION_META[0]
  const diffColor = DIFF_COLORS[idea?.difficulty ?? 3]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, alignItems: 'start' }}>

      {/* ── LEFT: Mission selector ──────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Profile panel */}
        <div style={{
          background: 'rgba(255,255,255,0.018)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: '13px 14px 12px',
        }}>
          <p style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', color: '#7878a8', textTransform: 'uppercase', marginBottom: 11 }}>Your Profile</p>

          {/* Level */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: '#5a5a7a', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Level</p>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['beginner', 'intermediate', 'advanced'] as const).map(lvl => {
                const active = profile.level === lvl
                return (
                  <button key={lvl} onClick={() => saveProfile({ ...profile, level: lvl })} style={{
                    flex: 1, fontSize: 10, fontWeight: 700, padding: '5px 2px', borderRadius: 6,
                    background: active ? 'rgba(124,106,255,0.16)' : 'transparent',
                    color: active ? '#a78bfa' : '#5a5a7a',
                    border: `1px solid ${active ? 'rgba(124,106,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
                    letterSpacing: '0.02em',
                  }}>
                    {lvl}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Interests */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: '#5a5a7a', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Focus</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {INTERESTS.map(t => {
                const active = profile.interests.includes(t)
                return (
                  <button key={t} onClick={() => toggleInterest(t)} style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
                    background: active ? 'rgba(167,139,250,0.12)' : 'transparent',
                    color: active ? '#a78bfa' : '#5a5a7a',
                    border: `1px solid ${active ? 'rgba(167,139,250,0.26)' : 'rgba(255,255,255,0.06)'}`,
                    cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s',
                  }}>{t}</button>
                )
              })}
            </div>
          </div>

          {/* Hours */}
          <div>
            <p style={{ fontSize: 11, color: '#5a5a7a', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Hrs/week</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" min={1} max={40} value={profile.hoursPerWeek}
                onChange={e => saveProfile({ ...profile, hoursPerWeek: Math.max(1, Math.min(40, parseInt(e.target.value) || 5)) })}
                style={{
                  width: 60, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, padding: '4px 8px',
                  color: '#a78bfa', fontSize: 13, fontWeight: 700, outline: 'none',
                  MozAppearance: 'textfield',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: 12, color: '#5a5a7a' }}>hours</span>
            </div>
          </div>
        </div>

        {ideas.map((m, i) => {
          const mm      = MISSION_META[i] ?? MISSION_META[0]
          const active  = activeIdx === i
          const dc      = DIFF_COLORS[m.difficulty] ?? '#7878a8'
          return (
            <button
              key={m.id}
              onClick={() => setActiveIdx(i)}
              style={{
                position: 'relative',
                textAlign: 'left',
                background: active ? `rgba(${mm.rgb},0.07)` : 'rgba(255,255,255,0.015)',
                border: `1px solid ${active ? `rgba(${mm.rgb},0.28)` : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 14,
                padding: '16px 16px 14px 20px',
                cursor: 'pointer',
                transition: 'all 0.18s',
                overflow: 'hidden',
              }}
            >
              {/* Active left bar */}
              {active && (
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: 3, background: mm.color,
                  boxShadow: `0 0 12px ${mm.color}`,
                }} />
              )}

              {/* Mission code + ETA */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{
                  fontSize: 13, fontWeight: 900, letterSpacing: '0.18em',
                  color: active ? mm.color : '#7878a8',
                  transition: 'color 0.18s',
                }}>
                  {mm.code}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: active ? '#6060a0' : '#7878a8',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 5, padding: '1px 7px',
                }}>
                  ~{m.estimated_hours}h
                </span>
              </div>

              {/* Title */}
              <p style={{
                fontSize: 13, fontWeight: 700, lineHeight: 1.35,
                color: active ? '#e8e8f0' : '#5a5a7a',
                marginBottom: 10,
                transition: 'color 0.18s',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>
                {m.title}
              </p>

              {/* Difficulty bar */}
              <div style={{ display: 'flex', gap: 3 }}>
                {[1, 2, 3, 4, 5].map(seg => (
                  <div key={seg} style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: seg <= m.difficulty
                      ? (active ? dc : 'rgba(255,255,255,0.15)')
                      : 'rgba(255,255,255,0.05)',
                    transition: 'background 0.18s',
                  }} />
                ))}
              </div>
            </button>
          )
        })}

        {/* Regenerate */}
        <button
          onClick={regenerate}
          disabled={loading}
          style={{
            marginTop: 4,
            background: 'transparent',
            color: '#7878a8',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 10, padding: '9px 14px',
            fontSize: 14, fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'opacity 0.2s',
          }}
        >
          {loading
            ? <><span className="inline-block h-3 w-3 rounded-full border border-violet-500 border-t-transparent animate-spin" />Generating…</>
            : '↻ New missions'}
        </button>
      </div>

      {/* ── RIGHT: Mission briefing ─────────────────────────────────── */}
      {idea ? (
        <div
          key={idea.id}
          className="detail-enter"
          style={{
            position: 'relative',
            background: 'rgba(255,255,255,0.018)',
            border: `1px solid rgba(${meta.rgb},0.2)`,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {/* Top gradient bar */}
          <div style={{
            height: 2.5,
            background: `linear-gradient(to right, ${meta.color}, rgba(${meta.rgb},0.1))`,
          }} />

          {/* Header strip */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 24px',
            background: `rgba(${meta.rgb},0.05)`,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 12, fontWeight: 900, letterSpacing: '0.22em',
                color: meta.color, textTransform: 'uppercase',
              }}>
                {meta.code}
              </span>
              <span style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)', display: 'inline-block' }} />
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: '#7878a8', textTransform: 'uppercase' }}>
                Mission Briefing
              </span>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 900, letterSpacing: '0.14em',
              color: meta.color, opacity: 0.5,
              background: `rgba(${meta.rgb},0.08)`,
              border: `1px solid rgba(${meta.rgb},0.18)`,
              borderRadius: 4, padding: '2px 8px', textTransform: 'uppercase',
            }}>
              Classified
            </span>
          </div>

          <div style={{ padding: '22px 24px 28px' }}>

            {/* Title + stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'start', marginBottom: 24 }}>
              <h2 style={{
                color: '#e8e8f0', fontSize: 22, fontWeight: 900,
                letterSpacing: '-0.02em', lineHeight: 1.25,
              }}>
                {idea.title}
              </h2>

              {/* Stats block */}
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 12, padding: '12px 16px',
                display: 'flex', flexDirection: 'column', gap: 10,
                minWidth: 150,
              }}>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.16em', color: '#7878a8', marginBottom: 6, textTransform: 'uppercase' }}>Difficulty</p>
                  <DiffMeter level={idea.difficulty} color={diffColor} />
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.16em', color: '#7878a8', marginBottom: 5, textTransform: 'uppercase' }}>ETA</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Fuel bar */}
                    <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min((idea.estimated_hours / 20) * 100, 100)}%`,
                        background: meta.color,
                        borderRadius: 99, opacity: 0.8,
                      }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: meta.color, whiteSpace: 'nowrap' }}>
                      {idea.estimated_hours}h
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Objective */}
            <div style={{ marginBottom: 22 }}>
              <SectionLabel>Objective</SectionLabel>
              <p style={{ color: '#7070a0', fontSize: 14, lineHeight: 1.8 }}>
                {idea.description}
              </p>
            </div>

            {/* Tech Stack */}
            {idea.tech_stack?.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <SectionLabel>Tech Stack</SectionLabel>
                <TechFlow techs={idea.tech_stack} />
              </div>
            )}

            {/* Skills */}
            {idea.skills_learned.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <SectionLabel>Capabilities Gained</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {idea.skills_learned.map(s => (
                    <span key={s} style={{
                      fontSize: 12, fontWeight: 700,
                      color: '#34d399',
                      background: 'rgba(52,211,153,0.08)',
                      border: '1px solid rgba(52,211,153,0.18)',
                      borderRadius: 8, padding: '5px 12px',
                    }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Checklist */}
            {idea.starter_checklist.length > 0 && (
              <div>
                <SectionLabel>Mission Phases</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {idea.starter_checklist.map((step, i) => {
                    const key  = `${idea.id}-${i}`
                    const done = !!checked[key]
                    return (
                      <label
                        key={key}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12,
                          cursor: 'pointer',
                          background: done ? 'rgba(124,106,255,0.05)' : 'transparent',
                          borderRadius: 10, padding: '9px 10px',
                          transition: 'background 0.2s',
                        }}
                      >
                        {/* Phase number / check */}
                        <div style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          background: done ? `rgba(${meta.rgb},0.2)` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${done ? `rgba(${meta.rgb},0.4)` : 'rgba(255,255,255,0.1)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginTop: 1,
                          transition: 'all 0.2s',
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
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={done}
                          onChange={() => setChecked(p => ({ ...p, [key]: !p[key] }))}
                        />
                        <span style={{
                          fontSize: 13, lineHeight: 1.65,
                          color: done ? '#7878a8' : '#9090b0',
                          textDecoration: done ? 'line-through' : 'none',
                          transition: 'color 0.2s',
                        }}>
                          {step}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
