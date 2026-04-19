import { EventTemplate } from "nostr-tools";

// The seven report-type values defined by NIP-56.
export type ReportReason =
  | "nudity"
  | "malware"
  | "profanity"
  | "illegal"
  | "spam"
  | "impersonation"
  | "other";

// All valid NIP-56 report reasons
export const REPORT_REASONS: ReportReason[] = [
  "nudity",
  "malware",
  "profanity",
  "illegal",
  "spam",
  "impersonation",
  "other",
];

// Constructs NIP-56 tags for reporting a user profile.
export function constructProfileReportTags(
  pubkey: string,
  reason: ReportReason,
  content?: string
): { tags: string[][]; content: string } {
  return {
    tags: [["p", pubkey, reason]],
    content: content ?? "",
  };
}

//  * Constructs NIP-56 tags for reporting a marketplace listing.
export function constructListingReportTags(
  pubkey: string,
  dTag: string,
  reason: ReportReason,
  content?: string
): { tags: string[][]; content: string } {
  return {
    tags: [
      // NIP-56: "The report event MUST include a `p` tag referencing the pubkey"
      ["p", pubkey],
      // Addressable event reference: 30402:<pubkey>:<d-tag>
      ["a", `30402:${pubkey}:${dTag}`, reason],
    ],
    content: content ?? "",
  };
}

// Constructs a complete NIP-56 report EventTemplate.
export function constructReportEventTemplate(
  targetType: "profile" | "listing",
  pubkey: string,
  reason: ReportReason,
  content?: string,
  dTag?: string
): EventTemplate {
  let tagResult: { tags: string[][]; content: string };

  if (targetType === "profile") {
    tagResult = constructProfileReportTags(pubkey, reason, content);
  } else {
    if (!dTag) {
      throw new Error(
        "A d-tag is required to report an addressable listing event."
      );
    }
    tagResult = constructListingReportTags(pubkey, dTag, reason, content);
  }

  return {
    kind: 1984,
    tags: tagResult.tags,
    content: tagResult.content,
    created_at: Math.floor(Date.now() / 1000),
  };
}
