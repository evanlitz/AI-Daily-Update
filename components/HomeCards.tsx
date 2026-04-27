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
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: '18px 22px',
          transition: 'border-color 0.18s, background 0.18s',
          cursor: 'pointer',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = `rgba(${accent},0.3)`
          ;(e.currentTarget as HTMLDivElement).style.background = `rgba(${accent},0.04)`
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)'
          ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', color: `rgb(${accent})`, textTransform: 'uppercase', marginBottom: 8, opacity: 0.8 }}>
          {label}
        </p>
        <p style={{ fontSize: 32, fontWeight: 900, color: '#e8e8f4', letterSpacing: '-0.03em', lineHeight: 1 }}>
          {value}
        </p>
        {sub && (
          <p style={{ fontSize: 12, color: '#5a5a7a', marginTop: 6 }}>{sub}</p>
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
          background: 'rgba(255,255,255,0.015)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 10,
          padding: '12px 16px',
          transition: 'border-color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(124,106,255,0.25)'
          ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(124,106,255,0.04)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.05)'
          ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.015)'
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 800, color: '#c0c0dc', marginBottom: 3 }}>{label}</p>
        <p style={{ fontSize: 11, color: '#4a4a6a', lineHeight: 1.4 }}>{desc}</p>
      </div>
    </Link>
  )
}
