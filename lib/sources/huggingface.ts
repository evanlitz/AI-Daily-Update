import axios from 'axios'
import he from 'he'
import type { FeedItem } from '../types'

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function fetchHuggingFace(): Promise<FeedItem[]> {
  try {
    const res = await axios.get('https://huggingface.co/api/daily_papers', { timeout: 10000 })
    const items: any[] = Array.isArray(res.data) ? res.data : []
    const now = new Date().toISOString()

    return items.map((item: any) => {
      const id: string = item.paper?.id ?? item.id ?? ''
      const title: string = item.paper?.title ?? ''
      const summary: string = item.paper?.summary ?? ''
      const publishedAt: string = item.publishedAt ?? now

      return {
        id: id || `hf-${Date.now()}`,
        source: 'huggingface',
        title: he.decode(stripHtml(title)),
        url: `https://huggingface.co/papers/${id}`,
        raw_content: stripHtml(summary).slice(0, 800),
        published_at: publishedAt ? new Date(publishedAt).toISOString() : now,
        fetched_at: now,
        topic_tags: ['research'],
        velocity_score: 0,
        is_read: 0,
      }
    })
  } catch (err) {
    console.error('[huggingface] fetch failed:', err)
    return []
  }
}
