'use client'

import Link from 'next/link'

export function StatCard({ label, value, sub, href, accent }: {
  label: string
  value: string | number
  sub?: string
  href: string
  accent: string
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '18px 22px',
          transition: 'border-color 0.18s, background 0.18s',
          cursor: 'pointer',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = `rgba(${accent},0.3)`
          ;(e.currentTarget as HTMLDivElement).style.background = `rgba(${accent},0.05)`
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'
          ;(e.currentTarget as HTMLDivElement).style.background = 'var(--surface)'
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: `rgb(${accent})`, textTransform: 'uppercase', marginBottom: 8, opacity: 0.85 }}>
          {label}
        </p>
        <p style={{ fontSize: 32, fontWeight: 800, color: '#f4f4f5', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {value}
        </p>
        {sub && (
          <p style={{ fontSize: 12, color: '#71717a', marginTop: 6 }}>{sub}</p>
        )}
      </div>
    </Link>
  )
}

export function PageCard({
  href, label, desc, accent = '255,255,255', claude = false,
}: {
  href: string
  label: string
  desc: string
  accent?: string
  claude?: boolean
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderLeft: `3px solid rgba(${accent},0.45)`,
          borderRadius: 10,
          padding: '18px 20px',
          height: '100%',
          boxSizing: 'border-box',
          transition: 'background 0.15s, border-color 0.15s',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.background = `rgba(${accent},0.04)`
          ;(e.currentTarget as HTMLDivElement).style.borderColor = `rgba(${accent},0.35)`
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--surface)'
          ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#e4e4e7', letterSpacing: '-0.01em' }}>{label}</p>
          {claude && (
            <span style={{
              fontSize: 9, fontWeight: 900, letterSpacing: '0.12em',
              color: '#a78bfa', background: 'rgba(167,139,250,0.1)',
              border: '1px solid rgba(167,139,250,0.22)',
              borderRadius: 3, padding: '2px 6px', flexShrink: 0,
            }}>CLAUDE</span>
          )}
        </div>
        <p style={{ fontSize: 12, color: '#71717a', lineHeight: 1.65 }}>{desc}</p>
      </div>
    </Link>
  )
}
