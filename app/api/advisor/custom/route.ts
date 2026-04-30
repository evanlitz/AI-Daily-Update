import { NextResponse } from 'next/server'
import { generateCustomProjectIdeas } from '@/lib/intelligence/advisor'

export async function POST(req: Request) {
  let body: any = {}
  try { body = await req.json() } catch {}

  const userInput = typeof body.userInput === 'string' ? body.userInput.trim() : ''
  if (!userInput) return NextResponse.json({ error: 'userInput is required' }, { status: 400 })

  try {
    const ideas = await generateCustomProjectIdeas(userInput, {
      level: body.level,
      hoursPerWeek: body.hoursPerWeek,
    })
    return NextResponse.json(ideas)
  } catch (err) {
    console.error('[advisor/custom]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
