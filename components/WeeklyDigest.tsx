'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { WeeklyDigest as DigestType } from '@/lib/types'

export function WeeklyDigest({ initialDigest }: { initialDigest: DigestType | null }) {
  const [digest, setDigest] = useState(initialDigest)
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/digest/generate', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setDigest(data)
        setExpanded(true)
      }
    } finally {
      setGenerating(false)
    }
  }

  if (!digest) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <p className="mb-3 text-sm font-semibold text-zinc-400">Weekly Digest</p>
        <p className="mb-4 text-xs text-zinc-600">No digest generated yet.</p>
        <button
          onClick={generate}
          disabled={generating}
          className="w-full rounded-lg bg-violet-600 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 transition"
        >
          {generating ? 'Generating digest...' : 'Generate Digest'}
        </button>
      </div>
    )
  }

  const weekOf = new Date(digest.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-300">Weekly Digest — Week of {weekOf}</p>
          <span className="text-zinc-500 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
        {!expanded && digest.highlights.length > 0 && (
          <ul className="mt-2 space-y-1">
            {digest.highlights.map((h, i) => (
              <li key={i} className="text-xs text-zinc-500 flex gap-1.5">
                <span className="text-violet-500 shrink-0">•</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        )}
      </button>

      {expanded && (
        <div className="mt-4 prose prose-invert prose-sm max-w-none text-zinc-300">
          <ReactMarkdown>{digest.content_md}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
