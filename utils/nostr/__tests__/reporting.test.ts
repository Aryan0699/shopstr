import {
  constructProfileReportTags,
  constructListingReportTags,
  constructReportEventTemplate,
  REPORT_REASONS,
} from "../reporting";

// ── Profile report tags ─────────────────────────────────────────────────────

describe("constructProfileReportTags", () => {
  const pubkey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  it("builds a p-tag with the report reason as the 3rd element", () => {
    const result = constructProfileReportTags(pubkey, "spam");
    expect(result.tags).toEqual([["p", pubkey, "spam"]]);
  });

  it("sets content to the provided string", () => {
    const result = constructProfileReportTags(pubkey, "illegal", "Selling contraband");
    expect(result.content).toBe("Selling contraband");
  });

  it("defaults content to empty string when omitted", () => {
    const result = constructProfileReportTags(pubkey, "nudity");
    expect(result.content).toBe("");
  });

  it.each(REPORT_REASONS)("produces valid tags for reason: %s", (reason) => {
    const result = constructProfileReportTags(pubkey, reason);
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]).toEqual(["p", pubkey, reason]);
  });
});

// ── Listing report tags ─────────────────────────────────────────────────────

describe("constructListingReportTags", () => {
  const pubkey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const dTag = "my-listing-dtag";

  it("always includes both a p-tag and an a-tag (NIP-56 MUST)", () => {
    const result = constructListingReportTags(pubkey, dTag, "spam");
    expect(result.tags).toEqual([
      ["p", pubkey],
      ["a", `30402:${pubkey}:${dTag}`, "spam"],
    ]);
  });

  it("uses the NIP-01 coordinate format in the a-tag: 30402:<pubkey>:<d-tag>", () => {
    const result = constructListingReportTags(pubkey, dTag, "illegal");
    const aTag = result.tags.find((t) => t[0] === "a");
    expect(aTag).toBeDefined();
    expect(aTag![1]).toBe(`30402:${pubkey}:${dTag}`);
    expect(aTag![2]).toBe("illegal");
  });

  it("places the report reason as the 3rd element of the a-tag", () => {
    const result = constructListingReportTags(pubkey, dTag, "malware");
    const aTag = result.tags.find((t) => t[0] === "a")!;
    expect(aTag[2]).toBe("malware");
  });

  it("p-tag has no reason (bare reference, not a profile report)", () => {
    const result = constructListingReportTags(pubkey, dTag, "spam");
    const pTag = result.tags.find((t) => t[0] === "p")!;
    expect(pTag).toHaveLength(2); // ["p", pubkey] — no 3rd element
  });

  it("sets content to the provided string", () => {
    const result = constructListingReportTags(
      pubkey,
      dTag,
      "spam",
      "Fake product listing"
    );
    expect(result.content).toBe("Fake product listing");
  });

  it("defaults content to empty string when omitted", () => {
    const result = constructListingReportTags(pubkey, dTag, "other");
    expect(result.content).toBe("");
  });

  it.each(REPORT_REASONS)(
    "produces valid tags for reason: %s",
    (reason) => {
      const result = constructListingReportTags(pubkey, dTag, reason);
      const aTag = result.tags.find((t) => t[0] === "a")!;
      expect(aTag[2]).toBe(reason);
    }
  );
});

// ── Event template construction ─────────────────────────────────────────────

describe("constructReportEventTemplate", () => {
  const pubkey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
  const dTag = "test-product-dtag";

  it("produces a kind 1984 event", () => {
    const template = constructReportEventTemplate("profile", pubkey, "spam");
    expect(template.kind).toBe(1984);
  });

  it("sets created_at to approximately now", () => {
    const before = Math.floor(Date.now() / 1000);
    const template = constructReportEventTemplate("profile", pubkey, "spam");
    const after = Math.floor(Date.now() / 1000);
    expect(template.created_at).toBeGreaterThanOrEqual(before);
    expect(template.created_at).toBeLessThanOrEqual(after);
  });

  it("constructs profile report tags correctly", () => {
    const template = constructReportEventTemplate(
      "profile",
      pubkey,
      "impersonation",
      "Impersonating a well-known merchant"
    );
    expect(template.tags).toEqual([["p", pubkey, "impersonation"]]);
    expect(template.content).toBe("Impersonating a well-known merchant");
  });

  it("constructs listing report tags correctly", () => {
    const template = constructReportEventTemplate(
      "listing",
      pubkey,
      "spam",
      "Misleading listing",
      dTag
    );
    expect(template.tags).toEqual([
      ["p", pubkey],
      ["a", `30402:${pubkey}:${dTag}`, "spam"],
    ]);
    expect(template.content).toBe("Misleading listing");
  });

  it("throws when targetType is 'listing' but dTag is missing", () => {
    expect(() =>
      constructReportEventTemplate("listing", pubkey, "spam")
    ).toThrow("d-tag is required");
  });

  it("does NOT throw when targetType is 'listing' and dTag is provided", () => {
    expect(() =>
      constructReportEventTemplate("listing", pubkey, "spam", undefined, dTag)
    ).not.toThrow();
  });

  it("sets content to empty string when omitted for profile report", () => {
    const template = constructReportEventTemplate("profile", pubkey, "spam");
    expect(template.content).toBe("");
  });

  it("sets content to empty string when omitted for listing report", () => {
    const template = constructReportEventTemplate(
      "listing",
      pubkey,
      "spam",
      undefined,
      dTag
    );
    expect(template.content).toBe("");
  });
});
