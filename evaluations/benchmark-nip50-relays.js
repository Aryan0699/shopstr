import fs from "fs/promises";
import {
  KNOWN_SEARCH_RELAYS,
  fetchNIP11,
  declaresNIP50,
  declaresNIP42,
  connectRelay,
  sendSearchQuery,
  analyzeRelevanceSorting,
  computeJaccardSimilarity,
  seemsFiltered,
  computeScore,
  getVerdict,
  loadRelaysFromFile,
  parseArgs,
  log,
} from "./relay-test-utils.js";

// Configuration

const DETERMINISM_ROUNDS = 3;
const RELIABILITY_ROUNDS = 3;
const BENCHMARK_TIMEOUT = 8000;
const INTER_ROUND_DELAY = 500; // ms between rounds to avoid rate limiting

// Help

function printHelp() {
  console.log(`
benchmark-nip50-relays.js — Deep NIP-50 relay analysis for Shopstr

Usage:
  node benchmark-nip50-relays.js [options] [relay URLs...]

Options:
  --from <path>         Load candidates from discovery JSON output
  --file, -f <path>     Load relay URLs from a text file
  --query, -q <string>  Search query to test (default: "camera")
  --output, -o <path>   Custom output JSON path (default: auto-generated)
  --help, -h            Show this help

Scoring (total 10 points):
  Declares NIP-50          1.0    supported_nips includes 50
  Accepts search filter    1.5    returns filtered results for kind:1
  Indexes kind:30402       2.0    returns ≥1 result for kind:30402 search
  Result count (30402)     1.0    ≥10 results = 1.0, scaled linearly
  First event latency      1.0    <500ms = 1.0, <1000ms = 0.5
  EOSE time                0.5    <2000ms = 0.5
  Connection reliability   1.0    success_rate × 1.0
  Deterministic results    1.0    jaccard_similarity × 1.0
  Relevance ranking        1.0    results appear relevance-sorted

Verdicts:
  EXCELLENT  ≥8.0    Primary relay candidate
  GOOD       ≥6.0    Viable fallback
  MARGINAL   ≥4.0    Partial support, not recommended
  POOR       <4.0    Not suitable

Examples:
  node benchmark-nip50-relays.js wss://search.nos.today wss://relay.noswhere.com
  node benchmark-nip50-relays.js --from discovery-results-2026-04-19.json
  node benchmark-nip50-relays.js -q "vintage camera" -f relays.txt
`);
}

// Benchmark Tests


async function testCapability(relayUrl, query) {
  log.sub("Capability");

  // NIP-11
  const nip11 = await fetchNIP11(relayUrl);
  const nip50 = declaresNIP50(nip11);
  const nip42 = declaresNIP42(nip11);

  if (nip50) log.pass("Declares NIP-50 in supported_nips");
  else log.fail("Does NOT declare NIP-50");

  if (nip42) log.warn("Declares NIP-42 (may require authentication)");

  // Search acceptance — kind:1
  let acceptsSearch = false;
  let kind1Events = [];
  let authRequired = false;
  let ws;

  try {
    const conn = await connectRelay(relayUrl, BENCHMARK_TIMEOUT);
    ws = conn.ws;
    authRequired = conn.authChallenge !== null;

    // Test with search filter
    const searchResult = await sendSearchQuery(
      ws,
      "cap-search",
      { kinds: [1], search: query, limit: 20 },
      BENCHMARK_TIMEOUT
    );

    if (searchResult.authRequired) {
      authRequired = true;
      log.warn("NIP-42 authentication required");
    }

    kind1Events = searchResult.events;

    // Test without search filter (to detect relays that silently ignore search)
    const unfilteredResult = await sendSearchQuery(
      ws,
      "cap-nofilt",
      { kinds: [1], limit: 20 },
      BENCHMARK_TIMEOUT
    );

    const filtered = seemsFiltered(kind1Events, unfilteredResult.events);
    acceptsSearch = kind1Events.length > 0 && filtered;

    if (acceptsSearch)
      log.pass(`Accepts search filter (${kind1Events.length} kind:1 results, filtered)`);
    else if (kind1Events.length > 0 && !filtered)
      log.fail(`Returns ${kind1Events.length} kind:1 events but appears to IGNORE search filter`);
    else log.fail("No kind:1 results returned for search query");

    // Kind:30402 indexing
    const kind30402Result = await sendSearchQuery(
      ws,
      "cap-30402",
      { kinds: [30402], search: query, limit: 20 },
      BENCHMARK_TIMEOUT
    );

    const indexes30402 = kind30402Result.events.length > 0;
    if (indexes30402)
      log.pass(`Indexes kind:30402 (${kind30402Result.events.length} results)`);
    else log.fail("Does NOT return kind:30402 events for search query");

    try { ws.close(); } catch { /* ignore */ }

    return {
      nip11: nip11
        ? {
            name: nip11.name || null,
            supported_nips: nip11.supported_nips || [],
            software: nip11.software || null,
            version: nip11.version || null,
          }
        : null,
      capability: {
        declares_nip50: nip50,
        declares_nip42: nip42,
        accepts_search_filter: acceptsSearch,
        indexes_kind_30402: indexes30402,
        requires_nip42_auth: authRequired,
        kind1_ignores_search: kind1Events.length > 0 && !filtered,
      },
      _kind30402Events: kind30402Result.events,
      _kind30402Latency: {
        firstEventMs: kind30402Result.firstEventMs,
        eoseMs: kind30402Result.eoseMs,
      },
      _kind1Events: kind1Events,
    };
  } catch (err) {
    try { ws?.close(); } catch { /* ignore */ }
    log.fail(`Connection error: ${err.message}`);
    return {
      nip11: nip11
        ? {
            name: nip11.name || null,
            supported_nips: nip11.supported_nips || [],
            software: nip11.software || null,
            version: nip11.version || null,
          }
        : null,
      capability: {
        declares_nip50: nip50,
        declares_nip42: nip42,
        accepts_search_filter: false,
        indexes_kind_30402: false,
        requires_nip42_auth: authRequired,
        kind1_ignores_search: false,
      },
      _kind30402Events: [],
      _kind30402Latency: { firstEventMs: null, eoseMs: null },
      _kind1Events: [],
      error: err.message,
    };
  }
}

