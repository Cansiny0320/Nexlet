export type Capability = 'ocr' | 'translation';
export interface CapabilityDefinition {
  id: string;
  name: string;
  capability: Capability;
  locality: 'local' | 'cloud';
  languages: string[];
  entry: string;
  configSchema?: Record<string, unknown>;
}
export interface CapabilityProvider extends Omit<CapabilityDefinition, 'entry'> {
  pluginId: string;
  version: string;
}
export interface OcrResult {
  text: string;
  language?: string;
  blocks?: { text: string; confidence?: number; points: { x: number; y: number }[] }[];
}
export interface TranslationResult {
  text: string;
  detectedLanguage?: string;
}
export type CapabilityRequest =
  | { capability: 'ocr'; providerId?: string; image: Uint8Array }
  | {
      capability: 'translation';
      providerId?: string;
      text: string;
      sourceLanguage?: string;
      targetLanguage: string;
    };
export interface CapabilityState {
  providers: CapabilityProvider[];
  defaults: Partial<Record<Capability, string>>;
}
export interface CapabilitySettingsState extends CapabilityState {
  configurations: Record<string, Record<string, unknown>>;
}
export type CapabilitySettingsAction =
  | { action: 'read' }
  | { action: 'default'; capability: Capability; id: string | null }
  | { action: 'configure'; id: string; value: Record<string, unknown> };
