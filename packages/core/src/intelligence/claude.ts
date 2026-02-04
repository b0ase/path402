/**
 * Claude Intelligence Provider
 *
 * Uses Anthropic's Claude API for token evaluation and speculation decisions.
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseIntelligenceProvider } from './provider.js';

export class ClaudeIntelligenceProvider extends BaseIntelligenceProvider {
  name = 'claude';
  model: string;
  private client: Anthropic;

  constructor(apiKey?: string, model = 'claude-sonnet-4-20250514') {
    super();
    this.model = model;
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
  }

  protected async callLLM(prompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    // Extract text from response
    const textBlock = response.content.find(block => block.type === 'text');
    if (textBlock && textBlock.type === 'text') {
      return textBlock.text;
    }

    throw new Error('No text response from Claude');
  }
}
