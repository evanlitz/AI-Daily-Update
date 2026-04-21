import axios from 'axios'
import crypto from 'crypto'
import type { Dataset } from '../types'

// Task categories we care about — filters out generic/unrelated datasets
const RELEVANT_TASKS = new Set([
  'text-generation', 'text-classification', 'question-answering',
  'summarization', 'translation', 'token-classification',
  'text2text-generation', 'fill-mask', 'sentence-similarity',
  'conversational', 'zero-shot-classification',
  'image-classification', 'object-detection', 'image-segmentation',
  'image-to-text', 'text-to-image', 'visual-question-answering',
  'image-feature-extraction', 'depth-estimation',
  'automatic-speech-recognition', 'audio-classification',
  'text-to-speech', 'audio-to-audio',
  'video-classification', 'feature-extraction',
  'reinforcement-learning', 'robotics',
  'tabular-classification', 'tabular-regression',
])

// Readable labels for task categories
const TASK_LABELS: Record<string, string> = {
  'text-generation': 'Text Gen',
  'text-classification': 'Classification',
  'question-answering': 'Q&A',
  'summarization': 'Summarization',
  'translation': 'Translation',
  'token-classification': 'NER',
  'text2text-generation': 'Text2Text',
  'fill-mask': 'Fill Mask',
  'sentence-similarity': 'Similarity',
  'conversational': 'Chat',
  'zero-shot-classification': 'Zero-Shot',
  'image-classification': 'Image Class.',
  'object-detection': 'Object Det.',
  'image-segmentation': 'Segmentation',
  'image-to-text': 'Image→Text',
  'text-to-image': 'Text→Image',
  'visual-question-answering': 'VQA',
  'image-feature-extraction': 'Image Features',
  'automatic-speech-recognition': 'ASR',
  'audio-classification': 'Audio Class.',
  'text-to-speech': 'TTS',
  'reinforcement-learning': 'RL',
  'robotics': 'Robotics',
  'tabular-classification': 'Tabular',
  'feature-extraction': 'Embeddings',
}

export { TASK_LABELS, RELEVANT_TASKS }

function parseTags(tags: string[]): {
  task_categories: string[]
  modalities: string[]
  size_category: string | undefined
  license: string | undefined
} {
  const task_categories: string[] = []
  const modalities: string[] = []
  let size_category: string | undefined
  let license: string | undefined

  for (const tag of tags) {
    if (tag.startsWith('task_categories:')) {
      const t = tag.replace('task_categories:', '')
      if (RELEVANT_TASKS.has(t)) task_categories.push(t)
    } else if (tag.startsWith('modality:')) {
      modalities.push(tag.replace('modality:', ''))
    } else if (tag.startsWith('size_categories:')) {
      size_category = tag.replace('size_categories:', '')
    } else if (tag.startsWith('license:')) {
      license = tag.replace('license:', '').replace(/-/g, ' ')
    }
  }

  return { task_categories, modalities, size_category, license }
}

function cleanDescription(desc: string | undefined): string {
  if (!desc) return ''
  // Strip markdown headers, links, HTML
  return desc
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/#{1,6}\s/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300)
}

async function fetchPage(url: string): Promise<Dataset[]> {
  const res = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AIPulse/1.0)' },
  })
  const items: any[] = Array.isArray(res.data) ? res.data : []
  const now = new Date().toISOString()

  return items
    .map((item: any) => {
      const { task_categories, modalities, size_category, license } = parseTags(item.tags ?? [])
      if (task_categories.length === 0) return null // skip untagged/irrelevant

      const fullName: string = item.id ?? ''
      return {
        id: crypto.createHash('sha1').update(fullName).digest('hex').slice(0, 16),
        full_name: fullName,
        url: `https://huggingface.co/datasets/${fullName}`,
        description: cleanDescription(item.description),
        task_categories,
        modalities,
        size_category,
        license,
        downloads: item.downloads ?? 0,
        likes: item.likes ?? 0,
        last_modified: item.lastModified ? new Date(item.lastModified).toISOString() : undefined,
        fetched_at: now,
      } as Dataset
    })
    .filter(Boolean) as Dataset[]
}

// Niche task-specific queries to surface datasets that don't appear in top-50 popular
const NICHE_TASK_QUERIES = [
  'reinforcement-learning',
  'text-to-image',
  'robotics',
  'automatic-speech-recognition',
  'visual-question-answering',
  'object-detection',
  'tabular-classification',
]

export async function fetchDatasets(): Promise<Dataset[]> {
  try {
    const BASE = 'https://huggingface.co/api/datasets?full=true&limit=50'

    // Broad queries + niche task-specific queries for coverage
    const queries = [
      `${BASE}&sort=likes&direction=-1`,
      `${BASE}&sort=lastModified&direction=-1`,
      ...NICHE_TASK_QUERIES.map(t => `${BASE}&filter=task_categories:${t}&sort=likes&direction=-1&limit=20`),
    ]

    const pages = await Promise.all(queries.map(url => fetchPage(url).catch(() => [])))

    // Merge, deduplicate by full_name
    const seen = new Set<string>()
    const all: Dataset[] = []
    for (const page of pages) {
      for (const d of page) {
        if (!seen.has(d.full_name)) {
          seen.add(d.full_name)
          all.push(d)
        }
      }
    }

    console.log(`[datasets] fetched ${all.length} relevant HuggingFace datasets`)
    return all
  } catch (err) {
    console.error('[datasets] HuggingFace fetch failed:', err)
    return []
  }
}
