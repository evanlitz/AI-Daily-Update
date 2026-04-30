import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import type { AIModel, FeedItem } from '../types'
import { safeJSON } from '../utils'

interface SeedModel {
  name: string
  slug: string
  lab: string
  family: string
  release_date: string
  status: AIModel['status']
  context_window: number | null
  input_cost_per_mtok: number | null
  output_cost_per_mtok: number | null
  knowledge_cutoff: string | null
  modalities: string[]
  benchmarks: Record<string, number>
  highlights: string[]
  notes: string
}

// Pricing is per million tokens (input/output). Marked approximate where uncertain.
// Benchmarks: mmlu (0-100), humaneval (0-100), math (0-100), gpqa (0-100),
//             swe_bench (0-100), arc_agi (0-100), aime (0-100)

const MODEL_SEEDS: SeedModel[] = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    name: 'Claude 4 Opus',
    slug: 'claude-4-opus',
    lab: 'Anthropic',
    family: 'Claude 4',
    release_date: '2025-05-01',
    status: 'active',
    context_window: 200000,
    input_cost_per_mtok: 15.00,
    output_cost_per_mtok: 75.00,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { swe_bench: 72.5 },
    highlights: [
      'Top SWE-Bench score at release',
      'Powers Claude Code CLI for autonomous coding',
      'Best-in-class for long-horizon agentic tasks',
    ],
    notes: 'Most capable Claude model. Designed for complex multi-step reasoning and autonomous software engineering workflows.',
  },
  {
    name: 'Claude 4 Sonnet',
    slug: 'claude-4-sonnet',
    lab: 'Anthropic',
    family: 'Claude 4',
    release_date: '2025-05-01',
    status: 'active',
    context_window: 200000,
    input_cost_per_mtok: 3.00,
    output_cost_per_mtok: 15.00,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'vision', 'code'],
    benchmarks: {},
    highlights: [
      'Best price-to-performance in Claude 4 family',
      'Default model for most Claude API applications',
    ],
    notes: 'Balanced capability and cost. Recommended default for most applications.',
  },
  {
    name: 'Claude 3.7 Sonnet',
    slug: 'claude-3-7-sonnet',
    lab: 'Anthropic',
    family: 'Claude 3.7',
    release_date: '2025-02-24',
    status: 'active',
    context_window: 200000,
    input_cost_per_mtok: 3.00,
    output_cost_per_mtok: 15.00,
    knowledge_cutoff: 'Early 2024',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { swe_bench: 70.3, gpqa: 68.9 },
    highlights: [
      'First model with user-controllable extended thinking',
      'SWE-Bench Verified 70.3% — state of the art at release',
      'Configurable thinking budget (1K–64K tokens)',
    ],
    notes: 'Introduced extended thinking with an exposed reasoning chain. Users can allocate compute budget per query.',
  },
  {
    name: 'Claude 3.5 Sonnet',
    slug: 'claude-3-5-sonnet-20241022',
    lab: 'Anthropic',
    family: 'Claude 3.5',
    release_date: '2024-10-22',
    status: 'active',
    context_window: 200000,
    input_cost_per_mtok: 3.00,
    output_cost_per_mtok: 15.00,
    knowledge_cutoff: 'April 2024',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { mmlu: 88.7, humaneval: 93.7, gpqa: 65.0, swe_bench: 49.0 },
    highlights: [
      'Top coding benchmark at release (SWE-Bench 49%)',
      'Introduced computer use (experimental)',
      'Best vision + code combo in Claude 3.5 generation',
    ],
    notes: 'October 2024 refresh. Added computer use capability for GUI automation.',
  },
  {
    name: 'Claude 3.5 Haiku',
    slug: 'claude-3-5-haiku',
    lab: 'Anthropic',
    family: 'Claude 3.5',
    release_date: '2024-11-04',
    status: 'active',
    context_window: 200000,
    input_cost_per_mtok: 0.80,
    output_cost_per_mtok: 4.00,
    knowledge_cutoff: 'July 2024',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { swe_bench: 40.6 },
    highlights: [
      'Fastest Claude 3.5 model',
      'Outperforms Claude 3 Opus on several benchmarks at 20x lower cost',
    ],
    notes: 'Best value in the Claude lineup. Strong coding for its price tier.',
  },
  {
    name: 'Claude 3 Opus',
    slug: 'claude-3-opus',
    lab: 'Anthropic',
    family: 'Claude 3',
    release_date: '2024-03-04',
    status: 'deprecated',
    context_window: 200000,
    input_cost_per_mtok: 15.00,
    output_cost_per_mtok: 75.00,
    knowledge_cutoff: 'August 2023',
    modalities: ['text', 'vision'],
    benchmarks: { mmlu: 86.8, humaneval: 84.9, gpqa: 50.4 },
    highlights: [
      'First Claude model to beat GPT-4 on MMLU',
      'Dominated coding benchmarks for Q1–Q2 2024',
    ],
    notes: 'Superseded by Claude 3.5 Sonnet. Still available but no longer recommended.',
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  {
    name: 'o3',
    slug: 'openai-o3',
    lab: 'OpenAI',
    family: 'OpenAI o-series',
    release_date: '2025-04-16',
    status: 'active',
    context_window: 200000,
    input_cost_per_mtok: 10.00,
    output_cost_per_mtok: 40.00,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { swe_bench: 71.7, arc_agi: 87.5, gpqa: 87.7, aime: 96.7 },
    highlights: [
      '87.5% on ARC-AGI — crossed the 85% threshold Chollet set as meaningful',
      '96.7% on AIME 2025 math olympiad',
      'First AI to near-human performance on novel reasoning tasks',
    ],
    notes: 'Most capable OpenAI reasoning model. Initial pricing was ~$10/$40 per million tokens after significant reductions from launch.',
  },
  {
    name: 'GPT-4.1',
    slug: 'gpt-4-1',
    lab: 'OpenAI',
    family: 'GPT-4',
    release_date: '2025-04-14',
    status: 'active',
    context_window: 1000000,
    input_cost_per_mtok: 2.00,
    output_cost_per_mtok: 8.00,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { swe_bench: 54.6 },
    highlights: [
      '1 million token context window',
      'Optimized for instruction following and agentic tasks',
      'Significantly cheaper than GPT-4o at launch',
    ],
    notes: 'Positions as the default capable model for long-context applications. Competes directly with Gemini 1.5 Pro on context length.',
  },
  {
    name: 'GPT-4.1 mini',
    slug: 'gpt-4-1-mini',
    lab: 'OpenAI',
    family: 'GPT-4',
    release_date: '2025-04-14',
    status: 'active',
    context_window: 1000000,
    input_cost_per_mtok: 0.40,
    output_cost_per_mtok: 1.60,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'vision', 'code'],
    benchmarks: {},
    highlights: [
      '1M context at $0.40/M input — most affordable long-context model',
    ],
    notes: 'Small, fast, cheap, long-context. Replaces GPT-4o mini for most use cases.',
  },
  {
    name: 'o3-mini',
    slug: 'openai-o3-mini',
    lab: 'OpenAI',
    family: 'OpenAI o-series',
    release_date: '2025-01-31',
    status: 'active',
    context_window: 200000,
    input_cost_per_mtok: 1.10,
    output_cost_per_mtok: 4.40,
    knowledge_cutoff: 'Late 2024',
    modalities: ['text', 'code'],
    benchmarks: { aime: 87.3, gpqa: 79.7 },
    highlights: [
      'Best reasoning-per-dollar model at launch',
      'Outperforms o1 on math while being 10x cheaper',
    ],
    notes: 'Reasoning model optimized for STEM and coding tasks at competitive cost.',
  },
  {
    name: 'o1',
    slug: 'openai-o1',
    lab: 'OpenAI',
    family: 'OpenAI o-series',
    release_date: '2024-12-05',
    status: 'active',
    context_window: 200000,
    input_cost_per_mtok: 15.00,
    output_cost_per_mtok: 60.00,
    knowledge_cutoff: 'October 2023',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { swe_bench: 48.9, gpqa: 78.3, aime: 83.3 },
    highlights: [
      'First production reasoning model — chain-of-thought via RL',
      '89th percentile on AMC/AIME math olympiad at launch',
      'PhD-level performance on physics, chemistry, biology',
    ],
    notes: 'Full release of the o1 reasoning model with vision. Introduced the reasoning model paradigm to production.',
  },
  {
    name: 'GPT-4o',
    slug: 'gpt-4o',
    lab: 'OpenAI',
    family: 'GPT-4',
    release_date: '2024-05-13',
    status: 'active',
    context_window: 128000,
    input_cost_per_mtok: 2.50,
    output_cost_per_mtok: 10.00,
    knowledge_cutoff: 'October 2023',
    modalities: ['text', 'vision', 'audio', 'code'],
    benchmarks: { swe_bench: 33.2, mmlu: 88.7, humaneval: 90.2, math: 76.6, gpqa: 53.6 },
    highlights: [
      'First single model for text, vision, and real-time audio',
      'Sub-300ms spoken response latency',
      'Emotion detection in voice input',
    ],
    notes: 'Unified multimodal architecture. Real-time audio mode was a qualitative leap in conversational AI.',
  },
  {
    name: 'GPT-4o mini',
    slug: 'gpt-4o-mini',
    lab: 'OpenAI',
    family: 'GPT-4',
    release_date: '2024-07-18',
    status: 'active',
    context_window: 128000,
    input_cost_per_mtok: 0.15,
    output_cost_per_mtok: 0.60,
    knowledge_cutoff: 'October 2023',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { mmlu: 82.0, humaneval: 87.2 },
    highlights: [
      'Cheapest capable model at launch — replaced GPT-3.5 Turbo',
      'Outperforms GPT-4 (original) while 20x cheaper',
    ],
    notes: 'High-throughput, low-cost model for simple tasks and high-volume applications.',
  },
  {
    name: 'GPT-4 Turbo',
    slug: 'gpt-4-turbo',
    lab: 'OpenAI',
    family: 'GPT-4',
    release_date: '2023-11-06',
    status: 'deprecated',
    context_window: 128000,
    input_cost_per_mtok: 10.00,
    output_cost_per_mtok: 30.00,
    knowledge_cutoff: 'April 2023',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { mmlu: 86.5 },
    highlights: [
      'First 128K context GPT model',
      'Knowledge cutoff updated to April 2023',
    ],
    notes: 'Superseded by GPT-4o. Was the dominant model for Q4 2023–Q1 2024.',
  },

  // ── Google ─────────────────────────────────────────────────────────────────
  {
    name: 'Gemini 2.5 Pro',
    slug: 'gemini-2-5-pro',
    lab: 'Google',
    family: 'Gemini 2.5',
    release_date: '2025-03-25',
    status: 'active',
    context_window: 1000000,
    input_cost_per_mtok: 1.25,
    output_cost_per_mtok: 10.00,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'vision', 'audio', 'code'],
    benchmarks: { mmlu: 95.5, aime: 92.0, gpqa: 84.0, swe_bench: 63.8 },
    highlights: [
      'Topped LMArena leaderboard at release — #1 across all benchmarks',
      '1M token context with native audio understanding',
      'Re-established Google as a frontier AI leader',
    ],
    notes: 'Best-in-class on math, science, and coding at launch. Google\'s comeback model after difficult 2023.',
  },
  {
    name: 'Gemini 2.5 Flash',
    slug: 'gemini-2-5-flash',
    lab: 'Google',
    family: 'Gemini 2.5',
    release_date: '2025-05-01',
    status: 'active',
    context_window: 1000000,
    input_cost_per_mtok: 0.15,
    output_cost_per_mtok: 0.60,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'vision', 'audio', 'code'],
    benchmarks: {},
    highlights: [
      'Fastest Gemini 2.5 model',
      '1M context at Flash pricing',
    ],
    notes: 'Speed-optimized version of Gemini 2.5. Best value for high-throughput long-context tasks.',
  },
  {
    name: 'Gemini 2.0 Flash',
    slug: 'gemini-2-0-flash',
    lab: 'Google',
    family: 'Gemini 2.0',
    release_date: '2025-02-05',
    status: 'active',
    context_window: 1000000,
    input_cost_per_mtok: 0.10,
    output_cost_per_mtok: 0.40,
    knowledge_cutoff: 'August 2024',
    modalities: ['text', 'vision', 'audio', 'code'],
    benchmarks: { mmlu: 76.4 },
    highlights: [
      'Sub-100ms time-to-first-token',
      'Native audio output — not just text-to-speech',
      'Cheapest 1M context model at launch',
    ],
    notes: 'Real-time multimodal model. Designed for agentic and streaming use cases.',
  },
  {
    name: 'Gemini 1.5 Pro',
    slug: 'gemini-1-5-pro',
    lab: 'Google',
    family: 'Gemini 1.5',
    release_date: '2024-02-15',
    status: 'deprecated',
    context_window: 1000000,
    input_cost_per_mtok: 1.25,
    output_cost_per_mtok: 5.00,
    knowledge_cutoff: 'November 2023',
    modalities: ['text', 'vision', 'audio', 'code'],
    benchmarks: { mmlu: 81.9 },
    highlights: [
      'First 1M token context window — fit entire codebases in one prompt',
      'Could answer questions about specific moments in 1-hour videos',
    ],
    notes: 'Groundbreaking context window. Superseded by Gemini 2.0/2.5 but established the 1M context standard.',
  },

  // ── Meta ───────────────────────────────────────────────────────────────────
  {
    name: 'Llama 4 Maverick',
    slug: 'llama-4-maverick',
    lab: 'Meta',
    family: 'Llama 4',
    release_date: '2025-04-05',
    status: 'active',
    context_window: 10000000,
    input_cost_per_mtok: null,
    output_cost_per_mtok: null,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { mmlu: 88.0 },
    highlights: [
      '10 million token context — largest open-weight context window',
      'Matches GPT-4o on most benchmarks as open weights',
      'Mixture of Experts architecture: 17B active / 400B total parameters',
    ],
    notes: 'Open weights, commercially licensed. Meta\'s flagship multimodal model. Free to run self-hosted.',
  },
  {
    name: 'Llama 4 Scout',
    slug: 'llama-4-scout',
    lab: 'Meta',
    family: 'Llama 4',
    release_date: '2025-04-05',
    status: 'active',
    context_window: 10000000,
    input_cost_per_mtok: null,
    output_cost_per_mtok: null,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'vision', 'code'],
    benchmarks: {},
    highlights: [
      'Runs on a single GPU — 17B active parameters',
      '10M context on consumer hardware',
    ],
    notes: 'Efficiency-focused Llama 4. Designed to run on a single H100 or comparable consumer GPU.',
  },
  {
    name: 'Llama 3.3 70B',
    slug: 'llama-3-3-70b',
    lab: 'Meta',
    family: 'Llama 3.3',
    release_date: '2024-12-06',
    status: 'active',
    context_window: 128000,
    input_cost_per_mtok: null,
    output_cost_per_mtok: null,
    knowledge_cutoff: 'December 2023',
    modalities: ['text', 'code'],
    benchmarks: { mmlu: 86.0, humaneval: 88.4 },
    highlights: [
      'Performance of Llama 3.1 405B in a 70B package',
      'Most downloaded open-weight model on HuggingFace in Q1 2025',
    ],
    notes: 'Instruction-tuned. Best open-weight model before Llama 4 for most text tasks.',
  },
  {
    name: 'Llama 3.1 405B',
    slug: 'llama-3-1-405b',
    lab: 'Meta',
    family: 'Llama 3.1',
    release_date: '2024-07-23',
    status: 'active',
    context_window: 128000,
    input_cost_per_mtok: null,
    output_cost_per_mtok: null,
    knowledge_cutoff: 'December 2023',
    modalities: ['text', 'code'],
    benchmarks: { mmlu: 88.6, humaneval: 89.0 },
    highlights: [
      'First open-weight model to match GPT-4 on MMLU',
      'First open-weight model with 128K context',
    ],
    notes: 'Landmark open-source model. Requires multi-GPU setup but matched frontier closed models at release.',
  },

  // ── Mistral ────────────────────────────────────────────────────────────────
  {
    name: 'Mistral Large 2',
    slug: 'mistral-large-2',
    lab: 'Mistral',
    family: 'Mistral Large',
    release_date: '2024-07-24',
    status: 'active',
    context_window: 128000,
    input_cost_per_mtok: 2.00,
    output_cost_per_mtok: 6.00,
    knowledge_cutoff: 'Early 2024',
    modalities: ['text', 'code'],
    benchmarks: { mmlu: 84.0, humaneval: 92.0 },
    highlights: [
      '92% on HumanEval — strong coding at mid-tier pricing',
      'Supports 80+ programming languages natively',
    ],
    notes: 'Best Mistral model for production use. Strong code generation, 128K context.',
  },
  {
    name: 'Codestral',
    slug: 'mistral-codestral',
    lab: 'Mistral',
    family: 'Codestral',
    release_date: '2024-05-29',
    status: 'active',
    context_window: 32000,
    input_cost_per_mtok: 1.00,
    output_cost_per_mtok: 3.00,
    knowledge_cutoff: 'Early 2024',
    modalities: ['code'],
    benchmarks: { humaneval: 91.6 },
    highlights: [
      'Purpose-built code model — fill-in-the-middle support',
      '91.6% HumanEval — top code benchmark at launch',
    ],
    notes: 'Specialized for code completion and generation. 80+ languages, optimized for IDE integration.',
  },
  {
    name: 'Mixtral 8x22B',
    slug: 'mixtral-8x22b',
    lab: 'Mistral',
    family: 'Mixtral',
    release_date: '2024-04-10',
    status: 'active',
    context_window: 64000,
    input_cost_per_mtok: null,
    output_cost_per_mtok: null,
    knowledge_cutoff: 'Early 2024',
    modalities: ['text', 'code'],
    benchmarks: { mmlu: 77.8, humaneval: 75.0 },
    highlights: [
      'Largest open Mixture-of-Experts model',
      '39B active parameters from 141B total',
    ],
    notes: 'Open weights. Strong multilingual performance. 64K context.',
  },

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  {
    name: 'DeepSeek R1',
    slug: 'deepseek-r1',
    lab: 'DeepSeek',
    family: 'DeepSeek R',
    release_date: '2025-01-20',
    status: 'active',
    context_window: 64000,
    input_cost_per_mtok: 0.55,
    output_cost_per_mtok: 2.19,
    knowledge_cutoff: 'July 2024',
    modalities: ['text', 'code'],
    benchmarks: { aime: 79.8, math: 97.3, gpqa: 71.5, swe_bench: 49.2 },
    highlights: [
      'Open-weight reasoning model matching o1 at ~$6M training cost vs ~$100M+ for o1',
      'Geopolitical shock — proved frontier reasoning is not a US monopoly',
      'Triggered market sell-off in AI infrastructure stocks',
    ],
    notes: 'Open weights under MIT license. Built by a Chinese hedge fund. Chain-of-thought via RL, matching OpenAI\'s o1 on math and coding benchmarks.',
  },
  {
    name: 'DeepSeek V3',
    slug: 'deepseek-v3',
    lab: 'DeepSeek',
    family: 'DeepSeek V',
    release_date: '2024-12-26',
    status: 'active',
    context_window: 64000,
    input_cost_per_mtok: 0.27,
    output_cost_per_mtok: 1.10,
    knowledge_cutoff: 'July 2024',
    modalities: ['text', 'code'],
    benchmarks: { mmlu: 88.5, humaneval: 82.6 },
    highlights: [
      'Non-reasoning model that outperforms GPT-4o on coding',
      'Trained for ~$6M total — 50x cheaper than comparable US models',
    ],
    notes: 'Open weights (non-commercial license restrictions apply). Dense 671B MoE, 37B active parameters.',
  },

  // ── xAI ────────────────────────────────────────────────────────────────────
  {
    name: 'Grok 3',
    slug: 'xai-grok-3',
    lab: 'xAI',
    family: 'Grok 3',
    release_date: '2025-02-17',
    status: 'active',
    context_window: 131072,
    input_cost_per_mtok: 3.00,
    output_cost_per_mtok: 15.00,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { aime: 93.3, gpqa: 84.6, mmlu: 92.7 },
    highlights: [
      '93.3% on AIME 2025 — top math score at launch',
      'Trained on ~100K H100s in Colossus cluster',
      'Integrated real-time X/Twitter data access',
    ],
    notes: 'Elon Musk\'s frontier model. Competitive on reasoning benchmarks. Real-time social media context differentiates from other models.',
  },
  {
    name: 'Grok 3 Mini',
    slug: 'xai-grok-3-mini',
    lab: 'xAI',
    family: 'Grok 3',
    release_date: '2025-02-17',
    status: 'active',
    context_window: 131072,
    input_cost_per_mtok: 0.30,
    output_cost_per_mtok: 0.50,
    knowledge_cutoff: 'Early 2025',
    modalities: ['text', 'code'],
    benchmarks: { aime: 79.0 },
    highlights: [
      'Reasoning model at 10x lower cost than Grok 3',
    ],
    notes: 'Lightweight reasoning model in the Grok 3 family. Optimized for STEM tasks.',
  },
  {
    name: 'Grok 2',
    slug: 'xai-grok-2',
    lab: 'xAI',
    family: 'Grok 2',
    release_date: '2024-08-13',
    status: 'deprecated',
    context_window: 32000,
    input_cost_per_mtok: 2.00,
    output_cost_per_mtok: 10.00,
    knowledge_cutoff: 'August 2024',
    modalities: ['text', 'vision', 'code'],
    benchmarks: { mmlu: 87.5, humaneval: 88.4 },
    highlights: [
      'First xAI model with vision input',
      'Real-time X data access',
    ],
    notes: 'Superseded by Grok 3. Was competitive with GPT-4o at release.',
  },
]

