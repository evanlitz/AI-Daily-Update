import { TrendFeed } from '@/components/TrendFeed'
import { ProjectAdvisor } from '@/components/ProjectAdvisor'
import db from '@/lib/db'
import type { FeedItem, ProjectIdea } from '@/lib/types'

export default async function EmbedPage() {
  const [feedRows, ideaRows] = await Promise.all([
    db.execute({ sql: `SELECT * FROM feed_items ORDER BY velocity_score DESC LIMIT 40`, args: [] }).catch(() => ({ rows: [] })),
    db.execute({ sql: `SELECT * FROM project_ideas ORDER BY created_at DESC LIMIT 3`, args: [] }).catch(() => ({ rows: [] })),
  ])

  const items: FeedItem[] = (feedRows.rows as any[]).map(i => ({ ...i, topic_tags: JSON.parse(i.topic_tags ?? '[]') }))
  const projectIdeas: ProjectIdea[] = (ideaRows.rows as any[]).map(r => ({
    ...r,
    skills_learned: JSON.parse(r.skills_learned ?? '[]'),
    starter_checklist: JSON.parse(r.starter_checklist ?? '[]'),
    tech_stack: JSON.parse(r.tech_stack ?? '[]'),
  }))

  return (
    <main className="mx-auto max-w-4xl px-4 py-4 bg-zinc-950 min-h-screen">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TrendFeed items={items} stats={{}} />
        <ProjectAdvisor initialIdeas={projectIdeas} />
      </div>
    </main>
  )
}
