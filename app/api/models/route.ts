import { getAllModels, ensureAllModels } from '@/lib/intelligence/models'
import type { AIModel } from '@/lib/types'

// Seed runs at most once per serverless cold start — keeps GET read-only under load
let seeded = false

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lab    = searchParams.get('lab')
  const status = searchParams.get('status')
  const family = searchParams.get('family')

  if (!seeded) {
    await ensureAllModels()
    seeded = true
  }

  let models: AIModel[] = await getAllModels()

  if (lab)    models = models.filter(m => m.lab.toLowerCase() === lab.toLowerCase())
  if (family) models = models.filter(m => m.family.toLowerCase() === family.toLowerCase())
  if (status) models = models.filter(m => m.status === status)
  // Default: hide auto-detected previews unless explicitly requested
  else        models = models.filter(m => m.status !== 'preview')

  return Response.json(models)
}
