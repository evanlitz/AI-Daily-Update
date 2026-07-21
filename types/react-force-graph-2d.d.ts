declare module 'react-force-graph-2d' {
  import { Component } from 'react'

  export interface GNode {
    id: string
    [key: string]: unknown
  }

  export interface GLink {
    source: string
    target: string
    [key: string]: unknown
  }

  export interface GraphData {
    nodes: GNode[]
    links: GLink[]
  }

  // Callback params are typed `any` deliberately: force-graph's own generics
  // are invariant-hostile to a caller-supplied node/link shape (function
  // params are contravariant, and this shim's GNode/GLink are intentionally
  // minimal), so a concrete richer node type passed in from a consumer page
  // never structurally satisfies `(node: GNode) => T`. `any` here is the
  // pragmatic fix for a local, hand-written shim covering an untyped package.
  export interface ForceGraph2DProps {
    graphData: GraphData
    width?: number
    height?: number
    nodeId?: string
    nodeLabel?: string | ((node: any) => string)
    nodeColor?: string | ((node: any) => string)
    nodeVal?: string | ((node: any) => number)
    nodeRelSize?: number
    linkColor?: string | ((link: any) => string)
    linkWidth?: number | ((link: any) => number)
    linkLineDash?: number[] | null | ((link: any) => number[] | null)
    linkDirectionalArrowLength?: number | ((link: any) => number)
    linkDirectionalArrowRelPos?: number | ((link: any) => number)
    linkCurvature?: number | ((link: any) => number)
    cooldownTicks?: number
    onNodeClick?: (node: any, event: MouseEvent) => void
    onNodeHover?: (node: any, prevNode: any) => void
    onBackgroundClick?: (event: MouseEvent) => void
    onEngineStop?: () => void
    nodeCanvasObject?: (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => void
  }

  export default class ForceGraph2D extends Component<ForceGraph2DProps> {
    zoomToFit(durationMs?: number, padding?: number, filterFn?: (node: GNode) => boolean): void
  }
}
