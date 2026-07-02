import type { DigestContext } from '../intelligence/digest'
import type { TrendingAdvisorContext } from '../intelligence/advisor'
import type { PredictionContext } from '../intelligence/predictions'
import type { BriefContext, BriefSections } from '../intelligence/brief'

export interface GoldenSet {
  id: string
  weekStart: string
  capturedAt: string
  context: DigestContext
}

export interface Baseline {
  weekStart: string
  content: string
  promotedAt: string
}

export interface AdvisorGoldenSet {
  id: string
  weekStart: string
  capturedAt: string
  context: TrendingAdvisorContext
}

export interface AdvisorBaseline {
  weekStart: string
  ideas: any[]
  promotedAt: string
}

export interface PairwiseVerdict {
  specificity: { winner: 'A' | 'B' | 'tie'; reason: string }
  insightfulness: { winner: 'A' | 'B' | 'tie'; reason: string }
  overall_winner: 'A' | 'B' | 'tie'
}

export interface GroundednessVerdict {
  groundedness: number
  unsupported_claims: string[]
  rationale: string
  // Set when the judge's response couldn't be parsed at all — distinguishes
  // "judge is broken" from a genuine low groundedness score of 0.
  parseFailed?: boolean
}

export interface ActionabilityVerdict {
  actionability: number
  vague_steps: string[]
  rationale: string
}

export interface PredictionGoldenSet {
  id: string
  capturedAt: string
  context: PredictionContext
}

export interface BriefGoldenSet {
  id: string
  date: string
  capturedAt: string
  context: BriefContext
}

export interface BriefBaseline {
  date: string
  brief: BriefSections
  promotedAt: string
}
