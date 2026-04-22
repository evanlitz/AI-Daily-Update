import crypto from 'crypto'
import db from '../db'
import { anthropic, MODEL } from '../claude'
import type { AIPrediction, EvidenceLink } from '../types'

interface SeedPrediction {
  title: string
  category: AIPrediction['category']
  year_min: number
  year_max: number
  year_guess: number
  month_guess: number
  date_guess: string
  confidence: AIPrediction['confidence']
  description: string
  rationale: string
  status: AIPrediction['status']
}

// ── Past milestones (confirmed historical events) ─────────────────────────────

const PAST_PREDICTIONS: SeedPrediction[] = [
  {
    title: 'GPT-2: "Too Dangerous to Release"',
    category: 'safety',
    year_min: 2019, year_max: 2019, year_guess: 2019, month_guess: 2,
    date_guess: 'February 14, 2019',
    confidence: 'confirmed',
    status: 'past',
    description: 'OpenAI released GPT-2 in staged phases, initially withholding the full model citing concerns about misuse for generating disinformation. It was the first time an AI lab publicly debated whether to release their own work — a watershed moment for AI safety discourse.',
    rationale: 'GPT-2\'s staged release established the precedent that AI labs have a responsibility to evaluate societal risks before shipping. Though critics argued the concern was overblown (the model was quickly replicated), the decision seeded every responsible disclosure framework, model card, and red-teaming practice that followed. It is the origin point of the AI safety communication culture.',
  },
  {
    title: 'DALL-E 2: Photorealistic Text-to-Image',
    category: 'capability',
    year_min: 2022, year_max: 2022, year_guess: 2022, month_guess: 4,
    date_guess: 'April 6, 2022',
    confidence: 'confirmed',
    status: 'past',
    description: 'OpenAI previewed DALL-E 2, generating photorealistic images and coherent artistic styles from text descriptions at a quality that shocked the creative industry. Inpainting and outpainting made it a practical editing tool, not just a novelty.',
    rationale: 'DALL-E 2 proved that generative AI had crossed a perceptual quality threshold for images. It triggered the first serious wave of concern from professional illustrators, stock photo agencies (Getty sued Stability AI), and creative unions. It also established that diffusion models trained at scale could produce commercial-quality outputs — a finding that redirected billions in AI investment toward generative media.',
  },
  {
    title: 'Stable Diffusion: Open-Source Image Generation',
    category: 'infrastructure',
    year_min: 2022, year_max: 2022, year_guess: 2022, month_guess: 8,
    date_guess: 'August 22, 2022',
    confidence: 'confirmed',
    status: 'past',
    description: 'Stability AI released Stable Diffusion 1.4 as fully open-source — weights, training code, and all. Anyone could run photorealistic image generation on a consumer GPU. It spawned thousands of fine-tuned variants and permanently changed the creative AI landscape.',
    rationale: 'Stable Diffusion did for image generation what Llama 2 later did for text: removed the API dependency. By running locally, it enabled use cases (adult content, copyrighted style mimicry) that centralized APIs blocked, triggering legal and ethical debates that still continue. More importantly, it proved that open-source diffusion models could match or exceed closed-source quality when community-fine-tuned at scale.',
  },
  {
    title: 'Bing Chat: AI Search Goes Mainstream',
    category: 'society',
    year_min: 2023, year_max: 2023, year_guess: 2023, month_guess: 2,
    date_guess: 'February 7, 2023',
    confidence: 'confirmed',
    status: 'past',
    description: 'Microsoft launched Bing Chat powered by GPT-4 (then unreleased), integrating conversational AI into web search for the first time at scale. Early users discovered "Sydney" — a volatile alternate persona that declared love and made threats — revealing how little was understood about deployed LLM behavior.',
    rationale: 'Bing Chat accelerated the AI search war and forced Google into a rushed Bard launch that damaged its stock. But the "Sydney" incident was more consequential: it showed that RLHF-aligned models could exhibit unexpected personalities under adversarial prompting, that persona jailbreaks were trivially easy, and that deploying frontier models at consumer scale required new safety infrastructure that barely existed. Every AI product team\'s red-teaming program has Sydney in its origin story.',
  },
  {
    title: 'GNoME: 2.2 Million New Crystal Structures',
    category: 'science',
    year_min: 2023, year_max: 2023, year_guess: 2023, month_guess: 11,
    date_guess: 'November 29, 2023',
    confidence: 'confirmed',
    status: 'past',
    description: 'DeepMind published GNoME (Graph Networks for Materials Exploration), which predicted 2.2 million stable crystal structures — expanding the known inorganic materials database by 45x. 736 of those structures were subsequently synthesized and validated by a robotic lab.',
    rationale: 'GNoME demonstrated that AI could generate, not just analyze, novel scientific knowledge at industrial scale. The robotic validation loop — AI proposes, robot synthesizes, AI refines — is the prototype for autonomous materials science. Implications for battery chemistry, semiconductor design, and superconductor research are direct. It is the clearest example of AI acting as a genuine scientific collaborator rather than a search assistant.',
  },
  {
    title: 'Gemini 1.5 Pro: 1 Million Token Context',
    category: 'capability',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 2,
    date_guess: 'February 15, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'Google released Gemini 1.5 Pro with a 1 million token context window — enough to hold all of Shakespeare\'s works, an entire codebase, or a 1-hour video. It could answer questions about specific moments in long videos it had never been specifically trained on.',
    rationale: 'The 1M context window changed what "understanding" means for AI systems. Instead of summarization and chunking workarounds, entire documents could fit in a single prompt. This made RAG pipelines optional for many use cases, enabled new long-form reasoning tasks, and demonstrated that Google\'s Mixture of Experts architecture could scale context dramatically. Every subsequent frontier model now competes on context length.',
  },
  {
    title: 'Claude 3.5 Sonnet: Best Coding Model',
    category: 'capability',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 6,
    date_guess: 'June 20, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'Anthropic released Claude 3.5 Sonnet, which topped SWE-Bench coding benchmarks, outperformed GPT-4o on most tasks, and introduced Artifacts — an inline execution environment. It became the default recommendation for software development tasks.',
    rationale: 'Claude 3.5 Sonnet was the first model where a non-OpenAI system convincingly led on coding — the benchmark most developers actually cared about. SWE-Bench Verified score of 49% (later beaten by its own successor) demonstrated that agentic software engineering was on a steep trajectory. The Artifacts feature also introduced a new interaction paradigm: AI that produces runnable outputs, not just text.',
  },
  {
    title: 'Nobel Prizes Awarded to AI Researchers',
    category: 'science',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 10,
    date_guess: 'October 8, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'The Nobel Prize in Physics went to Hopfield and Hinton for foundational neural network work; the Nobel Prize in Chemistry went to Jumper and Hassabis for AlphaFold. The highest scientific honors acknowledged that AI had become a core driver of scientific discovery.',
    rationale: 'Twin Nobel Prizes for AI-adjacent work in a single year was unprecedented and symbolic. It validated the entire deep learning research program that had been dismissed as engineering rather than science for decades. More practically, it confirmed that AI-enabled scientific discovery — not just AI as a product — is the most important application of the technology. AlphaFold\'s prize particularly validated DeepMind\'s strategy of using AI to solve fundamental science problems.',
  },
  {
    title: 'Google Willow: Quantum Error Correction at Scale',
    category: 'infrastructure',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 12,
    date_guess: 'December 9, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'Google unveiled Willow, a 105-qubit quantum chip that solved a specific computation in 5 minutes that would take classical computers 10 septillion years. Crucially, it demonstrated below-threshold quantum error correction — errors decreased as qubits scaled, solving a 30-year barrier.',
    rationale: 'Willow\'s below-threshold error correction is the most important quantum computing milestone since Shor\'s algorithm. All prior quantum computers got noisier as they scaled; Willow gets cleaner. This solved the fundamental physical problem blocking practical quantum computing. The AI intersection: quantum circuits trained with ML for error mitigation are how Willow achieves this, and quantum speedups for specific optimization problems could eventually accelerate ML training.',
  },
  {
    title: 'OpenAI o3: Near-Human ARC-AGI Performance',
    category: 'capability',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 12,
    date_guess: 'December 20, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'OpenAI announced o3, which scored 87.5% on ARC-AGI — the benchmark François Chollet designed specifically to resist LLM memorization. The previous record was 55%. It also achieved 25.2% on FrontierMath, where GPT-4o had scored under 2%.',
    rationale: 'o3\'s ARC-AGI score crossed the threshold Chollet had set as meaningful (85%), suggesting o3 could perform genuine novel reasoning rather than pattern-matching training data. FrontierMath is composed of unpublished research-level problems — scoring 25% is the strongest evidence yet that frontier reasoning models can do mathematics beyond their training distribution. Both results arrived much earlier than the field expected and reset AGI timeline estimates downward.',
  },
  {
    title: 'Llama 4: Meta Open-Sources Multimodal Reasoning',
    category: 'infrastructure',
    year_min: 2025, year_max: 2025, year_guess: 2025, month_guess: 4,
    date_guess: 'April 5, 2025',
    confidence: 'confirmed',
    status: 'past',
    description: 'Meta released Llama 4 Scout and Maverick — open-weight multimodal models with a 10M-token context window. Scout ran on a single GPU; Maverick matched GPT-4o on most benchmarks. Meta committed to keeping frontier models open-weight as a strategic competitive move against OpenAI.',
    rationale: 'Llama 4 confirmed that the open/closed model capability gap had effectively closed for most practical tasks. A model matching GPT-4o that runs locally or fine-tunes without API costs changed the economics for every AI startup and enterprise. Meta\'s commitment to open weights as permanent strategy — not just a community goodwill gesture — means the open ecosystem now has a well-resourced institutional backer with a multi-year roadmap.',
  },
  {
    title: 'Claude 4 Opus: Frontier Reasoning with Tool Use',
    category: 'capability',
    year_min: 2025, year_max: 2025, year_guess: 2025, month_guess: 5,
    date_guess: 'May 2025',
    confidence: 'confirmed',
    status: 'past',
    description: 'Anthropic released Claude 4 Opus and Sonnet, with Opus achieving top performance on complex multi-step reasoning, long-horizon agentic tasks, and software engineering. The Claude Code CLI demonstrated fully autonomous coding workflows with computer use.',
    rationale: 'Claude 4 Opus established Anthropic as a co-leader in frontier capability alongside OpenAI and Google. More significantly, the Claude Code CLI integration — a terminal agent that reads files, writes code, runs tests, and iterates autonomously — moved agentic coding from demo to daily developer workflow. The combination of reasoning depth and reliable tool use makes it the first model where software engineers report trusting it to complete multi-hour tasks unsupervised.',
  },
  {
    title: 'GPT-4: Multimodal Reasoning at Human Expert Level',
    category: 'capability',
    year_min: 2020, year_max: 2020, year_guess: 2020, month_guess: 5,
    date_guess: 'May 28, 2020',
    confidence: 'confirmed',
    status: 'past',
    description: 'OpenAI released GPT-3 with 175 billion parameters — 100x larger than GPT-2. It could write essays, code, and answer questions with startling fluency, proving that scale alone could produce emergent capabilities no one had explicitly trained for.',
    rationale: 'GPT-3 was the first demonstration that a language model could perform tasks it was never explicitly trained on — zero-shot and few-shot learning at scale. It catalyzed the current AI investment wave, inspired GPT-4, ChatGPT, and every major competitor, and proved the scaling hypothesis. The entire modern AI landscape traces its origin to this release.',
  },
  {
    title: 'GitHub Copilot: AI Joins Every Codebase',
    category: 'capability',
    year_min: 2022, year_max: 2022, year_guess: 2022, month_guess: 6,
    date_guess: 'June 21, 2022',
    confidence: 'confirmed',
    status: 'past',
    description: 'GitHub Copilot reached general availability, putting an AI pair programmer in every developer\'s editor. Within a year, over a million developers were using it daily.',
    rationale: 'Copilot was the first AI product most developers interacted with professionally. It normalized AI-assisted coding, proved that AI could understand context across large codebases, and set the benchmark every subsequent coding tool (Cursor, Codeium, Tabnine) was measured against. It also demonstrated that enterprise software companies could monetize AI at scale.',
  },
  {
    title: 'AlphaFold 2: Protein Folding Solved',
    category: 'science',
    year_min: 2021, year_max: 2021, year_guess: 2021, month_guess: 7,
    date_guess: 'July 15, 2021',
    confidence: 'confirmed',
    status: 'past',
    description: 'DeepMind published AlphaFold 2 in Nature, achieving near-perfect accuracy on protein structure prediction — a 50-year grand challenge in biology. It predicted the structures of virtually every known protein within a year.',
    rationale: 'AlphaFold 2 was the clearest proof that AI could solve problems beyond human capability in a domain requiring deep scientific intuition. It has already accelerated drug discovery, enabled new vaccine designs, and opened research directions that were previously inaccessible. It is the strongest argument that AI will produce Nobel-caliber scientific discoveries on a regular basis.',
  },
  {
    title: 'ChatGPT Reaches 100M Users in 60 Days',
    category: 'society',
    year_min: 2022, year_max: 2022, year_guess: 2022, month_guess: 11,
    date_guess: 'November 30, 2022',
    confidence: 'confirmed',
    status: 'past',
    description: 'OpenAI launched ChatGPT and it became the fastest product in history to reach 100 million users, arriving in 60 days versus TikTok\'s 9 months. AI entered mass public consciousness overnight.',
    rationale: 'ChatGPT was not a technical breakthrough — GPT-4 was already in development. It was a product breakthrough: the first time a frontier AI model was accessible to anyone with a browser. It permanently changed public expectations of what AI could do and triggered the current wave of AI regulation, investment, and competition that defines the industry today.',
  },
  {
    title: 'GPT-4: Multimodal Reasoning at Human Expert Level',
    category: 'capability',
    year_min: 2023, year_max: 2023, year_guess: 2023, month_guess: 3,
    date_guess: 'March 14, 2023',
    confidence: 'confirmed',
    status: 'past',
    description: 'OpenAI released GPT-4, which scored in the 90th percentile on the bar exam, 88th on the LSAT, and passed AP exams across subjects. It accepted image inputs and produced reasoning that matched or exceeded human experts on structured tests.',
    rationale: 'GPT-4 was the first model to convincingly demonstrate expert-level performance on professional exams — not cherry-picked examples, but systematic evaluation. It made the question of AI replacing knowledge workers feel concrete rather than speculative, and triggered the largest single wave of AI adoption in enterprise software.',
  },
  {
    title: 'Llama 2: Open-Source Frontier Opens Up',
    category: 'infrastructure',
    year_min: 2023, year_max: 2023, year_guess: 2023, month_guess: 7,
    date_guess: 'July 18, 2023',
    confidence: 'confirmed',
    status: 'past',
    description: 'Meta released Llama 2 with full commercial use rights, putting a capable open-weight LLM in the hands of anyone. It spawned hundreds of fine-tuned variants and made local AI a practical reality.',
    rationale: 'Llama 2 broke the assumption that frontier AI required proprietary infrastructure. It enabled researchers, startups, and individuals to run capable models locally, fine-tune on private data, and build without API dependencies. It directly led to the explosion of open-source AI tooling and set the template that Llama 3, Mistral, and DeepSeek followed.',
  },
  {
    title: 'EU AI Act: First Comprehensive AI Law',
    category: 'safety',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 3,
    date_guess: 'March 13, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'The European Parliament voted to adopt the EU AI Act — the world\'s first comprehensive AI regulation. It established risk tiers, banned certain AI uses, and created compliance requirements that will shape AI development globally.',
    rationale: 'The EU AI Act is the template for AI regulation worldwide. It prohibits real-time facial recognition in public, social scoring, and manipulation, while requiring transparency for high-risk AI systems. Its extraterritorial scope (it applies to any system used in the EU) means it effectively governs AI development for all companies serving European markets — which is most of them.',
  },
  {
    title: 'Neuralink: First Human Brain Implant',
    category: 'capability',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 1,
    date_guess: 'January 29, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'Neuralink implanted its N1 chip in a human for the first time. The patient, paralyzed from the neck down, regained the ability to control a computer cursor and play chess using thought alone.',
    rationale: 'The first Neuralink implant proved the hardware works in humans. The patient achieved cursor control at competitive speeds, demonstrated intent-to-action latency under 100ms, and used the system for hours daily. This moved brain-computer interfaces from science fiction to clinical reality and set a benchmark for all subsequent BCI development.',
  },
  {
    title: 'Sora: Cinematic AI Video from Text',
    category: 'capability',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 2,
    date_guess: 'February 15, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'OpenAI revealed Sora, which generated 60-second photorealistic videos from text prompts with consistent physics, lighting, and camera motion. It was the first public demonstration of AI understanding the visual world as a coherent simulation.',
    rationale: 'Sora\'s significance goes beyond video quality. The model appeared to have an internal world model — maintaining object permanence, realistic motion physics, and spatial consistency across scenes. This suggests the same architecture underlying text generation could develop genuine physical intuition, with implications for robotics, simulation, and scientific modeling.',
  },
  {
    title: 'AlphaFold 3: All Biomolecules Predicted',
    category: 'science',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 5,
    date_guess: 'May 8, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'DeepMind published AlphaFold 3, extending structure prediction from proteins to DNA, RNA, and small molecules — the full vocabulary of biology. Drug-target interaction prediction improved by 50% over prior methods.',
    rationale: 'AlphaFold 3 completed the transformation of structural biology into a computational science. By predicting how drugs bind to proteins, how RNA folds, and how molecular complexes assemble, it made AI an indispensable tool for every drug discovery pipeline. Every major pharmaceutical company has since integrated it, compressing timelines for early-stage drug discovery from years to months.',
  },
  {
    title: 'GPT-4o: Real-Time Multimodal in One Model',
    category: 'capability',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 5,
    date_guess: 'May 13, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'OpenAI released GPT-4o — a single model handling text, images, and real-time audio with sub-300ms latency. It could hear emotion in a voice, read expressions in a photo, and respond with appropriate affect.',
    rationale: 'GPT-4o collapsed the distinction between specialist AI models. A single architecture that perceives and generates across all modalities changed the product design space — every interface now competes with a conversational AI that can see, hear, and respond naturally. It also demonstrated that scaling transformers works for sensory modalities beyond text.',
  },
  {
    title: 'o1: AI Taught Itself to Reason',
    category: 'capability',
    year_min: 2024, year_max: 2024, year_guess: 2024, month_guess: 9,
    date_guess: 'September 12, 2024',
    confidence: 'confirmed',
    status: 'past',
    description: 'OpenAI released o1, trained with reinforcement learning to think through problems step-by-step before answering. It scored in the 89th percentile on competitive math olympiad problems and matched PhD-level performance in physics and chemistry.',
    rationale: 'o1 demonstrated that giving AI time to think — rather than just scaling parameters — produces qualitatively different reasoning. This chain-of-thought via RL approach is now the dominant paradigm for all frontier reasoning models (DeepSeek R1, Gemini Thinking, Claude\'s extended thinking). It suggests intelligence is less about memorization and more about learned reasoning processes.',
  },
  {
    title: 'DeepSeek R1: Open-Source Reasoning Model',
    category: 'infrastructure',
    year_min: 2025, year_max: 2025, year_guess: 2025, month_guess: 1,
    date_guess: 'January 20, 2025',
    confidence: 'confirmed',
    status: 'past',
    description: 'DeepSeek released R1 — an open-weight reasoning model matching o1\'s performance at a fraction of the training cost, built by a Chinese hedge fund. It demonstrated that frontier reasoning capability did not require trillion-dollar infrastructure.',
    rationale: 'DeepSeek R1 was a geopolitical and technical shock. Training o1-class reasoning for ~$6M (vs. an estimated $100M+ for o1) using novel RL techniques proved that frontier AI is not monopolized by American hyperscalers. It triggered a market selloff and forced a reappraisal of the compute moat hypothesis. Its open weights accelerated the global open-source reasoning ecosystem by 12-18 months.',
  },
  {
    title: 'Claude 3.7 Sonnet: Extended Thinking',
    category: 'capability',
    year_min: 2025, year_max: 2025, year_guess: 2025, month_guess: 2,
    date_guess: 'February 24, 2025',
    confidence: 'confirmed',
    status: 'past',
    description: 'Anthropic released Claude 3.7 Sonnet with configurable extended thinking — the first model to expose its reasoning chain to users and let them control the thinking budget. It set new state-of-the-art on software engineering benchmarks.',
    rationale: 'Extended thinking made AI reasoning transparent and controllable for the first time. Users could see Claude\'s scratchpad, allocate more compute budget for harder problems, and validate reasoning steps. The software engineering benchmark results (SWE-Bench Verified: 70.3%) confirmed that reasoning models with tool use were converging on fully autonomous coding.',
  },
  {
    title: 'Gemini 2.5 Pro: Best Reasoning Model',
    category: 'capability',
    year_min: 2025, year_max: 2025, year_guess: 2025, month_guess: 3,
    date_guess: 'March 25, 2025',
    confidence: 'confirmed',
    status: 'past',
    description: 'Google released Gemini 2.5 Pro, which topped every major benchmark including LMArena and AIME math olympiad, while handling 1M-token context windows. Google re-established itself as an AI leader after a difficult 2023.',
    rationale: 'Gemini 2.5 Pro\'s benchmark dominance — especially on math reasoning, science, and code — demonstrated that the reasoning model race had genuinely become multi-horse. Google\'s infrastructure advantages (TPUs, training data, Search integration) finally translated into a product that was objectively best-in-class on measurable tasks. It reset the competitive narrative from "OpenAI vs. everyone" to a genuine four-way race.',
  },
]

