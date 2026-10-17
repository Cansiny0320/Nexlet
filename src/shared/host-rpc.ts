import type {
  AppState,
  ClipItem,
  Command,
  PluginRecord,
  PluginSessionState,
  Scratchpad,
  Settings,
  StartupStatus,
  UpdateStatus,
  WebShortcut,
} from './types';
import type { ClipIndex, ClipPage } from './clipboard';
import type { CommandConfig, CommandPreference } from './command-config';
import type {
  DirectoryPage,
  FileInfo,
  FileSearchIndexStatus,
  FileSearchResult,
} from './everything';
import type { InputSource, LaunchInput, SearchResponse } from './launch';
import type { MarketState } from './marketplace';
import type { PanelConfig, PanelState, PanelStatus } from './super-panel';
import type { ToolSessionSnapshot } from './tool-session';

export type PanelPatch = { revision: number } & (
  | {
      action: 'settings';
      patch: Partial<
        Pick<PanelConfig, 'enabled' | 'mouse' | 'holdMs' | 'shortcut' | 'excludedApps'>
      >;
    }
  | { action: 'add'; commandId: string }
  | { action: 'remove' | 'moveOut'; id: string }
  | { action: 'rename'; id: string; name: string }
  | { action: 'move'; id: string; target: string; position: 'before' | 'after' | 'inside' }
);
type WithoutRevision<T> = T extends unknown ? Omit<T, 'revision'> : never;
export type PanelPatchInput = WithoutRevision<PanelPatch>;
export type CommandConfigInput =
  | { action: 'patch'; id: string; patch: CommandPreference }
  | { action: 'pin' | 'removeRecent' | 'localRemove'; id: string }
  | { action: 'reorder'; revision: number; ids: string[] }
  | { action: 'layout'; value: 'grid' | 'list' }
  | { action: 'localSave'; id?: string; name: string; path: string };
export interface PluginSearchState {
  text: string;
  placeholder: string;
  visible: boolean;
  results: { id: string; title: string; description?: string }[];
}
export type WindowInput =
  | { action: 'pluginSearch'; operation: 'read' }
  | { action: 'pluginSearch'; operation: 'change'; text: string }
  | { action: 'pluginSearch'; operation: 'select'; id: string }
  | { action: 'busy'; value: boolean }
  | { action: 'overlay'; visible: boolean }
  | { action: 'exitPlugin' | 'hide' | 'close' | 'minimize' | 'maximize' | 'pin' }
  | { action: 'dragStart' }
  | { action: 'dragMove'; x: number; y: number }
  | { action: 'view'; view: string }
  | { action: 'height'; height: number }
  | { action: 'detach'; view: string; snapshot?: ToolSessionSnapshot };
export type ClipActionInput =
  | { action: 'writeText'; text: string }
  | { action: 'writeImage' | 'saveImage'; data: string }
  | { action: 'writeFiles'; files: string[] }
  | { action: 'capture' }
  | { action: 'clear'; includeFavorites?: boolean }
  | { action: 'copy' | 'paste' | 'delete' | 'station' | 'save'; ids: string[] }
  | { action: 'favorite'; ids: string[]; value: boolean };
