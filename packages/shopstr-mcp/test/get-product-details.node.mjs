import assert from "node:assert/strict";
import test from "node:test";

import { handleGetProductDetails } from "../dist/tools/get-product-details.js";

const hex = (char) => char.repeat(64);

function productEvent(overrides = {}) {
  return {
    id: hex("a"),
    pubkey: hex("b"),
    created_at: 100,
    kind: 30402,
    tags: [
      ["d", "product"],
      ["title", "Linen Shirt"],
      ["summary", "A nice shirt"],
      ["price", "10", "USD"],
    ],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

function context(events) {
  return {
    relays: ["wss://relay.example.com"],
    timeoutMs: 100,
    nostr: {
      async fetch() {
        return events;
      },
    },
  };
}

test("get_product_details returns a product by event id", async () => {
  const productId = hex("1");
  const response = await handleGetProductDetails(
    { productId },
    context([productEvent({ id: productId })])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.resultCount, 1);
  assert.equal(body.product.id, productId);
  assert.equal(body.product.title, "Linen Shirt");
  assert.equal(body._meta.resultCount, 1);
});

test("get_product_details returns not found when relays have no matching product", async () => {
  const response = await handleGetProductDetails(
    { productId: hex("1") },
    context([productEvent({ id: hex("2") })])
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "NOT_FOUND");
});
