export type AIProtocol = 'chat-completions' | 'responses' | 'anthropic';
export interface AIProvider {
  id: string;
  name: string;
  baseUrl: string;
  protocol: AIProtocol;
  models: string[];
  capabilities: { images: boolean; tools: boolean };
  maxOutputTokens: number;
  contextWindowTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  thinkingBudgetTokens?: number;
  temperature?: number;
}
export interface AIConfiguration {
  providers: AIProvider[];
  defaultModel: { providerId: string; model: string } | null;
}
export type AIContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' };
export interface AIRequest {
  providerId?: string;
  model?: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string | AIContent[] }[];
  tools?: { name: string; description?: string; parameters: Record<string, unknown> }[];
}
export interface AIToolCall {
  id: string;
  name: string;
  arguments: string;
}
export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}
export type AIEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; index: number; delta: Partial<AIToolCall> }
  | { type: 'usage'; usage: AIUsage }
  | { type: 'complete'; reason: 'stop' | 'tool-calls' }
  | { type: 'failure'; message: string; reason: 'error' | 'refusal' | 'truncated' | 'cancelled' };
export interface AIResult {
  text: string;
  toolCalls: AIToolCall[];
  usage?: AIUsage;
}
export type AISettingsAction =
  | { action: 'read' }
  | { action: 'importLegacy' }
  | { action: 'save'; provider: AIProvider; apiKey?: string | null }
  | { action: 'remove'; id: string }
  | { action: 'default'; value: AIConfiguration['defaultModel'] }
  | { action: 'models'; id: string }
  | { action: 'test'; id: string; model: string };
export interface AISettingsState extends AIConfiguration {
  credentials: Record<string, { configured: boolean; persistent: boolean }>;
  availableModels?: string[];
  testResult?: string;
  legacyAvailable?: boolean;
}
