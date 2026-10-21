import { ORPCError, os, type } from '@orpc/server';
import { RPCHandler } from '@orpc/server/message-port';
import type { BrowserWindow, IpcMain, IpcMainEvent } from 'electron';
import { isHostDocument } from './host-origin';
import type { HostAction, HostInputs, HostOutputs } from '../shared/host-rpc';

/** Schemas provide types only; handlers must validate payloads at runtime. */
export function hostProcedure<A extends HostAction>(
  authorize: () => void,
  handler: (input: HostInputs[A]) => Promise<HostOutputs[A]>,
) {
  return os
    .input(type<HostInputs[A], HostInputs[A]>((value) => value))
    .output(type<HostOutputs[A], HostOutputs[A]>((value) => value))
    .handler(async ({ input }) => {
      authorize();
      try {
        return await handler(input);
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        throw new ORPCError('BAD_REQUEST', {
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        });
      }
    });
}

export type HostRouter = { [A in HostAction]: ReturnType<typeof hostProcedure<A>> };

export function hostAuthorization(
  event: IpcMainEvent,
  hosts: ReadonlyMap<number, BrowserWindow>,
  document: string,
  denied: () => string,
) {
  const window = hosts.get(event.sender.id);
  const frame = event.senderFrame;
  const authorize = () => {
    if (
      !window ||
      window.isDestroyed() ||
      event.sender.isDestroyed() ||
      hosts.get(event.sender.id) !== window ||
      !frame ||
      frame !== event.sender.mainFrame ||
      !isHostDocument(frame.url, document)
    ) {
      throw new ORPCError('FORBIDDEN', { message: denied() });
    }
  };
  authorize();
  if (!window) throw new ORPCError('FORBIDDEN');
  return { window, authorize };
}

/** Ports belong to a single top-level document and are revoked on navigation. */
export function registerHostRpc(
  ipc: Pick<IpcMain, 'on' | 'removeListener'>,
  createRouter: (event: IpcMainEvent) => HostRouter,
) {
  const connections = new Map<number, () => void>();
  const connect = (event: IpcMainEvent) => {
    if (event.ports.length !== 1) {
      for (const port of event.ports) port.close();
      return;
    }
    const port = event.ports[0];
    let router: HostRouter;
    try {
      router = createRouter(event);
    } catch {
      port.close();
      return;
    }
    const sender = event.sender;
    connections.get(sender.id)?.();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      connections.delete(sender.id);
      sender.removeListener('did-start-navigation', navigate);
      sender.removeListener('destroyed', close);
      sender.removeListener('render-process-gone', close);
      port.close();
    };
    const navigate = (
      details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
    ) => {
      if (details.isMainFrame && !details.isSameDocument) close();
    };
    connections.set(sender.id, close);
    sender.on('did-start-navigation', navigate);
    sender.once('destroyed', close);
    sender.once('render-process-gone', close);
    port.once('close', close);
    new RPCHandler(router).upgrade(port);
    port.start();
  };
  ipc.on('host-rpc:connect', connect);
  return () => {
    ipc.removeListener('host-rpc:connect', connect);
    for (const close of [...connections.values()]) close();
  };
}
