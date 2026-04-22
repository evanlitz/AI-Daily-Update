import { ProjectAdvisor } from '@/components/ProjectAdvisor'
import db from '@/lib/db'
import type { ProjectIdea } from '@/lib/types'

async function getIdeas(): Promise<ProjectIdea[]> {
  try {
    const { rows } = await db.execute({
      sql: `SELECT * FROM project_ideas ORDER BY created_at DESC LIMIT 3`,
      args: [],
    })
    return (rows as any[]).map(r => ({
      ...r,
      skills_learned: JSON.parse(r.skills_learned ?? '[]'),
      starter_checklist: JSON.parse(r.starter_checklist ?? '[]'),
      tech_stack: JSON.parse(r.tech_stack ?? '[]'),
    }))
  } catch { return [] }
}

export default async function AdvisorPage() {
  const ideas = await getIdeas()

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <div className="mb-8">
        <p className="eyebrow mb-2">Mission Briefing</p>
        <h1
          style={{
            color: '#e8e8f0',
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            marginBottom: 6,
          }}
        >
          Project Advisor
        </h1>
        <p style={{ color: '#8080b0', fontSize: 12 }}>
          3 missions calibrated to your level · powered by Claude · based on what's trending now
        </p>
      </div>

      <ProjectAdvisor initialIdeas={ideas} />
    </main>
  )
}
