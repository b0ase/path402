/**
 * Ollama Intelligence Provider (Local)
 *
 * Uses locally hosted Ollama for cost-efficient token evaluation.
 */

import { BaseIntelligenceProvider } from './provider.js';

export class OllamaIntelligenceProvider extends BaseIntelligenceProvider {
    name = 'ollama';
    model: string;
    private endpoint: string;

    constructor(model = 'llama3', endpoint = 'http://localhost:11434') {
        super();
        this.model = model;
        this.endpoint = endpoint;
    }

    protected async callLLM(prompt: string): Promise<string> {
        try {
            const response = await fetch(`${this.endpoint}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    stream: false,
                    format: 'json',
                }),
            });

            if (!response.ok) {
                throw new Error(`Ollama error: ${response.statusText}`);
            }

            const data = await response.json() as { response: string };
            return data.response;
        } catch (e: any) {
            console.error(`[Ollama] Failed to call local LLM: ${e.message}`);
            throw e;
        }
    }
}
