import db from '../db'
import { recallFeedItems } from '../memory'
import { getAllModels } from './models'
import { getEntitiesForTools } from '../graph'

const PAPER_SOURCES = ['arxiv', 'paperswithcode', 'semanticscholar', 'huggingface']

export interface AdvisorSourceContext {
  trending: string
  papers: string
  repos: string
  datasets: string
  models: string
  radar: string
  // Optional: golden-set fixtures captured before this field existed won't have
  // it, so consumers must fall back rather than assume presence — same pattern
  // predictions.ts's NewPredictionContext.entityContext uses.
  entities?: string
}

// query: overrides the semantic-search text for the `trending` block. Trending
// mode (no user request to condition on) omits it and gets a fixed "what's hot"
// snapshot; custom mode passes the user's own project description so `trending`
// retrieves items actually related to what they asked for, instead of a generic
// "AI tools worth building with" slice that may have nothing to do with the request.
export async function gatherAdvisorContext(query?: string): Promise<AdvisorSourceContext> {
  const day14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const day21 = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
  const day30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const paperPlaceholders = PAPER_SOURCES.map(() => '?').join(', ')

  const [
    trendingItems,
    { rows: paperRows },
    { rows: repoRows },
    { rows: datasetRows },
    { rows: radarRows },
    models,
  ] = await Promise.all([
    recallFeedItems(
      query ?? 'AI tools frameworks APIs developer projects capabilities worth building with',
      14,
      { sinceISO: day14 }
    ),
    db.execute({
      sql: `SELECT title, source FROM feed_items WHERE fetched_at >= ? AND screened = 1 AND source IN (${paperPlaceholders}) ORDER BY velocity_score DESC LIMIT 6`,
      args: [day21, ...PAPER_SOURCES],
    }),
    db.execute(`
      WITH latest AS (SELECT MAX(fetched_at) AS ts FROM github_repos)
      SELECT gr.* FROM github_repos gr, latest l
      WHERE gr.fetched_at >= datetime(l.ts, '-60 minutes')
      ORDER BY gr.stars_total DESC LIMIT 6
    `),
    db.execute({
      sql: `SELECT * FROM datasets WHERE fetched_at >= ? ORDER BY likes DESC LIMIT 6`,
      args: [day30],
    }),
    db.execute(`SELECT id, name, category, quadrant FROM tech_radar WHERE quadrant IN ('adopt', 'trial') ORDER BY quadrant ASC, name ASC`),
    getAllModels(),
  ])

  const radarEntities = await getEntitiesForTools(radarRows as any[])

  const trending = trendingItems.length
    ? trendingItems.map(i => `- ${i.title}`).join('\n')
    : 'No recent items available.'

  const papers = (paperRows as any[]).map(i => `- ${i.title} (${i.source})`).join('\n') || 'No recent papers available.'

  const repos = (repoRows as any[])
    .map(r => `- ${r.full_name} — ${r.description ?? 'no description'} (★${r.stars_total} total, +${r.stars_today} today) ${r.url}`)
    .join('\n') || 'No trending repos available.'

  const datasets = (datasetRows as any[])
    .map(d => `- ${d.full_name} — ${JSON.parse(d.task_categories ?? '[]').join(', ') || 'general'}, ${d.downloads} downloads ${d.url}`)
    .join('\n') || 'No trending datasets available.'

  const recentModels = models
    .filter(m => m.status === 'active')
    .sort((a, b) => b.release_date.localeCompare(a.release_date))
    .slice(0, 6)
  const modelsText = recentModels.map(m => `- ${m.name} (${m.lab}) — released ${m.release_date}`).join('\n') || 'No recent models available.'

  const radar = (radarRows as any[]).map(r => `- ${r.name} (${r.category}, ${r.quadrant})`).join('\n') || 'No radar data available.'

  const entityLines = (radarRows as any[])
    .map(r => (radarEntities.get(r.id)?.length ? `- ${r.name}: ${radarEntities.get(r.id)!.join(', ')}` : null))
    .filter((line): line is string => Boolean(line))
  const entities = entityLines.join('\n') || 'No tracked entity associations for these tools yet.'

  return { trending, papers, repos, datasets, models: modelsText, radar, entities }
}
