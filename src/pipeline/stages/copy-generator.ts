/**
 * Copy Generator Pipeline Stage
 *
 * Generates ad copy using Claude API with a multi-agent review pipeline:
 * Maya (draft) → Vera + Marcus (parallel review) → Reviser (conditional fixes)
 */

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { pipelineConfig } from '../config.js';
import { MAYA_SYSTEM_PROMPT } from '../prompts/maya-system-prompt.js';
import { VERA_SYSTEM_PROMPT } from '../prompts/vera-system-prompt.js';
import { MARCUS_SYSTEM_PROMPT } from '../prompts/marcus-system-prompt.js';
import { REVISER_SYSTEM_PROMPT } from '../prompts/reviser-system-prompt.js';
import type { CopyResult, VeraReview, MarcusReview } from '../types.js';

interface CopyGenerationContext {
  videoAnalysis: object;
  angle: string;
  format: string;
  messenger: string;
  deliverableName: string;
}

function extractJson<T>(text: string): T {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Extract JSON from markdown code blocks or surrounding text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // Try fixing common LLM JSON issues
        let fixed = match[0];
        // Remove trailing commas before } or ]
        fixed = fixed.replace(/,\s*([}\]])/g, '$1');
        // Fix unescaped newlines inside string values
        fixed = fixed.replace(/(?<=:\s*"[^"]*)\n([^"]*")/g, '\\n$1');
        try {
          return JSON.parse(fixed);
        } catch {
          // Last resort: try to extract just primaryText and headline fields
          const ptMatch = fixed.match(/"primaryText"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
          const hlMatch = fixed.match(/"headline"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
          if (ptMatch && hlMatch) {
            return { primaryText: ptMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'), headline: hlMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n') } as T;
          }
          // For review objects, try extracting verdict/flags/claims
          const verdictMatch = fixed.match(/"verdict"\s*:\s*"([^"]*)"/);
          if (verdictMatch) {
            const flagsMatch = fixed.match(/"flags"\s*:\s*(\[[\s\S]*?\])/);
            const claimsMatch = fixed.match(/"claims"\s*:\s*(\[[\s\S]*?\])/);
            const result: Record<string, any> = { verdict: verdictMatch[1] };
            if (flagsMatch) try { result.flags = JSON.parse(flagsMatch[1]); } catch { result.flags = []; }
            if (claimsMatch) try { result.claims = JSON.parse(claimsMatch[1]); } catch { result.claims = []; }
            if (!result.flags) result.flags = [];
            if (!result.claims) result.claims = [];
            return result as T;
          }
        }
      }
    }
    throw new Error(`Failed to extract JSON from response: ${text.slice(0, 200)}`);
  }
}

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

async function callClaude(
  client: Anthropic,
  system: string,
  userMessage: string
): Promise<string> {
  const response = await client.messages.create({
    model: pipelineConfig.claudeModel,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }
  return textBlock.text;
}

/**
 * Generate ad copy with multi-agent review pipeline.
 *
 * 1. Maya drafts copy based on video analysis and creative context
 * 2. Vera (compliance) and Marcus (medical accuracy) review in parallel
 * 3. If either flags issues, Reviser applies minimal fixes
 */
export async function generateCopy(
  context: CopyGenerationContext
): Promise<CopyResult> {
  const client = getClient();

  // Step 1: Maya drafts copy
  console.log(`[copy-gen] Maya drafting copy for "${context.deliverableName}"...`);
  const mayaMessage = `Write ad copy for this video ad:

Ad Name: ${context.deliverableName}
Angle: ${context.angle}
Format: ${context.format}
Messenger: ${context.messenger}
Video Analysis:
${JSON.stringify(context.videoAnalysis, null, 2)}

Write copy that matches the video content and the specified angle.
Assume the audience is Problem Aware unless the angle suggests otherwise.
Return ONLY valid JSON: { "primaryText": "...", "headline": "...", "description": "..." }
The description should be a short link description (~10-15 words) that appears below the headline.`;

  const mayaRaw = await callClaude(client, MAYA_SYSTEM_PROMPT, mayaMessage);
  const draft = extractJson<{ primaryText: string; headline: string; description: string }>(mayaRaw);

  if (!draft.primaryText || !draft.headline) {
    throw new Error(`Maya returned incomplete copy: ${JSON.stringify(draft)}`);
  }
  if (!draft.description) draft.description = 'Learn more at Superpower';
  console.log(`[copy-gen] Maya draft complete (${draft.primaryText.length} chars)`);

  // Step 2: Review loop (max 2 rounds)
  const MAX_REVIEW_ROUNDS = 2;
  let currentCopy = draft;
  let vera: VeraReview;
  let marcus: MarcusReview;
  let revised = false;

  for (let round = 1; round <= MAX_REVIEW_ROUNDS; round++) {
    console.log(`[copy-gen] Review round ${round}/${MAX_REVIEW_ROUNDS}...`);
    const reviewMessage = `Review this ad copy:

Primary Text: ${currentCopy.primaryText}

Headline: ${currentCopy.headline}`;

    const [veraRaw, marcusRaw] = await Promise.all([
      callClaude(client, VERA_SYSTEM_PROMPT, reviewMessage),
      callClaude(client, MARCUS_SYSTEM_PROMPT, reviewMessage),
    ]);

    vera = extractJson<VeraReview>(veraRaw);
    marcus = extractJson<MarcusReview>(marcusRaw);

    console.log(`[copy-gen] Round ${round}: Vera=${vera.verdict} (${vera.flags.length} flags), Marcus=${marcus.verdict} (${marcus.claims.length} claims)`);

    const needsRevision = vera.verdict !== 'PASS' || marcus.verdict !== 'GREEN';
    if (!needsRevision) {
      console.log(`[copy-gen] All clear after round ${round}`);
      break;
    }

    if (round < MAX_REVIEW_ROUNDS) {
      console.log(`[copy-gen] Revision needed — calling Reviser...`);
      const reviserMessage = `Original ad copy:
Primary Text: ${currentCopy.primaryText}
Headline: ${currentCopy.headline}

Compliance Review (Vera):
${JSON.stringify(vera, null, 2)}

Medical Accuracy Review (Marcus):
${JSON.stringify(marcus, null, 2)}

Apply the minimum changes to fix all RED and YELLOW flags.
Return ONLY valid JSON: { "primaryText": "...", "headline": "...", "description": "..." }`;

      const reviserRaw = await callClaude(client, REVISER_SYSTEM_PROMPT, reviserMessage);
      currentCopy = extractJson<{ primaryText: string; headline: string; description: string }>(reviserRaw);

      if (!currentCopy.primaryText || !currentCopy.headline) {
        throw new Error(`Reviser returned incomplete copy: ${JSON.stringify(currentCopy)}`);
      }
      if (!currentCopy.description) currentCopy.description = draft.description;
      console.log(`[copy-gen] Revision complete (${currentCopy.primaryText.length} chars)`);
      revised = true;
    } else {
      console.warn(`[copy-gen] Round ${round} still has issues — accepting best result`);
      revised = true;
    }
  }

  return {
    primaryText: currentCopy.primaryText,
    headline: currentCopy.headline,
    description: currentCopy.description || 'Learn more at Superpower',
    reviewLog: {
      vera: vera!,
      marcus: marcus!,
      revised,
    },
  };
}
