'use client'

import React, { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { WeeklyDigest, DigestChange } from '@/lib/types'
import { useIsMobile } from '@/hooks/useIsMobile'

// ── Typography ───────────────────────────────────────────────────────────────
const SERIF    = "'Playfair Display', Georgia, 'Times New Roman', serif"
const SERIF_SM = "'Libre Baskerville', Georgia, 'Times New Roman', serif"
const MONO     = "'Courier New', Courier, monospace"

// ── Paper colours ────────────────────────────────────────────────────────────
const INK       = '#1a1208'
const INK_MID   = '#4a3828'
const INK_MUTED = '#7a5f4a'
const INK_FAINT = '#b09880'
const PAPER     = '#dddacb'

const SECTIONS_PER_PAGE = 3
// Half the flip CSS transition (820ms) — content swaps when paper is edge-on
const FLIP_HALF = 410

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseSections(md: string): Array<{ title: string; body: string }> {
  return md
    .split(/^(?=## )/m)
    .filter(p => p.trim())
    .map(part => ({
      title: part.match(/^## (.+)/)?.[1]?.trim() ?? '',
      body:  part
        .replace(/^## .+\n?/, '')
        .replace(/\n?\*{0,2}highlights\*{0,2}:?[^\n]*(\n[-*+]\s[^\n]*)*/gi, '')
        .replace(/^\{["'\s]*[\s\S]*?^\}/gm, '')
        .replace(/\{"\s*/g, '')
        .trim(),
    }))
}

// ── Ink-on-paper markdown ─────────────────────────────────────────────────────
function NewsBody({ body, className }: { body: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown components={{
        p: ({ children }) => (
          <p style={{ fontFamily: SERIF_SM, color: INK, fontSize: 12.5, lineHeight: 1.84,
            margin: '0 0 10px', textAlign: 'justify' }}>
            {children}
          </p>
        ),
        h3: ({ children }) => (
          <h3 style={{ fontFamily: SERIF, color: INK, fontSize: 13.5, fontWeight: 700,
            fontStyle: 'italic', borderTop: '1px solid rgba(0,0,0,0.18)',
            paddingTop: 6, margin: '14px 0 6px' }}>
            {children}
          </h3>
        ),
        ul: ({ children }) => <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 12px' }}>{children}</ul>,
        li: ({ children }) => (
          <li style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6,
            fontFamily: SERIF_SM, color: INK_MID, fontSize: 12, lineHeight: 1.72 }}>
            <span style={{ flexShrink: 0, color: INK_MUTED }}>—</span>
            <span>{children}</span>
          </li>
        ),
        strong: ({ children }) => <strong style={{ color: INK, fontWeight: 700 }}>{children}</strong>,
        blockquote: ({ children }) => (
          <div style={{ margin: '14px 0' }}>
            <div style={{ height: 2, background: INK, marginBottom: 8 }} />
            <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: INK,
              lineHeight: 1.5, textAlign: 'center' }}>
              {children}
            </div>
            <div style={{ height: 2, background: INK, marginTop: 8 }} />
          </div>
        ),
        code: ({ children }) => (
          <code style={{ fontFamily: MONO, fontSize: 10.5, color: INK_MID,
            background: 'rgba(0,0,0,0.07)', borderRadius: 2, padding: '1px 5px' }}>
            {children}
          </code>
        ),
      }}>
        {body}
      </ReactMarkdown>
    </div>
  )
}

// ── Fountain pen ─────────────────────────────────────────────────────────────
function FountainPen() {
  const LACQUER = '#1b1d3a'
  const GOLD    = '#c9a84c'
  const GOLD_DK = '#9a7828'
  const SHINE   = 'rgba(255,255,255,0.09)'
  return (
    <svg width="480" height="58" viewBox="0 0 300 36"
      style={{ filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.85)) drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
      {/* ── Nib (gold, tapered wedge) */}
      <polygon points="0,18 30,12 30,24" fill={GOLD} />
      <polygon points="0,18 30,12 15,18" fill="#e8c870" opacity="0.6" />
      {/* Nib slit */}
      <line x1="6" y1="18" x2="30" y2="18" stroke={GOLD_DK} strokeWidth="0.9" />
      {/* Tipping dot */}
      <circle cx="1.5" cy="18" r="1.8" fill="#e0c060" />

      {/* ── Grip section */}
      <rect x="30" y="11" width="34" height="14" rx="2" fill="#14152a" />
      {/* Grip ridges */}
      {[36,42,48,54].map(x => (
        <line key={x} x1={x} y1="11" x2={x} y2="25" stroke={SHINE} strokeWidth="1" />
      ))}

      {/* ── Gold band: grip → barrel */}
      <rect x="64" y="9.5" width="9" height="17" rx="1.5" fill={GOLD} />
      <rect x="65" y="9.5" width="3" height="17" rx="1" fill="#e8c870" opacity="0.4" />

      {/* ── Barrel */}
      <rect x="73" y="8" width="166" height="20" rx="5" fill={LACQUER} />
      {/* Top highlight */}
      <rect x="78" y="9" width="156" height="5" rx="2.5" fill={SHINE} />
      {/* Bottom shadow */}
      <rect x="78" y="22" width="156" height="4" rx="2" fill="rgba(0,0,0,0.25)" />

      {/* ── Gold band: barrel → cap */}
      <rect x="239" y="9.5" width="9" height="17" rx="1.5" fill={GOLD} />
      <rect x="240" y="9.5" width="3" height="17" rx="1" fill="#e8c870" opacity="0.4" />

      {/* ── Cap */}
      <rect x="248" y="7" width="48" height="22" rx="6" fill={LACQUER} />
      {/* Cap highlight */}
      <rect x="253" y="8" width="38" height="5" rx="2.5" fill={SHINE} />
      {/* Cap end */}
      <rect x="292" y="7" width="4" height="22" rx="2" fill="#12132a" />

      {/* ── Clip (gold bar on top of cap) */}
      <rect x="261" y="3" width="5" height="26" rx="2.5" fill={GOLD} />
      <circle cx="263.5" cy="2.5" r="4" fill={GOLD} />
      <rect x="262" y="3" width="2" height="26" rx="1" fill="#e8c870" opacity="0.45" />

      {/* ── Brand text on barrel */}
      <text x="155" y="20.5" textAnchor="middle" dominantBaseline="middle"
        fontSize="5.5" fontFamily="'Courier New', monospace" letterSpacing="3"
        fill="rgba(200,168,76,0.55)">AI PULSE</text>
    </svg>
  )
}

// ── Steam wisps ───────────────────────────────────────────────────────────────
function SteamWisps() {
  const wisps = [
    { x: 44, dur: 2.6, delay: 0,   amp: 5  },
    { x: 62, dur: 2.1, delay: 0.8, amp: -6 },
    { x: 80, dur: 3.1, delay: 1.5, amp: 5  },
  ]
  return (
    <g>
      {wisps.map(({ x, dur, delay, amp }, i) => {
        const p1 = `M ${x} 62 Q ${x+amp} 48 ${x} 36 Q ${x-amp} 24 ${x} 12`
        const p2 = `M ${x} 62 Q ${x-amp} 48 ${x} 36 Q ${x+amp} 24 ${x} 12`
        return (
          <path key={i} stroke="rgba(190,180,160,0.65)" strokeWidth="2.2" fill="none" strokeLinecap="round">
            <animate attributeName="d" values={`${p1};${p2};${p1}`}
              dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0.05;0"
              dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
            <animateTransform attributeName="transform" type="translate"
              values="0 0;0 -14;0 -30"
              dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" />
          </path>
        )
      })}
    </g>
  )
}

// ── Coffee mug — large, dark ceramic cylinder ─────────────────────────────────
function CoffeeMug() {
  const BODY  = '#263320'
  const DARK  = '#1a2318'
  const LIGHT = '#304228'
  const SAGE  = '#8ec98e'
  return (
    <svg width="360" height="432" viewBox="0 0 125 150"
      style={{ filter: 'drop-shadow(0 22px 44px rgba(0,0,0,0.9)) drop-shadow(0 6px 12px rgba(0,0,0,0.7))' }}>
      <SteamWisps />
      {/* Ground shadow */}
      <ellipse cx="54" cy="147" rx="50" ry="7" fill="rgba(0,0,0,0.55)" />
      {/* Body */}
      <path d="M 10 62 L 10 134 Q 12 142 54 142 Q 96 142 98 134 L 98 62" fill={BODY} />
      {/* Left shadow strip */}
      <path d="M 10 62 L 10 134 Q 11 141 28 142 L 26 58" fill="rgba(0,0,0,0.28)" />
      {/* Right highlight */}
      <path d="M 82 62 L 82 134 Q 86 142 98 134 L 98 62" fill="rgba(255,255,255,0.05)" />
      {/* Bottom ellipse */}
      <ellipse cx="54" cy="134" rx="44" ry="9" fill={DARK} />
      {/* Rim */}
      <ellipse cx="54" cy="62" rx="44" ry="11" fill={BODY} />
      <ellipse cx="54" cy="61" rx="42" ry="10" fill={LIGHT} />
      {/* Coffee surface */}
      <ellipse cx="54" cy="63" rx="37" ry="8.5" fill="#0c0703" />
      <ellipse cx="50" cy="62" rx="12" ry="3.5" fill="#160e06" />
      <ellipse cx="47" cy="61.5" rx="4.5" ry="1.8" fill="#1f1409" opacity="0.6" />
      {/* ── AI design etched on mug face ────────────────────────── */}
      {/* Outer ring */}
      <circle cx="52" cy="100" r="22" fill="rgba(142,201,142,0.06)"
        stroke="rgba(142,201,142,0.18)" strokeWidth="0.8" />
      {/* Inner ring */}
      <circle cx="52" cy="100" r="16" fill="none"
        stroke="rgba(142,201,142,0.10)" strokeWidth="0.5" />
      {/* "AI" letterforms */}
      <text x="52" y="106" textAnchor="middle" dominantBaseline="middle"
        fontSize="19" fontWeight="900" fontFamily="'Courier New', Courier, monospace"
        fill={SAGE} opacity="0.82" letterSpacing="3">AI</text>
      {/* Neural node row below */}
      <circle cx="44" cy="119" r="1.8" fill={SAGE} opacity="0.45" />
      <circle cx="52" cy="119" r="1.8" fill={SAGE} opacity="0.55" />
      <circle cx="60" cy="119" r="1.8" fill={SAGE} opacity="0.45" />
      <line x1="45.8" y1="119" x2="50.2" y2="119" stroke={SAGE} strokeWidth="0.7" opacity="0.3" />
      <line x1="53.8" y1="119" x2="58.2" y2="119" stroke={SAGE} strokeWidth="0.7" opacity="0.3" />
      {/* Node up-link lines */}
      <line x1="44" y1="117.2" x2="49" y2="109" stroke={SAGE} strokeWidth="0.6" opacity="0.2" />
      <line x1="52" y1="117.2" x2="52" y2="109" stroke={SAGE} strokeWidth="0.6" opacity="0.25" />
      <line x1="60" y1="117.2" x2="55" y2="109" stroke={SAGE} strokeWidth="0.6" opacity="0.2" />
      {/* ─────────────────────────────────────────────────────────── */}
      {/* Handle */}
      <path d="M 94 78 Q 118 78 118 100 Q 118 122 94 122"
        fill="none" stroke={DARK} strokeWidth="13" strokeLinecap="round" />
      <path d="M 94 78 Q 114 78 114 100 Q 114 120 94 120"
        fill="none" stroke={BODY} strokeWidth="7" strokeLinecap="round" />
      <path d="M 94 80 Q 111 80 111 100 Q 111 118 94 118"
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

// ── GPU / AI chip on the table ────────────────────────────────────────────────
function GPUChip() {
  const BOARD = '#1b2a1e'
  const TRACE = '#2a4230'
  const PIN   = '#7a8a82'
  const GLOW  = '#4ade80'
  const pinYs = [20, 30, 40, 50, 60, 70]
  const pinXs = [20, 30, 40, 50, 60, 70]
  return (
    <svg width="148" height="148" viewBox="0 0 90 90"
      style={{ filter: 'drop-shadow(0 14px 28px rgba(0,0,0,0.8)) drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }}>
      {/* PCB */}
      <rect x="0" y="0" width="90" height="90" rx="6" fill={BOARD} />
      {/* Trace lines connecting pins to die */}
      {pinYs.map((y, i) => (
        <React.Fragment key={`htrace${i}`}>
          <line x1="0" y1={y} x2="15" y2={y} stroke={TRACE} strokeWidth="1.5" />
          <line x1="75" y1={y} x2="90" y2={y} stroke={TRACE} strokeWidth="1.5" />
        </React.Fragment>
      ))}
      {pinXs.map((x, i) => (
        <React.Fragment key={`vtrace${i}`}>
          <line x1={x} y1="0" x2={x} y2="15" stroke={TRACE} strokeWidth="1.5" />
          <line x1={x} y1="75" x2={x} y2="90" stroke={TRACE} strokeWidth="1.5" />
        </React.Fragment>
      ))}
      {/* Chip package */}
      <rect x="15" y="15" width="60" height="60" rx="3" fill="#0d1f11" />
      <rect x="17" y="17" width="56" height="56" rx="2" fill="#16301a" />
      {/* Die cells */}
      <rect x="21" y="21" width="22" height="22" rx="1" fill="#1a2e1e" />
      <rect x="47" y="21" width="22" height="22" rx="1" fill="#152818" />
      <rect x="21" y="47" width="22" height="22" rx="1" fill="#152818" />
      <rect x="47" y="47" width="22" height="22" rx="1" fill="#1a2e1e" />
      {/* Central compute core */}
      <rect x="27" y="27" width="36" height="36" rx="2" fill="#0a1a0d" />
      <rect x="30" y="30" width="30" height="30" rx="1" fill="#081508" />
      {/* AI glyph */}
      <text x="45" y="48" textAnchor="middle" dominantBaseline="middle"
        fontSize="13" fontWeight="900" fontFamily="'Courier New', monospace"
        fill={GLOW} letterSpacing="2">AI</text>
      <rect x="32" y="38" width="26" height="15" rx="2" fill={GLOW} opacity="0.07" />
      {/* Pins left */}
      {pinYs.map((y, i) => <rect key={`pl${i}`} x="1" y={y-3} width="13" height="5" rx="2" fill={PIN} />)}
      {/* Pins right */}
      {pinYs.map((y, i) => <rect key={`pr${i}`} x="76" y={y-3} width="13" height="5" rx="2" fill={PIN} />)}
      {/* Pins top */}
      {pinXs.map((x, i) => <rect key={`pt${i}`} x={x-3} y="1" width="5" height="13" rx="2" fill={PIN} />)}
      {/* Pins bottom */}
      {pinXs.map((x, i) => <rect key={`pb${i}`} x={x-3} y="76" width="5" height="13" rx="2" fill={PIN} />)}
      {/* Status LED */}
      <circle cx="80" cy="10" r="4.5" fill="#22c55e" opacity="0.9" />
      <circle cx="80" cy="10" r="2.5" fill="#86efac" />
      {/* Part label */}
      <text x="6" y="10" fontSize="4.5" fontFamily="'Courier New', monospace"
        fill={GLOW} opacity="0.6" letterSpacing="0.3">NXP-7B</text>
    </svg>
  )
}

// ── Regen notepad ─────────────────────────────────────────────────────────────
function RegenCard({ generating, onClick }: { generating: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick} disabled={generating}
      title={generating ? 'Generating…' : 'Generate new edition'}
      style={{
        background: 'none', border: 'none', padding: 0, lineHeight: 0,
        cursor: generating ? 'wait' : 'pointer', display: 'block',
        filter: 'drop-shadow(2px 10px 28px rgba(0,0,0,0.75)) drop-shadow(0 2px 5px rgba(0,0,0,0.45))',
        transform: 'rotate(10deg)',
      }}
    >
      <div style={{
        width: 210,
        background: '#f0ead8',
        backgroundImage: `repeating-linear-gradient(
          transparent 0px, transparent 26px,
          rgba(90,60,20,0.10) 26px, rgba(90,60,20,0.10) 27px
        )`,
        padding: '0 20px 26px',
      }}>
        {/* Yellow binding strip */}
        <div style={{ margin: '0 -20px 4px', height: 14, background: '#c8941c' }} />
        <div style={{ margin: '0 -20px 26px', height: 4, background: '#a07010' }} />
        {/* Title */}
        <p style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 900,
          fontStyle: 'italic', letterSpacing: '-0.01em',
          color: '#3a2010', textAlign: 'center', margin: '0 0 14px',
          lineHeight: 1.2, whiteSpace: 'pre-line' }}>
          {generating ? 'Setting\nType…' : 'New\nIssue'}
        </p>
        {/* Spin icon */}
        <div style={{ textAlign: 'center', lineHeight: 1, marginBottom: 18 }}>
          <span style={{ fontFamily: SERIF, fontSize: 58, color: '#3a2010', opacity: 0.85,
            display: 'inline-block' }}>
            {generating ? '…' : '↻'}
          </span>
        </div>
        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(80,50,15,0.25)', margin: '0 0 12px' }} />
        {/* CTA */}
        <p style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: '#5a3820',
          letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center', margin: 0 }}>
          Generate
        </p>
      </div>
    </button>
  )
}

// ── Masthead ──────────────────────────────────────────────────────────────────
function Masthead({ weekOf, issueNum, topics }: {
  weekOf: string | null; issueNum: number; topics: string[]
}) {
  return (
    <div style={{ padding: '10px 28px 0', textAlign: 'center', flexShrink: 0 }}>
      {/* Top metadata strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
        fontFamily: SERIF_SM, fontSize: 12, fontWeight: 700, color: INK,
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 5 }}>
        <span>Vol. 1, No. {issueNum}</span>
        <span>{weekOf ?? '—'}</span>
        <span>By Claude Sonnet</span>
      </div>
      <div style={{ height: 1, background: 'rgba(0,0,0,0.3)', marginBottom: 2 }} />
      <div style={{ height: 5, background: INK, marginBottom: 2 }} />
      <div style={{ height: 1, background: 'rgba(0,0,0,0.3)', marginBottom: 6 }} />
      {/* Nameplate */}
      <div style={{ fontFamily: SERIF, fontSize: 52, fontWeight: 900, color: INK,
        lineHeight: 0.9, letterSpacing: '-0.02em', textTransform: 'uppercase', marginBottom: 6 }}>
        AI Weekly Update
      </div>
      <div style={{ height: 1, background: 'rgba(0,0,0,0.3)', marginBottom: 2 }} />
      <div style={{ height: 5, background: INK, marginBottom: 2 }} />
      <div style={{ height: 1, background: 'rgba(0,0,0,0.3)', marginBottom: 0 }} />
      {/* Inside — section index, prominent */}
      {topics.length > 0 && (
        <div style={{
          padding: '6px 0 5px',
          borderBottom: '1px solid rgba(0,0,0,0.18)',
          display: 'flex', justifyContent: 'center', alignItems: 'baseline',
          flexWrap: 'wrap', gap: '0 6px',
        }}>
          <span style={{ fontFamily: SERIF_SM, fontSize: 10.5, fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase',
            color: INK_MUTED, marginRight: 6, flexShrink: 0 }}>Inside:</span>
          {topics.map((t, i) => (
            <React.Fragment key={i}>
              <span style={{ fontFamily: SERIF_SM, fontSize: 11, color: INK, fontWeight: 400 }}>{t}</span>
              {i < topics.length - 1 && (
                <span style={{ color: INK_FAINT, fontSize: 11 }}>·</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Running head for inner pages ──────────────────────────────────────────────
function RunningHead({ pageNum, totalPages, weekOf, onBack, onForward, canBack, canForward }: {
  pageNum: number; totalPages: number; weekOf: string | null
  onBack?: () => void; onForward?: () => void; canBack?: boolean; canForward?: boolean
}) {
  return (
    <div style={{
      flexShrink: 0, padding: '8px 24px 7px',
      borderBottom: '3px double rgba(0,0,0,0.25)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 900,
        textTransform: 'uppercase', letterSpacing: '-0.02em', color: INK }}>
        AI Weekly Update
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {canBack && (
          <button onClick={onBack} style={{
            fontFamily: SERIF_SM, fontSize: 13, fontWeight: 700, color: INK,
            background: 'rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.30)',
            cursor: 'pointer', padding: '5px 16px', letterSpacing: '0.03em',
          }}>
            ← Prev Page
          </button>
        )}
        <span style={{ fontFamily: SERIF_SM, fontSize: 13, fontWeight: 700,
          color: INK, letterSpacing: '0.04em' }}>
          Page {pageNum} of {totalPages}
        </span>
        {canForward && (
          <button onClick={onForward} style={{
            fontFamily: SERIF_SM, fontSize: 13, fontWeight: 700, color: INK,
            background: 'rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.30)',
            cursor: 'pointer', padding: '5px 16px', letterSpacing: '0.03em',
          }}>
            Next Page →
          </button>
        )}
      </div>
      <div style={{ fontFamily: SERIF_SM, fontSize: 12, fontWeight: 700,
        color: INK, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {weekOf}
      </div>
    </div>
  )
}

// ── Paper face wrapper ────────────────────────────────────────────────────────
function PaperFace({
  children, side, lamp, onMouseMove, onMouseLeave, revealing, interactive, showFade = true,
}: {
  children: React.ReactNode
  side: 'front' | 'back'
  lamp: { x: number; y: number } | null
  onMouseMove: React.MouseEventHandler<HTMLDivElement>
  onMouseLeave: () => void
  revealing: boolean
  interactive: boolean
  showFade?: boolean
}) {
  return (
    <div
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'absolute', inset: 0,
        backgroundColor: PAPER,
        backgroundImage: `
          radial-gradient(ellipse at 38% 18%, rgba(255,255,255,0.28) 0%, transparent 52%),
          radial-gradient(ellipse at 70% 88%, rgba(0,0,0,0.05) 0%, transparent 42%)
        `,
        overflow: 'hidden', cursor: 'default',
        backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
        transform: side === 'back' ? 'rotateY(180deg)' : undefined,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    >
      {/* Paper grain */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
      }} />
      {/* Press band reveal */}
      {revealing && (
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 120,
          zIndex: 8, pointerEvents: 'none',
          animation: 'press-sweep 2.2s linear forwards',
          background: `linear-gradient(to bottom,
            rgba(255,200,80,0.04) 0%, rgba(255,170,30,0.10) 28%,
            rgba(18,9,2,0.24) 50%, rgba(18,9,2,0.12) 72%, transparent 100%)`,
        }} />
      )}
      {/* Reading lamp spotlight */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9,
        opacity: lamp ? 1 : 0, transition: 'opacity 0.5s ease',
        background: lamp
          ? `radial-gradient(circle 300px at ${lamp.x}px ${lamp.y}px,
              rgba(255,225,110,0.18) 0%, rgba(255,210,80,0.06) 55%, rgba(0,0,0,0.05) 100%)`
          : 'none',
      }} />
      {/* Folded-newspaper edge shading — left, right, top, bottom darks + center crease */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11,
        background: [
          'linear-gradient(to right,  rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.10) 2.5%, transparent 7%)',
          'linear-gradient(to left,   rgba(0,0,0,0.26) 0%, rgba(0,0,0,0.08) 2.5%, transparent 7%)',
          'linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.06) 2%,  transparent 6%)',
          'linear-gradient(to top,    rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.04) 2%,  transparent 5%)',
        ].join(','),
      }} />
      {/* Bottom fade — front page only */}
      {showFade && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: 52, pointerEvents: 'none', zIndex: 12,
          background: `linear-gradient(to bottom, transparent 0%, ${PAPER} 100%)`,
        }} />
      )}
      <div style={{ position: 'relative', zIndex: 6, height: '100%' }}>
        {children}
      </div>
    </div>
  )
}

// ── Section header rule ───────────────────────────────────────────────────────
function SectionRule({ num: _num, title }: { num: number; title: string }) {
  return (
    <div style={{ paddingBottom: 14, breakInside: 'avoid' as const, breakAfter: 'avoid' as const }}>
      <div style={{ height: 3, background: INK, marginBottom: 2 }} />
      <div style={{ height: 1, background: 'rgba(0,0,0,0.22)', marginBottom: 6 }} />
      <h3 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 900, fontStyle: 'italic',
        lineHeight: 1.08, letterSpacing: '-0.02em', color: INK, margin: '0 0 7px' }}>
        {title}
      </h3>
      <div style={{ height: 1, background: 'rgba(0,0,0,0.18)', marginBottom: 8 }} />
    </div>
  )
}

// ── 3-column section content (shared by back face and inner front pages) ──────
function SectionColumns({ batch, batchIdx }: {
  batch: Array<{ title: string; body: string }>
  batchIdx: number
}) {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {batch.map((section, i) => (
        <div
          key={i}
          className="paper-sidebar"
          style={{
            flex: 1, minHeight: 0, paddingBottom: 18,
            paddingLeft:  i > 0 ? 14 : 0,
            paddingRight: i < batch.length - 1 ? 14 : 0,
            borderLeft: i > 0 ? '1px solid rgba(0,0,0,0.16)' : 'none',
          }}
        >
          <SectionRule num={batchIdx * SECTIONS_PER_PAGE + i + 2} title={section.title} />
          <NewsBody body={section.body} />
        </div>
      ))}
      {batch.length === 0 && (
        <p style={{ fontFamily: SERIF, fontStyle: 'italic', color: INK_FAINT, fontSize: 14 }}>
          No additional sections this week.
        </p>
      )}
    </div>
  )
}

// ── Dog-ear page-turn corner ──────────────────────────────────────────────────
function DogEar({ onClick, show }: { onClick: () => void; show: boolean }) {
  if (!show) return null
  return (
    <button
      onClick={onClick}
      title="Turn to next page"
      style={{
        position: 'absolute', bottom: 0, right: 0, zIndex: 20,
        background: 'none', border: 'none', padding: 0,
        cursor: 'pointer', lineHeight: 0, transition: 'filter 0.15s ease',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.filter =
          'drop-shadow(-4px -4px 10px rgba(0,0,0,0.26))'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.filter = 'none'
      }}
    >
      <svg width="100" height="100" viewBox="0 0 100 100">
        <path d="M 0 100 L 100 100 L 100 0 Z" fill="#c4c0af" />
        <path d="M 26 100 L 100 100 L 100 26 Z" fill="rgba(255,255,255,0.15)" />
        <line x1="4" y1="100" x2="100" y2="4"
          stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" />
        <text x="76" y="57" textAnchor="middle"
          fontSize="9" fontFamily="'Libre Baskerville', Georgia, serif"
          fontWeight="700" letterSpacing="1"
          fill={INK_MID} style={{ pointerEvents: 'none', userSelect: 'none' }}>
          TURN
        </text>
        <text x="76" y="70" textAnchor="middle"
          fontSize="9" fontFamily="'Libre Baskerville', Georgia, serif"
          fontWeight="700" letterSpacing="1"
          fill={INK_MID} style={{ pointerEvents: 'none', userSelect: 'none' }}>
          PAGE
        </text>
        <text x="77" y="88" textAnchor="middle"
          fontSize="19" fontFamily="Georgia, serif"
          fill={INK_MID} style={{ pointerEvents: 'none', userSelect: 'none' }}>
          →
        </text>
      </svg>
    </button>
  )
}

// ── Mobile layout ─────────────────────────────────────────────────────────────
function MobileDigest({
  digest, lead, rest, weekOf, issueNum, loading, generating, onGenerate,
}: {
  digest: WeeklyDigest | null
  lead: { title: string; body: string } | undefined
  rest: Array<{ title: string; body: string }>
  weekOf: string | null
  issueNum: number
  loading: boolean
  generating: boolean
  onGenerate: () => void
}) {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0e0804',
      backgroundImage: `radial-gradient(ellipse 150% 80% at 28% 22%, rgba(100,55,12,0.38) 0%, transparent 62%)`,
      padding: '16px 12px 48px',
    }}>
      <div style={{
        backgroundColor: PAPER,
        backgroundImage: `radial-gradient(ellipse at 38% 18%, rgba(255,255,255,0.28) 0%, transparent 52%)`,
        boxShadow: '0 4px 32px rgba(0,0,0,0.72)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Paper grain */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.72' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
        }} />

        <div style={{ position: 'relative', zIndex: 6 }}>

          {/* Masthead */}
          <div style={{ padding: '10px 16px 0', textAlign: 'center' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontFamily: SERIF_SM, fontSize: 10, fontWeight: 700, color: INK,
              letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
            }}>
              <span>Vol. 1, No. {issueNum}</span>
              <span>{weekOf ?? '—'}</span>
              <span>By Claude Sonnet</span>
            </div>
            <div style={{ height: 1, background: 'rgba(0,0,0,0.3)', marginBottom: 2 }} />
            <div style={{ height: 4, background: INK, marginBottom: 2 }} />
            <div style={{ height: 1, background: 'rgba(0,0,0,0.3)', marginBottom: 6 }} />
            <div style={{
              fontFamily: SERIF, fontSize: 30, fontWeight: 900, color: INK,
              lineHeight: 0.9, letterSpacing: '-0.02em', textTransform: 'uppercase', marginBottom: 4,
            }}>
              AI Weekly Update
            </div>
            <div style={{ height: 1, background: 'rgba(0,0,0,0.3)', marginBottom: 2 }} />
            <div style={{ height: 4, background: INK, marginBottom: 2 }} />
            <div style={{ height: 1, background: 'rgba(0,0,0,0.3)', marginBottom: 8 }} />

            {/* Generate button */}
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <button
                onClick={onGenerate}
                disabled={generating}
                style={{
                  fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                  textTransform: 'uppercase', color: INK,
                  background: 'rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.25)',
                  padding: '6px 18px', cursor: generating ? 'wait' : 'pointer',
                  minHeight: 36,
                }}
              >
                {generating ? 'Setting Type…' : '↻ New Issue'}
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '4px 16px 32px' }}>

            {loading && (
              <p style={{ fontFamily: SERIF, fontSize: 14, fontStyle: 'italic',
                color: INK_FAINT, textAlign: 'center', paddingTop: 40 }}>
                Loading edition…
              </p>
            )}

            {!loading && !digest && !generating && (
              <p style={{ fontFamily: SERIF, fontSize: 18, fontStyle: 'italic',
                color: INK_FAINT, textAlign: 'center', paddingTop: 40 }}>
                No edition on press.<br />
                <span style={{ fontSize: 12 }}>Tap New Issue above to generate one.</span>
              </p>
            )}

            {generating && !digest && (
              <p style={{ fontFamily: SERIF, fontSize: 16, fontStyle: 'italic',
                color: INK_FAINT, textAlign: 'center', paddingTop: 40 }}>
                Setting type…
              </p>
            )}

            {/* Lead article */}
            {digest && lead && (
              <>
                <h2 style={{
                  fontFamily: SERIF, fontSize: 28, fontWeight: 900, fontStyle: 'italic',
                  lineHeight: 1.05, letterSpacing: '-0.02em', color: INK, margin: '0 0 8px',
                }}>
                  {lead.title}
                </h2>
                <div style={{ height: 3, background: INK, marginBottom: 2 }} />
                <div style={{ height: 1, background: 'rgba(0,0,0,0.22)', marginBottom: 10 }} />
                <NewsBody body={lead.body} />
              </>
            )}

            {/* Key Findings */}
            {digest && digest.highlights.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ height: 3, background: INK, marginBottom: 2 }} />
                <div style={{ height: 1, background: 'rgba(0,0,0,0.22)', marginBottom: 10 }} />
                <h4 style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 900,
                  fontStyle: 'italic', color: INK, margin: '0 0 14px', lineHeight: 1 }}>
                  Key Findings
                </h4>
                {digest.highlights.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 13, alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700,
                      color: INK_MUTED, flexShrink: 0, lineHeight: 1.7 }}>
                      {String(i + 1).padStart(2, '0')}.
                    </span>
                    <p style={{ fontFamily: SERIF_SM, fontSize: 13, color: INK,
                      lineHeight: 1.72, margin: 0 }}>{h}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Vs Last Week */}
            {digest && digest.changes.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ height: 3, background: INK, marginBottom: 2 }} />
                <div style={{ height: 1, background: 'rgba(0,0,0,0.22)', marginBottom: 10 }} />
                <h4 style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 900,
                  fontStyle: 'italic', color: INK, margin: '0 0 14px', lineHeight: 1 }}>
                  Vs. Last Week
                </h4>
                {digest.changes.map((c: DigestChange, i: number) => {
                  const { label, symbol } = {
                    escalated: { label: 'Escalated', symbol: '↑' },
                    resolved:  { label: 'Resolved',  symbol: '✓' },
                    new:       { label: 'New',       symbol: '★' },
                  }[c.type] ?? { label: c.type, symbol: '·' }
                  return (
                    <div key={i} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <span style={{ fontFamily: SERIF, fontSize: 13, fontWeight: 900, color: INK }}>{symbol}</span>
                        <span style={{ fontFamily: SERIF_SM, fontSize: 11, fontWeight: 700,
                          fontStyle: 'italic', color: INK_MID }}>{label}</span>
                        <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.15)' }} />
                      </div>
                      <p style={{ fontFamily: SERIF_SM, fontSize: 13, color: INK,
                        lineHeight: 1.72, margin: 0 }}>{c.text}</p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Additional sections */}
            {digest && rest.map((section, i) => (
              <div key={i} style={{ marginTop: 28 }}>
                <SectionRule num={i + 2} title={section.title} />
                <NewsBody body={section.body} />
              </div>
            ))}

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DigestPage() {
  const isMobile = useIsMobile()
  const [digest,     setDigest]     = useState<WeeklyDigest | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [lamp,       setLamp]       = useState<{ x: number; y: number } | null>(null)
  const [revealing,  setRevealing]  = useState(false)
  const [isFlipped,  setIsFlipped]  = useState(false)
  // spread = which pair of pages (0 = lead/p2, 1 = p3/p4, …)
  const [spread, setSpread] = useState(0)
  const revealedKey      = useRef<string | null>(null)
  const flipTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/digest')
      .then(r => r.ok ? r.json() : null)
      .then(d  => { setDigest(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!digest) return
    if (digest.week_start === revealedKey.current) return
    revealedKey.current = digest.week_start
    setRevealing(true)
    const t = setTimeout(() => setRevealing(false), 2800)
    return () => clearTimeout(t)
  }, [digest])

  async function generate() {
    setGenerating(true)
    setIsFlipped(false)
    setSpread(0)
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
    try {
      const res = await fetch('/api/digest/generate', { method: 'POST' })
      if (res.ok) setDigest(await res.json())
    } finally { setGenerating(false) }
  }

  const sections        = digest?.content_md ? parseSections(digest.content_md) : []
  const [lead, ...rest] = sections


  const ri = (delay: number): React.CSSProperties => revealing
    ? { opacity: 0, animation: `ink-reveal 0.45s ease ${delay}s forwards` }
    : {}

  // Batch remaining sections — each batch fills one inner page
  const restBatches: Array<Array<{ title: string; body: string }>> = []
  for (let i = 0; i < rest.length; i += SECTIONS_PER_PAGE) {
    restBatches.push(rest.slice(i, i + SECTIONS_PER_PAGE))
  }

  // Content for each face at current spread:
  //   spread 0 front  = lead (special)
  //   spread k front  = restBatches[2k-1]  (k > 0)
  //   spread k back   = restBatches[2k]
  const frontBatchIdx = spread === 0 ? -1 : 2 * spread - 1
  const backBatchIdx  = 2 * spread
  const frontBatch    = frontBatchIdx >= 0 ? restBatches[frontBatchIdx] : null
  const backBatch     = restBatches[backBatchIdx] ?? []

  const currentPage = spread * 2 + (isFlipped ? 1 : 0)
  const maxPage     = restBatches.length
  const totalPages  = 1 + restBatches.length
  const canGoForward = currentPage < maxPage
  const canGoBack    = currentPage > 0

  // Navigate forward — uses FLIP_HALF timer so content swaps when paper is edge-on
  function flipForward() {
    if (!canGoForward) return
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
    const nextPage  = currentPage + 1
    const nextSpread = Math.floor(nextPage / 2)
    if (nextSpread !== spread) {
      // Spread changes: currently on back face, going to front of next spread
      setIsFlipped(false)
      flipTimerRef.current = setTimeout(() => setSpread(nextSpread), FLIP_HALF)
    } else {
      setIsFlipped(true)
    }
  }

  function flipBack() {
    if (!canGoBack) return
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
    const prevPage   = currentPage - 1
    const prevSpread = Math.floor(prevPage / 2)
    if (prevSpread !== spread) {
      // Spread changes: currently on front face, going to back of previous spread
      setIsFlipped(true)
      flipTimerRef.current = setTimeout(() => setSpread(prevSpread), FLIP_HALF)
    } else {
      setIsFlipped(false)
    }
  }

  const weekOf = digest ? (() => {
    const [y, m, d] = digest.week_start.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US',
      { month: 'long', day: 'numeric', year: 'numeric' })
  })() : null
  const docRef = digest
    ? `WKL-${digest.week_start.replace(/-/g, '').slice(0, 8)}`
    : 'WKL-PENDING'
  const issueNum = digest
    ? Math.max(1, Math.floor(
        (new Date(digest.week_start).getTime() - new Date('2025-01-01').getTime()) /
        (7 * 24 * 60 * 60 * 1000)) + 1)
    : 1

  if (isMobile === null) return null

  if (isMobile) {
    return (
      <MobileDigest
        digest={digest}
        lead={lead}
        rest={rest}
        weekOf={weekOf}
        issueNum={issueNum}
        loading={loading}
        generating={generating}
        onGenerate={generate}
      />
    )
  }

  const paperW = 'min(1440px, calc(100vw - 520px))'
  const paperH = 'calc(100vh - 90px)'

  const frontMouse = {
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => {
      if (isFlipped) return
      const r = e.currentTarget.getBoundingClientRect()
      setLamp({ x: e.clientX - r.left, y: e.clientY - r.top })
    },
    onMouseLeave: () => setLamp(null),
  }
  const backMouse = {
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isFlipped) return
      const r = e.currentTarget.getBoundingClientRect()
      setLamp({ x: e.clientX - r.left, y: e.clientY - r.top })
    },
    onMouseLeave: () => setLamp(null),
  }

  return (
    // ── Dark walnut table ─────────────────────────────────────────────────────
    <div style={{
      height: '100vh', overflow: 'hidden', position: 'relative',
      backgroundColor: '#0e0804',
      backgroundImage: `
        repeating-linear-gradient(178.5deg,
          transparent 0px, transparent 22px,
          rgba(255,255,255,0.022) 23px, transparent 24px,
          transparent 58px,
          rgba(0,0,0,0.22) 59px, transparent 61px),
        repeating-linear-gradient(180.6deg,
          transparent 0px, transparent 40px,
          rgba(255,255,255,0.012) 41px, transparent 43px),
        radial-gradient(ellipse 150% 80% at 28% 22%, rgba(100,55,12,0.38) 0%, transparent 62%),
        radial-gradient(ellipse at center, rgba(30,14,4,0) 20%, rgba(0,0,0,0.72) 100%)
      `,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '36px 16px 60px',
    }}>

      {/* ── Newspaper scene ───────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', display: 'inline-block',
      }}>
        {/* Table decorations — right/left values are relative to the newspaper
            width via 100%, so they stay anchored to its edges on any viewport.
            Objects clip at the screen edge on narrow displays rather than
            sliding over newspaper content. */}
        {/* Decorations are placed fully OUTSIDE the newspaper boundaries so they
            never cover text. 100% = newspaper width; objects to the left use
            right:100%+, objects to the right use left:100%+. They clip at the
            viewport edge on narrow screens — that's fine. */}
        <div style={{ position: 'absolute', right: '100%', top: 20, zIndex: 50, transform: 'rotate(-22deg)', pointerEvents: 'none' }}>
          <FountainPen />
        </div>
        <div style={{ position: 'absolute', right: 'calc(100% + 24px)', bottom: 80, zIndex: 50, transform: 'rotate(-8deg)', pointerEvents: 'none' }}>
          <GPUChip />
        </div>
        <div style={{ position: 'absolute', left: '100%', top: 28, zIndex: 50, transform: 'rotate(4deg)', pointerEvents: 'none' }}>
          <CoffeeMug />
        </div>
        <div style={{ position: 'absolute', left: 'calc(100% + 20px)', top: 240, zIndex: 6, width: 90, height: 90, borderRadius: '50%', border: '5px solid rgba(70,40,10,0.11)', background: 'radial-gradient(circle, rgba(70,40,10,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: 'calc(100% + 24px)', bottom: 64, zIndex: 50 }}>
          <RegenCard generating={generating} onClick={generate} />
        </div>
        {/* Drop shadow on perspective div — NOT on preserve-3d container */}
        <div style={{
          perspective: '2400px',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.28)) drop-shadow(0 14px 36px rgba(0,0,0,0.58)) drop-shadow(0 36px 80px rgba(0,0,0,0.68))',
        }}>
          <div style={{
            width: paperW, height: paperH,
            position: 'relative',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.82s cubic-bezier(0.4, 0.2, 0.2, 1)',
            transform: isFlipped ? 'rotateY(-180deg)' : 'rotateY(0deg)',
          }}>

            {/* ══ FRONT FACE ══════════════════════════════════════════════════ */}
            <PaperFace side="front"
              lamp={isFlipped ? null : lamp}
              onMouseMove={frontMouse.onMouseMove}
              onMouseLeave={frontMouse.onMouseLeave}
              revealing={revealing && !isFlipped}
              interactive={!isFlipped}
              showFade={spread === 0}>

              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                {spread === 0 ? (
                  /* ── LEAD PAGE (spread 0 front) ──────────────────────────── */
                  <>
                    <div style={ri(0.05)}>
                      <Masthead weekOf={weekOf} issueNum={issueNum}
                        topics={rest.map(s => s.title)} />
                    </div>

                    <div style={{ flex: 1, overflow: 'hidden', padding: '10px 14px 52px' }}>
                      {loading && (
                        <div style={{ textAlign: 'center', paddingTop: 80,
                          fontFamily: SERIF, fontSize: 14, fontStyle: 'italic', color: INK_FAINT }}>
                          Loading edition…
                        </div>
                      )}
                      {!loading && !digest && !generating && (
                        <div style={{ textAlign: 'center', paddingTop: 80 }}>
                          <p style={{ fontFamily: SERIF, fontSize: 24, fontStyle: 'italic',
                            color: INK_FAINT, marginBottom: 20 }}>No edition on press.</p>
                          <p style={{ fontFamily: SERIF_SM, fontSize: 11, color: INK_FAINT }}>
                            Use the notepad on the table to generate one.
                          </p>
                        </div>
                      )}
                      {generating && !digest && (
                        <div style={{ textAlign: 'center', paddingTop: 80 }}>
                          <p style={{ fontFamily: SERIF, fontSize: 18, fontStyle: 'italic',
                            color: INK_FAINT, marginBottom: 8 }}>Setting type…</p>
                          <p style={{ fontFamily: MONO, fontSize: 9.5, color: INK_FAINT, letterSpacing: '0.12em' }}>
                            PLEASE HOLD — ~15 SECONDS
                          </p>
                        </div>
                      )}

                      {digest && lead && (
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr',
                          height: '100%', ...ri(0.35) }}>

                          {/* Left: headline + single-column auto-sized body */}
                          <div style={{
                            borderRight: '1px solid rgba(0,0,0,0.22)',
                            paddingRight: 18,
                            display: 'flex', flexDirection: 'column',
                            overflow: 'hidden',
                          }}>
                            <h2 style={{ fontFamily: SERIF, fontSize: 44, fontWeight: 900, fontStyle: 'italic',
                              lineHeight: 1.0, letterSpacing: '-0.025em', color: INK, margin: '0 0 8px',
                              flexShrink: 0 }}>
                              {lead.title}
                            </h2>
                            <div style={{ height: 3, background: INK, marginBottom: 2, flexShrink: 0 }} />
                            <div style={{ height: 1, background: 'rgba(0,0,0,0.22)', marginBottom: 8, flexShrink: 0 }} />
                            <div className="paper-sidebar" style={{ flex: 1, minHeight: 0 }}>
                              <div className="news-drop-cap" style={{ fontSize: 14 }}>
                                <ReactMarkdown components={{
                                  p: ({ children }) => (
                                    <p style={{ fontFamily: SERIF_SM, color: INK,
                                      fontSize: '1em', lineHeight: 1.88,
                                      margin: '0 0 0.72em', textAlign: 'justify' }}>
                                      {children}
                                    </p>
                                  ),
                                  strong: ({ children }) => (
                                    <strong style={{ color: INK, fontWeight: 700 }}>{children}</strong>
                                  ),
                                  h3: ({ children }) => (
                                    <h3 style={{ fontFamily: SERIF, color: INK, fontSize: '1.08em',
                                      fontWeight: 700, fontStyle: 'italic',
                                      borderTop: '1px solid rgba(0,0,0,0.18)',
                                      paddingTop: 6, margin: '1em 0 0.5em' }}>
                                      {children}
                                    </h3>
                                  ),
                                  ul: ({ children }) => (
                                    <ul style={{ listStyle: 'none', padding: 0, margin: '0.5em 0 1em' }}>{children}</ul>
                                  ),
                                  li: ({ children }) => (
                                    <li style={{ display: 'flex', gap: 6, alignItems: 'flex-start',
                                      marginBottom: '0.5em', fontFamily: SERIF_SM,
                                      color: INK_MID, fontSize: '0.93em', lineHeight: 1.72 }}>
                                      <span style={{ flexShrink: 0, color: INK_MUTED }}>—</span>
                                      <span>{children}</span>
                                    </li>
                                  ),
                                }}>
                                  {lead.body}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </div>

                          {/* Right sidebar */}
                          <div className="paper-sidebar" style={{ paddingLeft: 22 }}>

                            {/* ── Key Findings ── */}
                            {digest.highlights.length > 0 && (
                              <div style={{ marginBottom: 22 }}>
                                <div style={{ height: 3, background: INK, marginBottom: 2 }} />
                                <div style={{ height: 1, background: 'rgba(0,0,0,0.22)', marginBottom: 10 }} />
                                <h4 style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 900,
                                  fontStyle: 'italic', color: INK, margin: '0 0 14px',
                                  lineHeight: 1, letterSpacing: '-0.01em' }}>
                                  Key Findings
                                </h4>
                                {digest.highlights.map((h, i) => (
                                  <div key={i} style={{ display: 'flex', gap: 10,
                                    marginBottom: 13, alignItems: 'flex-start' }}>
                                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700,
                                      color: INK_MUTED, flexShrink: 0, lineHeight: 1.7 }}>
                                      {String(i + 1).padStart(2, '0')}.
                                    </span>
                                    <p style={{ fontFamily: SERIF_SM, fontSize: 13.5, color: INK,
                                      lineHeight: 1.72, margin: 0, textAlign: 'justify' }}>{h}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* ── Vs. Last Week ── */}
                            {digest.changes.length > 0 && (
                              <div>
                                <div style={{ height: 3, background: INK, marginBottom: 2 }} />
                                <div style={{ height: 1, background: 'rgba(0,0,0,0.22)', marginBottom: 10 }} />
                                <h4 style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 900,
                                  fontStyle: 'italic', color: INK, margin: '0 0 14px',
                                  lineHeight: 1, letterSpacing: '-0.01em' }}>
                                  Vs. Last Week
                                </h4>
                                {digest.changes.map((c: DigestChange, i: number) => {
                                  const { label, symbol } = {
                                    escalated: { label: 'Escalated', symbol: '↑' },
                                    resolved:  { label: 'Resolved',  symbol: '✓' },
                                    new:       { label: 'New',       symbol: '★' },
                                  }[c.type] ?? { label: c.type, symbol: '·' }
                                  return (
                                    <div key={i} style={{ marginBottom: 14 }}>
                                      <div style={{ display: 'flex', alignItems: 'center',
                                        gap: 7, marginBottom: 5 }}>
                                        <span style={{ fontFamily: SERIF, fontSize: 13,
                                          fontWeight: 900, color: INK, lineHeight: 1 }}>
                                          {symbol}
                                        </span>
                                        <span style={{ fontFamily: SERIF_SM, fontSize: 11,
                                          fontWeight: 700, fontStyle: 'italic',
                                          color: INK_MID, letterSpacing: '0.02em' }}>
                                          {label}
                                        </span>
                                        <div style={{ flex: 1, height: 1,
                                          background: 'rgba(0,0,0,0.15)' }} />
                                      </div>
                                      <p style={{ fontFamily: SERIF_SM, fontSize: 13.5, color: INK,
                                        lineHeight: 1.72, margin: 0, textAlign: 'justify' }}>
                                        {c.text}
                                      </p>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                          </div>

                        </div>
                      )}
                    </div>

                    {/* Footer strip */}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 12,
                      borderTop: '2px solid rgba(0,0,0,0.18)',
                      background: PAPER, padding: '4px 24px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontFamily: MONO, fontSize: 8, color: INK_FAINT, letterSpacing: '0.08em' }}>
                        {docRef}
                      </span>
                      <span style={{ fontFamily: SERIF_SM, fontSize: 9.5, fontStyle: 'italic', color: INK_FAINT }}>
                        Artificial Intelligence · Weekly Update
                      </span>
                      {rest.length > 0 && (
                        <span style={{ fontFamily: SERIF_SM, fontSize: 9, color: INK_MUTED }}>
                          continued p.2 →
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  /* ── INNER FRONT PAGE (spread > 0) ───────────────────────── */
                  <>
                    <RunningHead
                      pageNum={currentPage + 1}
                      totalPages={totalPages}
                      weekOf={weekOf}
                      canBack={canGoBack}
                      canForward={canGoForward}
                      onBack={flipBack}
                      onForward={flipForward}
                    />
                    <div style={{ flex: 1, overflow: 'hidden', padding: '14px 24px 52px' }}>
                      {frontBatch && (
                        <SectionColumns batch={frontBatch} batchIdx={frontBatchIdx} />
                      )}
                    </div>
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 12,
                      borderTop: '2px solid rgba(0,0,0,0.18)',
                      background: PAPER, padding: '4px 24px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <button onClick={flipBack}
                        style={{ fontFamily: SERIF_SM, fontSize: 13, fontWeight: 700,
                          background: 'rgba(0,0,0,0.07)', color: INK,
                          border: '1px solid rgba(0,0,0,0.30)', padding: '5px 16px',
                          cursor: 'pointer', letterSpacing: '0.03em' }}>
                        ← Prev Page
                      </button>
                      <span style={{ fontFamily: SERIF_SM, fontSize: 13, fontWeight: 700, color: INK }}>
                        Page {currentPage + 1} of {totalPages}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 8, color: INK_FAINT, letterSpacing: '0.08em' }}>
                        {docRef}
                      </span>
                    </div>
                  </>
                )}

                {/* Dog-ear — front face */}
                <DogEar onClick={flipForward} show={canGoForward} />

              </div>
            </PaperFace>

            {/* ══ BACK FACE ═══════════════════════════════════════════════════ */}
            <PaperFace side="back"
              lamp={isFlipped ? lamp : null}
              onMouseMove={backMouse.onMouseMove}
              onMouseLeave={backMouse.onMouseLeave}
              revealing={false}
              interactive={isFlipped}
              showFade={false}>

              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                <RunningHead
                  pageNum={currentPage + 1}
                  totalPages={totalPages}
                  weekOf={weekOf}
                  canBack={canGoBack}
                  canForward={canGoForward && !canGoForward /* header buttons mirror footer */}
                  onBack={flipBack}
                  onForward={flipForward}
                />

                <div style={{ flex: 1, overflow: 'hidden', padding: '14px 24px 52px' }}>
                  <SectionColumns batch={backBatch} batchIdx={backBatchIdx} />
                </div>

                {/* Footer */}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 12,
                  borderTop: '2px solid rgba(0,0,0,0.18)',
                  background: PAPER, padding: '4px 24px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <button onClick={flipBack}
                    style={{ fontFamily: SERIF_SM, fontSize: 13, fontWeight: 700,
                      background: 'rgba(0,0,0,0.07)', color: INK,
                      border: '1px solid rgba(0,0,0,0.30)', padding: '5px 16px',
                      cursor: 'pointer', letterSpacing: '0.03em' }}>
                    ← Prev Page
                  </button>
                  <span style={{ fontFamily: SERIF_SM, fontSize: 13, fontWeight: 700, color: INK }}>
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 8, color: INK_FAINT, letterSpacing: '0.08em' }}>
                    {docRef}
                  </span>
                </div>

                {/* Dog-ear — back face, leads to next spread */}
                <DogEar onClick={flipForward} show={canGoForward} />

              </div>
            </PaperFace>

          </div>
        </div>
      </div>

    </div>
  )
}