// Test 2: Coverage — result count, multi-keyword support
async function testCoverage(relayUrl, query) {
  log.sub("Coverage");
  let ws;

  try {
    const conn = await connectRelay(relayUrl, BENCHMARK_TIMEOUT);
    ws = conn.ws;

    // Single keyword — kind:30402
    const singleResult = await sendSearchQuery(
      ws,
      "cov-single",
      { kinds: [30402], search: query, limit: 50 },
      BENCHMARK_TIMEOUT
    );

    // Single keyword — kind:1
    const kind1Result = await sendSearchQuery(
      ws,
      "cov-kind1",
      { kinds: [1], search: query, limit: 50 },
      BENCHMARK_TIMEOUT
    );

    // Multi-keyword
    const multiQuery = `vintage ${query}`;
    const multiResult = await sendSearchQuery(
      ws,
      "cov-multi",
      { kinds: [30402], search: multiQuery, limit: 50 },
      BENCHMARK_TIMEOUT
    );

    // Check if multi-keyword results match both terms
    let multiBothMatched = false;
    if (multiResult.events.length > 0) {
      const queryTerms = multiQuery.toLowerCase().split(/\s+/);
      const matchCount = multiResult.events.filter((e) => {
        const text = ((e.content || "") + " " + (e.tags || []).flat().join(" ")).toLowerCase();
        return queryTerms.every((t) => text.includes(t));
      }).length;
      multiBothMatched = matchCount > 0;
    }

    log.info(`kind:1 results:    ${kind1Result.events.length}`);
    log.info(`kind:30402 results: ${singleResult.events.length}`);
    log.info(`Multi-keyword "${multiQuery}": ${multiResult.events.length} results`);

    if (singleResult.events.length >= 10)
      log.pass(`Good coverage (≥10 kind:30402 results)`);
    else if (singleResult.events.length > 0)
      log.warn(`Low coverage (${singleResult.events.length} kind:30402 results)`);
    else log.fail("No kind:30402 results");

    if (multiBothMatched) log.pass("Multi-keyword: both terms matched");
    else if (multiResult.events.length > 0)
      log.warn("Multi-keyword: results returned but not all terms matched");
    else log.fail("Multi-keyword: no results");

    try { ws.close(); } catch { /* ignore */ }

    return {
      kind1_result_count: kind1Result.events.length,
      kind30402_result_count: singleResult.events.length,
      multi_keyword_query: multiQuery,
      multi_keyword_result_count: multiResult.events.length,
      multi_keyword_both_matched: multiBothMatched,
    };
  } catch (err) {
    try { ws?.close(); } catch { /* ignore */ }
    log.fail(`Coverage test error: ${err.message}`);
    return {
      kind1_result_count: 0,
      kind30402_result_count: 0,
      multi_keyword_query: `vintage ${query}`,
      multi_keyword_result_count: 0,
      multi_keyword_both_matched: false,
      error: err.message,
    };
  }
}


