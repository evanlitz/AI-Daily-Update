import { anthropic, MODEL } from '../claude'
import { safeJSON } from '../utils'
import type { PairwiseVerdict, GroundednessVerdict, ActionabilityVerdict } from './types'

// Pairwise: judges are far more reliable at relative comparisons than absolute
// scores, so prompt-regression detection (old vs new) uses this. Position bias
// (judges favoring whichever side is labeled "A") is real — swap which output
// is A/B randomly so it averages out across a run.
export async function judgePairwise(
  baselineContent: string,
  candidateContent: string
): Promise<PairwiseVerdict & { baselineLabel: 'A' | 'B' }> {
  const baselineIsA = Math.random() < 0.5
  const a = baselineIsA ? baselineContent : candidateContent
  const b = baselineIsA ? candidateContent : baselineContent

  const systemPrompt = `You are comparing two versions of the same weekly AI digest, both written for a self-taught developer who wants to stay current with AI. Judge strictly — most digests sound fine on a skim, so look for the actual difference in substance.

Score each axis independently:

SPECIFICITY: Does it name concrete tools, papers, numbers, version names — or does it lean on vague phrases like "significant progress" and "exciting developments"? A digest that could be published unchanged in any week is low specificity.

INSIGHTFULNESS: Does it make a real, falsifiable claim about what's happening — a stance someone could disagree with — or does it just restate headlines in different words? "X happened, here's what it might mean" beats "X happened."

For each axis, declare a winner: "A", "B", or "tie" — only call a tie if they are genuinely indistinguishable, not as a default when unsure. Then give one overall_winner using the same rule, weighing both axes equally.`

  const userPrompt = `DIGEST A:\n${a}\n\nDIGEST B:\n${b}\n\nReturn ONLY a JSON object:\n{"specificity":{"winner":"A"|"B"|"tie","reason":"one sentence"},"insightfulness":{"winner":"A"|"B"|"tie","reason":"one sentence"},"overall_winner":"A"|"B"|"tie"}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const match = text.match(/\{[\s\S]*\}/)
  const verdict = safeJSON<PairwiseVerdict>(match ? match[0] : '{}', {
    specificity: { winner: 'tie', reason: 'parse failed' },
    insightfulness: { winner: 'tie', reason: 'parse failed' },
    overall_winner: 'tie',
  })

  return { ...verdict, baselineLabel: baselineIsA ? 'A' : 'B' }
}

// Absolute + reference-free: groundedness is the one axis that's checkable
// against a fixed source (the feed items the digest was built from), so it
// doesn't need a comparison output — "is this claim in the source material or
// not" is a yes/no question per claim, not a matter of taste.
export async function judgeGroundedness(digestContent: string, sourceContext: string): Promise<GroundednessVerdict> {
  const systemPrompt = `You are fact-checking an AI-generated weekly news digest against the source material it was built from. For every factual claim in the digest (a model release, a benchmark number, a company action, a paper's finding), check whether it is actually supported by the source material provided.

Score 1-5:
5 — every claim traces back to the source material; any inference is clearly framed as analysis, not fact
4 — claims are supported; at most minor paraphrase/rounding, no fabrication
3 — one or two claims aren't clearly supported by the sources but are plausible, reasonable inferences
2 — multiple claims are unsupported, exaggerated, or overstated beyond what the sources say
1 — contains claims that are fabricated or contradict the source material

List specific unsupported claims if any exist — don't flag the "What This Means For You" or "Hot Takes" sections for being opinionated, since those are explicitly meant to be analysis rather than fact-reporting. Only flag factual claims (what happened, who did what, what a benchmark showed) that aren't backed by the source material.`

  const userPrompt = `SOURCE MATERIAL:\n${sourceContext}\n\nGENERATED DIGEST:\n${digestContent}\n\nReturn ONLY a JSON object:\n{"groundedness":1-5,"unsupported_claims":["claim text", ...],"rationale":"2-3 sentences"}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const match = text.match(/\{[\s\S]*\}/)
  return safeJSON<GroundednessVerdict>(match ? match[0] : '{}', {
    groundedness: 0,
    unsupported_claims: [],
    rationale: 'parse failed',
  })
}

// Advisor groundedness: the prompt explicitly instructs Claude to ground each
// idea in a specific named repo/dataset/model/paper from the context instead
// of a generic placeholder — so "is the named resource actually in the
// context provided" is a checkable fact, same shape as digest groundedness.
export async function judgeAdvisorGrounded(ideas: any[], advisorContext: string): Promise<GroundednessVerdict> {
  const systemPrompt = `You are checking whether AI project ideas are actually grounded in the trending resources they were given, or whether they invented/hallucinated a resource name.

For each idea, check any named repo, dataset, model, or paper it references (in the title, description, or tech_stack) against the context provided below. A generic tool name everyone would know (Python, React, Docker) doesn't need to trace back — only check named *trending* resources the idea claims to build on.

Score 1-5:
5 — every named trending resource the ideas reference actually appears in the context
4 — resources are accurate; at most a minor name variation (abbreviation, version number)
3 — one idea names a trending resource not found in the context, but it's plausible/close
2 — multiple ideas reference resources not in the context
1 — ideas fabricate specific resources (repo names, paper titles) that don't exist in the context at all

List any specific resource names that don't trace back to the context.`

  const userPrompt = `AVAILABLE CONTEXT (trending items, papers, repos, datasets, models, radar tools):\n${advisorContext}\n\nGENERATED IDEAS:\n${JSON.stringify(ideas, null, 2)}\n\nReturn ONLY a JSON object:\n{"groundedness":1-5,"unsupported_claims":["resource name", ...],"rationale":"2-3 sentences"}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const match = text.match(/\{[\s\S]*\}/)
  return safeJSON<GroundednessVerdict>(match ? match[0] : '{}', {
    groundedness: 0,
    unsupported_claims: [],
    rationale: 'parse failed',
  })
}

// Actionability: checks whether each starter_checklist gives a developer
// something to actually do today (a specific command, repo to clone, API to
// call) versus vague planning language ("research the approach", "design the
// architecture") that reads fine but doesn't move anyone forward.
export async function judgeAdvisorActionability(ideas: any[]): Promise<ActionabilityVerdict> {
  const systemPrompt = `You are evaluating whether AI project idea starter checklists are concrete enough for a developer to act on immediately, or vague enough that they'd still be stuck on step 1.

A concrete step names a specific action: a command to run, a library to install, an API endpoint to call, a specific file/repo to clone. A vague step describes an activity without specifying how: "research the best approach", "design the data pipeline", "explore available APIs", "plan the architecture".

Score 1-5 across all the checklists together:
5 — every step in every checklist is concrete and immediately actionable
4 — nearly all steps are concrete; at most one borderline step
3 — a mix — roughly half the steps are vague enough to leave the developer unsure what to actually do
2 — most steps are vague planning language rather than actions
1 — checklists are essentially restatements of the idea description with no real first steps

List the specific vague steps you found, quoted.`

  const userPrompt = `GENERATED IDEAS:\n${JSON.stringify(ideas, null, 2)}\n\nReturn ONLY a JSON object:\n{"actionability":1-5,"vague_steps":["step text", ...],"rationale":"2-3 sentences"}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const match = text.match(/\{[\s\S]*\}/)
  return safeJSON<ActionabilityVerdict>(match ? match[0] : '{}', {
    actionability: 0,
    vague_steps: [],
    rationale: 'parse failed',
  })
}

// Prediction groundedness: refreshPredictionAnalysis is supposed to adjust
// confidence/dates only based on the 30 feed items it was handed — so the
// failure mode to catch is the same shape as digest groundedness: did it cite
// a development that isn't actually in the feed list it was given?
export async function judgePredictionGroundedness(updated: any[], feedList: string): Promise<GroundednessVerdict> {
  const systemPrompt = `You are checking whether updates to AI prediction timelines are actually grounded in the feed items they were given, or whether they cite developments that aren't in that feed.

Each update has a rationale and an evidence array citing specific feed items. Check whether the claims in the rationale and the cited evidence titles actually correspond to items in the feed list provided below — not whether the prediction's reasoning is correct in some absolute sense, only whether it's using real input rather than invented developments.

Score 1-5:
5 — every cited development traces back to an item in the feed list
4 — claims are supported; at most minor paraphrase
3 — one update cites a development not clearly in the feed, but it's a plausible inference
2 — multiple updates cite developments not in the feed list
1 — updates fabricate specific developments that don't appear in the feed at all

List any specific fabricated or unsupported claims.`

  const userPrompt = `FEED LIST (the only source material these updates should draw from):\n${feedList}\n\nUPDATED PREDICTIONS:\n${JSON.stringify(updated, null, 2)}\n\nReturn ONLY a JSON object:\n{"groundedness":1-5,"unsupported_claims":["claim text", ...],"rationale":"2-3 sentences"}`

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
  const match = text.match(/\{[\s\S]*\}/)
  return safeJSON<GroundednessVerdict>(match ? match[0] : '{}', {
    groundedness: 0,
    unsupported_claims: [],
    rationale: 'parse failed',
  })
}
