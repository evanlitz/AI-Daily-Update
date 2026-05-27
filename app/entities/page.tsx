'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { relTime } from '@/lib/utils'

const TYPE_META: Record<string, { color: string; rgb: string; label: string }> = {
  company:    { color: '#34d399', rgb: '52,211,153',  label: 'Companies'   },
  model:      { color: '#a78bfa', rgb: '167,139,250', label: 'Models'      },
  researcher: { color: '#fbbf24', rgb: '251,191,36',  label: 'Researchers' },
  paper:      { color: '#60a5fa', rgb: '96,165,250',  label: 'Papers'      },
}
const TYPE_ORDER = ['model', 'company', 'researcher', 'paper'] as const

interface Entity {
  id: string
  name: string
  type: string
  mention_count: number
  first_seen: string
  this_week: number
  last_week: number
  velocity: number
}

function VelocityBadge({ velocity, thisWeek }: { velocity: number; thisWeek: number }) {
  if (thisWeek === 0) return null
  const up   = velocity >= 1.5
  const flat = velocity >= 0.7 && velocity < 1.5
  const color = up ? '#34d399' : flat ? '#a0a0c0' : '#f87171'
  const arrow = up ? '↑' : flat ? '→' : '↓'
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, color,
      background: `${color}18`,
      border: `1px solid ${color}33`,
      borderRadius: 4, padding: '2px 6px',
      marginLeft: 6, flexShrink: 0,
    }}>
      {arrow} {velocity}×
    </span>
  )
}

function EntityCard({ e, trending }: { e: Entity; trending: boolean }) {
  const meta = TYPE_META[e.type] ?? { color: '#7c6aff', rgb: '124,106,255', label: e.type }
  const [hovered, setHovered] = useState(false)

  const badgeValue = trending ? e.this_week : e.mention_count
  const badgeLabel = trending ? 'this wk' : ''
  const subtitle   = trending
    ? `${e.this_week} this week · ${e.last_week} last week`
    : `since ${relTime(e.first_seen)}`

  return (
    <Link
      href={`/entities/${e.id}`}
      style={{
        textDecoration: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: hovered ? `rgba(${meta.rgb},0.07)` : 'rgba(255,255,255,0.025)',
        border: `1px solid ${hovered ? `rgba(${meta.rgb},0.3)` : 'rgba(255,255,255,0.07)'}`,
        borderLeft: `3px solid ${meta.color}`,
        borderRadius: 10,
        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
        boxShadow: hovered ? `0 4px 18px rgba(${meta.rgb},0.1)` : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{
          fontSize: 13, fontWeight: 800,
          color: hovered ? '#eeeef8' : '#d0d0ec',
          lineHeight: 1.3, marginBottom: 2,
          transition: 'color 0.15s',
        }}>
          {e.name}
        </p>
        <p style={{ fontSize: 10, color: '#5a5a7a' }}>{subtitle}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 12 }}>
        {trending && <VelocityBadge velocity={e.velocity} thisWeek={e.this_week} />}
        <span style={{
          fontSize: 12, fontWeight: 900,
          color: meta.color,
          background: `rgba(${meta.rgb},0.1)`,
          border: `1px solid rgba(${meta.rgb},0.22)`,
          borderRadius: 5, padding: '3px 9px',
          marginLeft: trending ? 6 : 0,
        }}>
          {badgeValue}{badgeLabel ? <span style={{ fontSize: 9, fontWeight: 700, marginLeft: 2 }}>{badgeLabel}</span> : null}
        </span>
      </div>
    </Link>
  )
}

