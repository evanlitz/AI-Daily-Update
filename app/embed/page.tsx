import { TrendFeed } from '@/components/TrendFeed'
import { ProjectAdvisor } from '@/components/ProjectAdvisor'
import db from '@/lib/db'
import type { FeedItem, ProjectIdea } from '@/lib/types'
import { withCachedFallback } from '@/lib/cache'

// Must be a literal: Next 16 statically analyses segment config exports and
// rejects an imported constant. Keep in sync with REVALIDATE_SECONDS in lib/cache.ts.
export const revalidate = 900

export default async function EmbedPage() {
  // Build-only fallbacks (see lib/cache.ts). The per-query `.catch(() => ({rows: []}))`
  // these replace was harmless under force-dynamic but would now pin an empty embed
  // in the ISR cache for 900s instead of letting the last good render stand.
  const [feedRows, ideaRows] = await Promise.all([
    withCachedFallback<{ rows: any[] }>('/embed feed', () =>
      db.execute({ sql: `SELECT * FROM feed_items ORDER BY velocity_score DESC LIMIT 40`, args: [] }), { rows: [] }),
    withCachedFallback<{ rows: any[] }>('/embed ideas', () =>
      db.execute({ sql: `SELECT * FROM project_ideas ORDER BY created_at DESC LIMIT 3`, args: [] }), { rows: [] }),
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
