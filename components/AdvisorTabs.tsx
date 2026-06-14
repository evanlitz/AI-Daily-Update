'use client'

import { useState } from 'react'
import { ProjectAdvisor } from './ProjectAdvisor'
import { CustomAdvisor } from './CustomAdvisor'
import type { ProjectIdea } from '@/lib/types'

const MODES = [
  {
    id: 'trending' as const,
    label: 'Trending Missions',
    accent: '59,130,246',
    color: '#3b82f6',
    desc: 'Claude analyzes this week\'s AI news and generates project briefs calibrated to your skill level and focus areas. Each mission includes a tech stack, difficulty rating, and phased checklist.',
  },
  {
    id: 'custom' as const,
    label: 'Custom Op',
    accent: '167,139,250',
    color: '#a78bfa',
    desc: 'Describe your own project idea and Claude returns a full brief: objectives, tech stack, skills gained, and a phased checklist. Good for validating a concept or getting a head start on something you already have in mind.',
  },
]

type Tab = typeof MODES[number]['id']

export function AdvisorTabs({ initialIdeas }: { initialIdeas: ProjectIdea[] }) {
  const [tab, setTab] = useState<Tab>('trending')

  return (
    <div>
      {/* Mode selector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
        {MODES.map(mode => {
          const active = tab === mode.id
          return (
            <button
              key={mode.id}
              onClick={() => setTab(mode.id)}
              style={{
                textAlign: 'left',
                padding: '16px 20px',
                borderRadius: 12,
                background: active ? `rgba(${mode.accent},0.06)` : 'rgba(255,255,255,0.015)',
                border: `1px solid ${active ? `rgba(${mode.accent},0.3)` : 'rgba(255,255,255,0.07)'}`,
                borderLeft: `3px solid ${active ? mode.color : 'rgba(255,255,255,0.07)'}`,
                cursor: 'pointer',
                transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <p style={{
                  fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em',
                  color: active ? mode.color : '#52525b',
                  transition: 'color 0.15s',
                }}>
                  {mode.label}
                </p>
                {active && (
                  <span style={{
                    fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
                    color: mode.color, background: `rgba(${mode.accent},0.12)`,
                    border: `1px solid rgba(${mode.accent},0.22)`,
                    borderRadius: 3, padding: '1px 6px', textTransform: 'uppercase',
                  }}>
                    Active
                  </span>
                )}
              </div>
              <p style={{
                fontSize: 12, color: active ? '#71717a' : '#3f3f46',
                lineHeight: 1.6, transition: 'color 0.15s',
              }}>
                {mode.desc}
              </p>
            </button>
          )
        })}
      </div>

      {tab === 'trending'
        ? <ProjectAdvisor initialIdeas={initialIdeas} />
        : <CustomAdvisor />
      }
    </div>
  )
}