export interface HostInputs {
  state: void;
  selectionInput: string;
  panel:
    | { action: 'state' }
    | { action: 'permissions' }
    | {
        action: 'open' | 'retry' | 'launcher' | 'clear' | 'focus' | 'hide';
      }
    | { action: 'launch'; id: string }
    | { action: 'config'; patch: PanelPatch };
  catalogIcons: string[];
  pluginSession: void;
  updateReady: { token: string; error?: string };
  updateCheck: void;
  updateDownload: void;
  updateInstall: void;
  updatePortable: void;
  search: string | { query: string; inputId?: string; from?: InputSource; requestId?: string };
  launchInput: { from: 'paste' | 'drop' } & (
    | { type: 'files'; paths: string[] }
    | { type: 'image'; data: string }
  );
  clearInput: void;
  launch: { id: string; inputId?: string; payload?: string; query?: string; mode?: 'open' };
  pin: string;
  commandConfig: CommandConfigInput;
  localPick: { directory: boolean };
  webShortcut: { action: 'remove'; id: string } | { action: 'save'; entry: WebShortcut };
  toolSession:
    | { action: 'read'; token: string }
    | { action: 'ready'; token: string; error?: string };
  window: WindowInput;
  settings: Partial<Settings>;
  rescan: void;
  startup: boolean;
  pickSearchPath: void;
  clips: { query?: string; kind?: string } | void;
  clipIndex: { query?: string; kind?: string } | void;
  clipPage: { ids: string[]; revision: number };
  clipDetail: string;
  clipAction: ClipActionInput;
  pads: void;
  savePad: { pad: Scratchpad; expectedUpdatedAt: number };
  deletePad: string;
  exportPad: { data: string };
  pluginInstall: { development: boolean };
  pluginToggle: { id: string; enabled: boolean };
  pluginRemove: { id: string; deleteData?: boolean };
  pluginInspect: void;
  marketplace: boolean | void;
  marketInstall: string;
  fileSearch: string;
  fileSearchStatus: void;
  fileBrowse: { path: string; filter?: string; cursor?: string };
  fileInfo: string;
  fileAction: { action: 'open' | 'reveal' | 'copy' | 'download'; path?: string };
  openData: void;
}
export interface HostOutputs {
  state: AppState;
  selectionInput: LaunchInput & { preview?: string };
  panel: (PanelState & { theme: string }) | PanelConfig | PanelStatus | boolean;
  catalogIcons: (Pick<Command, 'id' | 'icon'> & { revision: number })[];
  pluginSession: PluginSessionState | null;
  updateReady: boolean;
  updateCheck: UpdateStatus;
  updateDownload: UpdateStatus;
  updateInstall: boolean;
  updatePortable: boolean;
  search: Command[] | SearchResponse;
  launchInput: LaunchInput;
  clearInput: boolean;
  launch: { view?: string; payload?: string; opened?: boolean; needsQuery?: string };
  pin: boolean;
  commandConfig: CommandConfig | boolean;
  localPick: string | null;
  webShortcut: boolean;
  toolSession: ToolSessionSnapshot | boolean;
  window: PluginSearchState | [number, number] | boolean | null | undefined;
  settings: Settings;
  rescan: boolean;
  startup: StartupStatus;
  pickSearchPath: string | null;
  clips: ClipItem[];
  clipIndex: ClipIndex;
  clipPage: ClipPage;
  clipDetail: ClipItem | undefined;
  clipAction: boolean;
  pads: Scratchpad[];
  savePad: Scratchpad;
  deletePad: boolean;
  exportPad: boolean;
  pluginInstall: boolean;
  pluginToggle: boolean;
  pluginRemove: boolean;
  pluginInspect: PluginRecord[];
  marketplace: MarketState;
  marketInstall: boolean;
  fileSearch: FileSearchResult;
  fileSearchStatus: FileSearchIndexStatus;
  fileBrowse: DirectoryPage;
  fileInfo: FileInfo;
  fileAction: boolean;
  openData: boolean;
}
export type HostAction = keyof HostInputs;
// Preserve the existing action facade while inferring results from its input.
export type HostResult<A extends HostAction, P> = A extends 'search'
  ? P extends string
    ? Command[]
    : SearchResponse
  : A extends 'panel'
    ? P extends { action: 'state' }
      ? PanelState & { theme: string }
      : P extends { action: 'config' }
        ? PanelConfig
        : P extends { action: 'permissions' }
          ? PanelStatus
          : boolean
    : A extends 'toolSession'
      ? P extends { action: 'read' }
        ? ToolSessionSnapshot
        : boolean
      : A extends 'window'
        ? P extends { action: 'dragStart' }
          ? [number, number] | null
          : P extends { action: 'pluginSearch'; operation: 'read' }
            ? PluginSearchState | null
            : P extends { action: 'pluginSearch' }
              ? boolean | undefined
              : boolean
        : HostOutputs[A];
export type HostCall = <A extends HostAction, const P extends HostInputs[A]>(
  action: A,
  ...args: void extends HostInputs[A] ? [payload?: P] : [payload: P]
) => Promise<HostResult<A, P>>;
