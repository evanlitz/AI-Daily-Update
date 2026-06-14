'use client'

import { useState } from 'react'
import { ProjectAdvisor } from './ProjectAdvisor'
import { CustomAdvisor } from './CustomAdvisor'
import type { ProjectIdea } from '@/lib/types'

const TABS = [
  { id: 'trending', label: 'Trending Missions' },
  { id: 'custom',   label: 'Custom Op'         },
] as const

type Tab = typeof TABS[number]['id']

export function AdvisorTabs({ initialIdeas }: { initialIdeas: ProjectIdea[] }) {
  const [tab, setTab] = useState<Tab>('trending')

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {TABS.map(({ id, label }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase',
                padding: '7px 18px', borderRadius: 8,
                background: active ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: active ? '#60a5fa' : '#52525b',
                border: `1px solid ${active ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.08)'}`,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {label}
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