// Test 3: Ranking — relevance sorting analysis
function testRanking(events, query) {
  log.sub("Ranking");

  const analysis = analyzeRelevanceSorting(events, query);

  if (analysis.sample_size < 3) {
    log.warn(`Only ${analysis.sample_size} events — cannot assess ranking`);
    return analysis;
  }

  if (analysis.not_sorted_by_created_at)
    log.pass("Results NOT sorted by created_at (good — implies relevance sorting)");
  else log.warn("Results appear sorted by created_at (may not implement relevance ranking)");

  if (analysis.top_results_contain_query)
    log.pass("Top results contain query terms");
  else log.warn("Top results don't clearly contain query terms");

  if (analysis.sorted_by_relevance)
    log.pass("Appears to use relevance sorting ✓");
  else log.warn("Relevance sorting not clearly detected");

  return analysis;
}


// Test 4: Latency — first event and EOSE timing
async function testLatency(relayUrl, query) {
  log.sub("Latency");
  let ws;

  try {
    const conn = await connectRelay(relayUrl, BENCHMARK_TIMEOUT);
    ws = conn.ws;

    // kind:1 latency
    const kind1Result = await sendSearchQuery(
      ws,
      "lat-kind1",
      { kinds: [1], search: query, limit: 20 },
      BENCHMARK_TIMEOUT
    );

    // kind:30402 latency
    const kind30402Result = await sendSearchQuery(
      ws,
      "lat-30402",
      { kinds: [30402], search: query, limit: 20 },
      BENCHMARK_TIMEOUT
    );

    try { ws.close(); } catch { /* ignore */ }

    const firstEvent = kind1Result.firstEventMs;
    const eose = kind1Result.eoseMs;
    const firstEvent30402 = kind30402Result.firstEventMs;
    const eose30402 = kind30402Result.eoseMs;

    // Log kind:1 latency
    if (firstEvent !== null) {
      if (firstEvent < 500) log.pass(`kind:1 first event: ${firstEvent}ms (<500ms ✓)`);
      else if (firstEvent < 1000) log.warn(`kind:1 first event: ${firstEvent}ms (500-1000ms)`);
      else log.fail(`kind:1 first event: ${firstEvent}ms (>1000ms — slow)`);
    } else {
      log.info("kind:1 first event: no events returned");
    }

    if (eose !== null) {
      if (eose < 2000) log.pass(`kind:1 EOSE: ${eose}ms (<2000ms ✓)`);
      else log.warn(`kind:1 EOSE: ${eose}ms (>2000ms — slow)`);
    } else {
      log.time("kind:1 EOSE: timed out");
    }

    // Log kind:30402 latency
    if (firstEvent30402 !== null) {
      if (firstEvent30402 < 500) log.pass(`kind:30402 first event: ${firstEvent30402}ms (<500ms ✓)`);
      else if (firstEvent30402 < 1000) log.warn(`kind:30402 first event: ${firstEvent30402}ms (500-1000ms)`);
      else log.fail(`kind:30402 first event: ${firstEvent30402}ms (>1000ms — slow)`);
    } else {
      log.info("kind:30402 first event: no events returned");
    }

    if (eose30402 !== null) {
      if (eose30402 < 2000) log.pass(`kind:30402 EOSE: ${eose30402}ms (<2000ms ✓)`);
      else log.warn(`kind:30402 EOSE: ${eose30402}ms (>2000ms — slow)`);
    } else {
      log.time("kind:30402 EOSE: timed out");
    }

    return {
      first_event_ms: firstEvent,
      eose_ms: eose,
      kind30402_first_event_ms: firstEvent30402,
      kind30402_eose_ms: eose30402,
    };
  } catch (err) {
    try { ws?.close(); } catch { /* ignore */ }
    log.fail(`Latency test error: ${err.message}`);
    return {
      first_event_ms: null,
      eose_ms: null,
      kind30402_first_event_ms: null,
      kind30402_eose_ms: null,
      error: err.message,
    };
  }
}


