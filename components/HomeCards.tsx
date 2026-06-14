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

export function QuickNavCard({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px 16px',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(59,130,246,0.25)'
          ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(59,130,246,0.05)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'
          ;(e.currentTarget as HTMLDivElement).style.background = 'var(--surface)'
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 700, color: '#d4d4d8', marginBottom: 3 }}>{label}</p>
        <p style={{ fontSize: 11, color: '#71717a', lineHeight: 1.4 }}>{desc}</p>
      </div>
    </Link>
  )
}
