// Shared keyword-based topic tagging heuristic for sources without their own taxonomy.
export function getTopicTags(title: string, fallback: string[]): string[] {
  const t = title.toLowerCase()
  if (/paper|arxiv|research|study|benchmark/.test(t)) return ['research']
  if (/gpt|claude|gemini|llama|mistral|model|openai|anthropic|deepmind|o3|o4/.test(t)) return ['models']
  if (/tool|framework|library|sdk|api|open.?source|github|release|launch/.test(t)) return ['tools']
  return fallback
}
