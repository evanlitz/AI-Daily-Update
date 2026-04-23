import { anthropic, MODEL } from '../claude'
import db from '../db'

export async function generateHooks(): Promise<void> {
  const { rows } = await db.execute({
    sql: `SELECT id, title, source, raw_content FROM feed_items WHERE hook IS NULL ORDER BY fetched_at DESC LIMIT 30`,
    args: [],
  })

  if (rows.length === 0) return

  const items = rows as any[]
  const prompt = items.map((item, n) => {
    const snippet = item.raw_content ? `\n   ${String(item.raw_content).slice(0, 200)}` : ''
    return `${n + 1}. [${item.id}] (${item.source}) ${item.title}${snippet}`
  }).join('\n')

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [
        {
          type: 'text',
          text: 'You write one-line "why should I care?" hooks for AI news targeted at a self-taught developer. Rules: single sentence, max 100 chars, concrete practical relevance, no hype or hedging. Good examples: "First open-weight model to beat GPT-4o on coding benchmarks", "Cuts fine-tuning cost 10x — trainable on a laptop", "Drop-in replacement for LangChain with a much simpler API". Bad: "This is significant for the AI community", "Worth watching as the space evolves".',
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Write a hook for each item. Return ONLY a JSON array with no extra text: [{"id":"<exact id>","hook":"<one sentence>"},...]\n\n${prompt}`,
        },
      ],
    })

    const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) {
      console.error('[hooks] no JSON array found in response')
      return
    }

    const parsed: { id: string; hook: string }[] = JSON.parse(match[0])
    let updated = 0
    for (const { id, hook } of parsed) {
      if (!id || !hook) continue
      await db.execute({
        sql: `UPDATE feed_items SET hook = ? WHERE id = ?`,
        args: [hook.slice(0, 120), id],
      })
      updated++
    }
    console.log(`[hooks] generated hooks for ${updated} items`)
  } catch (err) {
    console.error('[hooks] error:', err)
  }
}
