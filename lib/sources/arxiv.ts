import axios from 'axios'
import { parseStringPromise } from 'xml2js'
import he from 'he'
import crypto from 'crypto'
import type { FeedItem } from '../types'

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function stripLatex(str: string): string {
  return str.replace(/\$[^$]+\$/g, '').replace(/\\[a-zA-Z]+\{[^}]*\}/g, '').trim()
}

function stableId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

export async function fetchArxiv(): Promise<FeedItem[]> {
  try {
    const url = 'http://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG+OR+cat:cs.CL&start=0&max_results=20&sortBy=submittedDate&sortOrder=descending'
    const res = await axios.get(url, { timeout: 15000 })
    const result = await parseStringPromise(res.data)
    const entries: any[] = result.feed?.entry ?? []
    const now = new Date().toISOString()

    return entries.map((entry: any) => {
      const rawUrl: string = entry.id?.[0] ?? ''
      const arxivId = rawUrl.split('/').pop()?.replace(/v\d+$/, '') ?? stableId(rawUrl)
      const rawContent = stripLatex(stripHtml(entry.summary?.[0] ?? ''))
      const published = entry.published?.[0]

      return {
        id: arxivId,
        source: 'arxiv',
        title: he.decode(stripHtml(entry.title?.[0] ?? '')),
        url: rawUrl,
        raw_content: rawContent.slice(0, 800),
        published_at: published ? new Date(published).toISOString() : now,
        fetched_at: now,
        topic_tags: ['research'],
        velocity_score: 0,
        is_read: 0,
      }
    })
  } catch (err) {
    console.error('[arxiv] fetch failed:', err)
    return []
  }
}
