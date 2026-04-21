import crypto from 'crypto'
import db from '../db'
import type { AIModel, FeedItem } from '../types'

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
    benchmarks: { swe_bench: 82.0 },
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
    benchmarks: { arc_agi: 87.5, gpqa: 87.7, aime: 96.7 },
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
    benchmarks: { gpqa: 78.3, aime: 83.3 },
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
    benchmarks: { mmlu: 88.7, humaneval: 90.2, math: 76.6, gpqa: 53.6 },
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
    benchmarks: { mmlu: 88.5, humaneval: 91.6 },
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

const insertOrIgnore = db.prepare(`
  INSERT OR IGNORE INTO ai_models
    (id, name, slug, lab, family, release_date, status, context_window,
     input_cost_per_mtok, output_cost_per_mtok, knowledge_cutoff,
     modalities, benchmarks, highlights, notes, feed_item_id, created_at, updated_at)
  VALUES
    (@id, @name, @slug, @lab, @family, @release_date, @status, @context_window,
     @input_cost_per_mtok, @output_cost_per_mtok, @knowledge_cutoff,
     @modalities, @benchmarks, @highlights, @notes, @feed_item_id, @created_at, @updated_at)
`)

export function ensureAllModels(): void {
  const now = new Date().toISOString()
  const txn = db.transaction(() => {
    for (const m of MODEL_SEEDS) {
      insertOrIgnore.run({
        id: crypto.randomUUID(),
        name: m.name,
        slug: m.slug,
        lab: m.lab,
        family: m.family,
        release_date: m.release_date,
        status: m.status,
        context_window: m.context_window ?? null,
        input_cost_per_mtok: m.input_cost_per_mtok ?? null,
        output_cost_per_mtok: m.output_cost_per_mtok ?? null,
        knowledge_cutoff: m.knowledge_cutoff ?? null,
        modalities: JSON.stringify(m.modalities),
        benchmarks: JSON.stringify(m.benchmarks),
        highlights: JSON.stringify(m.highlights),
        notes: m.notes ?? null,
        feed_item_id: null,
        created_at: now,
        updated_at: now,
      })
    }
  })
  txn()
  console.log(`[models] seeded ${MODEL_SEEDS.length} models`)
}

// Keyword regex for model release announcements
const MODEL_RELEASE_RE = /\b(GPT-[\d.]+|Claude\s[\d.]+|Gemini\s[\d.]+|Llama\s[\d.]+|Grok\s[\d.]+|DeepSeek[\s-][\w.]+|Mistral\s\w+|o\d[- ](?:mini|pro|preview)?|Mixtral|Codestral)\b/i

export function detectNewModels(items: FeedItem[]): void {
  const existingSlugs = new Set(
    (db.prepare('SELECT slug FROM ai_models').all() as { slug: string }[]).map(r => r.slug)
  )

  const now = new Date().toISOString()
  let detected = 0

  for (const item of items) {
    const match = MODEL_RELEASE_RE.exec(item.title)
    if (!match) continue

    const rawName = match[0].trim()
    // Rough slug: lowercase, spaces→hyphens, strip special chars
    const slug = `detected-${rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}-${item.id.slice(0, 6)}`

    if (existingSlugs.has(slug)) continue
    existingSlugs.add(slug)

    try {
      insertOrIgnore.run({
        id: crypto.randomUUID(),
        name: rawName,
        slug,
        lab: 'Unknown',
        family: rawName,
        release_date: item.published_at ?? now.slice(0, 10),
        status: 'preview',
        context_window: null,
        input_cost_per_mtok: null,
        output_cost_per_mtok: null,
        knowledge_cutoff: null,
        modalities: JSON.stringify(['text']),
        benchmarks: JSON.stringify({}),
        highlights: JSON.stringify([]),
        notes: `Auto-detected from feed: "${item.title}" (${item.source})`,
        feed_item_id: item.id,
        created_at: now,
        updated_at: now,
      })
      detected++
    } catch {
      // duplicate slug edge case — fine to skip
    }
  }

  if (detected > 0) console.log(`[models] detected ${detected} new model candidates from feed`)
}

export function getAllModels(): AIModel[] {
  const rows = db.prepare(`
    SELECT * FROM ai_models ORDER BY release_date DESC
  `).all() as any[]

  return rows.map(r => ({
    ...r,
    modalities: JSON.parse(r.modalities ?? '[]'),
    benchmarks: JSON.parse(r.benchmarks ?? '{}'),
    highlights: JSON.parse(r.highlights ?? '[]'),
  })) as AIModel[]
}
