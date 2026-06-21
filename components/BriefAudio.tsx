'use client'

import { useEffect, useState } from 'react'

export function BriefAudio({ signal, rising, watch, shift }: {
  signal: string
  rising: string
  watch: string
  shift: string
}) {
  const [speaking, setSpeaking] = useState(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window)
    return () => window.speechSynthesis?.cancel()
  }, [])

  if (!supported) return null

  function toggle() {
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(
      `Signal. ${signal} Rising. ${rising} Watch. ${watch} Shift. ${shift}`
    )
    utterance.rate = 1.02
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)
    setSpeaking(true)
  }

  return (
    <button
      onClick={toggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
        color: speaking ? '#60a5fa' : '#a1a1aa',
        background: speaking ? 'rgba(59,130,246,0.1)' : 'transparent',
        border: `1px solid ${speaking ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
        borderRadius: 20, padding: '5px 12px', cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s, color 0.15s',
      }}
    >
      {speaking ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect width="3" height="10" /><rect x="6" width="3" height="10" /></svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="0,0 10,5 0,10" /></svg>
      )}
      {speaking ? 'Stop' : 'Listen'}
    </button>
  )
}
