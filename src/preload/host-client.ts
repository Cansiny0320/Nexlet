import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/message-port';
import type { RouterClient } from '@orpc/server';
import type { HostRouter } from '../main/host-rpc';
import type { HostAction, HostCall, HostInputs, HostOutputs } from '../shared/host-rpc';
import { HOST_ACTIONS } from '../shared/types';

export function createHostCall(port: MessagePort): HostCall {
  const client: RouterClient<HostRouter> = createORPCClient(new RPCLink({ port }));
  port.start();
  // This is the single dispatch boundary for the compatibility action facade.
  // Input and output are defined by the same per-procedure contract on both ends.
  return (async <A extends HostAction>(action: A, payload?: HostInputs[A]) => {
    if (!HOST_ACTIONS.includes(action)) throw new Error('Unsupported host action');
    const call = client[action] as (input: HostInputs[A]) => Promise<HostOutputs[A]>;
    return call(payload as HostInputs[A]);
  }) as HostCall;
}
