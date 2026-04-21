import axios from 'axios'
import crypto from 'crypto'
import type { Dataset } from '../types'

// Tags on Kaggle datasets that indicate AI/ML relevance
const AI_TAGS = new Set([
  'deep learning', 'machine learning', 'nlp', 'natural language processing',
  'computer vision', 'neural networks', 'text', 'image', 'audio',
  'classification', 'regression', 'reinforcement learning', 'generative ai',
  'large language models', 'transformers', 'llm', 'ai', 'pytorch', 'tensorflow',
  'time series', 'object detection', 'sentiment analysis', 'image classification',
  'speech recognition', 'question answering',
])

function isAIRelevant(tags: string[]): boolean {
  const lower = tags.map(t => t.toLowerCase())
  return lower.some(t => AI_TAGS.has(t))
}

function mapTaskCategories(tags: string[]): string[] {
  const lower = tags.map(t => t.toLowerCase())
  const cats: string[] = []
  if (lower.some(t => t.includes('nlp') || t.includes('natural language') || t.includes('text'))) cats.push('text-generation')
  if (lower.some(t => t.includes('image') || t.includes('computer vision'))) cats.push('image-classification')
  if (lower.some(t => t.includes('speech') || t.includes('audio'))) cats.push('automatic-speech-recognition')
  if (lower.some(t => t.includes('reinforcement'))) cats.push('reinforcement-learning')
  if (lower.some(t => t.includes('classification'))) cats.push('tabular-classification')
  if (lower.some(t => t.includes('question answering'))) cats.push('question-answering')
  if (lower.some(t => t.includes('object detection'))) cats.push('object-detection')
  return cats.length > 0 ? cats : ['feature-extraction']
}

async function fetchPage(sort: string): Promise<Dataset[]> {
  const username = process.env.KAGGLE_USERNAME
  const key = process.env.KAGGLE_KEY

  if (!username || !key) {
    console.log('[kaggle] KAGGLE_USERNAME or KAGGLE_KEY not set, skipping')
    return []
  }

  const auth = Buffer.from(`${username}:${key}`).toString('base64')
  const res = await axios.get('https://www.kaggle.com/api/v1/datasets/list', {
    params: { sort, page: 1, pageSize: 50 },
    headers: {
      Authorization: `Basic ${auth}`,
      'User-Agent': 'Mozilla/5.0 (compatible; AIPulse/1.0)',
    },
    timeout: 15000,
  })

  const items: any[] = Array.isArray(res.data) ? res.data : []
  const now = new Date().toISOString()

  return items
    .filter(item => {
      const tags: string[] = (item.tags ?? []).map((t: any) =>
        typeof t === 'string' ? t : t.name ?? t.label ?? ''
      )
      return isAIRelevant(tags)
    })
    .map(item => {
      const tags: string[] = (item.tags ?? []).map((t: any) =>
        typeof t === 'string' ? t : t.name ?? t.label ?? ''
      )
      const ref: string = item.ref ?? item.id ?? ''
      const fullName = `kaggle:${ref}`
      const sizeBytes: number = item.totalBytes ?? 0
      const sizeMB = sizeBytes / (1024 * 1024)
      const size_category =
        sizeMB < 1 ? 'n<1M' :
        sizeMB < 10 ? 'n<10M' :
        sizeMB < 100 ? 'n<100M' :
        sizeMB < 1000 ? 'n<1G' : 'n>1G'

      return {
        id: crypto.createHash('sha1').update(fullName).digest('hex').slice(0, 16),
        full_name: fullName,
        url: item.url ?? `https://www.kaggle.com/datasets/${ref}`,
        description: (item.subtitle || item.description || '').slice(0, 300),
        task_categories: mapTaskCategories(tags),
        modalities: [],
        size_category,
        license: item.licenseName?.toLowerCase() ?? undefined,
        downloads: item.downloadCount ?? 0,
        likes: item.voteCount ?? 0,
        last_modified: item.lastUpdated ? new Date(item.lastUpdated).toISOString() : undefined,
        fetched_at: now,
      } as Dataset
    })
}

export async function fetchKaggleDatasets(): Promise<Dataset[]> {
  try {
    const [byVotes, byUpdated] = await Promise.all([
      fetchPage('votes'),
      fetchPage('updated'),
    ])

    const seen = new Set<string>()
    const all: Dataset[] = []
    for (const d of [...byVotes, ...byUpdated]) {
      if (!seen.has(d.full_name)) {
        seen.add(d.full_name)
        all.push(d)
      }
    }

    console.log(`[kaggle] fetched ${all.length} AI-relevant datasets`)
    return all
  } catch (err: any) {
    if (err?.response?.status === 401) {
      console.error('[kaggle] authentication failed — check KAGGLE_USERNAME and KAGGLE_KEY')
    } else {
      console.error('[kaggle] fetch failed:', err?.message ?? err)
    }
    return []
  }
}
