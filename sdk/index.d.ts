import type { PluginSdkExtensions, PluginInputExtensions, PluginClipboardExtensions, SdkPermission } from './extensions';
export * from './extensions';
/** Type declarations for the public plugin bridge, not Nexlet's internal HostApi. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Unsubscribe = () => void;
export type PluginPermission = 'clipboard.read' | 'clipboard.write' | 'shell.openExternal' | 'network.request' | 'secrets' | SdkPermission;
export type InputSource = 'input' | 'paste' | 'drop' | 'selection';

export interface InputResource {
  id: string;
  name: string;
  size: number;
  isDirectory: boolean;
  path?: string;
  mime?: string;
}

export type PluginContext = { id: string; code: string; from: InputSource } & (
  | { type: 'text'; payload: string }
  | { type: 'files'; payload: InputResource[] }
  | { type: 'image'; payload: InputResource }
);

export type ContentMatch =
  | { type: 'text'; minLength?: number; maxLength?: number }
  | { type: 'regex'; pattern: string; flags?: string; minLength?: number; maxLength?: number }
  | { type: 'image' }
  | { type: 'files'; extensions?: string[]; fileType?: 'file' | 'directory'; minCount?: number; maxCount?: number };

export type AppLocale = 'zh-CN' | 'zh-Hant' | 'en';
export type PluginLocales = Partial<Record<AppLocale, { name?: string; description?: string; category?: string }>>;

export interface PluginFeature {
  locales?: PluginLocales;
  code: string;
  name: string;
  keywords: string[];
  matches?: ContentMatch[];
}

export interface PluginManifest {
  locales?: PluginLocales;
  id: string;
  name: string;
  version: string;
  description?: string;
  apiVersion: 1;
  main: string;
  backend?: string;
  icon?: string;
  permissions: PluginPermission[];
  features: PluginFeature[];
}

export interface PluginInfo {
  name: string;
  version: string;
  code: string;
  /** Legacy text payload, limited to 65,536 characters. Use context() for full input. */
  payload: string;
}

export interface NetworkRequest {
  /** Unique among this session's in-flight requests. */
  id: string;
  /** HTTPS or loopback HTTP; redirects are not followed. */
  url: string;
  method?: 'GET' | 'POST';
  /** Only Accept, Content-Type, Authorization and X-API-Key are supported. */
  headers?: Record<string, string>;
  /** POST only; maximum 256 KB in UTF-8. */
  body?: string;
  /** 1–120,000 milliseconds; defaults to 30,000. */
  timeoutMs?: number;
}

export interface NetworkResponse {
  status: number;
  /** Response body decoded as UTF-8; maximum 2 MB. */
  body: string;
}

export interface PluginApi extends PluginSdkExtensions {
  info(): Promise<PluginInfo>;
  context(): Promise<PluginContext>;
  input: PluginInputExtensions & {
    /** Read an input resource granted to this session; not an arbitrary file path. */
    read(id: string): Promise<Uint8Array>;
  };
  /** Callbacks have a bounded wait in the current host; see SDK documentation. */
  onReady(callback: () => void | Promise<void>): Unsubscribe;
  onEnter(callback: (context: PluginContext) => void | Promise<void>): Unsubscribe;
  onOut(callback: (context: PluginContext) => void | Promise<void>): Unsubscribe;
  onDetach(callback: () => void | Promise<void>): Unsubscribe;
  /** Legacy reactivation notification. Prefer onEnter for full structured input. */
  onActivate(callback: (context: Pick<PluginInfo, 'code' | 'payload'>) => void): Unsubscribe;
  storage: {
    keys(): Promise<string[]>;
    remove(key: string): Promise<boolean>;
    /** Missing values return null. T is a caller assertion, not runtime validation. */
    get<T = JsonValue>(key: string): Promise<T | null>;
    /** JSON values only. All stored values together are limited to 1 MB per plugin. */
    set(key: string, value: JsonValue): Promise<true>;
  };
  network: {
    /** Requires network.request. HTTP error statuses are returned, not rejected. */
    request(request: NetworkRequest): Promise<NetworkResponse>;
    cancel(id: string): Promise<boolean>;
    /** Also cancels this session's in-flight requests. Does not change the manifest. */
    resetPermissions(): Promise<true>;
  };
  secrets: {
    /** Requires secrets. Missing values return null. */
    get(key: string): Promise<string | null>;
    /** Null deletes the secret. persistent=false means session-only storage. */
    set(key: string, value: string | null): Promise<{ persistent: boolean }>;
  };
  clipboard: PluginClipboardExtensions & {
    /** Requires clipboard.read. */
    readText(): Promise<string>;
    /** Requires clipboard.write. */
    writeText(text: string): Promise<true>;
  };
  /** Requires shell.openExternal. Only HTTP / HTTPS URLs are accepted. */
  openExternal(url: string): Promise<true>;
}

declare global {
  const nexlet: PluginApi;
  interface Window { nexlet: PluginApi; }
}
