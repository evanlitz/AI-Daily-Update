export interface FeedItem {
  id: string
  source: string
  title: string
  url: string
  summary?: string
  raw_content?: string
  published_at?: string
  fetched_at: string
  topic_tags: string[]
  velocity_score: number
  is_read: number
  hook?: string
}

export interface DigestChange {
  type: 'escalated' | 'resolved' | 'new'
  text: string
}

export interface WeeklyDigest {
  id: string
  week_start: string
  content_md: string
  highlights: string[]
  changes: DigestChange[]
  created_at: string
}

export interface RadarRingEvent {
  from: string
  to: string
  date: string
}

export interface TechRadarItem {
  id: string
  name: string
  category: string
  quadrant: 'adopt' | 'trial' | 'assess' | 'hold'
  rationale?: string
  last_updated: string
  ring_history?: RadarRingEvent[]
}

export interface ProjectIdea {
  id: string
  title: string
  description: string
  difficulty: number
  skills_learned: string[]
  estimated_hours: number
  starter_checklist: string[]
  tech_stack: string[]
  created_at: string
}

export interface Dataset {
  id: string
  full_name: string
  url: string
  description?: string
  task_categories: string[]
  modalities: string[]
  size_category?: string
  license?: string
  downloads: number
  likes: number
  last_modified?: string
  fetched_at: string
}

export interface EvidenceLink {
  title: string
  url: string
  source: string
}

export interface AIPrediction {
  id: string
  title: string
  category: 'capability' | 'safety' | 'science' | 'society' | 'infrastructure'
  year_min: number
  year_max: number
  year_guess: number
  month_guess?: number
  date_guess?: string
  confidence: 'speculative' | 'low' | 'medium' | 'high' | 'confirmed'
  description?: string
  rationale?: string
  evidence: EvidenceLink[]
  status: 'upcoming' | 'imminent' | 'past'
  created_at: string
  updated_at: string
}

export interface AIModel {
  id: string
  name: string
  slug: string
  lab: string
  family: string
  release_date: string
  status: 'active' | 'deprecated' | 'preview'
  context_window: number | null
  input_cost_per_mtok: number | null
  output_cost_per_mtok: number | null
  knowledge_cutoff: string | null
  modalities: string[]
  benchmarks: Record<string, number>
  highlights: string[]
  notes: string | null
  feed_item_id: string | null
  created_at: string
  updated_at: string
}

export interface GithubRepo {
  id: string
  name: string
  full_name: string
  url: string
  description?: string
  language?: string
  stars_total: number
  stars_today: number
  topics: string[]
  fetched_at: string
}