const UPSERT_MODEL_SQL = `
  INSERT INTO ai_models (id, name, slug, lab, family, release_date, status, context_window, input_cost_per_mtok, output_cost_per_mtok, knowledge_cutoff, modalities, benchmarks, highlights, notes, feed_item_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(slug) DO UPDATE SET
    status=excluded.status,
    input_cost_per_mtok=excluded.input_cost_per_mtok,
    output_cost_per_mtok=excluded.output_cost_per_mtok,
    knowledge_cutoff=excluded.knowledge_cutoff,
    benchmarks=excluded.benchmarks,
    highlights=excluded.highlights,
    notes=excluded.notes,
    updated_at=excluded.updated_at
`

export async function ensureAllModels(): Promise<void> {
  const now = new Date().toISOString()
  for (const m of MODEL_SEEDS) {
    await db.execute({
      sql: UPSERT_MODEL_SQL,
      args: [crypto.randomUUID(), m.name, m.slug, m.lab, m.family, m.release_date, m.status, m.context_window ?? null, m.input_cost_per_mtok ?? null, m.output_cost_per_mtok ?? null, m.knowledge_cutoff ?? null, JSON.stringify(m.modalities), JSON.stringify(m.benchmarks), JSON.stringify(m.highlights), m.notes ?? null, null, now, now],
    })
  }
  console.log(`[models] seeded/updated ${MODEL_SEEDS.length} models`)
}