export default function EntitiesPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading]   = useState(true)
  const [activeType, setActiveType] = useState<string>('all')
  const [sort, setSort] = useState<'mentions' | 'trending'>('mentions')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/entities?sort=${sort}`)
      .then(r => r.json())
      .then(d => setEntities(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [sort])

  const filtered = activeType === 'all' ? entities : entities.filter(e => e.type === activeType)
  const byType: Record<string, Entity[]> = {}
  for (const e of entities) (byType[e.type] ??= []).push(e)

  const top5 = [...entities].slice(0, 5)

  return (
    <main style={{
      padding: '36px 28px', maxWidth: 1200, margin: '0 auto',
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.022) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
    }}>

      {/* Page header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <p className="eyebrow" style={{ marginBottom: 8 }}>Entity Graph</p>
          <h1 style={{
            fontSize: 28, fontWeight: 900, color: '#e8e8f4',
            letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: 6,
          }}>
            Tracked Entities
          </h1>
          <p style={{ fontSize: 14, color: '#8080b0' }}>
            {loading ? 'Loading…' : `${entities.length} entities extracted from feed items`}
          </p>
        </div>

        {/* Sort toggle */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['mentions', 'trending'] as const).map(s => {
            const active = sort === s
            return (
              <button
                key={s}
                onClick={() => setSort(s)}
                style={{
                  background: active ? 'rgba(124,106,255,0.15)' : 'rgba(255,255,255,0.04)',
                  color: active ? '#a78bfa' : '#5a5a7a',
                  border: active ? '1px solid rgba(167,139,250,0.35)' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8, padding: '7px 16px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {s === 'mentions' ? 'Most Mentioned' : '↑ Trending'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Top 5 stat strip */}
      {top5.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
          {top5.map((e, i) => {
            const meta = TYPE_META[e.type] ?? { color: '#7c6aff', rgb: '124,106,255' }
            const statLabel = sort === 'trending'
              ? `${e.this_week} this wk · ${e.velocity}×`
              : `${e.mention_count} mentions`
            return (
              <Link
                key={e.id}
                href={`/entities/${e.id}`}
                style={{
                  textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 16px',
                  background: `linear-gradient(135deg, rgba(${meta.rgb},0.1) 0%, rgba(${meta.rgb},0.04) 100%)`,
                  border: `1px solid rgba(${meta.rgb},0.22)`,
                  borderRadius: 10, flex: '1 1 160px',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: `rgba(${meta.rgb},0.15)`,
                  border: `1px solid rgba(${meta.rgb},0.3)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: meta.color }}>{i + 1}</span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#d8d8ee', lineHeight: 1.2, marginBottom: 1 }}>
                    {e.name}
                  </p>
                  <p style={{ fontSize: 10, color: meta.color, fontWeight: 700 }}>{statLabel}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <div className="h-7 w-7 rounded-full border border-violet-500 border-t-transparent animate-spin" />
        </div>
      ) : entities.length === 0 ? (
        <div style={{
          padding: '60px 32px', textAlign: 'center',
          background: 'rgba(255,255,255,0.015)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 18,
        }}>
          <p style={{ fontSize: 13, color: '#5a5a7a', fontStyle: 'italic', lineHeight: 1.7 }}>
            Entity extraction runs automatically during each feed fetch.<br />
            Trigger a refresh on the Feed page to populate.
          </p>
        </div>
      ) : (
        <>
          {/* Type filter chips */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {(['all', ...TYPE_ORDER] as const).map(t => {
              const isActive = activeType === t
              const meta = t === 'all' ? { color: '#7c6aff', rgb: '124,106,255' } : TYPE_META[t]
              const count = t === 'all' ? entities.length : (byType[t]?.length ?? 0)
              return (
                <button
                  key={t}
                  onClick={() => setActiveType(t)}
                  style={{
                    background: isActive ? `rgba(${meta.rgb},0.14)` : 'rgba(255,255,255,0.03)',
                    color: isActive ? meta.color : '#5a5a7a',
                    border: isActive ? `1px solid rgba(${meta.rgb},0.35)` : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8, padding: '6px 14px',
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? `0 0 12px rgba(${meta.rgb},0.12)` : 'none',
                  }}
                >
                  <span style={{ textTransform: 'capitalize' }}>{t === 'all' ? 'All' : TYPE_META[t]?.label ?? t}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 900,
                    color: isActive ? meta.color : '#3a3a5a',
                    background: isActive ? `rgba(${meta.rgb},0.15)` : 'rgba(255,255,255,0.05)',
                    borderRadius: 3, padding: '1px 5px',
                  }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Entity grid */}
          {activeType === 'all' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {TYPE_ORDER.map(type => {
                const group = byType[type] ?? []
                if (!group.length) return null
                const meta = TYPE_META[type]
                return (
                  <section key={type}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 900, letterSpacing: '0.18em',
                        color: meta.color, textTransform: 'uppercase', flexShrink: 0,
                      }}>
                        {meta.label}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#3a3a5a',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 4, padding: '1px 7px',
                      }}>
                        {group.length}
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                      {group.map(e => <EntityCard key={e.id} e={e} trending={sort === 'trending'} />)}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
              {filtered.map(e => <EntityCard key={e.id} e={e} trending={sort === 'trending'} />)}
            </div>
          )}
        </>
      )}
    </main>
  )
}
