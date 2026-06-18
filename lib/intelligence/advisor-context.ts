import db from '../db'
import { getAllModels } from './models'

const PAPER_SOURCES = ['arxiv', 'paperswithcode', 'semanticscholar', 'huggingface']

export interface AdvisorSourceContext {
  trending: string
  papers: string
  repos: string
  datasets: string
  models: string
  radar: string
}

export async function gatherAdvisorContext(): Promise<AdvisorSourceContext> {
  const day14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const day21 = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
  const paperPlaceholders = PAPER_SOURCES.map(() => '?').join(', ')

  const [
    { rows: trendingRows },
    { rows: paperRows },
    { rows: repoRows },
    { rows: datasetRows },
    { rows: radarRows },
    models,
  ] = await Promise.all([
    db.execute({
      sql: `SELECT title FROM feed_items WHERE fetched_at >= ? AND velocity_score > 0 AND screened = 1 AND source NOT IN (${paperPlaceholders}) ORDER BY velocity_score DESC LIMIT 10`,
      args: [day14, ...PAPER_SOURCES],
    }),
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
    db.execute(`SELECT * FROM datasets ORDER BY likes DESC LIMIT 6`),
    db.execute(`SELECT name, category, quadrant FROM tech_radar WHERE quadrant IN ('adopt', 'trial') ORDER BY quadrant ASC, name ASC`),
    getAllModels(),
  ])

  const trending = (trendingRows as any[]).map(i => `- ${i.title}`).join('\n') || 'No recent items available.'

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

  return { trending, papers, repos, datasets, models: modelsText, radar }
}
