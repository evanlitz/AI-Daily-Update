'use client'

import { useState, useEffect } from 'react'
import { RepoCard } from '@/components/RepoCard'
import type { GithubRepo } from '@/lib/types'

const LANGUAGES = ['All', 'Python', 'TypeScript', 'JavaScript', 'Rust', 'Go', 'C++', 'Other']

export default function ReposPage() {
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [activeLang, setActiveLang] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/repos?limit=30')
      .then(r => r.json())
      .then(data => setRepos(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = activeLang === 'All'
    ? repos
    : activeLang === 'Other'
    ? repos.filter(r => !['Python', 'TypeScript', 'JavaScript', 'Rust', 'Go', 'C++'].includes(r.language ?? ''))
    : repos.filter(r => r.language?.toLowerCase() === activeLang.toLowerCase())

  return (
    <main className="mx-auto max-w-screen-xl px-5 py-8">
      <div className="mb-8">
        <p className="eyebrow mb-2">Trending Signals</p>
        <h1
          style={{
            color: '#e8e8f0',
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            marginBottom: 6,
          }}
        >
          Top AI Repos
        </h1>
        <p style={{ color: '#9090c0', fontSize: 15 }}>
          Ranked by stars gained in the last 24 hours · {repos.length} repos tracked
        </p>
      </div>

      {/* Language filter */}
      <div className="mb-6 flex flex-wrap items-center gap-1.5">
        {LANGUAGES.map(lang => {
          const active = activeLang === lang
          return (
            <button
              key={lang}
              onClick={() => setActiveLang(lang)}
              className="transition-all duration-150"
              style={{
                background: active ? 'rgba(124,106,255,0.12)' : 'transparent',
                color: active ? '#a78bfa' : '#8080b0',
                border: `1px solid ${active ? 'rgba(124,106,255,0.3)' : 'rgba(255,255,255,0.05)'}`,
                borderRadius: 8,
                padding: '5px 10px',
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              {lang}
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', color: '#7878a8', fontSize: 11 }}>
          {filtered.length}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-7 w-7 rounded-full border border-violet-500 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-2xl py-16 text-center"
          style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p style={{ color: '#8080b0', fontSize: 15 }}>No repos yet — check back after the first fetch</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(repo => <RepoCard key={repo.id} repo={repo} />)}
        </div>
      )}

      <p className="mt-10 text-center" style={{ color: '#7878a8', fontSize: 15, letterSpacing: '0.06em' }}>
        DATA FROM GITHUB TRENDING · REFRESHED EVERY 6 HOURS
      </p>
    </main>
  )
}
