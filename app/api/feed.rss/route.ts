import { NextResponse } from 'next/server'
import db from '@/lib/db'

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function rfcDate(iso: string): string {
  return new Date(iso).toUTCString()
}

export async function GET(req: Request) {
  const { rows } = await db.execute(
    `SELECT id, title, url, summary, source, published_at, fetched_at, topic_tags, velocity_score
     FROM feed_items
     ORDER BY fetched_at DESC
     LIMIT 100`
  )

  const host = new URL(req.url).origin

  const items = (rows as any[]).map(r => {
    const tags: string[] = (() => { try { return JSON.parse(r.topic_tags ?? '[]') } catch { return [] } })()
    const date = r.published_at ?? r.fetched_at
    const desc = r.summary ? escape(r.summary) : ''
    const categories = tags.map(t => `    <category>${escape(t)}</category>`).join('\n')
    return `  <item>
    <title>${escape(r.title)}</title>
    <link>${escape(r.url)}</link>
    <guid isPermaLink="false">${escape(r.id)}</guid>
    <pubDate>${rfcDate(date)}</pubDate>
    <source url="${host}/api/feed.rss">AI Daily Update Feed</source>
${categories}
    <description>${desc}</description>
  </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Daily Update — Feed</title>
    <link>${host}</link>
    <description>AI news feed — curated from arXiv, Hacker News, GitHub, and RSS sources</description>
    <language>en</language>
    <atom:link href="${host}/api/feed.rss" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=900',
    },
  })
}