// Test 5: Reliability — connection success rate across multiple attempts
async function testReliability(relayUrl, query) {
  log.sub("Reliability");

  let successes = 0;
  let timeouts = 0;
  const attempts = RELIABILITY_ROUNDS;

  for (let i = 0; i < attempts; i++) {
    let ws;
    try {
      const conn = await connectRelay(relayUrl, BENCHMARK_TIMEOUT);
      ws = conn.ws;

      const result = await sendSearchQuery(
        ws,
        `rel-${i}`,
        { kinds: [30402], search: query, limit: 5 },
        BENCHMARK_TIMEOUT
      );

      if (result.timedOut) {
        timeouts++;
        log.warn(`Attempt ${i + 1}/${attempts}: timeout`);
      } else {
        successes++;
      }

      try { ws.close(); } catch { /* ignore */ }
    } catch (err) {
      try { ws?.close(); } catch { /* ignore */ }
      log.warn(`Attempt ${i + 1}/${attempts}: ${err.message}`);
    }

    // Delay between rounds
    if (i < attempts - 1)
      await new Promise((r) => setTimeout(r, INTER_ROUND_DELAY));
  }

  const successRate = successes / attempts;

  if (successRate >= 0.95)
    log.pass(`Connection reliability: ${(successRate * 100).toFixed(0)}% (${successes}/${attempts})`);
  else if (successRate >= 0.5)
    log.warn(`Connection reliability: ${(successRate * 100).toFixed(0)}% (${successes}/${attempts})`);
  else
    log.fail(`Connection reliability: ${(successRate * 100).toFixed(0)}% (${successes}/${attempts})`);

  return {
    connection_attempts: attempts,
    connection_successes: successes,
    success_rate: Math.round(successRate * 1000) / 1000,
    timeouts,
  };
}


// Test 6: Consistency — deterministic results across repeated queries
async function testConsistency(relayUrl, query) {
  log.sub("Consistency");

  const idSets = [];
  const rounds = DETERMINISM_ROUNDS;

  for (let i = 0; i < rounds; i++) {
    let ws;
    try {
      const conn = await connectRelay(relayUrl, BENCHMARK_TIMEOUT);
      ws = conn.ws;

      const result = await sendSearchQuery(
        ws,
        `det-${i}`,
        { kinds: [30402], search: query, limit: 20 },
        BENCHMARK_TIMEOUT
      );

      idSets.push(result.eventIds);
      log.info(`Round ${i + 1}/${rounds}: ${result.eventIds.length} events`);

      try { ws.close(); } catch { /* ignore */ }
    } catch (err) {
      try { ws?.close(); } catch { /* ignore */ }
      idSets.push([]);
      log.warn(`Round ${i + 1}/${rounds}: error — ${err.message}`);
    }

    if (i < rounds - 1)
      await new Promise((r) => setTimeout(r, INTER_ROUND_DELAY));
  }

  const jaccard = computeJaccardSimilarity(idSets);
  const deterministic = jaccard >= 0.9;

  if (deterministic)
    log.pass(`Deterministic: Jaccard similarity = ${jaccard.toFixed(3)} (≥0.9 ✓)`);
  else if (jaccard >= 0.5)
    log.warn(`Partially deterministic: Jaccard = ${jaccard.toFixed(3)}`);
  else log.fail(`Non-deterministic: Jaccard = ${jaccard.toFixed(3)}`);

  return {
    rounds,
    event_id_sets: idSets,
    jaccard_similarity: Math.round(jaccard * 1000) / 1000,
    deterministic,
  };
}

// Full Benchmark

async function benchmarkRelay(relayUrl, query) {
  log.header(`Benchmarking: ${relayUrl}`);
  log.info(`Query: "${query}"`);

  // 1. Capability (includes kind:30402 results for ranking analysis)
  const capResult = await testCapability(relayUrl, query);

  // 2. Coverage
  const coverage = await testCoverage(relayUrl, query);

  // 3. Ranking (using kind:30402 events from capability test)
  const ranking = testRanking(capResult._kind30402Events, query);

  // 4. Latency
  const latency = await testLatency(relayUrl, query);

  // 5. Reliability
  const reliability = await testReliability(relayUrl, query);

  // 6. Consistency
  const consistency = await testConsistency(relayUrl, query);

  // Assemble result
  const result = {
    url: relayUrl,
    nip11: capResult.nip11,
    capability: capResult.capability,
    coverage,
    ranking: {
      sorted_by_relevance: ranking.sorted_by_relevance,
      not_sorted_by_created_at: ranking.not_sorted_by_created_at,
      top_results_contain_query: ranking.top_results_contain_query,
      sample_size: ranking.sample_size,
    },
    latency,
    reliability,
    consistency: {
      rounds: consistency.rounds,
      event_id_sets: consistency.event_id_sets.map((s) => s.slice(0, 5)), // truncate for readability
      jaccard_similarity: consistency.jaccard_similarity,
      deterministic: consistency.deterministic,
    },
    overall_score: 0,
    verdict: "POOR",
  };

  // Compute score
  result.overall_score = computeScore(result);
  result.verdict = getVerdict(result.overall_score);

  // Print verdict
  log.sub("Verdict");
  const emoji =
    result.verdict === "EXCELLENT" ? "🏆" :
    result.verdict === "GOOD" ? "👍" :
    result.verdict === "MARGINAL" ? "⚠️ " :
    "❌";
  console.log(`    ${emoji} Score: ${result.overall_score}/10 — ${result.verdict}`);

  return result;
}