const MODEL_RELEASE_RE = /\b(GPT-[\d.]+(?:\s+\w+)?|Claude\s+[\d.]+(?:\s+\w+)?|Gemini\s+[\d.]+(?:\s+\w+)?|Llama\s+[\d.]+(?:\s+\w+)?|Grok\s+[\d.]+(?:\s+\w+)?|DeepSeek[\s-][\w.]+|Mistral\s+\w+(?:\s+\d+)?|o\d+(?:[\s-](?:mini|pro|preview))?|Mixtral[\s-][\w.]+|Codestral|Phi-[\d.]+|Qwen[\s-][\w.]+|Command[\s-]\w+)\b/gi

interface ExtractedModel {
  name: string
  lab: string
  family: string
  release_date: string
  context_window: number | null
  input_cost_per_mtok: number | null
  output_cost_per_mtok: number | null
  modalities: string[]
  benchmarks: Record<string, number>
  highlights: string[]
  notes: string
}

export async function refreshModelsFromFeed(items: FeedItem[]): Promise<void> {
  // Only process items that plausibly discuss a model release
  const candidates = items.filter(i =>
    MODEL_RELEASE_RE.test(i.title) && /releas|launch|announc|introduc|debut|unveil/i.test(i.title)
  ).slice(0, 10)
  MODEL_RELEASE_RE.lastIndex = 0

  // Also gather preview stubs that still need enrichment
  const { rows: previewRows } = await db.execute({
    sql: `SELECT id, slug, name FROM ai_models WHERE status = 'preview' LIMIT 8`,
    args: [],
  })
  const previewNames = (previewRows as any[]).map(r => r.name as string)

  if (candidates.length === 0 && previewNames.length === 0) return

  const context = candidates.map(i =>
    `SOURCE: ${i.source}\nHEADLINE: ${i.title}\nSNIPPET: ${(i.raw_content ?? i.summary ?? '').slice(0, 350)}`
  ).join('\n\n---\n\n')

  const previewHint = previewNames.length > 0
    ? `\n\nAlso try to enrich data for these models already in the database that are missing details: ${previewNames.join(', ')}`
    : ''

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: [
        {
          type: 'text',
          text: `You are an AI model database curator. Extract structured data about AI model releases from news snippets.
Rules:
- Only include models you can clearly identify from the text — no hallucination
- Only populate fields you have evidence for — use null for unknowns
- benchmarks keys: mmlu, humaneval, math, gpqa, swe_bench, arc_agi, aime (values 0–100)
- modalities: array of "text", "vision", "audio", "code"
- costs are per million tokens (e.g. "$3/M input" → 3.0)
- highlights: 1–3 concrete facts, max 80 chars each
- release_date: ISO date string YYYY-MM-DD, approximate from article date if needed
- lab: one of Anthropic, OpenAI, Google, Meta, Mistral, DeepSeek, xAI, or the actual company name
- status: "preview" if announced but not yet generally available, "active" if released to the public; omit if unclear
- family: model family name (e.g. "GPT-4", "Gemini 2.5", "Claude 3.5") — infer from the model name`,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Extract any AI model releases from these news items. Return ONLY a JSON array (empty array if nothing to extract):\n[{"name":"...","lab":"...","family":"...","release_date":"YYYY-MM-DD","context_window":null,"input_cost_per_mtok":null,"output_cost_per_mtok":null,"modalities":[],"benchmarks":{},"highlights":[],"notes":"..."}]\n\n${context}${previewHint}`,
        },
      ],
    })

    const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return

    const extracted: ExtractedModel[] = safeJSON(match[0])
    if (!Array.isArray(extracted) || extracted.length === 0) return

    const now = new Date().toISOString()
    let upserted = 0

    for (const m of extracted) {
      if (!m.name || !m.lab) continue
      const slug = `detected-${m.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
      try {
        await db.execute({
          sql: `INSERT INTO ai_models (id, name, slug, lab, family, release_date, status, context_window, input_cost_per_mtok, output_cost_per_mtok, knowledge_cutoff, modalities, benchmarks, highlights, notes, feed_item_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, null, ?, ?, ?, ?, null, ?, ?)
                ON CONFLICT(slug) DO UPDATE SET
                  status = CASE WHEN excluded.status = 'active' THEN 'active' ELSE ai_models.status END,
                  context_window = COALESCE(excluded.context_window, ai_models.context_window),
                  input_cost_per_mtok = COALESCE(excluded.input_cost_per_mtok, ai_models.input_cost_per_mtok),
                  output_cost_per_mtok = COALESCE(excluded.output_cost_per_mtok, ai_models.output_cost_per_mtok),
                  benchmarks = CASE WHEN excluded.benchmarks != '{}' THEN excluded.benchmarks ELSE ai_models.benchmarks END,
                  highlights = CASE WHEN excluded.highlights != '[]' THEN excluded.highlights ELSE ai_models.highlights END,
                  notes = CASE WHEN excluded.notes != '' THEN excluded.notes ELSE ai_models.notes END,
                  updated_at = excluded.updated_at`,
          args: [
            crypto.randomUUID(), m.name, slug, m.lab, m.family ?? m.name,
            m.release_date ?? now.slice(0, 10),
            m.context_window ?? null,
            m.input_cost_per_mtok ?? null,
            m.output_cost_per_mtok ?? null,
            JSON.stringify(m.modalities ?? ['text']),
            JSON.stringify(m.benchmarks ?? {}),
            JSON.stringify(m.highlights ?? []),
            m.notes ?? '',
            now, now,
          ],
        })
        upserted++
      } catch {}
    }

    if (upserted > 0) console.log(`[models] Claude enriched/inserted ${upserted} models from feed`)
  } catch (err) {
    console.error('[models] error enriching from feed:', err)
  }
}

export async function getAllModels(): Promise<AIModel[]> {
  const { rows } = await db.execute(`SELECT * FROM ai_models ORDER BY release_date DESC`)
  return (rows as any[]).map(r => ({
    ...r,
    modalities: JSON.parse(r.modalities ?? '[]'),
    benchmarks: JSON.parse(r.benchmarks ?? '{}'),
    highlights: JSON.parse(r.highlights ?? '[]'),
  })) as AIModel[]
}