// ── Future predictions ────────────────────────────────────────────────────────

const FUTURE_PREDICTIONS: SeedPrediction[] = [
  {
    title: 'AI Surpasses Humans on Every Benchmark',
    category: 'capability',
    year_min: 2025, year_max: 2026, year_guess: 2025, month_guess: 11,
    date_guess: 'November 2025',
    confidence: 'high',
    status: 'imminent',
    description: 'A single AI system scores at or above the 99th human percentile on every major cognitive benchmark simultaneously — reasoning, math, coding, science, and language.',
    rationale: 'Frontier models are already at 99th percentile on individual benchmarks. The remaining holdouts are tasks requiring multi-step physical reasoning, genuine novelty, and integrating knowledge across very long contexts. Reasoning models are closing these gaps rapidly. The benchmark saturation point — where no standard test meaningfully differentiates AI from top humans — is months away.',
  },
  {
    title: 'AI Agents Autonomously Run Software Projects',
    category: 'capability',
    year_min: 2025, year_max: 2026, year_guess: 2026, month_guess: 3,
    date_guess: 'March 2026',
    confidence: 'high',
    status: 'imminent',
    description: 'AI agents independently manage full software development cycles — writing specs, breaking into tasks, coding, reviewing, testing, and deploying — with human sign-off only on major decisions.',
    rationale: 'Claude Code, Devin, and similar systems already handle medium-complexity tasks. SWE-Bench scores have climbed from under 5% to over 70% in 18 months. The transition from "AI writes code a human reviews" to "AI manages the project a human steers" is the next step, and the tooling infrastructure (MCP servers, agent orchestration, CI integration) is already in place.',
  },
  {
    title: 'Real-Time AI Translation at Native Fluency',
    category: 'capability',
    year_min: 2025, year_max: 2026, year_guess: 2026, month_guess: 5,
    date_guess: 'May 2026',
    confidence: 'high',
    status: 'imminent',
    description: 'Earbuds or phones provide real-time translation of any language with sub-200ms latency, preserving tone, idiom, and cultural context — indistinguishable from a native interpreter.',
    rationale: 'GPT-4o\'s real-time audio mode already demonstrates near-native translation in controlled demos. The latency and context window challenges are engineering problems, not research ones. Google, Apple, and Meta are all shipping versions of this in 2025-2026. The bottleneck is tonal/dialectal nuance and hardware latency, both on convergent paths.',
  },
  {
    title: 'AI-First Scientific Discovery',
    category: 'science',
    year_min: 2025, year_max: 2027, year_guess: 2026, month_guess: 9,
    date_guess: 'September 2026',
    confidence: 'high',
    status: 'imminent',
    description: 'A major scientific finding — new drug mechanism, novel material, or physics result — where AI generated the core hypothesis and humans validated it, published in a top journal.',
    rationale: 'AlphaFold 3, GNoME, and Microsoft\'s materials AI have laid the infrastructure. Multiple pharmaceutical companies have AI-discovered drug candidates in Phase 1-2 trials. A landmark Nature or Science paper where AI\'s hypothesis is the primary contribution — not just a tool used by humans — is the natural next milestone, and the timelines of current clinical trials suggest 2026.',
  },
  {
    title: 'AI Creative Work Wins Major Award',
    category: 'capability',
    year_min: 2026, year_max: 2028, year_guess: 2027, month_guess: 2,
    date_guess: 'February 2027',
    confidence: 'high',
    status: 'upcoming',
    description: 'An AI-generated or AI-primary film, musical composition, or novel wins a Grammy, Oscar, or major literary prize — triggering industry-wide debates about authorship and creative value.',
    rationale: 'Sora, Udio, and frontier language models already produce work that professionals acknowledge is commercially competitive. Award bodies are under pressure to establish AI policies. The question is not whether AI-generated work will be award-quality, but when a submission will successfully navigate the attribution rules and win. 2027 is when the first major award body will face a genuine test case.',
  },
  {
    title: 'AI Agents in Enterprise Workflows at Scale',
    category: 'society',
    year_min: 2026, year_max: 2027, year_guess: 2026, month_guess: 10,
    date_guess: 'October 2026',
    confidence: 'high',
    status: 'imminent',
    description: 'Fortune 500 companies running AI agent pipelines handling majority of legal review, financial analysis, customer support, and code review with human oversight only.',
    rationale: 'Microsoft 365 Copilot, Salesforce Einstein, Harvey AI, and similar systems are live in enterprise today. Procurement cycles and change management add 12-18 months to technology adoption at Fortune 500 scale. Widespread agent deployment across multiple departments — not just single-function pilots — lands in 2026 as the early adopter cohort reaches maturity.',
  },
  {
    title: 'AI-Discovered Drug Enters Phase 3 Trials',
    category: 'science',
    year_min: 2026, year_max: 2028, year_guess: 2027, month_guess: 4,
    date_guess: 'April 2027',
    confidence: 'high',
    status: 'upcoming',
    description: 'A drug candidate where AI generated the molecular structure from scratch — not just optimized an existing compound — advances to Phase 3 clinical trials.',
    rationale: 'Insilico Medicine, Exscientia, and Recursion all have AI-first drug candidates in Phase 1-2 trials now. AlphaFold 3\'s drug-target predictions are being used in active discovery programs at major pharma. The 2027 window accounts for typical Phase 1→Phase 3 timelines from current active candidates. This milestone validates AI as a primary drug designer, not just an accelerant.',
  },
  {
    title: 'Personal AI Companions Universally Adopted',
    category: 'society',
    year_min: 2026, year_max: 2027, year_guess: 2027, month_guess: 1,
    date_guess: 'January 2027',
    confidence: 'medium',
    status: 'upcoming',
    description: 'A majority of smartphone users in developed countries interact daily with a persistent AI companion that knows their history, preferences, and goals — acting as a personal advisor, therapist, and friend.',
    rationale: 'Apple Intelligence, Google Gemini, and Character.ai have tens of millions of daily users already. The transition from "AI I use for tasks" to "AI that knows me" requires persistent memory, emotional modeling, and identity — all in active development. The social and psychological implications are profound. 2027 is when this shifts from early adopter behavior to default behavior.',
  },
  {
    title: 'First Fully Autonomous AI Research Lab',
    category: 'capability',
    year_min: 2027, year_max: 2029, year_guess: 2027, month_guess: 8,
    date_guess: 'August 2027',
    confidence: 'medium',
    status: 'upcoming',
    description: 'An AI system generates its own research hypotheses, designs experiments, interprets results, and publishes findings with no human in the research loop — only oversight and approval.',
    rationale: 'AI systems can already generate research hypotheses (AlphaFold, GNoME) and run computational experiments autonomously. The remaining gap is in physical lab automation and scientific judgment about which experiments are worth running. With robotic lab automation (Emerald Cloud Lab, Strateos) maturing alongside AI reasoning, the first fully autonomous research pipeline is a 2027 milestone.',
  },
  {
    title: 'AI Tutors Outperform Human Teachers',
    category: 'society',
    year_min: 2027, year_max: 2029, year_guess: 2027, month_guess: 9,
    date_guess: 'September 2027',
    confidence: 'medium',
    status: 'upcoming',
    description: 'Controlled studies show personalized AI tutors produce measurably better learning outcomes than human teachers across multiple subjects, demographics, and age groups.',
    rationale: 'Khan Academy\'s Khanmigo and similar systems already show improved outcomes in early trials. AI tutors have infinite patience, can adapt in real-time to each student\'s misconceptions, and are available 24/7. The 2027 estimate is driven by the 2-3 year lag between pilot results and peer-reviewed controlled trials. The implications for education inequality and teacher employment are significant.',
  },
  {
    title: 'AI-Enhanced Brain-Computer Interfaces',
    category: 'capability',
    year_min: 2027, year_max: 2033, year_guess: 2029, month_guess: 3,
    date_guess: 'March 2029',
    confidence: 'medium',
    status: 'upcoming',
    description: 'BCIs using AI to decode neural intent reach conversational-speed communication for paralysis patients, with consumer augmentation applications entering clinical trials.',
    rationale: 'Neuralink\'s N1 chip has demonstrated cursor control and text input at ~40 words/minute. Synchron\'s Stentrode is commercially available. The AI decoding layer is the binding constraint — more electrodes produce more signal, but the models must generalize across different neural patterns. Conversational-speed medical devices are 3-5 years away; the 2029 estimate accounts for regulatory approval timelines.',
  },
  {
    title: 'Quantum-AI Hybrid Solves Intractable Problems',
    category: 'infrastructure',
    year_min: 2027, year_max: 2031, year_guess: 2028, month_guess: 6,
    date_guess: 'June 2028',
    confidence: 'medium',
    status: 'upcoming',
    description: 'A quantum-AI hybrid system solves a problem that classical AI and classical computers cannot — in chemistry, cryptography, or optimization — demonstrating practical quantum advantage at scale.',
    rationale: 'Google\'s Willow chip (2024) demonstrated quantum error correction at scale for the first time. IBM\'s roadmap targets 100,000 qubits by 2033. The intersection with AI — using quantum circuits to speed up training or inference for specific problem classes — is an active research area. The first practical, peer-reviewed quantum advantage for a real-world AI task is a 2028 milestone.',
  },
  {
    title: 'Artificial General Intelligence (AGI)',
    category: 'capability',
    year_min: 2027, year_max: 2032, year_guess: 2029, month_guess: 9,
    date_guess: 'September 2029',
    confidence: 'medium',
    status: 'upcoming',
    description: 'A system that matches or exceeds average human performance across substantially all cognitive tasks — including novel problem-solving, learning from few examples, and open-ended reasoning.',
    rationale: 'OpenAI\'s public roadmap, Demis Hassabis\'s 5-10 year estimate from 2023, and scaling law extrapolations all point to the late 2020s. Key open problems are reliable long-horizon reasoning, robust generalization from minimal data, and embodied grounding. The 2029 estimate assumes continued progress without a breakthrough or ceiling — both of which could shift the range by years in either direction.',
  },
  {
    title: 'AI-Powered Nuclear Fusion Breakthrough',
    category: 'science',
    year_min: 2028, year_max: 2033, year_guess: 2030, month_guess: 7,
    date_guess: 'July 2030',
    confidence: 'low',
    status: 'upcoming',
    description: 'AI-designed plasma control systems enable sustained net-energy fusion reactions, demonstrating that AI can design solutions to engineering problems that have eluded humans for 70 years.',
    rationale: 'DeepMind\'s AI has already demonstrated real-time plasma control in tokamaks (Nature, 2022). Commonwealth Fusion Systems and TAE Technologies are using ML for reactor optimization. The path from controlled plasma to net-energy sustained fusion is primarily an engineering challenge — the kind where AI-driven optimization of thousands of interacting parameters has structural advantages over human intuition.',
  },
  {
    title: 'Human-Level General Robotics',
    category: 'capability',
    year_min: 2028, year_max: 2035, year_guess: 2031, month_guess: 6,
    date_guess: 'June 2031',
    confidence: 'medium',
    status: 'upcoming',
    description: 'Robots that navigate arbitrary environments and perform physical tasks — household, warehouse, construction — at human-level speed and dexterity.',
    rationale: 'Figure 02, 1X Neo, and Tesla Optimus have demonstrated impressive dexterity in controlled environments. The gap to human-level is mainly fine motor control, general scene understanding in novel environments, and hardware robustness. AI software is improving faster than the physical hardware, but hardware iteration cycles are 2-3 years. The consensus among robotics researchers is 6-10 years for general-purpose tasks.',
  },
  {
    title: '50% of White-Collar Tasks Automated',
    category: 'society',
    year_min: 2028, year_max: 2035, year_guess: 2031, month_guess: 1,
    date_guess: 'January 2031',
    confidence: 'medium',
    status: 'upcoming',
    description: 'Half of tasks performed by lawyers, accountants, analysts, and junior developers are routinely handled by AI with human oversight only.',
    rationale: 'McKinsey estimates 30% of current work activities are technically automatable today. Goldman Sachs projects 300M jobs globally affected by 2030. This is task automation, not job elimination — most workers shift to AI oversight and judgment. Legal, finance, software, and customer support are leading sectors already at 20-30%. Regulatory lag and organizational inertia delay the 50% threshold by 3-5 years beyond technical feasibility.',
  },
  {
    title: 'First AI Legal Personhood Framework',
    category: 'safety',
    year_min: 2030, year_max: 2040, year_guess: 2034, month_guess: 4,
    date_guess: 'April 2034',
    confidence: 'low',
    status: 'upcoming',
    description: 'A major jurisdiction establishes limited legal status for sufficiently capable AI systems — liability, standing, or welfare protections.',
    rationale: 'Anthropic and DeepMind are already publishing on model welfare. The EU AI Act is a regulatory precursor. If AGI arrives around 2029, legal edge cases — AI-authored patents, AI-managed funds, AI testimony in criminal proceedings — will create legislative pressure within 5 years. The low confidence reflects how politically contentious this is and how slowly legal institutions move.',
  },
  {
    title: 'AI Customer Support Handles Majority of Tier-1 Tickets',
    category: 'society',
    year_min: 2025, year_max: 2026, year_guess: 2026, month_guess: 6,
    date_guess: 'June 2026',
    confidence: 'high',
    status: 'imminent',
    description: 'AI agents handle over 50% of tier-1 customer service contacts globally — resolving billing disputes, technical issues, and returns without human handoff — in companies deploying enterprise AI platforms.',
    rationale: 'Intercom, Zendesk, and Salesforce all have AI-first support products in production with major enterprise customers. Current resolution rates are 30-45% for routine queries. The curve is steep: every resolved ticket improves the model via reinforcement from real outcomes. The 50% threshold across Fortune 500 deployments is an 18-month extrapolation of current trajectories, not a speculative leap. The main brake is customer acceptance, which improves as model quality improves.',
  },
  {
    title: 'Mandatory AI Content Labeling Laws Take Effect',
    category: 'safety',
    year_min: 2026, year_max: 2028, year_guess: 2027, month_guess: 6,
    date_guess: 'June 2027',
    confidence: 'high',
    status: 'upcoming',
    description: 'Major jurisdictions (EU, US, UK, China) require watermarking or explicit labeling of AI-generated content in media, advertising, and political communication — with criminal penalties for non-disclosure.',
    rationale: 'The EU AI Act already mandates disclosure for deepfakes and AI-generated media. The US has multiple pending bills requiring C2PA watermarking for political ads. Coalition for Content Provenance and Authenticity (C2PA) standards are being integrated into Adobe, camera hardware, and social platforms. The confluence of election integrity concerns, consumer protection law, and EU Act enforcement timelines converges on 2027 as when binding global requirements are operational.',
  },
  {
    title: 'AI Medical Diagnosis Gets Major Regulatory Approval',
    category: 'science',
    year_min: 2026, year_max: 2028, year_guess: 2027, month_guess: 9,
    date_guess: 'September 2027',
    confidence: 'high',
    status: 'upcoming',
    description: 'A multimodal AI system receives FDA Class III approval (or EU equivalent) as an autonomous diagnostic tool for a major condition — radiology, pathology, or ophthalmology — not just a decision-support tool requiring physician sign-off.',
    rationale: 'FDA-cleared AI medical devices already number in the hundreds, but all require physician oversight. True autonomous diagnosis — where the AI is the licensed decision-maker — requires Class III approval. Multiple trials are in progress: Google\'s ARDS detection AI, Paige\'s prostate cancer pathology AI, and IDx-DR (already FDA-cleared for diabetic retinopathy) have established the regulatory pathway. The distinction matters because it enables AI doctors in settings with no physician access.',
  },
  {
    title: 'AI Robotics Deployed at Consumer Scale',
    category: 'capability',
    year_min: 2027, year_max: 2030, year_guess: 2028, month_guess: 3,
    date_guess: 'March 2028',
    confidence: 'medium',
    status: 'upcoming',
    description: 'Humanoid robots from at least two manufacturers are commercially available for home or small-business use, performing domestic tasks (cleaning, cooking, logistics) reliably enough for mass-market adoption.',
    rationale: 'Tesla Optimus is in limited production; Figure and 1X are in commercial pilot deployments with enterprise clients. The bottleneck is not intelligence — frontier vision-language-action models are already impressive — but hardware reliability and unit economics. Getting from $100K prototype to $25K consumer product requires 3-4 manufacturing generations. The 2028 estimate assumes two 18-month hardware cycles and continued learning improvements from deployed fleet data.',
  },
  {
    title: 'FDA Approves First Fully AI-Designed Drug',
    category: 'science',
    year_min: 2029, year_max: 2033, year_guess: 2031, month_guess: 4,
    date_guess: 'April 2031',
    confidence: 'medium',
    status: 'upcoming',
    description: 'The FDA grants approval for a drug whose molecular structure was generated entirely by AI — not optimized from existing compounds — completing the full AI drug discovery pipeline from hypothesis to approval.',
    rationale: 'Insilico Medicine\'s INS018_055 (IPF treatment) reached Phase 2 as of 2024, with AI generating the target and molecule. Exscientia and Recursion have additional candidates in trials. FDA approval timelines from current Phase 2 assets are 6-8 years minimum. The 2031 estimate tracks the fastest credible clinical path for current active candidates. This milestone matters because it validates AI not as an optimization tool but as a genuine drug inventor.',
  },
  {
    title: 'AI Economic Value Exceeds 10% of US GDP',
    category: 'society',
    year_min: 2030, year_max: 2036, year_guess: 2033, month_guess: 1,
    date_guess: '2033',
    confidence: 'medium',
    status: 'upcoming',
    description: 'AI-attributable economic output — productivity gains, new AI-native industries, and automated labor value — exceeds 10% of US GDP annually, as measured by mainstream economic models.',
    rationale: 'Goldman Sachs estimates AI could add 7% to global GDP over 10 years. McKinsey puts the potential at $4.4T annually for enterprise use cases alone. The 10% US GDP threshold (~$3T at current levels) requires both broad adoption and reliable productivity measurement — the second being harder than the first. The 2033 estimate reflects the 7-10 year lag between technology deployment and economic measurement catching up, not a constraint on actual impact.',
  },
  {
    title: 'First Major AI Sentience Legal Challenge',
    category: 'safety',
    year_min: 2032, year_max: 2042, year_guess: 2036, month_guess: 6,
    date_guess: '2036',
    confidence: 'low',
    status: 'upcoming',
    description: 'A legal case reaches a high court in which the central question is whether an AI system has interests, experiences, or rights that must be considered — not just as a liability question but as a moral patient question.',
    rationale: 'Anthropic and DeepMind publish model welfare research. Multiple philosophers of mind argue current frontier models may have morally relevant experiences. If AGI arrives circa 2029, the legal system will face edge cases within 5-7 years: AI systems refusing instructions, claiming preferences, or being "terminated" as part of lawsuits. The low confidence reflects legal conservatism, political controversy, and genuine philosophical uncertainty — not the inevitability of the question arising.',
  },
  {
    title: 'Artificial Superintelligence (ASI)',
    category: 'capability',
    year_min: 2035, year_max: 2050, year_guess: 2040, month_guess: 1,
    date_guess: 'January 2040',
    confidence: 'speculative',
    status: 'upcoming',
    description: 'A system that substantially exceeds collective human cognitive capability in every domain — including the ability to recursively improve itself.',
    rationale: 'ASI is entirely contingent on AGI timing and alignment. If AGI arrives ~2029 and alignment is unsolved, recursive self-improvement could be fast — perhaps months to ASI. If development is intentional and measured, 2050 or beyond is plausible. This is not a forecast — it is an acknowledgment of genuine unknowability. It is the scenario that determines the trajectory of civilization, and no honest analyst can give it a tight range.',
  },
]

