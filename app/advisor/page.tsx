import { AdvisorTabs } from '@/components/AdvisorTabs'
import db from '@/lib/db'
import type { ProjectIdea } from '@/lib/types'

export const dynamic = 'force-dynamic'

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
    <main className="mx-auto max-w-screen-2xl px-10 py-8">
      <div className="mb-8">
        <p style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.16em',
          color: '#a78bfa', textTransform: 'uppercase', marginBottom: 14,
        }}>
          Claude-Powered
        </p>
        <h1 style={{
          color: '#f4f4f5', fontSize: 32, fontWeight: 900,
          letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 10,
        }}>
          AI Project Advisor
        </h1>
        <p style={{ color: '#71717a', fontSize: 14, lineHeight: 1.65, maxWidth: 560 }}>
          Claude scans the week's AI developments and generates project briefs calibrated to your skill level —
          complete with tech stack, difficulty rating, and a phased checklist. Or describe your own idea
          for a custom mission brief.
        </p>
      </div>

      <AdvisorTabs initialIdeas={ideas} />
    </main>
  )
}
