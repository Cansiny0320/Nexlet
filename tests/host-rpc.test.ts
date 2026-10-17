import { afterEach, expect, it } from 'vite-plus/test';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/message-port';
import { RPCHandler } from '@orpc/server/message-port';
import type { RouterClient } from '@orpc/server';
import type { BrowserWindow, IpcMainEvent } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hostAuthorization, hostProcedure } from '../src/main/host-rpc';

const ports: MessagePort[] = [];
afterEach(() => {
  for (const port of ports.splice(0)) port.close();
});

it('checks authorization on every request and preserves business errors across MessagePort', async () => {
  let allowed = true;
  const router = {
    pin: hostProcedure<'pin'>(
      () => {
        if (!allowed) throw Error('revoked');
      },
      async (id) => {
        if (typeof id !== 'string' || !id) throw Error('invalid command');
        return true;
      },
    ),
  };
  const channel = new MessageChannel();
  ports.push(channel.port1, channel.port2);
  new RPCHandler(router).upgrade(channel.port1);
  const client: RouterClient<typeof router> = createORPCClient(
    new RPCLink({ port: channel.port2 }),
  );
  channel.port1.start();
  channel.port2.start();
  await expect(client.pin('tool:json')).resolves.toBe(true);
  await expect(client.pin('')).rejects.toMatchObject({
    code: 'BAD_REQUEST',
    message: 'invalid command',
  });
  allowed = false;
  await expect(client.pin('tool:json')).rejects.toBeDefined();
});

it('accepts only the registered window and its current main host document', () => {
  const document = path.resolve('src/renderer/index.html');
  const frame = { url: pathToFileURL(document).href + '?view=launcher' };
  const sender = { id: 3, mainFrame: frame, isDestroyed: () => false };
  const window = { isDestroyed: () => false } as BrowserWindow;
  const hosts = new Map([[3, window]]);
  const event = { sender, senderFrame: frame } as unknown as IpcMainEvent;
  const { authorize } = hostAuthorization(event, hosts, document, () => 'denied');
  expect(authorize).not.toThrow();
  frame.url = 'https://example.com/';
  expect(authorize).toThrow('denied');
  frame.url = pathToFileURL(document).href;
  sender.mainFrame = { ...frame };
  expect(authorize).toThrow('denied');
  sender.mainFrame = frame;
  hosts.clear();
  expect(authorize).toThrow('denied');
  hosts.set(3, window);
  expect(() =>
    hostAuthorization(
      { ...event, senderFrame: { ...frame } } as IpcMainEvent,
      hosts,
      document,
      () => 'denied',
    ),
  ).toThrow('denied');
  window.isDestroyed = () => true;
  expect(authorize).toThrow('denied');
});

it('rejects pending calls when the peer closes instead of leaving them hanging', async () => {
  let entered!: () => void;
  let finish!: (value: boolean) => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const response = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const router = {
    rescan: hostProcedure<'rescan'>(
      () => {},
      async () => {
        entered();
        return response;
      },
    ),
  };
  const channel = new MessageChannel();
  ports.push(channel.port1, channel.port2);
  new RPCHandler(router).upgrade(channel.port1);
  const client: RouterClient<typeof router> = createORPCClient(
    new RPCLink({ port: channel.port2 }),
  );
  channel.port1.start();
  channel.port2.start();
  const pending = client.rescan();
  const rejected = expect(pending).rejects.toBeDefined();
  await started;
  channel.port1.close();
  await rejected;
  finish(true);
});
