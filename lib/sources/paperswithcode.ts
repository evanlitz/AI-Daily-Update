import axios from 'axios'
import he from 'he'
import type { FeedItem } from '../types'

// Tasks we consider relevant — mirrors the datasets.ts RELEVANT_TASKS set
const RELEVANT_TASKS = new Set([
  'Language Modelling', 'Text Generation', 'Text Classification', 'Question Answering',
  'Summarization', 'Machine Translation', 'Named Entity Recognition', 'Sentiment Analysis',
  'Image Classification', 'Object Detection', 'Image Segmentation', 'Image Generation',
  'Text-to-Image Generation', 'Visual Question Answering', 'Image Captioning',
  'Automatic Speech Recognition', 'Text-to-Speech',
  'Reinforcement Learning', 'Robot Learning',
  'Code Generation', 'Math', 'Reasoning', 'Instruction Following',
  'Few-Shot Learning', 'Zero-Shot Learning', 'Retrieval-Augmented Generation',
])

function stripLatex(str: string): string {
  return str.replace(/\$[^$]+\$/g, '').replace(/\\[a-zA-Z]+\{[^}]*\}/g, '').trim()
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function hasRelevantTask(tasks: any[]): boolean {
  if (!tasks?.length) return false
  return tasks.some((t: any) => RELEVANT_TASKS.has(t.name))
}

export async function fetchPapersWithCode(): Promise<FeedItem[]> {
  try {
    // Fetch trending papers (ordered by date, PwC trending endpoint)
    const [trendingRes, recentRes] = await Promise.allSettled([
      axios.get('https://paperswithcode.com/api/v1/papers/?ordering=-published&format=json&page_size=30', { timeout: 15000 }),
      axios.get('https://paperswithcode.com/api/v1/papers/?ordering=-github_stars_count&format=json&page_size=20', { timeout: 15000 }),
    ])

    const papers: any[] = []
    const seen = new Set<string>()

    for (const r of [trendingRes, recentRes]) {
      if (r.status === 'rejected') continue
      for (const p of (r.value.data?.results ?? [])) {
        if (!p.arxiv_id || seen.has(p.arxiv_id)) continue
        seen.add(p.arxiv_id)
        papers.push(p)
      }
    }

    const now = new Date().toISOString()
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000

    return papers
      .filter((p: any) => {
        // Must have at least one code repo to distinguish from plain ArXiv
        if (!p.repositories?.length) return false
        // Must be within 14-day window
        if (p.published && new Date(p.published).getTime() < cutoff) return false
        // Must touch a relevant task (or have no task info — let it through)
        if (p.tasks?.length && !hasRelevantTask(p.tasks)) return false
        return true
      })
      .map((p: any) => {
        const topRepo = (p.repositories ?? [])
          .sort((a: any, b: any) => (b.stars ?? 0) - (a.stars ?? 0))[0]
        const repoNote = topRepo
          ? ` [code: ${topRepo.stars ?? 0} stars]`
          : ''
        const abstract = stripLatex(stripHtml(p.abstract ?? '')).slice(0, 800)
        const taskNames = (p.tasks ?? []).map((t: any) => t.name).join(', ')

        return {
          id: p.arxiv_id, // intentionally matches arxiv.ts id format — deduplicates in DB
          source: 'paperswithcode',
          title: he.decode(p.title ?? '') + repoNote,
          url: p.url_abs ?? `https://arxiv.org/abs/${p.arxiv_id}`,
          raw_content: (taskNames ? `Tasks: ${taskNames}. ` : '') + abstract,
          published_at: p.published ? new Date(p.published).toISOString() : now,
          fetched_at: now,
          topic_tags: ['research'],
          velocity_score: 0,
          is_read: 0,
        }
      })

  } catch (err) {
    console.error('[paperswithcode] fetch failed:', err)
    return []
  }
}