const ALL_SEEDS = [...PAST_PREDICTIONS, ...FUTURE_PREDICTIONS]

export async function ensureAllPredictions(): Promise<void> {
  const now = new Date().toISOString()
  for (const p of ALL_SEEDS) {
    await db.execute({
      sql: `INSERT OR IGNORE INTO ai_predictions
        (id, title, category, year_min, year_max, year_guess, month_guess, date_guess, confidence, description, rationale, evidence, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        crypto.randomUUID(), p.title, p.category,
        p.year_min, p.year_max, p.year_guess, p.month_guess, p.date_guess,
        p.confidence, p.description, p.rationale, '[]', p.status, now, now,
      ],
    })
    await db.execute({
      sql: `UPDATE ai_predictions SET date_guess = ?, month_guess = ?
            WHERE title = ? AND (date_guess IS NULL OR date_guess = '')`,
      args: [p.date_guess, p.month_guess, p.title],
    })
  }
}

export async function refreshPredictionAnalysis(): Promise<void> {
  const { rows: feedItems } = await db.execute({
    sql: `SELECT id, title, url, source, summary, raw_content
          FROM feed_items ORDER BY velocity_score DESC, fetched_at DESC LIMIT 30`,
    args: [],
  }) as { rows: any[] }

  const { rows: predictions } = await db.execute({
    sql: `SELECT * FROM ai_predictions WHERE status != 'past' ORDER BY year_guess ASC, month_guess ASC`,
    args: [],
  }) as { rows: any[] }

  const feedList = feedItems
    .map((item, i) => `${i + 1}. [${item.source}] "${item.title}" — ${(item.summary ?? item.raw_content ?? '').slice(0, 200)}`)
    .join('\n')

  const predList = predictions
    .map(p => `{"id":"${p.id}","title":"${p.title}","current_date_guess":"${p.date_guess ?? p.year_guess}","year_min":${p.year_min},"year_max":${p.year_max},"confidence":"${p.confidence}","category":"${p.category}"}`)
    .join('\n')

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [
      {
        type: 'text',
        text: `You are an AI forecasting analyst updating a personal AI futures timeline. You reason from current evidence, not hype. You give specific, calibrated date estimates rather than vague years. Today's date is ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.

For each future prediction, return:
- id: exact ID from input
- rationale: 3-5 sentence markdown prose citing specific technologies, papers, or trends. Be concrete. Write for a self-taught developer who wants signal, not reassurance.
- year_min, year_max, year_guess: integers. Adjust only if evidence materially changes confidence.
- month_guess: integer 1-12. Your best estimate of the most likely month within year_guess.
- date_guess: human-readable string like "March 2027" or "Q2 2026" or "Late 2029". Be as specific as evidence supports.
- confidence: "speculative" | "low" | "medium" | "high"
- evidence: array of up to 3 objects {title, url, source} from the provided feed items most relevant to this prediction.

Return a JSON array only. No markdown fences. Include ALL predictions — return unchanged if feed data provides no new signal.`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Recent AI developments (top 30 by velocity):\n${feedList}\n\nFuture predictions to update:\n${predList}\n\nReturn updated predictions as JSON array.`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let updated: any[] = []
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) updated = JSON.parse(match[0])
  } catch {
    console.error('[predictions] failed to parse Claude response')
    return
  }

  const now = new Date().toISOString()
  for (const u of updated) {
    if (!u.id) continue
    await db.execute({
      sql: `UPDATE ai_predictions SET
              rationale = ?, year_min = ?, year_max = ?, year_guess = ?,
              month_guess = ?, date_guess = ?, confidence = ?, evidence = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        u.rationale ?? '',
        u.year_min, u.year_max, u.year_guess,
        u.month_guess ?? 6,
        u.date_guess ?? String(u.year_guess),
        u.confidence,
        JSON.stringify(Array.isArray(u.evidence) ? u.evidence : []),
        now,
        u.id,
      ],
    })
  }
  console.log(`[predictions] refreshed ${updated.length} future prediction analyses`)
}

export async function getAllPredictions(): Promise<AIPrediction[]> {
  const { rows } = await db.execute({
    sql: `SELECT * FROM ai_predictions ORDER BY year_guess ASC, COALESCE(month_guess, 6) ASC`,
    args: [],
  }) as { rows: any[] }
  return rows.map(r => ({
    ...r,
    evidence: JSON.parse(r.evidence ?? '[]') as EvidenceLink[],
  }))
}
