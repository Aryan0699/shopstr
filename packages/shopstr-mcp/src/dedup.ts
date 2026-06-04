import type { NostrEvent } from "./types.js";

export function getDTag(event: NostrEvent): string | undefined {
  return event.tags?.find((tag) => tag[0] === "d")?.[1];
}

function getTagValue(event: NostrEvent, key: string): string | undefined {
  return event.tags?.find((tag) => tag[0] === key)?.[1];
}

export function getParameterizedReplaceableCoordinate(
  event: NostrEvent
): string | undefined {
  const dTag = getDTag(event);
  if (!dTag) return;
  return `${event.kind}:${event.pubkey}:${dTag}`;
}

export function mergeAndDeduplicateProducts(
  events: readonly NostrEvent[]
): NostrEvent[] {
  const byCoordinate = new Map<string, NostrEvent>();

  for (const event of events) {
    const coordinate =
      event.kind === 30402
        ? (getParameterizedReplaceableCoordinate(event) ?? event.id)
        : event.id;
    const existing = byCoordinate.get(coordinate);
    if (!existing || event.created_at > existing.created_at) {
      byCoordinate.set(coordinate, event);
    }
  }

  const byId = new Map<string, NostrEvent>();
  for (const event of byCoordinate.values()) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
}

export function mergeAndDeduplicateReviews(
  events: readonly NostrEvent[]
): NostrEvent[] {
  const latestByReviewerAndTarget = new Map<string, NostrEvent>();

  for (const event of events) {
    const target = getReviewTarget(event);
    const coordinate =
      event.kind === 31555 && target ? `${event.pubkey}:${target}` : event.id;
    const existing = latestByReviewerAndTarget.get(coordinate);
    if (!existing || event.created_at > existing.created_at) {
      latestByReviewerAndTarget.set(coordinate, event);
    }
  }

  const byId = new Map<string, NostrEvent>();
  for (const event of latestByReviewerAndTarget.values()) {
    if (!byId.has(event.id)) {
      byId.set(event.id, event);
    }
  }

  return Array.from(byId.values()).sort((a, b) => b.created_at - a.created_at);
}

function getReviewTarget(event: NostrEvent): string | undefined {
  const aTag = getTagValue(event, "a");
  if (aTag) return `a:${aTag}`;

  const dTag = getDTag(event);
  if (dTag?.startsWith("a:30402:")) return dTag;
  if (dTag?.startsWith("30402:")) return `a:${dTag}`;

  const eTag = getTagValue(event, "e");
  if (eTag) return `e:${eTag}`;

  const pTag = getTagValue(event, "p");
  if (pTag) return `p:${pTag}`;

  return dTag ? `d:${dTag}` : undefined;
}
