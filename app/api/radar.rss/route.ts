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

const RING_DESC: Record<string, string> = {
  adopt:  'ADOPT — use now',
  trial:  'TRIAL — experiment with',
  assess: 'ASSESS — worth watching',
  hold:   'HOLD — not yet',
}

export async function GET(req: Request) {
  const { rows } = await db.execute(
    `SELECT id, name, category, quadrant, rationale, last_updated
     FROM tech_radar
     ORDER BY last_updated DESC`
  )

  const host = new URL(req.url).origin

  const items = (rows as any[]).map(r => {
    const ring = RING_DESC[r.quadrant] ?? r.quadrant
    const desc = r.rationale ? `[${ring}] ${escape(r.rationale)}` : escape(ring)
    return `  <item>
    <title>${escape(r.name)} [${(r.quadrant as string).toUpperCase()}]</title>
    <link>${host}/radar</link>
    <guid isPermaLink="false">radar-${escape(r.id)}</guid>
    <pubDate>${rfcDate(r.last_updated)}</pubDate>
    <category>${escape(r.category)}</category>
    <description>${desc}</description>
  </item>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Daily Update — Tech Radar</title>
    <link>${host}/radar</link>
    <description>AI/ML technology radar — signals classified by adoption readiness</description>
    <language>en</language>
    <atom:link href="${host}/api/radar.rss" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
