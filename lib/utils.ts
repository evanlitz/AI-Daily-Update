// Strip trailing commas before ] or } — Claude occasionally emits them.
// Returns `fallback` instead of throwing on malformed input.
export function safeJSON<T>(text: string, fallback: T): T {
  const cleaned = text.replace(/,(\s*[}\]])/g, '$1')
  try {
    return JSON.parse(cleaned) as T
  } catch {
    return fallback
  }
}

export function getMondayISO(date?: string | Date): string {
  const now = date ? new Date(date) : new Date()
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

// Strip control chars and unpaired UTF-16 surrogates (e.g. from a string sliced
// mid-emoji) — Turso's HTTP transport rejects these with an opaque 400.
export function sanitizeText<T extends string | null | undefined>(value: T): T {
  if (value == null) return value
  let result = ''
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue
    if (code === 0x7f) continue
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value[i] + value[i + 1]
        i++
      }
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue
    result += value[i]
  }
  return result as T
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 3600)      return `${Math.floor(d / 60)}m ago`
  if (d < 86400)     return `${Math.floor(d / 3600)}h ago`
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
