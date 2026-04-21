'use client'

import type { Dataset } from '@/lib/types'
import { TASK_LABELS } from '@/lib/sources/datasets'

const MODALITY_META: Record<string, { label: string; color: string; rgb: string }> = {
  text:    { label: 'Text',    color: '#a78bfa', rgb: '167,139,250' },
  image:   { label: 'Image',   color: '#60a5fa', rgb: '96,165,250' },
  audio:   { label: 'Audio',   color: '#34d399', rgb: '52,211,153' },
  video:   { label: 'Video',   color: '#fb923c', rgb: '251,146,60' },
  tabular: { label: 'Tabular', color: '#fbbf24', rgb: '251,191,36' },
}

const LICENSE_COLORS: Record<string, string> = {
  'apache 2.0': '#34d399', 'mit': '#34d399', 'cc0 1.0': '#34d399',
  'cc by 4.0': '#60a5fa', 'cc by sa 4.0': '#60a5fa',
  'openrail': '#a78bfa', 'llama 2': '#fbbf24', 'llama 3': '#fbbf24', 'gemma': '#fbbf24',
}

function licenseColor(license: string | undefined): string {
  if (!license) return '#2a2a3e'
  const key = license.toLowerCase()
  for (const [k, v] of Object.entries(LICENSE_COLORS)) {
    if (key.includes(k)) return v
  }
  return '#3d3d5a'
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

function sizeLabel(s: string | undefined): string {
  if (!s) return ''
  return s.replace('n<', '').replace('<n', '–').replace(/([<>])/g, '')
}

const isKaggle = (fullName: string) => fullName.startsWith('kaggle:')

function parseFullName(fullName: string): { owner: string; name: string } {
  if (isKaggle(fullName)) {
    const ref = fullName.replace('kaggle:', '')
    const parts = ref.split('/')
    return { owner: parts[0] ?? '', name: parts[1] ?? ref }
  }
  const parts = fullName.split('/')
  return { owner: parts[0] ?? '', name: parts[1] ?? fullName }
}

export function DatasetCard({ dataset }: { dataset: Dataset }) {
  const modality = dataset.modalities[0]
  const modMeta  = modality ? MODALITY_META[modality] : null
  const topTasks = dataset.task_categories.slice(0, 3)
  const kaggle   = isKaggle(dataset.full_name)
  const { owner, name } = parseFullName(dataset.full_name)
  const accentRgb = modMeta?.rgb ?? '124,106,255'
  const accentColor = modMeta?.color ?? '#7c6aff'

  return (
    <a
      href={dataset.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block relative overflow-hidden transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 16,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = `rgba(${accentRgb},0.22)`
        el.style.boxShadow   = `0 0 24px rgba(${accentRgb},0.05)`
        el.style.transform   = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.borderColor = 'rgba(255,255,255,0.06)'
        el.style.boxShadow   = 'none'
        el.style.transform   = 'translateY(0)'
      }}
    >
      {/* Top accent line */}
      <div style={{ height: 2, background: `rgba(${accentRgb},0.45)`, width: '100%' }} />

      <div style={{ padding: '14px 16px 14px' }}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                style={kaggle
                  ? { background: 'rgba(32,178,170,0.1)', color: '#20b2aa', border: '1px solid rgba(32,178,170,0.2)', borderRadius: 6, padding: '1px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }
                  : { background: 'rgba(255,195,0,0.08)', color: '#ffc300', border: '1px solid rgba(255,195,0,0.15)', borderRadius: 6, padding: '1px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }
                }
              >
                {kaggle ? 'Kaggle' : 'HF'}
              </span>
              <p style={{ color: '#2a2a3e', fontSize: 10, fontWeight: 600 }} className="truncate">{owner}/</p>
            </div>
            <p style={{ color: '#e8e8f0', fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }} className="truncate">
              {name}
            </p>
          </div>
          {modMeta && (
            <span
              style={{
                flexShrink: 0,
                background: `rgba(${accentRgb},0.1)`,
                color: accentColor,
                border: `1px solid rgba(${accentRgb},0.2)`,
                borderRadius: 8,
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
              }}
            >
              {modMeta.label}
            </span>
          )}
        </div>

        {/* Description */}
        {dataset.description && (
          <p className="line-clamp-2 mb-3" style={{ color: '#4a4a6a', fontSize: 11, lineHeight: 1.6 }}>
            {dataset.description}
          </p>
        )}

        {/* Task badges */}
        {topTasks.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {topTasks.map(t => (
              <span
                key={t}
                style={{
                  background: 'rgba(124,106,255,0.07)',
                  color: '#7c6aff',
                  border: '1px solid rgba(124,106,255,0.15)',
                  borderRadius: 20,
                  padding: '2px 8px',
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {TASK_LABELS[t] ?? t}
              </span>
            ))}
            {dataset.task_categories.length > 3 && (
              <span style={{
                background: 'rgba(255,255,255,0.03)',
                color: '#2a2a3e',
                borderRadius: 20,
                padding: '2px 8px',
                fontSize: 9,
                fontWeight: 700,
              }}>
                +{dataset.task_categories.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer stats */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span style={{ color: '#3d3d5a', fontSize: 10, fontWeight: 600 }}>
              <span style={{ color: '#f87171' }}>♥</span> {formatCount(dataset.likes)}
            </span>
            <span style={{ color: '#3d3d5a', fontSize: 10, fontWeight: 600 }}>
              ↓ {formatCount(dataset.downloads)}
            </span>
            {dataset.size_category && (
              <span style={{ color: '#2a2a3e', fontSize: 10 }}>{sizeLabel(dataset.size_category)}</span>
            )}
          </div>
          {dataset.license && (
            <span style={{ color: licenseColor(dataset.license), fontSize: 9, fontWeight: 700, letterSpacing: '0.04em' }}>
              {dataset.license}
            </span>
          )}
        </div>
      </div>
    </a>
  )
}
