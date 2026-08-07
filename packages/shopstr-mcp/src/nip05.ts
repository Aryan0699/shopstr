import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const NIP05_TIMEOUT_MS = 3_000;
const NIP05_MAX_BODY_BYTES = 10 * 1024;

export type Nip05Verification = {
  attempted: true;
  verified: boolean;
  claimed: string;
  checkedAt: string;
  error?: string;
};

type FetchLike = typeof fetch;
type ResolveHostname = (hostname: string) => Promise<string[]>;

type Nip05VerifyOptions = {
  fetchImpl?: FetchLike;
  resolveHostname?: ResolveHostname;
};

export function isNip05Claim(value: string): boolean {
  const [name, domain, extra] = value.trim().split("@");
  return Boolean(name && domain && !extra && !domain.includes("/"));
}

export async function verifyNip05Claim(
  claimed: string,
  pubkey: string,
  options: Nip05VerifyOptions | FetchLike = {}
): Promise<Nip05Verification> {
  const checkedAt = new Date().toISOString();
  const normalizedClaim = claimed.trim();
  const fetchImpl =
    typeof options === "function" ? options : (options.fetchImpl ?? fetch);
  const resolveHostname =
    typeof options === "function"
      ? defaultResolveHostname
      : (options.resolveHostname ?? defaultResolveHostname);

  try {
    if (!isNip05Claim(normalizedClaim)) {
      return failure(
        normalizedClaim,
        checkedAt,
        "Invalid NIP-05 claim format."
      );
    }

    const [name, domain] = normalizedClaim.split("@") as [string, string];
    const url = new URL("https://example.com/.well-known/nostr.json");
    url.hostname = domain;
    url.searchParams.set("name", name);

    await assertPublicHostname(domain, resolveHostname);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NIP05_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        return failure(
          normalizedClaim,
          checkedAt,
          "Redirects are not followed."
        );
      }
      if (!response.ok) {
        return failure(
          normalizedClaim,
          checkedAt,
          `NIP-05 endpoint returned HTTP ${response.status}.`
        );
      }

      const body = await readCappedBody(response, NIP05_MAX_BODY_BYTES);
      const parsed = JSON.parse(body) as unknown;
      const names =
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        "names" in parsed
          ? (parsed as { names?: unknown }).names
          : undefined;
      const mappedPubkey =
        names &&
        typeof names === "object" &&
        !Array.isArray(names) &&
        typeof (names as Record<string, unknown>)[name] === "string"
          ? ((names as Record<string, string>)[name] ?? "").toLowerCase()
          : "";

      return {
        attempted: true,
        verified: mappedPubkey === pubkey.toLowerCase(),
        claimed: normalizedClaim,
        checkedAt,
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return failure(
      normalizedClaim,
      checkedAt,
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function readCappedBody(
  response: Response,
  maxBytes: number
): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error("NIP-05 response exceeded 10KB body limit.");
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(concatChunks(chunks, totalBytes));
}

function concatChunks(
  chunks: readonly Uint8Array[],
  totalBytes: number
): Uint8Array {
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

async function assertPublicHostname(
  hostname: string,
  resolveHostname: ResolveHostname
): Promise<void> {
  const directIpVersion = isIP(hostname);
  if (directIpVersion !== 0) {
    assertPublicIp(hostname);
    return;
  }

  const addresses = await resolveHostname(hostname);
  if (addresses.length === 0) {
    throw new Error("NIP-05 hostname did not resolve.");
  }
  addresses.forEach(assertPublicIp);
}

async function defaultResolveHostname(hostname: string): Promise<string[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map((address) => address.address);
}

function assertPublicIp(address: string): void {
  if (isPrivateOrLocalIp(address)) {
    throw new Error("NIP-05 hostname resolved to a private or local address.");
  }
}

function isPrivateOrLocalIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateOrLocalIpv4(address);
  if (version === 6) return isPrivateOrLocalIpv6(address);
  return true;
}

function isPrivateOrLocalIpv4(address: string): boolean {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateOrLocalIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}

function failure(
  claimed: string,
  checkedAt: string,
  error: string
): Nip05Verification {
  return {
    attempted: true,
    verified: false,
    claimed,
    checkedAt,
    error,
  };
}
