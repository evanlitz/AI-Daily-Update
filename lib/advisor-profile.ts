// The `advisor-profile` localStorage key is written by two components that each
// own a different subset of its fields, so anything read back may be missing
// keys, hold a shape from an older deploy, or be outright malformed. Every read
// goes through `coerce`, so callers always get a complete AdvisorProfile.

export const ADVISOR_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type AdvisorLevel = (typeof ADVISOR_LEVELS)[number]

export interface AdvisorProfile {
  level: AdvisorLevel
  interests: string[]
  hoursPerWeek: number
}

const STORAGE_KEY = 'advisor-profile'
const MIN_HOURS = 1
const MAX_HOURS = 40

export const DEFAULT_ADVISOR_PROFILE: AdvisorProfile = {
  level: 'beginner',
  interests: [],
  hoursPerWeek: 5,
}

function coerce(raw: unknown): AdvisorProfile {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const hours = Number(o.hoursPerWeek)

  return {
    level: ADVISOR_LEVELS.includes(o.level as AdvisorLevel)
      ? (o.level as AdvisorLevel)
      : DEFAULT_ADVISOR_PROFILE.level,
    interests: Array.isArray(o.interests)
      ? o.interests.filter((i): i is string => typeof i === 'string')
      : [],
    hoursPerWeek: Number.isFinite(hours)
      ? Math.max(MIN_HOURS, Math.min(MAX_HOURS, Math.round(hours)))
      : DEFAULT_ADVISOR_PROFILE.hoursPerWeek,
  }
}

export function loadAdvisorProfile(): AdvisorProfile {
  if (typeof window === 'undefined') return { ...DEFAULT_ADVISOR_PROFILE }
  try {
    return coerce(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return { ...DEFAULT_ADVISOR_PROFILE }
  }
}

// Merges a partial update over the stored profile and rewrites the whole object,
// so a component that only knows about some fields can't drop the others.
export function saveAdvisorProfile(patch: Partial<AdvisorProfile>): AdvisorProfile {
  const next = coerce({ ...loadAdvisorProfile(), ...patch })
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
  return next
}
