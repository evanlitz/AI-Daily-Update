// Strip trailing commas before ] or } — Claude occasionally emits them
export function safeJSON<T>(text: string): T {
  const cleaned = text.replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(cleaned) as T
}

export function getMondayISO(date?: string | Date): string {
  const now = date ? new Date(date) : new Date()
  const diff = now.getDay() === 0 ? -6 : 1 - now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 3600)      return `${Math.floor(d / 60)}m ago`
  if (d < 86400)     return `${Math.floor(d / 3600)}h ago`
  if (d < 86400 * 7) return `${Math.floor(d / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
