import assert from "node:assert/strict";
import test from "node:test";

import { isNip05Claim, verifyNip05Claim } from "../dist/nip05.js";

const pubkey = "a".repeat(64);

function response(body, init = {}) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

test("validates NIP-05 claim shape", () => {
  assert.equal(isNip05Claim("alice@example.com"), true);
  assert.equal(isNip05Claim("alice"), false);
  assert.equal(isNip05Claim("alice@example.com/path"), false);
  assert.equal(isNip05Claim("alice@example.com@extra"), false);
});

test("verifyNip05Claim verifies matching well-known response", async () => {
  const result = await verifyNip05Claim("alice@example.com", pubkey, {
    async resolveHostname() {
      return ["93.184.216.34"];
    },
    async fetchImpl(url, init) {
      assert.equal(
        url.toString(),
        "https://example.com/.well-known/nostr.json?name=alice"
      );
      assert.equal(init.redirect, "manual");
      return response(JSON.stringify({ names: { alice: pubkey } }));
    },
  });

  assert.equal(result.attempted, true);
  assert.equal(result.verified, true);
  assert.equal(result.claimed, "alice@example.com");
});

test("verifyNip05Claim rejects redirects without following them", async () => {
  const result = await verifyNip05Claim("alice@example.com", pubkey, {
    async resolveHostname() {
      return ["93.184.216.34"];
    },
    async fetchImpl() {
      return response("", {
        status: 302,
        headers: { location: "https://evil.example" },
      });
    },
  });

  assert.equal(result.verified, false);
  assert.match(result.error, /Redirects are not followed/);
});

test("verifyNip05Claim rejects private and oversized responses", async () => {
  const privateResult = await verifyNip05Claim("alice@127.0.0.1", pubkey);
  assert.equal(privateResult.verified, false);
  assert.match(privateResult.error, /private or local/);

  const oversizedResult = await verifyNip05Claim("alice@example.com", pubkey, {
    async resolveHostname() {
      return ["93.184.216.34"];
    },
    async fetchImpl() {
      return response("x".repeat(11 * 1024));
    },
  });
  assert.equal(oversizedResult.verified, false);
  assert.match(oversizedResult.error, /10KB body limit/);
});
