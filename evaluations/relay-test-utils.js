import WebSocket from "ws";
import fetch from "node-fetch";

// Constants

export const DEFAULT_TIMEOUT = 8000;

export const KNOWN_SEARCH_RELAYS = [
  "wss://search.nos.today",
  "wss://relay.noswhere.com",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
  "wss://filter.nostr.wine",
  "wss://relay.snort.social",
  "wss://relay.orangepill.dev",
  "wss://directory.yabu.me",
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://purplepag.es",
  "wss://relay.primal.net",
];

// NIP-11 Relay Info

// Convert a wss:// relay URL to its HTTPS equivalent for NIP-11 fetch
export function toHttp(relay) {
  return relay.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}


//  Fetch NIP-11 relay information document.
//  Returns the parsed JSON or null on failure.
 
export async function fetchNIP11(relayUrl, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(toHttp(relayUrl), {
      headers: { Accept: "application/nostr+json" },
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const json = await res.json();
    return json;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Check if a relay declares NIP-50 support in its NIP-11 document.

export function declaresNIP50(nip11) {
  if (!nip11 || !Array.isArray(nip11.supported_nips)) return false;
  return nip11.supported_nips.includes(50);
}

// Check if a relay declares NIP-42 support in its NIP-11 document.
export function declaresNIP42(nip11) {
  if (!nip11 || !Array.isArray(nip11.supported_nips)) return false;
  return nip11.supported_nips.includes(42);
}

// WebSocket Helpers

//  Open a WebSocket connection with timeout and error handling.
//  Returns { ws, authChallenge } or throws on failure.
export function connectRelay(relayUrl, timeoutMs = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    let authChallenge = null;
    const ws = new WebSocket(relayUrl);

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Connection timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on("open", () => {
      clearTimeout(timer);
      // Give a small window to receive AUTH challenge before resolving
      setTimeout(() => {
        resolve({ ws, authChallenge });
      }, 300);
    });

    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data[0] === "AUTH" && data[1]) {
          authChallenge = data[1];
        }
      } catch {
        // ignore parse errors during connection
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Connection error: ${err.message}`));
    });
  });
}

export function sendSearchQuery(
  ws,
  subId,
  filter,
  timeoutMs = DEFAULT_TIMEOUT
) {
  return new Promise((resolve) => {
    const events = [];
    const eventIds = [];
    let firstEventMs = null;
    let closedMessage = null;
    let authRequired = false;

    const start = Date.now();

    const timer = setTimeout(() => {
      // Send CLOSE for the subscription
      try {
        ws.send(JSON.stringify(["CLOSE", subId]));
      } catch {
        // ws might already be closed
      }
      resolve({
        events,
        eventIds,
        firstEventMs,
        eoseMs: null,
        timedOut: true,
        closedMessage,
        authRequired,
      });
    }, timeoutMs);

    const handler = (msg) => {
      let data;
      try {
        data = JSON.parse(msg);
      } catch {
        return;
      }

      if (data[0] === "EVENT" && data[1] === subId) {
        const event = data[2];
        events.push(event);
        eventIds.push(event.id);
        if (firstEventMs === null) {
          firstEventMs = Date.now() - start;
        }
      }

      if (data[0] === "EOSE" && data[1] === subId) {
        clearTimeout(timer);
        ws.removeListener("message", handler);
        resolve({
          events,
          eventIds,
          firstEventMs,
          eoseMs: Date.now() - start,
          timedOut: false,
          closedMessage,
          authRequired,
        });
      }

      if (data[0] === "CLOSED" && data[1] === subId) {
        clearTimeout(timer);
        ws.removeListener("message", handler);
        closedMessage = data[2] || null;
        authRequired =
          typeof closedMessage === "string" &&
          closedMessage.includes("auth-required");
        resolve({
          events,
          eventIds,
          firstEventMs,
          eoseMs: null,
          timedOut: false,
          closedMessage,
          authRequired,
        });
      }

      // AUTH challenge during query
      if (data[0] === "AUTH") {
        authRequired = true;
      }

      if (data[0] === "NOTICE") {
        // Some relays send NOTICE for unsupported features
        const notice = data[1] || "";
        if (
          notice.toLowerCase().includes("search") ||
          notice.toLowerCase().includes("not supported")
        ) {
          clearTimeout(timer);
          ws.removeListener("message", handler);
          closedMessage = `NOTICE: ${notice}`;
          resolve({
            events,
            eventIds,
            firstEventMs,
            eoseMs: null,
            timedOut: false,
            closedMessage,
            authRequired,
          });
        }
      }
    };

    ws.on("message", handler);

    // Send the REQ
    ws.send(JSON.stringify(["REQ", subId, filter]));
  });
}

// Analysis Helpers

export function analyzeRelevanceSorting(events, query) {
  if (events.length < 3) {
    return {
      sorted_by_relevance: null, // can't determine with < 3 events
      not_sorted_by_created_at: null,
      top_results_contain_query: null,
      sample_size: events.length,
    };
  }

  // Check if sorted strictly by created_at descending
  const timestamps = events.map((e) => e.created_at);
  let isStrictlyDescending = true;
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] > timestamps[i - 1]) {
      isStrictlyDescending = false;
      break;
    }
  }

  // Check if top results contain query terms
  const queryTerms = query.toLowerCase().split(/\s+/);
  const topN = Math.min(5, events.length);
  let topMatchCount = 0;

  for (let i = 0; i < topN; i++) {
    const content = (events[i].content || "").toLowerCase();
    const tagValues = (events[i].tags || [])
      .flat()
      .join(" ")
      .toLowerCase();
    const searchable = content + " " + tagValues;

    const matches = queryTerms.some((term) => searchable.includes(term));
    if (matches) topMatchCount++;
  }

  const topResultsContainQuery = topMatchCount / topN >= 0.6;

  return {
    sorted_by_relevance: !isStrictlyDescending && topResultsContainQuery,
    not_sorted_by_created_at: !isStrictlyDescending,
    top_results_contain_query: topResultsContainQuery,
    sample_size: events.length,
  };
}

// Compute Jaccard similarity between multiple sets of event IDs.
// Returns a value between 0 and 1.
export function computeJaccardSimilarity(idSets) {
  if (idSets.length < 2) return 1.0;

  // Pairwise Jaccard, then average
  let totalSimilarity = 0;
  let pairs = 0;

  for (let i = 0; i < idSets.length; i++) {
    for (let j = i + 1; j < idSets.length; j++) {
      const setA = new Set(idSets[i]);
      const setB = new Set(idSets[j]);

      const intersection = new Set([...setA].filter((x) => setB.has(x)));
      const union = new Set([...setA, ...setB]);

      if (union.size === 0) {
        totalSimilarity += 1.0; // both empty = identical
      } else {
        totalSimilarity += intersection.size / union.size;
      }
      pairs++;
    }
  }

  return pairs > 0 ? totalSimilarity / pairs : 1.0;
}

// Check if search results are actually filtered (not just an unfiltered dump).
// Compares search results against unfiltered results to detect relays that
// silently ignore the search field.
// Returns true if results appear to be filtered (different from unfiltered).
 
export function seemsFiltered(searchEvents, unfilteredEvents) {
  if (searchEvents.length === 0 && unfilteredEvents.length === 0) return false;
  if (searchEvents.length === 0 && unfilteredEvents.length > 0) return true;

  const searchIds = new Set(searchEvents.map((e) => e.id));
  const unfilteredIds = new Set(unfilteredEvents.map((e) => e.id));

  // If the search results are a strict subset of (or identical to) unfiltered,
  // and unfiltered has more results, then search might be ignored
  const overlap = [...searchIds].filter((id) => unfilteredIds.has(id)).length;
  const overlapRatio = overlap / searchIds.size;

  // If >90% of search results also appear in unfiltered, the relay may be
  // ignoring the search field. But only flag it if unfiltered returned ~same count.
  if (
    overlapRatio > 0.9 &&
    Math.abs(searchEvents.length - unfilteredEvents.length) < 3
  ) {
    return false; // likely ignoring search
  }

  return true;
}

// Scoring

export function computeScore(result) {
  let score = 0;

  // Declares NIP-50 (1.0)
  if (result.capability.declares_nip50) score += 1.0;

  // Accepts search filter (1.5)
  if (result.capability.accepts_search_filter) score += 1.5;

  // Indexes kind:30402 (2.0) — most important for Shopstr
  if (result.capability.indexes_kind_30402) score += 2.0;

  // Result count for kind:30402 (1.0, scaled)
  const count30402 = result.coverage.kind30402_result_count || 0;
  score += Math.min(1.0, count30402 / 10);

  // First event latency (1.0)
  const latency = result.latency.kind30402_first_event_ms
    ?? result.latency.first_event_ms;
  if (latency !== null && latency < 500) {
    score += 1.0;
  } else if (latency !== null && latency < 1000) {
    score += 0.5;
  }

  // EOSE time (0.5)
  const eose = result.latency.kind30402_eose_ms
    ?? result.latency.eose_ms;
  if (eose !== null && eose < 2000) {
    score += 0.5;
  }

  // Connection reliability (1.0)
  score += (result.reliability.success_rate || 0) * 1.0;

  // Deterministic results (1.0)
  score += (result.consistency.jaccard_similarity || 0) * 1.0;

  // Relevance ranking (1.0)
  if (result.ranking.sorted_by_relevance) score += 1.0;

  return Math.round(score * 100) / 100;
}


export function getVerdict(score) {
  if (score >= 8.0) return "EXCELLENT";
  if (score >= 6.0) return "GOOD";
  if (score >= 4.0) return "MARGINAL";
  return "POOR";
}

// Logger
export const log = {
  info: (msg) => console.log(`  ℹ ${msg}`),
  pass: (msg) => console.log(`  ✅ ${msg}`),
  fail: (msg) => console.log(`  ❌ ${msg}`),
  warn: (msg) => console.log(`  ⚠️  ${msg}`),
  time: (msg) => console.log(`  ⏱  ${msg}`),
  header: (msg) => console.log(`\n${"═".repeat(60)}\n  ${msg}\n${"═".repeat(60)}`),
  sub: (msg) => console.log(`\n  ── ${msg} ──`),
};

// Relay List Fetching

//  Fetch NIP-50 capable relays from nostr.watch API.
//  Falls back to the /v1/online endpoint and filters locally if /v1/nip/50 fails.
 
export async function fetchRelaysFromNostrWatch() {
  // Try the NIP-specific endpoint first
  try {
    const res = await fetch("https://api.nostr.watch/v1/nip/50", {
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const relays = await res.json();
      if (Array.isArray(relays) && relays.length > 0) {
        log.info(`Fetched ${relays.length} NIP-50 relays from nostr.watch /v1/nip/50`);
        return relays.map((r) => (typeof r === "string" ? r : r.url || r));
      }
    }
  } catch {
    // fall through
  }

  // Fallback: fetch all online relays
  try {
    const res = await fetch("https://api.nostr.watch/v1/online", {
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      const relays = await res.json();
      if (Array.isArray(relays)) {
        log.warn(
          `NIP-50 endpoint unavailable. Fetched ${relays.length} online relays (will filter locally)`
        );
        return relays.map((r) => (typeof r === "string" ? r : r.url || r));
      }
    }
  } catch {
    // fall through
  }

  log.warn("nostr.watch API unavailable, using hardcoded relay list only");
  return [];
}

// Load relays from a text file (one URL per line).
 
export async function loadRelaysFromFile(filepath) {
  const { readFile } = await import("fs/promises");
  const content = await readFile(filepath, "utf-8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

// Parse common CLI arguments.
export function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    file: null,
    output: null,
    query: "camera",
    relays: [],
    from: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--file" || arg === "-f") {
      parsed.file = args[++i];
    } else if (arg === "--output" || arg === "-o") {
      parsed.output = args[++i];
    } else if (arg === "--query" || arg === "-q") {
      parsed.query = args[++i];
    } else if (arg === "--from") {
      parsed.from = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg.startsWith("wss://") || arg.startsWith("ws://")) {
      parsed.relays.push(arg);
    } else if (!parsed.query || parsed.query === "camera") {
      // Treat bare positional args as query if not a URL
      parsed.query = arg;
    }
  }

  return parsed;
}
