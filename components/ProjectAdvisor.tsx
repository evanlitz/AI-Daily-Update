'use client'

import { useState, useEffect } from 'react'
import type { ProjectIdea } from '@/lib/types'
import { RefineChat } from './RefineChat'

interface AdvisorProfile {
  level: 'beginner' | 'intermediate' | 'advanced'
  interests: string[]
  hoursPerWeek: number
}

// ── Constants ──────────────────────────────────────────────────────────────

const MISSION_META = [
  { code: 'M-01', color: '#3b82f6', rgb: '59,130,246' },
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
  return { color: '#3b82f6', rgb: '59,130,246', cat: '···' }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.22em', color: '#71717a', textTransform: 'uppercase' }}>
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
              <span style={{ fontSize: 13, fontWeight: 700, color: '#d4d4d8' }}>
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

// ── Download helper ────────────────────────────────────────────────────────

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
  if (idea.tech_stack.length)        lines.push('## Tech Stack',         ...idea.tech_stack.map(t => `- ${t}`), '')
  if (idea.skills_learned.length)    lines.push('## Capabilities Gained',...idea.skills_learned.map(s => `- ${s}`), '')
  if (idea.starter_checklist.length) lines.push('## Mission Phases',     ...idea.starter_checklist.map(s => `- [ ] ${s}`), '')

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: `${idea.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md` })
  a.click()
  URL.revokeObjectURL(url)
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

  function handleRefine(updated: ProjectIdea) {
    setIdeas(prev => prev.map(i => i.id === updated.id ? updated : i))
  }

  const idea = ideas[activeIdx]
  const meta = MISSION_META[activeIdx] ?? MISSION_META[0]
  const diffColor = DIFF_COLORS[idea?.difficulty ?? 3]

  return (
    <div>
    <style>{`
      @media (max-width: 767px) {
        .adv-main-grid  { grid-template-columns: 1fr !important; }
        .adv-title-grid { grid-template-columns: 1fr !important; }
        .adv-brief-inner { padding: 20px 18px 26px !important; }
      }
    `}</style>
    <div className="adv-main-grid" style={{ display: 'grid', gridTemplateColumns: '310px 1fr', gap: 24, alignItems: 'start' }}>

      {/* ── LEFT: Mission selector ──────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Profile panel */}
        <div style={{
          background: 'rgba(255,255,255,0.018)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: '16px 16px 14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.18em', color: '#71717a', textTransform: 'uppercase' }}>Your Profile</p>
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
              color: '#3b82f6', background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase',
            }}>Step 1</span>
          </div>

          {/* Level */}
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 11, color: '#52525b', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Level</p>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['beginner', 'intermediate', 'advanced'] as const).map(lvl => {
                const active = profile.level === lvl
                return (
                  <button key={lvl} onClick={() => saveProfile({ ...profile, level: lvl })} style={{
                    flex: 1, fontSize: 11, fontWeight: 700, padding: '6px 4px', borderRadius: 6,
                    background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                    color: active ? '#60a5fa' : '#52525b',
                    border: `1px solid ${active ? 'rgba(59,130,246,0.28)' : 'rgba(255,255,255,0.07)'}`,
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
            <p style={{ fontSize: 11, color: '#52525b', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Focus</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {INTERESTS.map(t => {
                const active = profile.interests.includes(t)
                return (
                  <button key={t} onClick={() => toggleInterest(t)} style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
                    background: active ? 'rgba(96,165,250,0.12)' : 'transparent',
                    color: active ? '#60a5fa' : '#52525b',
                    border: `1px solid ${active ? 'rgba(96,165,250,0.26)' : 'rgba(255,255,255,0.07)'}`,
                    cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s',
                  }}>{t}</button>
                )
              })}
            </div>
          </div>

          {/* Hours */}
          <div>
            <p style={{ fontSize: 11, color: '#52525b', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Hrs/week</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number" min={1} max={40} value={profile.hoursPerWeek}
                onChange={e => saveProfile({ ...profile, hoursPerWeek: Math.max(1, Math.min(40, parseInt(e.target.value) || 5)) })}
                style={{
                  width: 60, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, padding: '4px 8px',
                  color: '#60a5fa', fontSize: 13, fontWeight: 700, outline: 'none',
                  MozAppearance: 'textfield',
                } as React.CSSProperties}
              />
              <span style={{ fontSize: 12, color: '#52525b' }}>hours</span>
            </div>
          </div>
        </div>

        {ideas.length > 0 && (
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', color: '#52525b', textTransform: 'uppercase', margin: '6px 2px 4px' }}>
            Step 2 · Select Mission
          </p>
        )}

        {ideas.map((m, i) => {
          const mm      = MISSION_META[i] ?? MISSION_META[0]
          const active  = activeIdx === i
          const dc      = DIFF_COLORS[m.difficulty] ?? '#71717a'
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
                padding: '20px 18px 18px 22px',
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
                  boxShadow: 'none',
                }} />
              )}

              {/* Mission code + ETA */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{
                  fontSize: 13, fontWeight: 900, letterSpacing: '0.18em',
                  color: active ? mm.color : '#71717a',
                  transition: 'color 0.18s',
                }}>
                  {mm.code}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: '#52525b',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 5, padding: '1px 7px',
                }}>
                  ~{m.estimated_hours}h
                </span>
              </div>

              {/* Title */}
              <p style={{
                fontSize: 14, fontWeight: 700, lineHeight: 1.4,
                color: active ? '#f4f4f5' : '#52525b',
                marginBottom: 12,
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

        {/* Generate / Regenerate */}
        <button
          onClick={regenerate}
          disabled={loading}
          style={{
            marginTop: 4,
            background: ideas.length === 0 ? 'rgba(59,130,246,0.12)' : 'transparent',
            color: ideas.length === 0 ? '#60a5fa' : '#71717a',
            border: `1px solid ${ideas.length === 0 ? 'rgba(59,130,246,0.28)' : 'rgba(255,255,255,0.06)'}`,
            borderRadius: 10, padding: '10px 14px',
            fontSize: ideas.length === 0 ? 13 : 11, fontWeight: 700,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s',
          }}
        >
          {loading
            ? <><span className="inline-block h-3 w-3 rounded-full border border-blue-500 border-t-transparent animate-spin" />Generating…</>
            : ideas.length === 0 ? 'Generate missions →' : '↻ New missions'}
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
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', color: '#71717a', textTransform: 'uppercase' }}>
                Mission Briefing
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => idea && downloadPlan(idea)}
                style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                  color: '#71717a', background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.target as HTMLElement).style.color = '#60a5fa'; (e.target as HTMLElement).style.borderColor = 'rgba(59,130,246,0.28)' }}
                onMouseLeave={e => { (e.target as HTMLElement).style.color = '#71717a'; (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
              >
                ↓ Save Plan
              </button>
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
          </div>

          <div className="adv-brief-inner" style={{ padding: '26px 30px 34px' }}>

            {/* Title + stats row */}
            <div className="adv-title-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'start', marginBottom: 24 }}>
              <h2 style={{
                color: '#f4f4f5', fontSize: 26, fontWeight: 900,
                letterSpacing: '-0.02em', lineHeight: 1.2,
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
                  <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.16em', color: '#71717a', marginBottom: 6, textTransform: 'uppercase' }}>Difficulty</p>
                  <DiffMeter level={idea.difficulty} color={diffColor} />
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.16em', color: '#71717a', marginBottom: 5, textTransform: 'uppercase' }}>ETA</p>
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
            <div style={{ marginBottom: 26 }}>
              <SectionLabel>Objective</SectionLabel>
              <p style={{ color: '#a1a1aa', fontSize: 15, lineHeight: 1.85 }}>
                {idea.description}
              </p>
            </div>

            {/* Tech Stack */}
            {idea.tech_stack?.length > 0 && (
              <div style={{ marginBottom: 26 }}>
                <SectionLabel>Tech Stack</SectionLabel>
                <TechFlow techs={idea.tech_stack} />
              </div>
            )}

            {/* Skills */}
            {idea.skills_learned.length > 0 && (
              <div style={{ marginBottom: 26 }}>
                <SectionLabel>Capabilities Gained</SectionLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {idea.skills_learned.map(s => (
                    <span key={s} style={{
                      fontSize: 13, fontWeight: 700,
                      color: '#34d399',
                      background: 'rgba(52,211,153,0.08)',
                      border: '1px solid rgba(52,211,153,0.18)',
                      borderRadius: 8, padding: '6px 14px',
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {idea.starter_checklist.map((step, i) => {
                    const key  = `${idea.id}-${i}`
                    const done = !!checked[key]
                    return (
                      <label
                        key={key}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 12,
                          cursor: 'pointer',
                          background: 'transparent',
                          borderRadius: 10, padding: '10px 12px',
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
                            <span style={{ fontSize: 12, fontWeight: 900, color: '#71717a' }}>
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
                          fontSize: 14, lineHeight: 1.7,
                          color: done ? '#71717a' : '#a1a1aa',
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

            <RefineChat idea={idea} onUpdate={handleRefine} />
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: 360, gap: 12,
          background: 'rgba(255,255,255,0.012)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 16,
        }}>
          <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.2em', color: '#3f3f46', textTransform: 'uppercase' }}>
            Step 3 · Briefing
          </p>
          <p style={{ color: '#3f3f46', fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 1.65 }}>
            {loading
              ? 'Claude is generating missions from this week\'s AI news…'
              : 'Configure your profile on the left, then hit Generate to see mission briefs here.'}
          </p>
          {loading && <span className="inline-block h-4 w-4 rounded-full border border-blue-500 border-t-transparent animate-spin" />}
        </div>
      )}
    </div>
    </div>
  )
}
