import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import type { FeedItem } from '../types'

const TOOL_PATTERNS = /\b(GPT-?4o?|GPT-?[345][\w.-]*|o[134][\w-]*|Claude[\s-][\w.]+|Claude\s(?:Opus|Sonnet|Haiku)[\s\w.]*|Gemini[\s\w.-]+|Gemma[\s\d.-]*|Llama[\s-]?[23][\w.-]*|LLaMA[\s\d.-]*|Mistral[\s\w.-]*|Mixtral[\s\w.-]*|Grok[\s-]?[\w.-]*|DeepSeek[\s-]?[\w.-]*|Phi-[\w.-]+|Qwen[\s\d.-]*|Falcon[\s\d.-]*|Stable[\s-]?Diffusion[\s\w.-]*|SDXL|DALL-?E[\s\d.-]*|Midjourney|Flux[\s\d.-]*|Runway[\s\w.-]*|Sora|LangChain|LlamaIndex|LangGraph|LangSmith|Haystack|DSPy|Instructor|Outlines|CrewAI|AutoGen|AutoGPT|Swarm|Chroma|Pinecone|Weaviate|Qdrant|Milvus|pgvector|Ollama|LM Studio|GPT4All|vLLM|TGI|llama\.cpp|LoRA|QLoRA|RLHF|DPO|ORPO|GRPO|RAG|GraphRAG|Cursor\b|Copilot[\s\w.-]*|Codeium|Tabnine|Weights\s?&\s?Biases|MLflow|Hugging\s?Face|Transformers\b|PEFT|TRL|PyTorch|JAX|TensorFlow|LiteLLM|Portkey|Helicone|Langfuse|Perplexity[\s\w.-]*|Groq\b|Together[\s\w.-]*|Fireworks[\s\w.-]*|Cohere\b)\b/gi

// Baseline tools to classify if radar is empty — ensures value on first load
const SEED_TOOLS = [
  'Claude Sonnet', 'GPT-4o', 'Gemini 1.5 Pro', 'Llama 3', 'Mistral 7B',
  'DeepSeek V3', 'Phi-3', 'Gemma 2',
  'Cursor', 'GitHub Copilot', 'Codeium',
  'LangChain', 'LlamaIndex', 'DSPy', 'CrewAI', 'AutoGen',
  'Ollama', 'vLLM', 'LM Studio',
  'Chroma', 'Qdrant', 'Pinecone',
  'RAG', 'LoRA', 'QLoRA', 'RLHF', 'DPO',
  'Weights & Biases', 'LiteLLM',
]

async function classifyBatch(tools: string[]): Promise<void> {
  if (tools.length === 0) return

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: [
      {
        type: 'text',
        text: `You are classifying AI tools and models for a personal tech radar used by a self-taught developer learning AI.

Quadrant definitions:
- adopt: Mature, proven, actively recommended — use this now
- trial: Promising, worth hands-on experimentation
- assess: Emerging or niche — worth understanding but not adopting yet
- hold: Superseded, overhyped, too unstable, or not worth the investment right now

Category definitions:
- model: An AI/LLM model (GPT-4o, Claude, Llama, etc.)
- tool: A product or application (Cursor, Copilot, Ollama, etc.)
- framework: A dev library or orchestration framework (LangChain, DSPy, etc.)
- technique: A training/inference technique or concept (RAG, LoRA, RLHF, etc.)
- infra: Infrastructure/deployment/observability (vLLM, W&B, Pinecone, etc.)

Be opinionated. Base quadrant on the current state of the ecosystem as of early 2026.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Classify these AI tools/models/techniques. Return a JSON array only, no markdown fences:\n\n${tools.join(', ')}\n\n[{"name":"...","category":"model|tool|framework|technique|infra","quadrant":"adopt|trial|assess|hold","rationale":"One sentence explaining why this quadrant."}]`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let classified: any[] = []
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) classified = JSON.parse(match[0])
  } catch { return }

  const now = new Date().toISOString()
  const upsert = db.prepare(
    `INSERT INTO tech_radar (id, name, category, quadrant, rationale, last_updated)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       category = excluded.category,
       quadrant = excluded.quadrant,
       rationale = excluded.rationale,
       last_updated = excluded.last_updated`
  )

  const txn = db.transaction(() => {
    for (const item of classified) {
      if (!item.name) continue
      upsert.run(
        crypto.randomUUID(),
        item.name,
        item.category ?? 'tool',
        item.quadrant ?? 'assess',
        item.rationale ?? '',
        now,
      )
    }
  })
  txn()
  console.log(`[radar] classified ${classified.length} items`)
}

export async function seedRadarIfEmpty(): Promise<void> {
  const count = (db.prepare('SELECT COUNT(*) as c FROM tech_radar').get() as any).c
  if (count > 0) return
  console.log('[radar] seeding baseline...')
  await classifyBatch(SEED_TOOLS)
}

export async function classifyForRadar(items: FeedItem[]): Promise<void> {
  const allText = items.map(i => `${i.title} ${i.raw_content ?? ''}`).join(' ')
  const matches = allText.match(TOOL_PATTERNS) ?? []
  // Normalize: collapse extra whitespace, deduplicate case-insensitively
  const seen = new Map<string, string>()
  for (const m of matches) {
    const key = m.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!seen.has(key)) seen.set(key, m.trim())
  }
  const uniqueTools = [...seen.values()]

  if (uniqueTools.length === 0) return

  const existingNames = new Set(
    (db.prepare('SELECT name FROM tech_radar').all() as any[]).map((r: any) => r.name.toLowerCase())
  )
  const newTools = uniqueTools.filter(t => !existingNames.has(t.toLowerCase()))
  if (newTools.length === 0) return

  // Classify in batches of 20 to stay within token limits
  for (let i = 0; i < newTools.length; i += 20) {
    await classifyBatch(newTools.slice(i, i + 20))
  }
}

// Scan all existing feed items — used by the manual "Scan feed" button
export async function scanAllFeedItems(): Promise<number> {
  const items = db.prepare(
    `SELECT title, raw_content FROM feed_items ORDER BY fetched_at DESC LIMIT 500`
  ).all() as any[]

  await classifyForRadar(items as FeedItem[])
  return (db.prepare('SELECT COUNT(*) as c FROM tech_radar').get() as any).c
}
