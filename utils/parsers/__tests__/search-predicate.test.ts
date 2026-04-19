import { nip19 } from "nostr-tools";
import { ProductData } from "../product-parser-functions";
import {
  productSatisfiesCategoryFilter,
  productSatisfiesLocationFilter,
  productSatisfiesSearchFilter,
  productSatisfiesAllFilters,
} from "../search-predicate";

// Fixtures
const baseProduct: ProductData = {
  id: "test-id-1",
  pubkey:
    "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  createdAt: 1672531200,
  title: "Vintage Camera",
  summary: "A great vintage film camera in excellent condition",
  publishedAt: "1672531200",
  images: ["https://example.com/camera.jpg"],
  categories: ["Electronics", "Collectibles"],
  location: "New York",
  price: 250,
  currency: "USD",
  totalCost: 250,
  d: "unique-product-dtag",
};

// Category filter 

describe("productSatisfiesCategoryFilter", () => {
  it("returns true when no categories are selected", () => {
    expect(productSatisfiesCategoryFilter(baseProduct, new Set())).toBe(true);
  });

  it("matches a selected category (case-insensitive)", () => {
    expect(
      productSatisfiesCategoryFilter(baseProduct, new Set(["electronics"]))
    ).toBe(true);
  });

  it("matches when any selected category matches", () => {
    expect(
      productSatisfiesCategoryFilter(
        baseProduct,
        new Set(["Food", "Collectibles"])
      )
    ).toBe(true);
  });

  it("returns false when no selected categories match", () => {
    expect(
      productSatisfiesCategoryFilter(
        baseProduct,
        new Set(["Clothing", "Shoes"])
      )
    ).toBe(false);
  });

  it("returns false for a product with no categories", () => {
    const product = { ...baseProduct, categories: [] };
    expect(
      productSatisfiesCategoryFilter(product, new Set(["Electronics"]))
    ).toBe(false);
  });

  it("handles regex-special characters in category names safely", () => {
    const product = {
      ...baseProduct,
      categories: ["C++ Programming"],
    };
    expect(
      productSatisfiesCategoryFilter(product, new Set(["C++ Programming"]))
    ).toBe(true);
  });
});

// Location filter

describe("productSatisfiesLocationFilter", () => {
  it("returns true when no location is selected", () => {
    expect(productSatisfiesLocationFilter(baseProduct, "")).toBe(true);
  });

  it("returns true when the location matches exactly", () => {
    expect(productSatisfiesLocationFilter(baseProduct, "New York")).toBe(true);
  });

  it("returns false when the location does not match", () => {
    expect(productSatisfiesLocationFilter(baseProduct, "Los Angeles")).toBe(
      false
    );
  });

  it("returns false for partial location matches (exact only)", () => {
    expect(productSatisfiesLocationFilter(baseProduct, "New")).toBe(false);
  });
});

// Search filter

describe("productSatisfiesSearchFilter", () => {
  it("returns true when search is empty", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "")).toBe(true);
    expect(productSatisfiesSearchFilter(baseProduct, "   ")).toBe(true);
  });

  it("returns false when product has no title", () => {
    const product = { ...baseProduct, title: "" };
    expect(productSatisfiesSearchFilter(product, "camera")).toBe(false);
  });

  it("matches title case-insensitively", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "vintage")).toBe(true);
    expect(productSatisfiesSearchFilter(baseProduct, "CAMERA")).toBe(true);
    expect(productSatisfiesSearchFilter(baseProduct, "Vintage Camera")).toBe(
      true
    );
  });

  it("matches summary case-insensitively", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "excellent")).toBe(true);
    expect(productSatisfiesSearchFilter(baseProduct, "film")).toBe(true);
  });

  it("does not match unrelated search terms", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "smartphone")).toBe(false);
  });

  it("matches exact numeric price", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "250")).toBe(true);
  });

  it("does not match different numeric price", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "300")).toBe(false);
  });

  it("decodes and matches a valid npub", () => {
    const npub = nip19.npubEncode(baseProduct.pubkey);
    expect(productSatisfiesSearchFilter(baseProduct, npub)).toBe(true);
  });

  it("returns false for a valid npub that does not match", () => {
    const differentPubkey =
      "1111111111111111111111111111111111111111111111111111111111111111";
    const npub = nip19.npubEncode(differentPubkey);
    expect(productSatisfiesSearchFilter(baseProduct, npub)).toBe(false);
  });

  it("decodes and matches a valid naddr", () => {
    const naddr = nip19.naddrEncode({
      identifier: baseProduct.d!,
      pubkey: baseProduct.pubkey,
      kind: 30402,
    });
    expect(productSatisfiesSearchFilter(baseProduct, naddr)).toBe(true);
  });

  it("returns false for an naddr with a different identifier", () => {
    const naddr = nip19.naddrEncode({
      identifier: "different-dtag",
      pubkey: baseProduct.pubkey,
      kind: 30402,
    });
    expect(productSatisfiesSearchFilter(baseProduct, naddr)).toBe(false);
  });

  it("returns false for an invalid npub string", () => {
    expect(
      productSatisfiesSearchFilter(baseProduct, "npub1invalidstring")
    ).toBe(false);
  });

  it("returns false for an invalid naddr string", () => {
    expect(
      productSatisfiesSearchFilter(baseProduct, "naddr1invalidstring")
    ).toBe(false);
  });

  it("handles regex special characters safely (no crash)", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "[invalid(regex")).toBe(
      false
    );
    expect(productSatisfiesSearchFilter(baseProduct, "test.*+?")).toBe(false);
    expect(productSatisfiesSearchFilter(baseProduct, "price: $250")).toBe(
      false
    );
  });

  it("matches a substring within the title", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "Cam")).toBe(true);
  });

  it("trims leading/trailing whitespace in the search query", () => {
    expect(productSatisfiesSearchFilter(baseProduct, "  camera  ")).toBe(true);
  });
});

// Composite filter

describe("productSatisfiesAllFilters", () => {
  it("returns true when all filters pass", () => {
    expect(
      productSatisfiesAllFilters(
        baseProduct,
        new Set(["Electronics"]),
        "New York",
        "Camera"
      )
    ).toBe(true);
  });

  it("returns false when category filter fails", () => {
    expect(
      productSatisfiesAllFilters(
        baseProduct,
        new Set(["Clothing"]),
        "New York",
        "Camera"
      )
    ).toBe(false);
  });

  it("returns false when location filter fails", () => {
    expect(
      productSatisfiesAllFilters(
        baseProduct,
        new Set(["Electronics"]),
        "Los Angeles",
        "Camera"
      )
    ).toBe(false);
  });

  it("returns false when search filter fails", () => {
    expect(
      productSatisfiesAllFilters(
        baseProduct,
        new Set(["Electronics"]),
        "New York",
        "smartphone"
      )
    ).toBe(false);
  });

  it("returns true when all filters are empty (no filtering)", () => {
    expect(productSatisfiesAllFilters(baseProduct, new Set(), "", "")).toBe(
      true
    );
  });

  it("short-circuits: fails fast on first failing filter", () => {
    // Category will fail, so location and search should not matter
    expect(
      productSatisfiesAllFilters(
        baseProduct,
        new Set(["NonexistentCategory"]),
        "NonexistentLocation",
        "nonexistentquery"
      )
    ).toBe(false);
  });
});
