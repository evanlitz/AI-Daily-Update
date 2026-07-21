// Shared glyph set — kept as one module so icons used in more than one place
// (currently: the sidebar/mobile nav in app/layout.tsx and the source-type
// icons on the health dashboard) can't silently drift into two different
// SVGs for the same concept.

export function Icon({ children, size = 22, style }: { children: React.ReactNode; size?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
      width={size} height={size} style={{ flexShrink: 0, ...style }}>
      {children}
    </svg>
  )
}

export function RepoGlyph(p: { size?: number; style?: React.CSSProperties }) {
  return <Icon {...p}><circle cx="6" cy="4" r="2" strokeWidth="1.75" /><circle cx="6" cy="20" r="2" strokeWidth="1.75" /><circle cx="18" cy="10" r="2" strokeWidth="1.75" /><path d="M6 6v10M6 10h6a6 6 0 016 6" strokeWidth="1.75" /></Icon>
}

export function DatasetGlyph(p: { size?: number; style?: React.CSSProperties }) {
  return <Icon {...p}><ellipse cx="12" cy="5" rx="9" ry="3" strokeWidth="1.75" /><path d="M21 12c0 1.66-4.03 3-9 3s-9-1.34-9-3M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" strokeWidth="1.75" /></Icon>
}

export function PaperGlyph(p: { size?: number; style?: React.CSSProperties }) {
  return <Icon {...p}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8L14 2z" strokeWidth="1.75" /><path d="M14 2v6h6M8 13h8M8 17h5" strokeWidth="1.75" /></Icon>
}

export function ModelGlyph(p: { size?: number; style?: React.CSSProperties }) {
  return (
    <Icon {...p}>
      <rect x="2" y="3" width="20" height="5" rx="1.5" strokeWidth="1.75" />
      <rect x="2" y="10" width="20" height="5" rx="1.5" strokeWidth="1.75" />
      <rect x="2" y="17" width="20" height="5" rx="1.5" strokeWidth="1.75" />
      <circle cx="6" cy="5.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="6" cy="19.5" r="1" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function PersonGlyph(p: { size?: number; style?: React.CSSProperties }) {
  return <Icon {...p}><circle cx="12" cy="8" r="4" strokeWidth="1.75" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" strokeWidth="1.75" /></Icon>
}

export function RadarGlyph(p: { size?: number; style?: React.CSSProperties }) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="5.5" strokeWidth="1.75" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 12L19 6" strokeWidth="1.75" />
    </Icon>
  )
}

export function GraphGlyph(p: { size?: number; style?: React.CSSProperties }) {
  return (
    <Icon {...p}>
      <circle cx="6" cy="6" r="2.5" strokeWidth="1.75" />
      <circle cx="18" cy="6" r="2.5" strokeWidth="1.75" />
      <circle cx="12" cy="18" r="2.5" strokeWidth="1.75" />
      <path d="M8.2 7.3L11 16M15.8 7.3L13 16M8.5 6h7" strokeWidth="1.75" />
    </Icon>
  )
}
