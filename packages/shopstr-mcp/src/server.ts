import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ShopstrMcpConfig } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import { NostrManager } from "./nostr-manager.js";
import { MemoryCache } from "./cache.js";
import { registerCoreTools } from "./tools/index.js";
import { registerPrompts } from "./prompts/index.js";
import { registerResources } from "./resources/index.js";

export type McpServerDependencies = {
  logger?: Pick<Logger, "warn">;
  nostr?: Pick<NostrManager, "fetch" | "close">;
  cache?: MemoryCache;
};

export function createMcpServer(
  config: ShopstrMcpConfig,
  dependencies: McpServerDependencies = {}
): McpServer {
  const logger = dependencies.logger ?? createLogger(config.logLevel);
  const nostr =
    dependencies.nostr ??
    new NostrManager(config.relays, {
      connectionTimeout: config.relayConnectTimeoutMs,
      logger,
    });
  const cache = dependencies.cache ?? new MemoryCache(config.profileCacheTtlMs);
  const server = new McpServer({
    name: "shopstr-mcp",
    version: config.version,
  });

  registerCoreTools(server, {
    nostr,
    relays: config.relays,
    timeoutMs: config.defaultToolTimeoutMs,
    cache,
  });
  registerResources(server, {
    nostr,
    relays: config.relays,
    timeoutMs: config.defaultToolTimeoutMs,
    cacheTtlMs: config.resourceCacheTtlMs,
  });
  registerPrompts(server);
  attachNostrCloseHandler(server, nostr);

  return server;
}

function attachNostrCloseHandler(
  server: McpServer,
  nostr: Pick<NostrManager, "close">
): void {
  const closeMcpServer = server.close.bind(server);
  let closed = false;

  server.close = async () => {
    if (closed) return;
    closed = true;

    const results = await Promise.allSettled([closeMcpServer(), nostr.close()]);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (rejected) throw rejected.reason;
  };
}
