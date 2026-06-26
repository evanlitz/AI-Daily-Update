'use client'

import { useState } from 'react'
import Link from 'next/link'

type Page = { href: string; label: string; desc: string; icon?: React.ReactNode }

export function CollapsibleAbout({ pages }: { pages: Page[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 48 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: 'var(--text)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em',
        }}
      >
        About This Project
        <svg
          viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75"
          width={14} height={14}
          style={{
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.18s ease',
            color: 'var(--muted)',
            marginTop: 2,
          }}
        >
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.75, marginBottom: 28 }}>
            Automated AI intelligence, refreshed twice daily. Claude screens 12+ sources for relevance, threads related stories over time, and surfaces what is actually moving.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {pages.map(p => (
              <Link
                key={p.href}
                href={p.href}
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid rgba(59,130,246,0.35)',
                  borderRadius: 10,
                  padding: '18px 20px',
                  height: '100%',
                  transition: 'border-color 0.15s',
                }}>
                  {p.icon && (
                    <div style={{ marginBottom: 14 }}>
                      {p.icon}
                    </div>
                  )}
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8, letterSpacing: '-0.01em' }}>
                    {p.label}
                  </p>
                  <p style={{ fontSize: 14, color: '#a1a1aa', lineHeight: 1.7 }}>
                    {p.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
