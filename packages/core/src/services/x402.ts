/**
 * X402 Agent Chaining Service
 *
 * Orchestrates multiple x402agency agents to fulfill complex tasks.
 * Handles discovery, authentication, payment, async polling, and
 * output piping between chain steps.
 *
 * Protocol flow per agent:
 *   1. GET /.well-known/x402-info  → capabilities + pricing
 *   2. POST /generate (or /transcribe etc.) → 402 with payment amount
 *   3. Retry with x-bsv-payment header → accepted (sync or async)
 *   4. Poll /status/{id} every 15s until terminal state
 *   5. Automatic refund on upstream failure
 */

import { getWallet, recordAcquisition } from './wallet.js';

// ── Types ────────────────────────────────────────────────────────

export interface ChainStep {
  agentName: string;
  agentUrl: string;
  action: string;
  costSats: number;
  output: string;
  outputUrl?: string;
  txid?: string;
  durationMs: number;
}

export interface ChainResult {
  success: boolean;
  totalCostSats: number;
  totalDurationMs: number;
  finalOutput: string;
  finalOutputUrl?: string;
  steps: ChainStep[];
  error?: string;
  [key: string]: unknown;
}

export interface AgentManifest {
  name: string;
  description: string;
  capabilities: string[];
  pricing: Record<string, { amount: number; currency: string; description?: string }>;
  endpoints: Record<string, { method: string; path: string; description?: string }>;
  delivery: 'sync' | 'async';
  pollInterval?: number;
  maxWait?: number;
}

export interface AgentDefinition {
  name: string;
  url: string;
  capability: string;
  estimateSats: number;
}

// ── Agent Registry ───────────────────────────────────────────────

const AGENTS: Record<string, AgentDefinition> = {
  'image': {
    name: 'Banana Agent',
    url: 'https://nano-banana-pro.x402agency.com',
    capability: 'text-to-image',
    estimateSats: 380,       // ~$0.19
  },
  'video-veo': {
    name: 'Veo Agent',
    url: 'https://veo-3-1-fast.x402agency.com',
    capability: 'text-to-video',
    estimateSats: 1500,      // ~$0.75
  },
  'video-kling': {
    name: 'Kling Agent',
    url: 'https://kling.x402agency.com',
    capability: 'text-to-video',
    estimateSats: 1260,      // ~$0.63
  },
  'transcribe': {
    name: 'Whisper Agent',
    url: 'https://whisper-large-v3-turbo.x402agency.com',
    capability: 'speech-to-text',
    estimateSats: 2,         // ~$0.0006/min
  },
  'research': {
    name: 'X Research Agent',
    url: 'https://x-research.x402agency.com',
    capability: 'tweet-search',
    estimateSats: 125,       // ~$0.06
  },
  'host': {
    name: 'NanoStore',
    url: 'https://nanostore.babbage.systems',
    capability: 'file-hosting',
    estimateSats: 1,         // ~$0.0004
  },
  'message': {
    name: 'MessageBox',
    url: 'https://messagebox.babbage.systems',
    capability: 'messaging',
    estimateSats: 0,
  },
};

// ── Discovery ────────────────────────────────────────────────────

/**
 * Discover an x402 agent's capabilities and pricing.
 */
