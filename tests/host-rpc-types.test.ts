import { expectTypeOf, it } from 'vite-plus/test';
import type { HostAction, HostCall } from '../src/shared/host-rpc';
import { HOST_ACTIONS } from '../src/shared/types';
import type { AppState } from '../src/shared/types';
import type { SearchResponse } from '../src/shared/launch';
import type { PanelState } from '../src/shared/super-panel';

// Checked by TypeScript/Vite+; never execute calls or require a browser here.
function contract(call: HostCall) {
  expectTypeOf<(typeof HOST_ACTIONS)[number]>().toEqualTypeOf<HostAction>();
  expectTypeOf(call('state')).toEqualTypeOf<Promise<AppState>>();
  expectTypeOf(call('search', { query: 'JSON' })).toEqualTypeOf<Promise<SearchResponse>>();
  expectTypeOf(call('panel', { action: 'state' })).toEqualTypeOf<
    Promise<PanelState & { theme: string }>
  >();
  expectTypeOf(call('window', { action: 'pin' })).toEqualTypeOf<Promise<boolean>>();
  // @ts-expect-error Operation names are closed.
  call('unknown');
  // @ts-expect-error Payload is required for settings.
  call('settings');
  // @ts-expect-error Wrong payload is rejected before IPC.
  call('settings', { autoCheckUpdates: 'yes' });
  // @ts-expect-error Return types cannot be selected by the caller.
  call<number>('state');
  // @ts-expect-error Coordinates are required for a drag.
  call('window', { action: 'dragMove' });
}
it('exposes the typed contract', () => {
  expectTypeOf(contract).toBeFunction();
});
