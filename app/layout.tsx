'use client'

import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

// ── SVG icons ────────────────────────────────────────────────────────────────

function Icon({ d, ...props }: { d: string | React.ReactNode } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
      width={22} height={22} {...props}>
      {typeof d === 'string' ? <path d={d} strokeWidth="1.75" /> : d}
    </svg>
  )
}

const NAV = [
  {
    href: '/',
    label: 'Feed',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" width={22} height={22}>
        <path d="M4 6h16M4 12h12M4 18h14" strokeWidth="1.75" />
      </svg>
    ),
  },
  {
    href: '/digest',
    label: 'Digest',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8L14 2z" strokeWidth="1.75" />
        <path d="M14 2v6h6M8 13h8M8 17h5" strokeWidth="1.75" />
      </svg>
    ),
  },
  {
    href: '/datasets',
    label: 'Datasets',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
        <ellipse cx="12" cy="5" rx="9" ry="3" strokeWidth="1.75" />
        <path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" strokeWidth="1.75" />
      </svg>
    ),
  },
  {
    href: '/radar',
    label: 'Radar',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" width={22} height={22}>
        <circle cx="12" cy="12" r="2" strokeWidth="1.75" />
        <circle cx="12" cy="12" r="6" strokeWidth="1.75" />
        <circle cx="12" cy="12" r="10" strokeWidth="1.75" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2" strokeWidth="1.75" />
      </svg>
    ),
  },
  {
    href: '/advisor',
    label: 'Advisor',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
        <path d="M12 2a7 7 0 017 7c0 2.5-1.3 4.7-3.3 6L15 17H9l-.7-2C6.3 13.7 5 11.5 5 9a7 7 0 017-7z" strokeWidth="1.75" />
        <path d="M9 21h6M10 19h4" strokeWidth="1.75" />
      </svg>
    ),
  },
  {
    href: '/repos',
    label: 'Repos',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
        <circle cx="6" cy="4" r="2" strokeWidth="1.75" />
        <circle cx="6" cy="20" r="2" strokeWidth="1.75" />
        <circle cx="18" cy="10" r="2" strokeWidth="1.75" />
        <path d="M6 6v10M6 10h6a6 6 0 016 6" strokeWidth="1.75" />
      </svg>
    ),
  },
  {
    href: '/models',
    label: 'Models',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" width={22} height={22}>
        <rect x="2" y="3" width="20" height="5" rx="1.5" strokeWidth="1.75" />
        <rect x="2" y="10" width="20" height="5" rx="1.5" strokeWidth="1.75" />
        <rect x="2" y="17" width="20" height="5" rx="1.5" strokeWidth="1.75" />
        <circle cx="6" cy="5.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="6" cy="12.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="6" cy="19.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: '/timeline',
    label: 'Timeline',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" width={22} height={22}>
        <path d="M12 3v18" strokeWidth="1.75" />
        <circle cx="12" cy="7" r="2.5" strokeWidth="1.75" />
        <circle cx="12" cy="12" r="2.5" strokeWidth="1.75" />
        <circle cx="12" cy="17" r="2.5" strokeWidth="1.75" />
        <path d="M12 7h4M12 12h5M12 17h3" strokeWidth="1.75" />
      </svg>
    ),
  },
]

function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="sidebar fixed left-0 top-0 bottom-0 z-50 flex flex-col"
      style={{
        background: 'rgba(5,5,14,0.92)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5" style={{ minHeight: 72 }}>
        <div
          className="flex shrink-0 items-center justify-center rounded-xl"
          style={{
            width: 38, height: 38,
            background: 'linear-gradient(135deg, #7c6aff, #5b8aff)',
            boxShadow: '0 0 20px rgba(124,106,255,0.5)',
          }}
        >
          <span style={{ color: '#fff', fontSize: 13, fontWeight: 900, letterSpacing: '-0.02em' }}>AI</span>
        </div>
        <span className="sidebar-label font-black tracking-tight" style={{ color: '#e8e8f0', fontSize: 16 }}>
          Pulse
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '0 10px 8px' }} />

      {/* Nav items */}
      <nav className="flex flex-col gap-1 flex-1 px-3 py-2">
        {NAV.map(({ href, label, icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="relative flex items-center gap-3 rounded-xl transition-all duration-150"
              style={{
                padding: '11px 12px',
                color: active ? '#e8e8f0' : '#4a4a6a',
                background: active ? 'rgba(124,106,255,0.14)' : 'transparent',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.color = '#9090b0'
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.color = '#4a4a6a'
              }}
            >
              {/* Active indicator bar */}
              {active && (
                <div
                  className="absolute left-0 top-2 bottom-2 rounded-full"
                  style={{ width: 3, background: '#7c6aff', boxShadow: '0 0 10px #7c6aff' }}
                />
              )}
              <div className="shrink-0" style={{ marginLeft: active ? 3 : 0 }}>{icon}</div>
              <span className="sidebar-label font-semibold" style={{ fontSize: 14 }}>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '0 10px 10px' }} />

      {/* Live indicator */}
      <div className="flex items-center gap-3 px-4 pb-6">
        <div className="relative flex shrink-0 h-3 w-3">
          <span className="absolute inline-flex h-full w-full rounded-full ping-slow" style={{ background: 'rgba(52,211,153,0.5)' }} />
          <span className="relative inline-flex h-3 w-3 rounded-full" style={{ background: '#34d399' }} />
        </div>
        <span className="sidebar-label" style={{ color: '#34d399', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Live
        </span>
      </div>
    </aside>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>AI Pulse</title>
        <meta name="description" content="Personal AI tracking dashboard" />
      </head>
      <body className={inter.variable}>
        <Sidebar />
        <div style={{ marginLeft: 72 }}>
          {children}
        </div>
      </body>
    </html>
  )
}
