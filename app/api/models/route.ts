import { getAllModels } from '@/lib/intelligence/models'
import type { AIModel } from '@/lib/types'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lab    = searchParams.get('lab')
  const status = searchParams.get('status')
  const family = searchParams.get('family')

  let models: AIModel[] = getAllModels()

  if (lab)    models = models.filter(m => m.lab.toLowerCase() === lab.toLowerCase())
  if (family) models = models.filter(m => m.family.toLowerCase() === family.toLowerCase())
  if (status) models = models.filter(m => m.status === status)
  // Default: hide auto-detected previews unless explicitly requested
  else        models = models.filter(m => m.status !== 'preview')

  return Response.json(models)
}