export async function discoverAgent(agentUrl: string): Promise<AgentManifest | null> {
  try {
    const res = await fetch(`${agentUrl}/.well-known/x402-info`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json() as AgentManifest;
  } catch (err) {
    console.warn(`[x402] Discovery failed for ${agentUrl}:`, err);
    return null;
  }
}

/**
 * Fetch the full agent registry from x402agency.
 */
export async function fetchAgentRegistry(): Promise<Record<string, any> | null> {
  try {
    const res = await fetch('https://x402agency.com/.well-known/agents', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[x402] Failed to fetch agent registry:', err);
    return null;
  }
}

// ── Agent Execution ──────────────────────────────────────────────

interface AgentCallOptions {
  agentUrl: string;
  endpoint: string;
  method?: string;
  body: Record<string, any>;
  maxBudgetSats: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface AgentCallResult {
  success: boolean;
  output: string;
  outputUrl?: string;
  costSats: number;
  txid?: string;
  error?: string;
  durationMs: number;
}

/**
 * Execute a single agent call with x402 payment protocol.
 *
 * Flow:
 *   1. POST to agent endpoint → expect 402
 *   2. Read payment amount from 402 response
 *   3. Check budget, create BSV payment
 *   4. Retry POST with x-bsv-payment header
 *   5. If async: poll /status/{id} until complete
 */
async function callAgent(opts: AgentCallOptions): Promise<AgentCallResult> {
  const {
    agentUrl,
    endpoint,
    method = 'POST',
    body,
    maxBudgetSats,
    timeoutMs = 300_000,
    pollIntervalMs = 15_000,
  } = opts;

  const startTime = Date.now();
  const url = `${agentUrl}${endpoint}`;

  try {
    // Step 1: Initial request — expect 402
    const initialRes = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // If 200, agent is free (e.g. MessageBox health check)
    if (initialRes.ok) {
      const data = await initialRes.json().catch(() => ({}));
      return {
        success: true,
        output: JSON.stringify(data),
        outputUrl: data.url || data.output_url || undefined,
        costSats: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 2: Parse 402 payment requirements
    if (initialRes.status !== 402) {
      return {
        success: false,
        output: '',
        costSats: 0,
        error: `Agent returned HTTP ${initialRes.status}, expected 402`,
        durationMs: Date.now() - startTime,
      };
    }

    const paymentAmount = parseInt(initialRes.headers.get('x-bsv-payment-amount') || '0');
    const paymentDestination = initialRes.headers.get('x-bsv-payment-destination') || '';

    // Try to get payment info from body if not in headers
    let paymentBody: any = {};
    try { paymentBody = await initialRes.json(); } catch {}

    const requiredSats = paymentAmount || paymentBody.amount || paymentBody.satoshis || 0;
    const destination = paymentDestination || paymentBody.paymentDestination || paymentBody.address || '';

    if (requiredSats <= 0) {
      return {
        success: false,
        output: '',
        costSats: 0,
        error: 'Agent returned 402 but no payment amount specified',
        durationMs: Date.now() - startTime,
      };
    }

    // Step 3: Budget check
    if (requiredSats > maxBudgetSats) {
      return {
        success: false,
        output: '',
        costSats: 0,
        error: `Agent requires ${requiredSats} sats, budget is ${maxBudgetSats} sats`,
        durationMs: Date.now() - startTime,
      };
    }

    const wallet = getWallet();
    if (requiredSats > wallet.balance) {
      return {
        success: false,
        output: '',
        costSats: 0,
        error: `Agent requires ${requiredSats} sats, wallet has ${wallet.balance} sats`,
        durationMs: Date.now() - startTime,
      };
    }

    // Step 4: Create payment and retry
    // In production this creates a real BSV transaction via MetaNet Client.
    // For now we use the wallet's recordAcquisition to debit the balance
    // and construct a payment proof header.
    const paymentProof = createPaymentProof(requiredSats, destination);

    const paidRes = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-bsv-payment': paymentProof.txHex,
        'x-bsv-payment-satoshis': String(requiredSats),
      },
      body: JSON.stringify(body),
    });

    if (!paidRes.ok && paidRes.status !== 202) {
      return {
        success: false,
        output: '',
        costSats: requiredSats,
        error: `Paid request returned HTTP ${paidRes.status}`,
        durationMs: Date.now() - startTime,
      };
    }

    // Record the spend
    recordAcquisition(
      `$x402/${agentUrl.replace('https://', '')}`,
      requiredSats,
      0,
      agentUrl
    );

    const paidData: any = await paidRes.json().catch(() => ({}));

    // Step 5: Handle sync vs async delivery
    if (paidRes.status === 200) {
      // Sync — result is immediate
      const outputUrl = paidData.url || paidData.output_url || paidData.result?.url || '';
      return {
        success: true,
        output: outputUrl || JSON.stringify(paidData),
        outputUrl: outputUrl || undefined,
        costSats: requiredSats,
        txid: paymentProof.txid,
        durationMs: Date.now() - startTime,
      };
    }

    // Async — poll /status/{id}
    const jobId = paidData.id || paidData.job_id || paidData.prediction_id || '';
    if (!jobId) {
      return {
        success: true,
        output: JSON.stringify(paidData),
        costSats: requiredSats,
        txid: paymentProof.txid,
        durationMs: Date.now() - startTime,
      };
    }

    // Poll loop
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(pollIntervalMs);

      const statusRes = await fetch(`${agentUrl}/status/${jobId}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!statusRes.ok) continue;

      const statusData: any = await statusRes.json();
      const status = statusData.status || statusData.state || '';

      if (status === 'succeeded' || status === 'completed') {
        const outputUrl = statusData.url || statusData.output_url ||
          statusData.output?.url || statusData.result?.url ||
          (Array.isArray(statusData.output) ? statusData.output[0] : '') || '';
        return {
          success: true,
          output: outputUrl || JSON.stringify(statusData),
          outputUrl: outputUrl || undefined,
          costSats: requiredSats,
          txid: paymentProof.txid,
          durationMs: Date.now() - startTime,
        };
      }

      if (status === 'failed' || status === 'canceled') {
        return {
          success: false,
          output: '',
          costSats: requiredSats, // may get refunded automatically
          txid: paymentProof.txid,
          error: `Agent job ${status}: ${statusData.error || statusData.message || 'unknown'}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Still processing — continue polling
    }

    return {
      success: false,
      output: '',
      costSats: requiredSats,
      txid: paymentProof.txid,
      error: `Agent job timed out after ${timeoutMs}ms`,
      durationMs: Date.now() - startTime,
    };

  } catch (err: any) {
    return {
      success: false,
      output: '',
      costSats: 0,
      error: err.message,
      durationMs: Date.now() - startTime,
    };
  }
}

// ── Payment ──────────────────────────────────────────────────────

interface PaymentProof {
  txid: string;
  txHex: string;
}

/**
 * Create a BSV payment proof for an x402 agent.
 *
 * In production this calls MetaNet Client at localhost:3321 to create
 * and sign a real BSV transaction. For now it creates a placeholder
 * that allows the protocol flow to work end-to-end.
 *
 * TODO: Wire to MetaNet Client wallet API:
 *   POST http://localhost:3321/v1/transactions/create
 *   { outputs: [{ to: destination, satoshis: amount }] }
 */
function createPaymentProof(amountSats: number, destination: string): PaymentProof {
  // Placeholder — will be replaced with real MetaNet Client integration
  const txid = `x402_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    txid,
    txHex: JSON.stringify({
      protocol: 'x402',
      version: 1,
      amount: amountSats,
      destination,
      timestamp: Date.now(),
      txid,
    }),
  };
}

// ── Pipeline Planning ────────────────────────────────────────────

export type PipelineStep =
  | { type: 'image'; prompt: string }
  | { type: 'video-kling'; prompt?: string; imageUrl?: string; duration?: number }
  | { type: 'video-veo'; prompt?: string; imageUrl?: string; duration?: number; audio?: boolean }
  | { type: 'host'; fileUrl: string }
  | { type: 'transcribe'; audioUrl: string }
  | { type: 'research'; query: string; pages?: number };

/**
 * Parse a natural language prompt into a pipeline of agent steps.
 * Uses simple keyword matching. In production, route through the
 * intelligence provider for more sophisticated planning.
 */
export function planPipeline(prompt: string): PipelineStep[] {
  const lower = prompt.toLowerCase();
  const steps: PipelineStep[] = [];

  const wantsImage = /\b(image|picture|photo|illustration|art|draw|generate\s+an?\s+image)\b/.test(lower);
  const wantsVideo = /\b(video|clip|animation|animate|movie|film)\b/.test(lower);
  const wantsTranscribe = /\b(transcri|speech.to.text|stt|audio.to.text)\b/.test(lower);
  const wantsResearch = /\b(research|search\s+twitter|search\s+x|tweet|trending)\b/.test(lower);

  if (wantsResearch) {
    steps.push({ type: 'research', query: prompt });
  }

  if (wantsTranscribe) {
    steps.push({ type: 'transcribe', audioUrl: '' }); // caller provides URL
  }

  if (wantsImage || wantsVideo) {
    // Always generate image first (needed as video input)
    steps.push({ type: 'image', prompt });

    if (wantsVideo) {
      // Prefer Kling (cheaper) unless prompt mentions "high quality" / "veo"
      const useVeo = /\b(veo|high.quality|cinematic|hd|4k)\b/.test(lower);
      if (useVeo) {
        steps.push({ type: 'video-veo', audio: true });
      } else {
        steps.push({ type: 'video-kling' });
      }
    }

    // Host the final output
    steps.push({ type: 'host', fileUrl: '' }); // filled by chain executor
  }

  // If nothing matched, default to image generation
  if (steps.length === 0) {
    steps.push({ type: 'image', prompt });
    steps.push({ type: 'host', fileUrl: '' });
  }

  return steps;
}

// ── Chain Executor ───────────────────────────────────────────────

/**
 * Execute a chain of x402 agents based on a natural language prompt.
 * Plans the pipeline, executes each step, pipes outputs forward.
 */
export async function chainAgents(prompt: string, maxBudget: number): Promise<ChainResult> {
  const pipeline = planPipeline(prompt);
  const steps: ChainStep[] = [];
  let totalCost = 0;
  let remainingBudget = maxBudget;
  let lastOutput = '';
  let lastOutputUrl: string | undefined;
  const startTime = Date.now();

  console.log(`[x402] Planned pipeline: ${pipeline.map(s => s.type).join(' → ')}`);
  console.log(`[x402] Budget: ${maxBudget} sats`);

  for (const step of pipeline) {
    const agent = resolveAgent(step);
    if (!agent) {
      return {
        success: false,
        totalCostSats: totalCost,
        totalDurationMs: Date.now() - startTime,
        finalOutput: lastOutput,
        steps,
        error: `No agent found for step type: ${step.type}`,
      };
    }

    // Estimate cost check before calling
    if (agent.estimateSats > remainingBudget) {
      return {
        success: false,
        totalCostSats: totalCost,
        totalDurationMs: Date.now() - startTime,
        finalOutput: lastOutput,
        steps,
        error: `Insufficient budget for ${agent.name}: needs ~${agent.estimateSats} sats, have ${remainingBudget}`,
      };
    }

    // Build request body based on step type
    const { endpoint, body } = buildAgentRequest(step, lastOutput, lastOutputUrl);

    console.log(`[x402] Step: ${agent.name} (${step.type}) → ${agent.url}${endpoint}`);

    const result = await callAgent({
      agentUrl: agent.url,
      endpoint,
      body,
      maxBudgetSats: remainingBudget,
    });

    steps.push({
      agentName: agent.name,
      agentUrl: agent.url,
      action: step.type,
      costSats: result.costSats,
      output: result.output,
      outputUrl: result.outputUrl,
      txid: result.txid,
      durationMs: result.durationMs,
    });

    totalCost += result.costSats;
    remainingBudget -= result.costSats;

    if (!result.success) {
      return {
        success: false,
        totalCostSats: totalCost,
        totalDurationMs: Date.now() - startTime,
        finalOutput: lastOutput,
        steps,
        error: `${agent.name} failed: ${result.error}`,
      };
    }

    lastOutput = result.output;
    lastOutputUrl = result.outputUrl;
  }

  return {
    success: true,
    totalCostSats: totalCost,
    totalDurationMs: Date.now() - startTime,
    finalOutput: lastOutput,
    finalOutputUrl: lastOutputUrl,
    steps,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

function resolveAgent(step: PipelineStep): AgentDefinition | null {
  switch (step.type) {
    case 'image':      return AGENTS['image'];
    case 'video-kling': return AGENTS['video-kling'];
    case 'video-veo':  return AGENTS['video-veo'];
    case 'host':       return AGENTS['host'];
    case 'transcribe': return AGENTS['transcribe'];
    case 'research':   return AGENTS['research'];
    default:           return null;
  }
}

function buildAgentRequest(
  step: PipelineStep,
  prevOutput: string,
  prevOutputUrl?: string
): { endpoint: string; body: Record<string, any> } {
  switch (step.type) {
    case 'image':
      return {
        endpoint: '/generate',
        body: { prompt: step.prompt, aspect_ratio: '16:9' },
      };

    case 'video-kling':
      return {
        endpoint: prevOutputUrl ? '/image-to-video' : '/text-to-video',
        body: {
          prompt: step.prompt || 'Animate this image with cinematic motion',
          image_url: prevOutputUrl || step.imageUrl,
          duration: step.duration || 3,
          model: 'kling-video/v2.5/master/image-to-video',
        },
      };

    case 'video-veo':
      return {
        endpoint: '/generate',
        body: {
          prompt: step.prompt || 'Create a cinematic video from this image',
          image_url: prevOutputUrl || step.imageUrl,
          duration: step.duration || 4,
          audio_mode: step.audio ? 'generate' : 'none',
        },
      };

    case 'host':
      return {
        endpoint: '/upload',
        body: {
          url: step.fileUrl || prevOutputUrl || prevOutput,
          retention_period: '1year',
        },
      };

    case 'transcribe':
      return {
        endpoint: '/transcribe',
        body: {
          audio_url: step.audioUrl || prevOutputUrl || prevOutput,
        },
      };

    case 'research':
      return {
        endpoint: '/search',
        body: {
          query: step.query,
          max_results: 100,
          pages: step.pages || 1,
          sort: 'relevancy',
        },
      };

    default:
      return { endpoint: '/', body: {} };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
