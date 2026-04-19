# NIP-50 Relay Evaluation for Shopstr Marketplace

> **Purpose**: Identify which Nostr relays genuinely support NIP-50 search for `kind:30402` (Classified Listings) so Shopstr can implement server-side marketplace search.

---
## 1. Approach

I built two scripts for this — one for discovery and one for deep benchmarking — and ran them in stages.

### Stage 1: Cast a Wide Net (Discovery)

I started with **58 relays**  from [nostr.watch](https://nostr.watch/) that had decent average round-trip times. For each one, I:

1. Fetched the NIP-11 relay info document to check if `supported_nips` includes `50`
2. Ran a quick smoke test — connect, send a simple search REQ, see what comes back
3. Checked for NIP-42 authentication challenges

**Findings:**

- Several relays required **NIP-42 authentication** just to query — I skipped these for now since Shopstr's search needs to work without requiring users to authenticate with every relay
- Many relays **declared NIP-50 support but only returned results for `kind:1`** (text notes). When I sent the exact same search filter with `kind:30402`, I got nothing back
- A few relays didn't even respond to the search filter at all, just returning empty EOSE

After filtering, narrowed it down to **17 relays** that at least accepted search queries and returned some data.

### Stage 2: Deep Benchmark

Ran each of the 17 candidates through a thorough benchmark testing the following metrics:

| Category | Metric | How I Tested | What I Wanted |
|---|---|---|---|
| **Capability** | Declares NIP-50 | Check `supported_nips` in NIP-11 | Must include `50` |
| **Capability** | Accepts search filter | Send REQ with `"search"` field | Returns filtered events, not an unfiltered dump |
| **Capability** | Indexes `kind:30402` | Search for listings specifically | Returns marketplace events |
| **Capability** | NIP-42 auth required | Listen for AUTH challenge or `auth-required` CLOSED | Prefer no auth needed |
| **Coverage** | Result count | Count returned events | ≥10 relevant results |
| **Coverage** | Multi-keyword support | Search `"vintage camera"` | Matches both keywords |
| **Ranking** | Relevance sorting | Check if results are NOT sorted by `created_at` | Most relevant first, not newest first |
| **Latency** | First event time | Measure time to first EVENT message | < 500 ms |
| **Latency** | EOSE time | Measure time to EOSE | < 2 seconds |
| **Reliability** | Connection success rate | Connect and query 3 times | >95% success |
| **Consistency** | Deterministic results | Repeat same query 3 times, compare event IDs | Same results each time (Jaccard ≥ 0.9) |

### Scoring

Each relay got a score out of 10 based on weighted metrics:

| Metric | Weight | Condition |
|---|---|---|
| Declares NIP-50 | 1.0 | `supported_nips` includes 50 |
| Accepts search filter | 1.5 | Returns filtered results for kind:1 |
| **Indexes kind:30402** | **2.0** | Returns ≥1 result for kind:30402 (heaviest weight — this is what Shopstr needs) |
| Result count (30402) | 1.0 | ≥10 results = full score, scaled linearly below |
| First event latency | 1.0 | <500ms = 1.0, <1000ms = 0.5 |
| EOSE time | 0.5 | <2000ms = 0.5 |
| Connection reliability | 1.0 | success_rate × 1.0 |
| Deterministic results | 1.0 | Jaccard similarity × 1.0 |
| Relevance ranking | 1.0 | Results appear relevance-sorted |

**Verdicts:**
- 🏆 **EXCELLENT** (≥8.0) — Primary relay candidate
- 👍 **GOOD** (≥6.0) — Viable fallback
- ⚠️ **MARGINAL** (≥4.0) — Partial support, not recommended
- ❌ **POOR** (<4.0) — Not suitable

---

## 3. Results

I ran the benchmark twice with different search queries to see how query popularity affects results:
- **`"bitcoin"`** — a very common term across Nostr, lots of content
- **`"camera"`** — a more niche term, fewer listings

### 3.1 Benchmark Results — Query: `"bitcoin"`

| Relay | NIP-50 | Search | k:30402 | k:1 Results | k:30402 Results | 1st Event (ms) | EOSE (ms) | Reliability | Jaccard | Score | Verdict |
|---|:---:|:---:|:---:|---:|---:|---:|---:|---:|---:|---:|---|
| `wss://relay.ditto.pub` | ✅ | ✅ | ✅ | 50 | **8** | 361 | 377 | 100% | 1.0 | **9.8** | 🏆 EXCELLENT |
| `wss://testing.gathr.gives` | ✅ | ✅ | ✅ | 50 | **50** | 333 | 643 | 100% | 1.0 | **9.0** | 🏆 EXCELLENT |
| `wss://social.protest.net/relay` | ✅ | ⚠️¹ | ✅ | 50 | **50** | 313 | 531 | 100% | 1.0 | **7.5** | 👍 GOOD |
| `wss://spatia-arcana.com` | ✅ | ✅ | ❌ | 40 | 0 | 285 | 621 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://nostr.me/relay` | ✅ | ✅ | ❌ | 50 | 0 | 185 | 361 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://relay2.veganostr.com` | ✅ | ✅ | ❌ | 21 | 0 | 352 | 593 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://playground.nostrcheck.me` | ✅ | ✅ | ❌ | 23 | 0 | 201 | 231 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://inner.sebastix.social` | ✅ | ✅ | ❌ | 40 | 0 | 212 | 837 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://relay.cal3b.com` | ✅ | ✅ | ❌ | 5 | 0 | 397 | 397 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://relay.divine.video` | ✅ | ✅ | ❌ | 50 | 0 | 1644 | 1916 | 100% | 1.0 | 5.0 | ⚠️ MARGINAL |
| `wss://relay.nostriches.club` | ✅ | ✅ | ❌ | 49 | 0 | 1804 | 1805 | 100% | 1.0 | 5.0 | ⚠️ MARGINAL |
| `wss://relay.staging.dvines.org` | ✅ | ✅ | ❌ | 2 | 0 | 1282 | 1282 | 100% | 1.0 | 5.0 | ⚠️ MARGINAL |
| `wss://search.nos.today` | ✅ | ✅ | ❌ | 0² | 0 | 505 | 717 | 0%³ | 1.0 | 4.5 | ⚠️ MARGINAL |
| `wss://relay.nostr-check.me` | ✅ | ✅ | ❌ | 49 | 0 | 5933 | 5970 | 100% | 1.0 | 4.5 | ⚠️ MARGINAL |
| `wss://relay.nostrverse.net` | ❌ | ✅ | ❌ | — | 0 | 1831 | 1832 | 100% | 1.0 | 4.0 | ⚠️ MARGINAL |
| `wss://relay.noswhere.com` | ✅ | ❌ | ❌ | 0 | 0 | — | 203 | 100% | 1.0 | 3.5 | ❌ POOR |
| `wss://purplepag.es` | ❌ | ❌ | ❌ | 0 | 0 | — | 248 | 100% | 1.0 | 2.5 | ❌ POOR |

> ¹ `social.protest.net` appears to ignore the search filter — returns unfiltered events sorted by time, not relevance  
> ² `search.nos.today` accepted kind:1 search in capability test but returned 0 in coverage (separate connection)  
> ³ Reliability test uses kind:30402 queries — since this relay doesn't index 30402, all 3 attempts timed out

---

### 3.2 Benchmark Results — Query: `"camera"`

| Relay | NIP-50 | Search | k:30402 | k:1 Results | k:30402 Results | 1st Event (ms) | EOSE (ms) | Reliability | Jaccard | Score | Verdict |
|---|:---:|:---:|:---:|---:|---:|---:|---:|---:|---:|---:|---|
| `wss://testing.gathr.gives` | ✅ | ✅ | ✅ | 50 | **2** | 288 | 530 | 100% | 1.0 | **8.2** | 🏆 EXCELLENT |
| `wss://social.protest.net/relay` | ✅ | ⚠️¹ | ✅ | 50 | **50** | 236 | 456 | 100% | 1.0 | **7.5** | 👍 GOOD |
| `wss://relay.ditto.pub` | ✅ | ✅ | ❌ | 50 | **0** | 310 | 323 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://spatia-arcana.com` | ✅ | ✅ | ❌ | 40 | 0 | 412 | 823 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://inner.sebastix.social` | ✅ | ✅ | ❌ | 3 | 0 | 220 | 220 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://relay.wavefunc.live` | ✅ | ✅ | ❌ | 37 | 0 | 314 | 908 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://relay.mcfamily.social` | ✅ | ✅ | ❌ | 1 | 0 | 417 | 417 | 100% | 1.0 | 6.0 | 👍 GOOD |
| `wss://relay.divine.video` | ✅ | ✅ | ❌ | 18 | 0 | 676 | 963 | 100% | 1.0 | 5.5 | ⚠️ MARGINAL |
| `wss://relay.cal3b.com` | ✅ | ✅ | ❌ | 1 | 0 | 520 | 520 | 100% | 1.0 | 5.5 | ⚠️ MARGINAL |
| `wss://search.nos.today` | ✅ | ✅ | ❌ | 0² | 0 | 457 | 664 | 0%³ | 1.0 | 5.0 | ⚠️ MARGINAL |
| `wss://playground.nostrcheck.me` | ✅ | ✅ | ❌ | 1 | 0 | 1736 | 1736 | 100% | 1.0 | 5.0 | ⚠️ MARGINAL |
| `wss://nostr.me/relay` | ✅ | ❌ | ❌ | 50 | 0 | 276 | 512 | 100% | 1.0 | 4.5 | ⚠️ MARGINAL |
| `wss://relay.noswhere.com` | ✅ | ❌ | ❌ | 0 | 0 | — | 248 | 100% | 1.0 | 3.5 | ❌ POOR |
| `wss://relay2.veganostr.com` | ✅ | ❌ | ❌ | 0 | 0 | — | 289 | 100% | 1.0 | 3.5 | ❌ POOR |
| `wss://relay.staging.dvines.org` | ✅ | ❌ | ❌ | 0 | 0 | — | 1394 | 100% | 1.0 | 3.5 | ❌ POOR |
| `wss://relay.og.coop` | ✅ | ❌ | ❌ | 0 | 0 | — | 276 | 100% | 1.0 | 3.5 | ❌ POOR |
| `wss://purplepag.es` | ❌ | ❌ | ❌ | 0 | 0 | — | 242 | 100% | 1.0 | 2.5 | ❌ POOR |

---

### 3.3 Query Comparison — The Three Relays That Index `kind:30402`

This is the most interesting part. Only **three relays** out of the 17 I benchmarked actually returned `kind:30402` data. Here's how they compared across the two queries:

| Relay | Query | k:30402 Results | k:1 Results | 1st Event (ms) | EOSE (ms) | Relevance Sort | Score |
|---|---|---:|---:|---:|---:|:---:|---|
| **`wss://relay.ditto.pub`** | `"bitcoin"` | **8** | 50 | 361 | 377 | ✅ Yes | 9.8 |
| | `"camera"` | **0** | 50 | 310 | 323 | — | 6.0 |
| **`wss://testing.gathr.gives`** | `"bitcoin"` | **50** | 50 | 333 | 643 | ❌ No | 9.0 |
| | `"camera"` | **2** | 50 | 288 | 530 | — | 8.2 |
| **`wss://social.protest.net/relay`** | `"bitcoin"` | **50** | 50 | 313 | 531 | ❌ No | 7.5 |
| | `"camera"` | **50** | 50 | 236 | 456 | ❌ No | 7.5 |

**Key observations:**

- **`relay.ditto.pub`** returned 8 listings for "bitcoin" but **zero for "camera"**. It scored highest overall (9.8) because it's the only relay that implements proper relevance sorting — results are NOT just sorted by `created_at`. However, its kind:30402 index clearly has gaps for less common terms.

- **`testing.gathr.gives`** returned 50 listings for "bitcoin" but only **2 for "camera"**. It has the broadest index but doesn't implement relevance sorting — results come back sorted by timestamp. Still, since it returns the most results consistently, it's the most reliable option.

- **`social.protest.net/relay`** returned 50 results for both queries, but there's a catch — it appears to **ignore the search filter entirely** and just return the latest events. The "camera" results didn't actually contain "camera" in the content. It's functionally an unfiltered dump, which is why it scored lower despite high result counts.

---

## 4. The Big Takeaway

Out of 58 relays I started with, **only 2 are genuinely usable** for NIP-50 search on `kind:30402`:

1. **`wss://testing.gathr.gives`** — Best coverage, fast, reliable. Doesn't do relevance sorting but returns the most kind:30402 results. Best primary candidate.

2. **`wss://relay.ditto.pub`** — Only relay that implements proper relevance sorting. Lower kind:30402 coverage (especially for niche terms), but the results you do get are well-ranked. Best quality candidate.

`social.protest.net/relay` technically returns kind:30402 events, but since it ignores the search filter, it's not actually doing search — it's just dumping recent events.

The overwhelming majority of relays that "support NIP-50" only index `kind:1` (text notes). This makes sense — most relay software was built for social media use cases, not marketplaces. Classified listings (`kind:30402`) are a niche event type that most indexers don't bother with.

---

## 5. Recommendations for Shopstr

### Search Relay Configuration

```typescript
export const NIP50_SEARCH_RELAYS = [
  "wss://testing.gathr.gives",   // Primary: broadest kind:30402 index
  "wss://relay.ditto.pub",       // Secondary: proper relevance ranking
];
```

## 6. Tools Used

I built two scripts for this evaluation, living in `evaluations/`:

| Script | Purpose |
|---|---|
| [`discover-nip50-relays.js`](discover-nip50-relays.js) | Scans relays from nostr.watch API, checks NIP-11 for NIP-50, runs smoke test, flags NIP-42 auth |
| [`benchmark-nip50-relays.js`](benchmark-nip50-relays.js) | Deep analysis across 8 metric categories, weighted scoring, JSON export |

Both share utilities from [`relay-test-utils.js`](relay-test-utils.js). 
**Running them:**

```bash
# Discover NIP-50 relays
node evaluations/discover-nip50-relays.js

# Benchmark candidates
node evaluations/benchmark-nip50-relays.js --from discovery-results.json -q bitcoin

# Or test specific relays directly
node evaluations/benchmark-nip50-relays.js wss://testing.gathr.gives wss://relay.ditto.pub -q camera
```
