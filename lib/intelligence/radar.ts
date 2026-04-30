import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL_FAST } from '../claude'
import type { FeedItem } from '../types'

const TOOL_PATTERNS = /\b(GPT-?4o?|GPT-?[345][\w.-]*|o[134][\w-]*|Claude\s?(?:[34][\w.]*|Opus[\s\w.-]*|Sonnet[\s\w.-]*|Haiku[\s\w.-]*|Instant[\s\w.-]*|Code[\s\w.-]*)|Gemini[\s\w.-]+|Gemma[\s\d.-]*|Llama[\s-]?[23][\w.-]*|LLaMA[\s\d.-]*|Mistral[\s\w.-]*|Mixtral[\s\w.-]*|Grok[\s-]?[\w.-]*|DeepSeek[\s-]?[\w.-]*|Phi-[\w.-]+|Qwen[\s\d.-]*|Falcon[\s\d.-]*|Stable[\s-]?Diffusion[\s\w.-]*|SDXL|DALL-?E[\s\d.-]*|Midjourney|Flux[\s\d.-]*|Runway[\s\w.-]*|Sora|LangChain|LlamaIndex|LangGraph|DSPy|Instructor|CrewAI|AutoGen|Chroma|Pinecone|Weaviate|Qdrant|Ollama|LM Studio|vLLM|llama\.cpp|LoRA|QLoRA|RLHF|DPO|RAG|GraphRAG|Cursor\b|Copilot[\s\w.-]*|Codeium|Weights\s?&\s?Biases|MLflow|Hugging\s?Face|Transformers\b|PEFT|TRL|PyTorch|JAX|LiteLLM|Perplexity[\s\w.-]*|Groq\b|Cohere\b)\b/gi

const SEED_TOOLS = ['Claude Sonnet','GPT-4o','Gemini 1.5 Pro','Llama 3','Mistral 7B','DeepSeek V3','Phi-3','Gemma 2','Cursor','GitHub Copilot','Codeium','LangChain','LlamaIndex','DSPy','CrewAI','AutoGen','Ollama','vLLM','LM Studio','Chroma','Qdrant','Pinecone','RAG','LoRA','QLoRA','RLHF','DPO','Weights & Biases','LiteLLM']

function normalizeKey(s: string) {
  return s.toLowerCase().replace(/[\s\-_.]+/g, '')
}

async function classifyBatch(tools: string[]): Promise<void> {
  if (!tools.length) return
  const toolKeys = new Set(tools.map(normalizeKey))
  const response = await anthropic.messages.create({
    model: MODEL_FAST, max_tokens: 2000,
    system: [{ type: 'text', text: 'You are classifying AI tools for a personal tech radar (self-taught developer learning AI). Quadrants: adopt=use now, trial=worth experimenting, assess=watch but not yet, hold=not worth it. Categories: model, tool, framework, technique, infra. Be opinionated, base on early 2026 ecosystem. CRITICAL: only return entries for tools explicitly listed in the input. Use the exact name as given. Do NOT add entries for people, historical figures, organizations, or anything not in the input list. If an item is not a real AI tool, model, framework, technique, or infrastructure product, omit it entirely.', cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Classify these AI tools. Return JSON array only — one entry per tool in the list, skip any that are not genuine AI tools:\n\n${tools.join(', ')}\n\n[{"name":"...","category":"model|tool|framework|technique|infra","quadrant":"adopt|trial|assess|hold","rationale":"One sentence."}]` }],
  })
  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let classified: any[] = []
  try { const m = text.match(/\[[\s\S]*\]/); if (m) classified = JSON.parse(m[0]) } catch { return }

  // Only accept entries whose name matches one of the input tools
  const valid = classified.filter(item => item.name && toolKeys.has(normalizeKey(item.name)))

  // Fetch existing quadrants to detect ring transitions
  const now = new Date().toISOString()
  const existingMap = new Map<string, { quadrant: string; ring_history: string }>()
  if (valid.length > 0) {
    const placeholders = valid.map(() => '?').join(',')
    const { rows: existing } = await db.execute({
      sql: `SELECT name, quadrant, ring_history FROM tech_radar WHERE name IN (${placeholders})`,
      args: valid.map(i => i.name),
    })
    for (const row of existing as any[]) existingMap.set(row.name, row)
  }

  for (const item of valid) {
    const prev = existingMap.get(item.name)
    let history: any[] = []
    if (prev) {
      try { history = JSON.parse(prev.ring_history ?? '[]') } catch {}
      if (prev.quadrant !== (item.quadrant ?? 'assess')) {
        history.push({ from: prev.quadrant, to: item.quadrant ?? 'assess', date: now })
      }
    }
    await db.execute({
      sql: `INSERT INTO tech_radar (id, name, category, quadrant, rationale, last_updated, ring_history) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET category=excluded.category, quadrant=excluded.quadrant, rationale=excluded.rationale, last_updated=excluded.last_updated, ring_history=excluded.ring_history`,
      args: [crypto.randomUUID(), item.name, item.category ?? 'tool', item.quadrant ?? 'assess', item.rationale ?? '', now, JSON.stringify(history)],
    })
  }
  console.log(`[radar] classified ${valid.length}/${classified.length} items (${classified.length - valid.length} filtered)`)
}

export async function seedRadarIfEmpty(): Promise<void> {
  const { rows } = await db.execute(`SELECT COUNT(*) as c FROM tech_radar`)
  if ((rows[0] as any).c > 0) return
  console.log('[radar] seeding...')
  await classifyBatch(SEED_TOOLS)
}

export async function classifyForRadar(items: FeedItem[]): Promise<void> {
  const allText  = items.map(i => `${i.title} ${i.raw_content ?? ''}`).join(' ')
  const matches  = allText.match(TOOL_PATTERNS) ?? []
  const seen     = new Map<string, string>()
  for (const m of matches) { const k = m.toLowerCase().trim(); if (!seen.has(k)) seen.set(k, m.trim()) }
  const uniqueTools = [...seen.values()]
  if (!uniqueTools.length) return

  const { rows: existing } = await db.execute(`SELECT name FROM tech_radar`)
  const existingNames = new Set((existing as any[]).map(r => r.name.toLowerCase()))
  const newTools = uniqueTools.filter(t => !existingNames.has(t.toLowerCase()))
  if (!newTools.length) return

  for (let i = 0; i < newTools.length; i += 20) await classifyBatch(newTools.slice(i, i + 20))
}

export async function scanAllFeedItems(): Promise<number> {
  const { rows } = await db.execute(`SELECT title, raw_content FROM feed_items ORDER BY fetched_at DESC LIMIT 500`)
  await classifyForRadar(rows as unknown as FeedItem[])
  const { rows: countRows } = await db.execute(`SELECT COUNT(*) as c FROM tech_radar`)
  return (countRows[0] as any).c
}
