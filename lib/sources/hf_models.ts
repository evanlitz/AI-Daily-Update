import axios from 'axios'
import he from 'he'
import crypto from 'crypto'
import type { FeedItem } from '../types'

// Pipeline tags we care about — excludes niche/non-AI-focused tags
const RELEVANT_PIPELINES = new Set([
  'text-generation', 'text2text-generation', 'fill-mask', 'text-classification',
  'token-classification', 'question-answering', 'summarization', 'translation',
  'sentence-similarity', 'zero-shot-classification', 'conversational',
  'image-classification', 'object-detection', 'image-segmentation',
  'image-to-text', 'text-to-image', 'visual-question-answering',
  'automatic-speech-recognition', 'text-to-speech', 'audio-classification',
  'video-classification', 'reinforcement-learning', 'robotics',
  'image-feature-extraction', 'feature-extraction',
])

function stableId(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 16)
}

function getTopicTags(pipeline: string): string[] {
  if (/image|vision|video|object|segment/.test(pipeline)) return ['models', 'tools']
  if (/speech|audio/.test(pipeline)) return ['models', 'tools']
  if (/text|conversational|summariz|translat|fill|question|zero/.test(pipeline)) return ['models']
  return ['models']
}

export async function fetchHFModels(): Promise<FeedItem[]> {
  try {
    const res = await axios.get('https://huggingface.co/api/models', {
      params: { sort: 'trending', limit: 50, full: false },
      timeout: 15000,
    })

    const models: any[] = Array.isArray(res.data) ? res.data : []
    const now = new Date().toISOString()
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000

    return models
      .filter((m: any) => {
        if (!RELEVANT_PIPELINES.has(m.pipeline_tag)) return false
        // Require meaningful engagement to filter out personal/throwaway uploads
        if ((m.likes ?? 0) < 10 && (m.downloads ?? 0) < 1000) return false
        // Recency check — model must have been modified recently
        if (m.lastModified && new Date(m.lastModified).getTime() < cutoff) return false
        return true
      })
      .map((m: any) => {
        const modelId: string = m.modelId ?? m.id ?? ''
        const pipeline: string = m.pipeline_tag ?? 'unknown'
        const lastMod = m.lastModified ?? now
        const description = [
          pipeline,
          m.likes != null ? `${m.likes} likes` : null,
          m.downloads != null ? `${m.downloads.toLocaleString()} downloads` : null,
        ].filter(Boolean).join(' · ')

        return {
          id: stableId(`hf-model:${modelId}`),
          source: 'hf-models',
          title: he.decode(modelId),
          url: `https://huggingface.co/${modelId}`,
          raw_content: description,
          published_at: new Date(lastMod).toISOString(),
          fetched_at: now,
          topic_tags: getTopicTags(pipeline),
          velocity_score: 0,
          is_read: 0,
        }
      })

  } catch (err) {
    console.error('[hf-models] fetch failed:', err)
    return []
  }
}
