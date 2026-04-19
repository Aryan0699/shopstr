import fs from "fs/promises";
import {
  KNOWN_SEARCH_RELAYS,
  fetchNIP11,
  declaresNIP50,
  declaresNIP42,
  connectRelay,
  sendSearchQuery,
  fetchRelaysFromNostrWatch,
  loadRelaysFromFile,
  parseArgs,
  log,
} from "./relay-test-utils.js";

// Configuration

const CONCURRENCY = 15; // parallel relay checks
const SMOKE_TIMEOUT = 6000; // ms for smoke test

// Main Logic

function printHelp() {
  console.log(`
discover-nip50-relays.js — Find Nostr relays that support NIP-50 search

Usage:
  node discover-nip50-relays.js [options]

Options:
  --file, -f <path>     Load relays from a text file (one URL per line)
  --output, -o <path>   Custom output JSON path (default: auto-generated)
  --help, -h            Show this help

Examples:
  node discover-nip50-relays.js
  node discover-nip50-relays.js --file my-relays.txt
  node discover-nip50-relays.js -o nip50-candidates.json
`);
}


//  Perform a quick smoke test: connect, send a simple search REQ,
//  check if the relay accepts it.

async function smokeTest(relayUrl) {
  let ws;
  try {
    const conn = await connectRelay(relayUrl, SMOKE_TIMEOUT);
    ws = conn.ws;
    const authOnConnect = conn.authChallenge !== null;

    const result = await sendSearchQuery(
      ws,
      "disco-smoke",
      { kinds: [1], search: "test", limit: 1 },
      SMOKE_TIMEOUT
    );

    try { ws.close(); } catch { /* ignore */ }

    return {
      connected: true,
      accepts_search: result.events.length > 0 || (result.eoseMs !== null && !result.closedMessage),
      auth_on_connect: authOnConnect,
      auth_required: result.authRequired,
      event_count: result.events.length,
      latency_ms: result.firstEventMs || result.eoseMs || null,
      closed_message: result.closedMessage,
    };
  } catch (err) {
    try { ws?.close(); } catch { /* ignore */ }
    return {
      connected: false,
      accepts_search: false,
      auth_on_connect: false,
      auth_required: false,
      event_count: 0,
      latency_ms: null,
      closed_message: null,
      error: err.message,
    };
  }
}

// Evaluate a single relay for NIP-50 discovery.
async function discoverRelay(relayUrl) {
  // Step 1: Fetch NIP-11
  const nip11 = await fetchNIP11(relayUrl);
  const nip50 = declaresNIP50(nip11);
  const nip42 = declaresNIP42(nip11);

  const entry = {
    url: relayUrl,
    nip11: nip11
      ? {
          name: nip11.name || null,
          description: nip11.description || null,
          supported_nips: nip11.supported_nips || [],
          software: nip11.software || null,
          version: nip11.version || null,
        }
      : null,
    declares_nip50: nip50,
    declares_nip42: nip42,
    accepts_search_filter: false,
    requires_nip42_auth: false,
    smoke_test_latency_ms: null,
    smoke_test_event_count: 0,
    reachable: false,
    error: null,
  };

  // Step 2: Only smoke test if NIP-50 is declared (or if from known list)
  if (nip50 || KNOWN_SEARCH_RELAYS.includes(relayUrl)) {
    const smoke = await smokeTest(relayUrl);
    entry.reachable = smoke.connected;
    entry.accepts_search_filter = smoke.accepts_search;
    entry.requires_nip42_auth = smoke.auth_required || smoke.auth_on_connect;
    entry.smoke_test_latency_ms = smoke.latency_ms;
    entry.smoke_test_event_count = smoke.event_count;
    if (smoke.error) entry.error = smoke.error;
    if (smoke.closed_message) entry.closed_message = smoke.closed_message;
  }

  return entry;
}

