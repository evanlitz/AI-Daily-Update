import axios from 'axios'
import crypto from 'crypto'
import type { FeedItem } from '../types'

const HEADERS: Record<string, string> = {
  'Accept': 'application/vnd.github+json',
  'User-Agent': 'AIPulse/1.0',
}
if (process.env.GITHUB_TOKEN) HEADERS['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`

// Repos where a new release is actual news — inference engines, training frameworks,
// orchestration libs, and SDK clients that practitioners upgrade regularly
const WATCHED_REPOS = [
  // Inference / serving
  'vllm-project/vllm',
  'ollama/ollama',
  'ggerganov/llama.cpp',

  // Core training frameworks
  'huggingface/transformers',
  'huggingface/trl',
  'huggingface/peft',
  'unslothai/unsloth',

  // Agents / orchestration
  'langchain-ai/langchain',
  'run-llama/llama_index',
  'microsoft/autogen',
  'pydantic/pydantic-ai',
  'BerriAI/litellm',

  // SDK clients
  'openai/openai-python',
  'anthropics/anthropic-sdk-python',

  // Tooling
  'simonw/llm',
]

const CUTOFF_DAYS = 14
const MIN_BODY_LEN = 80   // skip releases with no notes (pure patch bumps)

function stableId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*|__|\*|_|`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchReleases(repo: string, cutoff: number): Promise<FeedItem[]> {
  try {
    const res = await axios.get(`https://api.github.com/repos/${repo}/releases`, {
      params: { per_page: 5 },
      headers: HEADERS,
      timeout: 10000,
    })
    const now = new Date().toISOString()
    const repoName = repo.split('/')[1]

    return (res.data as any[])
      .filter(r =>
        !r.draft &&
        !r.prerelease &&
        new Date(r.published_at).getTime() > cutoff &&
        (r.body ?? '').length >= MIN_BODY_LEN
      )
      .map(r => {
        const releaseName = r.name?.trim() || r.tag_name
        const body = stripMarkdown(r.body ?? '').slice(0, 1200)
        return {
          id: stableId(r.html_url),
          source: 'github-releases',
          title: `${repoName} ${r.tag_name}: ${releaseName}`,
          url: r.html_url as string,
          raw_content: body,
          published_at: new Date(r.published_at).toISOString(),
          fetched_at: now,
          topic_tags: ['tools'],
          velocity_score: 0,
          is_read: 0,
        } as FeedItem
      })
  } catch (err) {
    console.error(`[github-releases] ${repo}:`, err)
    return []
  }
}

export async function fetchGithubReleases(): Promise<FeedItem[]> {
  const cutoff = Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000
  const results = await Promise.all(WATCHED_REPOS.map(repo => fetchReleases(repo, cutoff)))
  const items = results.flat()
  console.log(`[github-releases] ${items.length} new releases across ${WATCHED_REPOS.length} repos`)
  return items
}
