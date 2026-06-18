'use client'

import { useState } from 'react'
import type { ProjectIdea, IdeaRefinementMessage } from '@/lib/types'

export function RefineChat({ idea, onUpdate }: { idea: ProjectIdea; onUpdate: (idea: ProjectIdea) => void }) {
  const [draft,   setDraft]   = useState('')
  const [sending, setSending] = useState(false)
  const [error,   setError]   = useState('')
  const [pending, setPending] = useState<IdeaRefinementMessage | null>(null)

  const log = idea.refinement_log ?? []

  async function send() {
    const message = draft.trim()
    if (!message || sending) return
    setError('')
    setSending(true)
    setPending({ role: 'user', content: message, at: new Date().toISOString() })
    setDraft('')
    try {
      const res = await fetch('/api/advisor/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId: idea.id, message }),
      })
      if (!res.ok) throw new Error('request failed')
      onUpdate(await res.json())
    } catch {
      setError('Could not apply that change — try again.')
      setDraft(message)
    } finally {
      setSending(false)
      setPending(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
  }

  return (
    <div style={{ marginTop: 26, paddingTop: 22, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.22em', color: '#71717a', textTransform: 'uppercase' }}>
          Adjust This Mission
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      </div>

      {(log.length > 0 || pending) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {[...log, ...(pending ? [pending] : [])].map((m, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10,
              fontSize: 13, lineHeight: 1.6,
              opacity: pending && i === log.length ? 0.6 : 1,
            }}>
              <span style={{
                flexShrink: 0, fontSize: 11, fontWeight: 900, letterSpacing: '0.06em',
                color: m.role === 'user' ? '#60a5fa' : '#71717a',
                textTransform: 'uppercase', width: 36,
              }}>
                {m.role === 'user' ? 'You' : 'AI'}
              </span>
              <span style={{ color: m.role === 'user' ? '#d4d4d8' : '#a1a1aa' }}>{m.content}</span>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          placeholder="e.g. swap the tech stack for Python, or trim this to 5 hours…"
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '8px 12px',
            color: '#d4d4d8', fontSize: 13,
            outline: 'none', fontFamily: 'inherit',
          }}
        />
        <button
          onClick={send}
          disabled={sending || !draft.trim()}
          style={{
            background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
            border: '1px solid rgba(59,130,246,0.28)', borderRadius: 8,
            padding: '8px 16px', fontSize: 12, fontWeight: 900,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            cursor: sending || !draft.trim() ? 'not-allowed' : 'pointer',
            opacity: sending || !draft.trim() ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
        >
          {sending
            ? <><span className="inline-block h-3 w-3 rounded-full border border-blue-500 border-t-transparent animate-spin" />Applying…</>
            : 'Send ⌘↵'}
        </button>
      </div>
    </div>
  )
}