// Main

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const query = args.query;

  // Resolve relay list

  let relayUrls = [];

  if (args.from) {
    // Load from discovery JSON
    log.info(`Loading candidates from: ${args.from}`);
    const discoveryJson = JSON.parse(await fs.readFile(args.from, "utf-8"));
    relayUrls = (discoveryJson.candidates || []).map((c) => c.url);
    log.info(`Loaded ${relayUrls.length} candidates from discovery results`);
  } else if (args.file) {
    relayUrls = await loadRelaysFromFile(args.file);
    log.info(`Loaded ${relayUrls.length} relays from file: ${args.file}`);
  } else if (args.relays.length > 0) {
    relayUrls = args.relays;
  } else {
    // Default: use known search relays
    relayUrls = KNOWN_SEARCH_RELAYS;
    log.info("No relays specified — using default known search relays");
  }

  if (relayUrls.length === 0) {
    log.fail("No relays to benchmark. Provide relay URLs, --file, or --from.");
    process.exit(1);
  }

  log.header("NIP-50 Relay Benchmark");
  console.log(`  Query:   "${query}"`);
  console.log(`  Relays:  ${relayUrls.length}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Timeout: ${BENCHMARK_TIMEOUT}ms`);
  console.log(`  Rounds:  ${DETERMINISM_ROUNDS} (determinism), ${RELIABILITY_ROUNDS} (reliability)`);

  // Run benchmarks sequentially

  const results = [];

  for (const relay of relayUrls) {
    const result = await benchmarkRelay(relay, query);
    results.push(result);
  }

  // Final ranking

  results.sort((a, b) => b.overall_score - a.overall_score);

  log.header("Final Ranking");
  console.log();
  console.log(
    "  " +
    "Rank".padEnd(6) +
    "Score".padEnd(8) +
    "Verdict".padEnd(12) +
    "NIP-50".padEnd(8) +
    "k:30402".padEnd(9) +
    "Auth".padEnd(6) +
    "Relay"
  );
  console.log("  " + "─".repeat(80));

  results.forEach((r, i) => {
    const rank = `#${i + 1}`.padEnd(6);
    const score = `${r.overall_score}`.padEnd(8);
    const verdict = r.verdict.padEnd(12);
    const nip50 = (r.capability.declares_nip50 ? "✅" : "❌").padEnd(8);
    const k30402 = (r.capability.indexes_kind_30402 ? "✅" : "❌").padEnd(9);
    const auth = (r.capability.requires_nip42_auth ? "🔒" : "—").padEnd(6);
    console.log(`  ${rank}${score}${verdict}${nip50}${k30402}${auth}${r.url}`);
  });

  // ── Export JSON ──

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outputPath =
    args.output ||
    new URL(`./benchmark-results-${timestamp}.json`, import.meta.url).pathname;

  const output = {
    timestamp: new Date().toISOString(),
    query,
    timeout_ms: BENCHMARK_TIMEOUT,
    determinism_rounds: DETERMINISM_ROUNDS,
    reliability_rounds: RELIABILITY_ROUNDS,
    relays: results,
    ranking: results.map((r) => r.url),
    summary: {
      excellent: results.filter((r) => r.verdict === "EXCELLENT").map((r) => r.url),
      good: results.filter((r) => r.verdict === "GOOD").map((r) => r.url),
      marginal: results.filter((r) => r.verdict === "MARGINAL").map((r) => r.url),
      poor: results.filter((r) => r.verdict === "POOR").map((r) => r.url),
    },
  };

  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
  log.pass(`Results saved to: ${outputPath}`);

  // Recommendations

  log.sub("Recommendations for Shopstr");

  const excellent = results.filter((r) => r.verdict === "EXCELLENT");
  const good = results.filter((r) => r.verdict === "GOOD");

  if (excellent.length > 0) {
    console.log("    Primary search relays:");
    excellent.forEach((r) => console.log(`      🏆 ${r.url} (score: ${r.overall_score})`));
  }

  if (good.length > 0) {
    console.log("    Fallback search relays:");
    good.forEach((r) => console.log(`      👍 ${r.url} (score: ${r.overall_score})`));
  }

  if (excellent.length === 0 && good.length === 0) {
    log.warn("No relays scored GOOD or EXCELLENT for kind:30402 search.");
    log.warn("Consider using client-side search as primary strategy.");
  }

  console.log();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
