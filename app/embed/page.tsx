import { TrendFeed } from '@/components/TrendFeed'
import { ProjectAdvisor } from '@/components/ProjectAdvisor'
import type { FeedItem, ProjectIdea } from '@/lib/types'

async function fetchJSON(path: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${base}${path}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function EmbedPage() {
  const [feedItems, ideas] = await Promise.all([
    fetchJSON('/api/feed?page=1&sort=velocity'),
    fetchJSON('/api/advisor'),
  ])

  const items: FeedItem[] = feedItems ?? []
  const projectIdeas: ProjectIdea[] = Array.isArray(ideas) ? ideas : []

  return (
    <main className="mx-auto max-w-4xl px-4 py-4 bg-zinc-950 min-h-screen">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TrendFeed items={items} stats={{}} />
        <ProjectAdvisor initialIdeas={projectIdeas} />
      </div>
    </main>
  )
}
