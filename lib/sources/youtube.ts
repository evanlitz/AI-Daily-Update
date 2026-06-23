import Parser from 'rss-parser'
import { YoutubeTranscript } from 'youtube-transcript'
import he from 'he'
import crypto from 'crypto'
import type { FeedItem } from '../types'

const parser = new Parser({
  customFields: { item: [['media:group', 'mediaGroup']] },
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIPulse/1.0)' },
  timeout: 10000,
})

// To find a channel ID: open the channel page, view source, search for "externalId"
const CHANNELS = [
  { channelId: 'UCZHmQk67mSJgfCCTn7xBfew', slug: 'yannic-kilcher',   tags: ['research'] as string[] },
  { channelId: 'UCbfYPyITQ-7l4upoX8nvctg', slug: 'two-minute-papers', tags: ['research'] as string[] },
  { channelId: 'UCSHZKyawb77ixDdsGog4iWA', slug: 'lex-fridman',       tags: ['industry'] as string[] },
  { channelId: 'UCXUPKJO5MZQN11PqgIvyuvQ', slug: 'andrej-karpathy',   tags: ['research', 'tools'] as string[] },
  { channelId: 'UCXl4i9dYBrFOabk0xGmbkRA', slug: 'dwarkesh-patel',    tags: ['research', 'industry'] as string[] },
  { channelId: 'UCxBcwypKK-W3GHd_RZ9FZrQ', slug: 'latent-space',      tags: ['tools', 'industry'] as string[] },
  { channelId: 'UCSI7h9hydQ40K5MJHnCrQvw', slug: 'no-priors',         tags: ['industry'] as string[] },
  { channelId: 'UCfV5_thTSP0Wvi0odqxG96Q', slug: 'cognitive-revolution', tags: ['industry', 'tools'] as string[] },
]

const CUTOFF_DAYS = 7
const TRANSCRIPT_CHARS = 4000

function stableId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

function extractVideoId(url: string): string | null {
  const m = url.match(/[?&]v=([^&]+)/) ?? url.match(/youtu\.be\/([^?]+)/)
  return m?.[1] ?? null
}

async function getTranscript(videoId: string): Promise<string> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' })
    return segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim().slice(0, TRANSCRIPT_CHARS)
  } catch {
    return ''
  }
}

async function fetchChannel(ch: typeof CHANNELS[number], knownUrls: Set<string>): Promise<FeedItem[]> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channelId}`
  const cutoff = Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000

  try {
    const result = await parser.parseURL(feedUrl)
    const rssItems = result.items ?? []

    // If the most recent video is already stored, this channel has nothing new
    const mostRecentUrl = rssItems[0]?.link ?? ''
    if (mostRecentUrl && knownUrls.has(mostRecentUrl)) {
      console.log(`[youtube:${ch.slug}] up to date, skipping`)
      return []
    }

    const channelName = result.title ?? ch.slug
    const now = new Date().toISOString()

    const candidates = rssItems
      .slice(0, 15)
      .map((item: any) => {
        const url = item.link ?? ''
        const pubDate = item.isoDate ?? (item.pubDate ? new Date(item.pubDate).toISOString() : null)
        const mediaDesc: string =
          item.mediaGroup?.['media:description']?.[0] ??
          item.content ?? item.contentSnippet ?? ''
        return { url, pubDate, mediaDesc, title: item.title ?? '' }
      })
      .filter(item =>
        !knownUrls.has(item.url) &&
        (!item.pubDate || new Date(item.pubDate).getTime() > cutoff)
      )

    // Fetch transcripts sequentially to avoid rate-limiting YouTube
    const feedItems: FeedItem[] = []
    for (const item of candidates) {
      const videoId = extractVideoId(item.url)
      const transcript = videoId ? await getTranscript(videoId) : ''
      const content = transcript
        ? `[${channelName}] ${transcript}`
        : `[${channelName}] ${item.mediaDesc}`

      feedItems.push({
        id: stableId(item.url || item.title || String(Math.random())),
        source: `youtube:${ch.slug}`,
        title: he.decode(item.title),
        url: item.url,
        raw_content: content.slice(0, TRANSCRIPT_CHARS + 50),
        published_at: item.pubDate ?? now,
        fetched_at: now,
        topic_tags: ch.tags,
        velocity_score: 0,
        is_read: 0,
      })
    }

    console.log(`[youtube:${ch.slug}] ${feedItems.length} new videos`)
    return feedItems
  } catch (err) {
    console.error(`[youtube:${ch.slug}] fetch failed:`, err)
    return []
  }
}

export async function fetchYoutube(knownUrls: Set<string>): Promise<FeedItem[]> {
  const results = await Promise.all(CHANNELS.map(ch => fetchChannel(ch, knownUrls)))
  const items = results.flat()
  console.log(`[youtube] ${items.length} total new videos`)
  return items
}
