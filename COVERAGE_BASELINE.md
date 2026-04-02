# Coverage Baseline and Impact Analysis

Command used:

```bash
npm test -- --ci --coverage --coverageReporters=json-summary --coverageReporters=text --json --outputFile=test-results.json
```

## Current Baseline

### Test execution summary

- Test suites: 59 passed, 0 failed, 59 total
- Tests: 463 passed, 0 failed, 463 total
- Runtime: ~17.8s (local)

### Coverage snapshot

| File | Stmts | Branch | Funcs | Lines |
|---|---:|---:|---:|---:|
| Overall project | 44.43% | 30.07% | 38.88% | 44.47% |
| utils/nostr/nostr-helper-functions.ts | 9.22% | 0.00% | 0.00% | 9.05% |
| utils/nostr/fetch-service.ts | 3.99% | 0.00% | 0.00% | 2.53% |


## Impact Analysis: Coverage Gaps

Coverage is currently lowest in **core event publishing, storage parsing, identity verification, and relay/cache merge paths**, which increases regression risk across authentication, listings, messaging, and order lifecycle flows.

### High-risk hotspots

| Function                    | Why it matters                                                           |
| --------------------------- | ------------------------------------------------------------------------ |
| `getLocalStorageData`       | Shared storage parsing layer for auth, wallet, relay, and profile state. |
| `finalizeAndSendNostrEvent` | Central signed-event publish pipeline used across core user actions.     |
| `constructGiftWrappedEvent` | Builds order/payment routing tags; failures break lifecycle messaging.   |
| `publishProofEvent`         | Proof publication path affecting wallet/state consistency.               |

### Medium-risk hotspots

| Function                     | Why it matters                                                  |
| ---------------------------- | --------------------------------------------------------------- |
| `verifyNip05Identifier`      | Controls identity verification and trust indicators.            |
| `fetchAllPosts`              | Cache + relay merge logic impacts listing freshness/duplicates. |
| `fetchProfile` (NIP-05 path) | Async verification flow may surface stale identity state.       |

## Suggested Next Test Additions (Highest ROI)

1. getLocalStorageData: malformed JSON, missing keys, and migration compatibility fixtures.
2. finalizeAndSendNostrEvent: success path and partial relay failure path with mocked NostrManager publish results.
3. constructGiftWrappedEvent: tag matrix assertions for order and non-order payloads.
4. publishProofEvent: signer missing, proof payload serialization, and publish failure behavior.
5. fetchAllPosts: conflict resolution between DB cache and relay event recency.
6. fetchProfile: nip05 present/absent and verified/unverified result propagation to profile map.
