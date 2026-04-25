import {
  SimplePool,
  Filter as NToolFilter,
  Event as NToolEvent,
  verifyEvent,
} from "nostr-tools";
import { SubscribeManyParams, SubCloser } from "nostr-tools/abstract-pool";

async function newPromiseWithTimeout<T>(
  callback: (
    resolve: (val: T) => void,
    reject: (err: Error) => void,
    abortSignal: AbortSignal
  ) => any,
  { timeout = 60000 }: { timeout?: number } = {}
): Promise<T> {
  return await new Promise<T>(
    (resolve: (val: T) => void, reject: (err: Error) => void) => {
      const abortController = new AbortController();
      const abortSignal = abortController.signal;

      const timeoutId = setTimeout(() => {
        abortController.abort();
        reject(new Error("Timeout"));
      }, timeout);

      function wrap<X>(f: (val: X) => void): (val: X) => void {
        return (val: X) => {
          clearTimeout(timeoutId);
          f(val);
        };
      }
      const p = callback(wrap<T>(resolve), wrap<Error>(reject), abortSignal);
      if (p && p instanceof Promise) {
        p.catch((err) => wrap<Error>(reject)(err));
      }
    }
  );
}

// Types 
export type NostrRelay = {
  url: string;
  disconnect: () => Promise<void>;
  connect: () => Promise<void>;
  activeSubs: Array<NostrSub>;
  sleeping: boolean;
  lastActive: number;
};

export type NostrSub = {
  _sub: SubCloser;
  close: () => Promise<void>;
};

export type NostrFilter = NToolFilter;
export type NostrEvent = NToolEvent;
export type NostrManagerParams = {
  connectionTimeout?: number;
  keepAliveTime: number;
  gcInterval: number;
  readable?: boolean;
  writable?: boolean;
};

// NostrManager (read-only part extracted)
export class NostrManager {
  private readonly pool: SimplePool;
  private readonly params: NostrManagerParams;
  private readonly relays: Array<NostrRelay> = [];
  private gcTimeout: any;

  constructor(relays: Array<string> = [], params?: NostrManagerParams) {
    const {
      keepAliveTime = 1000 * 60 * 5,
      gcInterval = 1000 * 60 * 5,
      connectionTimeout = undefined,
      readable = true,
      writable = false,
    } = params || {};

    this.pool = new SimplePool();
    this.params = {
      keepAliveTime,
      gcInterval,
      connectionTimeout,
      readable,
      writable,
    };
    for (const relay of relays) {
      this.addRelay(relay, { connectionTimeout: connectionTimeout });
    }
    this.gc().catch(console.error);
  }

  private keepAlive(relays: NostrRelay[]) {
    for (const relay of relays) {
      if (relay.sleeping) {
        try {
          relay.connect();
          relay.sleeping = false;
        } catch (e) {
          console.error(e);
        }
      }
      relay.lastActive = Date.now();
    }
  }

  private async gc() {
    try {
      for (const relay of this.relays) {
        if (
          !relay.sleeping &&
          relay.activeSubs.length === 0 &&
          Date.now() - relay.lastActive > this.params.keepAliveTime
        ) {
          try {
            await relay.disconnect();
          } catch (e) {
            console.error(e);
          }
          relay.sleeping = true;
        }
      }
    } catch (e) {
      console.error(e);
    }
    this.gcTimeout = setTimeout(() => {
      this.gc();
    }, this.params.keepAliveTime);
  }

  public async subscribe(
    filters: NostrFilter[],
    params: SubscribeManyParams,
    relayUrls?: string[]
  ): Promise<NostrSub> {
    if (!this.params.readable) throw new Error("not readable");

    if (params?.onevent) {
      const onevent = params.onevent;
      params.onevent = (event: NostrEvent) => {
        if (verifyEvent(event)) {
          onevent(event);
        }
      };
    }
    if (relayUrls) {
      for (const relayUrl of relayUrls) {
        this.addRelay(relayUrl);
      }
    }

    const relays = relayUrls
      ? this.relays.filter((r) => relayUrls.includes(r.url))
      : this.relays;
    const requests = relays.flatMap((r) =>
      filters.map((f) => ({ url: r.url, filter: f }))
    );
    const sub: NostrSub = {
      _sub: this.pool.subscribeMap(requests, params ?? {}),
      close: async () => {
        sub._sub.close();
        for (const relay of relays) {
          const activeSubs = relay.activeSubs;
          const i = activeSubs.indexOf(sub);
          if (i !== -1) activeSubs.splice(i, 1);
        }
      },
    };
    for (const relay of relays) {
      relay.activeSubs.push(sub);
    }
    this.keepAlive(relays);
    return sub;
  }

  public async fetch(
    filters: NostrFilter[],
    params?: SubscribeManyParams,
    relayUrls?: string[]
  ): Promise<NostrEvent[]> {
    return await newPromiseWithTimeout(async (resolve, _reject) => {
      if (!params) {
        params = {};
      }

      if (!params.onevent) {
        params.onevent = () => {};
      }

      if (!params.oneose) {
        params.oneose = () => {};
      }

      const onEvent = params.onevent;
      const onEose = params.oneose;
      const fetchedEvents: Array<NostrEvent> = [];

      params.onevent = (event: NostrEvent) => {
        fetchedEvents.push(event);
        return onEvent!(event);
      };

      params.oneose = () => {
        sub!.close();
        resolve(fetchedEvents);
        return onEose!();
      };

      const sub = await this.subscribe(filters, params, relayUrls);
    });
  }

  public addRelay(
    relayUrl: string,
    params?: {
      connectionTimeout?: number;
    }
  ): void {
    if (this.relays.find((r) => r.url === relayUrl)) return;
    const r = this.pool.ensureRelay(relayUrl, params);
    const relay: NostrRelay = {
      url: relayUrl,
      connect: async () => {
        this.pool.ensureRelay(relayUrl, params);
        await (await r).connect();
      },
      disconnect: async () => {
        (await r).close();
      },
      activeSubs: [],
      sleeping: true,
      lastActive: Date.now(),
    };
    this.relays.push(relay);
  }

  public addRelays(
    relayUrls: string[],
    params?: {
      connectionTimeout?: number;
    }
  ): void {
    for (const relayUrl of relayUrls) {
      this.addRelay(relayUrl, params);
    }
  }

  public close() {
    clearTimeout(this.gcTimeout);
    for (const relay of this.relays) {
      for (const sub of [...relay.activeSubs]) {
        sub.close();
      }
      relay.disconnect();
    }
    this.relays.length = 0;
  }
}