// Process relays in batches for concurrency control.
async function processBatch(relays, batchSize, processFn) {
  const results = [];
  for (let i = 0; i < relays.length; i += batchSize) {
    const batch = relays.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(relays.length / batchSize);
    process.stdout.write(
      `\r  Processing batch ${batchNum}/${totalBatches} (${i + 1}-${Math.min(i + batchSize, relays.length)} of ${relays.length})...`
    );

    const batchResults = await Promise.all(batch.map(processFn));
    results.push(...batchResults);
  }
  console.log(); // newline after progress
  return results;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  log.header("NIP-50 Relay Discovery");
  console.log(`  Started: ${new Date().toISOString()}\n`);

  // Gather relay URLs

  let relayUrls = [...KNOWN_SEARCH_RELAYS];

  if (args.file) {
    log.info(`Loading relays from file: ${args.file}`);
    const fileRelays = await loadRelaysFromFile(args.file);
    log.info(`Loaded ${fileRelays.length} relays from file`);
    relayUrls.push(...fileRelays);
  } else {
    log.info("Fetching relays from nostr.watch API...");
    const apiRelays = await fetchRelaysFromNostrWatch();
    relayUrls.push(...apiRelays);
  }

  // Deduplicate
  relayUrls = [...new Set(relayUrls.map((url) => url.replace(/\/$/, "")))];
  log.info(`Total unique relays to scan: ${relayUrls.length}`);

  // Run discovery

  log.sub("Scanning relays");
  const allResults = await processBatch(relayUrls, CONCURRENCY, discoverRelay);

  // Categorize results

  const nip50Declared = allResults.filter((r) => r.declares_nip50);
  const nip50Confirmed = allResults.filter(
    (r) => r.declares_nip50 && r.accepts_search_filter
  );
  const nip50UndeclaredButWorks = allResults.filter(
    (r) => !r.declares_nip50 && r.accepts_search_filter
  );
  const authRequired = allResults.filter((r) => r.requires_nip42_auth);

  // Print summary

  log.sub("Discovery Summary");
  log.info(`Total scanned:              ${allResults.length}`);
  log.info(`NIP-11 reachable:           ${allResults.filter((r) => r.nip11 !== null).length}`);
  log.info(`Declares NIP-50:            ${nip50Declared.length}`);
  log.info(`NIP-50 confirmed (smoke):   ${nip50Confirmed.length}`);
  log.info(`Undeclared but works:       ${nip50UndeclaredButWorks.length}`);
  log.info(`Requires NIP-42 auth:       ${authRequired.length}`);

  // Print confirmed relays
  log.sub("NIP-50 Candidates");
  const candidates = [...nip50Confirmed, ...nip50UndeclaredButWorks];

  if (candidates.length === 0) {
    log.warn("No NIP-50 candidates found!");
  } else {
    for (const r of candidates) {
      const authTag = r.requires_nip42_auth ? " [AUTH]" : "";
      const latencyTag = r.smoke_test_latency_ms
        ? ` (${r.smoke_test_latency_ms}ms)`
        : "";
      const declaredTag = r.declares_nip50 ? "✅" : "⚠️ ";
      console.log(`    ${declaredTag} ${r.url}${latencyTag}${authTag}`);
    }
  }

  // Show auth-required relays
  if (authRequired.length > 0) {
    log.sub("Relays Requiring NIP-42 Auth");
    for (const r of authRequired) {
      console.log(`    🔒 ${r.url}`);
    }
  }

  // Export JSON

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath =
    args.output ||
    new URL(`./discovery-results-${timestamp}.json`, import.meta.url).pathname;

  const output = {
    timestamp: new Date().toISOString(),
    total_scanned: allResults.length,
    nip11_reachable: allResults.filter((r) => r.nip11 !== null).length,
    nip50_declared: nip50Declared.length,
    nip50_confirmed: nip50Confirmed.length,
    undeclared_but_works: nip50UndeclaredButWorks.length,
    auth_required: authRequired.length,
    candidates: candidates.map((r) => ({
      url: r.url,
      nip11: r.nip11,
      declares_nip50: r.declares_nip50,
      accepts_search_filter: r.accepts_search_filter,
      requires_nip42_auth: r.requires_nip42_auth,
      smoke_test_latency_ms: r.smoke_test_latency_ms,
      smoke_test_event_count: r.smoke_test_event_count,
    })),
    all_results: allResults,
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  log.pass(`Results saved to: ${outputPath}`);

  console.log(
    `\n  💡 Next step: run the benchmark on candidates:\n` +
    `     node evaluations/benchmark-nip50-relays.js --from ${outputPath}\n`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
