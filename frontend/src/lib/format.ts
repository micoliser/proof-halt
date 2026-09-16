import { formatUnits, parseUnits } from "viem";

const GEN_DECIMALS = 18;

/** Format a u256 decimal string (or bigint) as a trimmed GEN display value. */
export function formatGen(
  wei: string | bigint | number | null | undefined,
  maxFractionDigits = 6,
): string {
  if (wei === undefined || wei === null || wei === "") return "0";
  try {
    const raw = formatUnits(BigInt(wei), GEN_DECIMALS);
    const [whole, frac = ""] = raw.split(".");
    if (!frac || maxFractionDigits === 0) return whole;
    const trimmed = frac.slice(0, maxFractionDigits).replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed}` : whole;
  } catch {
    return String(wei);
  }
}

/** Parse a human GEN amount into a wei bigint for payable writes. */
export function parseGen(amount: string): bigint {
  const cleaned = amount.trim();
  if (!cleaned) throw new Error("Amount is required");
  return parseUnits(cleaned, GEN_DECIMALS);
}

export function shortAddress(address: string | null | undefined, chars = 4): string {
  if (!address) return "—";
  if (address.length < chars * 2 + 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export function isEthAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

/** Governor or a named backup may request unhalt. */
export function isUnhaltAuthority(
  wallet?: string | null,
  protocol?: { governor: string; backup_unhalters?: string[] } | null,
): boolean {
  if (!wallet || !protocol) return false;
  if (sameAddress(wallet, protocol.governor)) return true;
  return (protocol.backup_unhalters ?? []).some((addr) => sameAddress(wallet, addr));
}

/** Exact wei for payable report / challenge / unhalt. Do not parseGen this string. */
export function bondWei(reporterBond: string | null | undefined): bigint {
  if (reporterBond == null || reporterBond === "") {
    throw new Error("Could not read the required bond amount.");
  }
  return BigInt(reporterBond);
}

/** End boundary comes from the API; `now` is the client clock for display ticks. */
export function msUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (Number.isNaN(end)) return null;
  return end - now;
}

export function isAppealWindowOpen(
  appealEndsAt?: string | null,
  now = Date.now(),
): boolean {
  const remaining = msUntil(appealEndsAt, now);
  return remaining != null && remaining > 0;
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  if (minutes || hours || days) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function csvToList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Mirror contracts/halt_module.py `_normalize_host` for allowlist matching.
 * Lowercases; strips scheme, path/query/fragment, userinfo, port, leading www.
 */
export function normalizeHost(urlOrHost: string): string {
  let normalized = urlOrHost.trim().toLowerCase();
  if (normalized.includes("://")) {
    normalized = normalized.split("://", 2)[1] ?? normalized;
  }
  for (const char of ["/", "?", "#"] as const) {
    normalized = normalized.split(char, 2)[0] ?? normalized;
  }
  if (normalized.includes("@")) {
    normalized = normalized.split("@").pop() ?? normalized;
  }
  if (normalized.includes(":")) {
    normalized = normalized.split(":", 2)[0] ?? normalized;
  }
  if (normalized.startsWith("www.")) {
    normalized = normalized.slice(4);
  }
  return normalized;
}

function looksLikeIpv4(host: string): boolean {
  // Mirror contracts/halt_module.py `_looks_like_ipv4`: four all-digit labels
  // count as an IPv4 attempt even when an octet is >255 or has a leading zero.
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return false;
    if (part.length > 1 && part.startsWith("0")) return true;
    if (Number(part) > 255) return true;
  }
  return true;
}

/** Mirror contracts/halt_module.py `_assert_safe_hostname` (client UX only). */
export function trustedHostError(hostRaw: string): string | null {
  const host = normalizeHost(hostRaw);
  if (!host || !host.includes(".")) {
    return "Trusted domain must be a valid hostname.";
  }
  if (host.length > 253) {
    return "Trusted domain hostname is too long (max 253 chars).";
  }
  if ([...host].some((c) => c.charCodeAt(0) > 127)) {
    return "Trusted domain must be ASCII (use punycode xn-- for international domains).";
  }
  if (/[ /?#@|\[\]%]/.test(host)) {
    return "Trusted domain hostname is invalid.";
  }
  if (looksLikeIpv4(host)) {
    return "Trusted domains cannot be IP addresses.";
  }
  const labels = host.split(".");
  if (labels.some((label) => !label)) {
    return "Trusted domain hostname is invalid.";
  }
  for (const label of labels) {
    if (label.startsWith("-") || label.endsWith("-")) {
      return "Trusted domain hostname is invalid.";
    }
    if (!/^[a-z0-9-]+$/.test(label)) {
      return "Trusted domain hostname is invalid.";
    }
  }
  return null;
}

/**
 * Client-side check matching on-chain evidence URL rules.
 * Returns an error message, or null when every URL is allowed.
 */
export function evidenceUrlsError(
  urls: string[],
  trustedDomains: string[] | null | undefined,
): string | null {
  if (!urls.length) {
    return "Add at least one evidence link.";
  }
  if (urls.length > 10) {
    return "At most 10 evidence links are allowed.";
  }
  const trusted = new Set(
    (trustedDomains ?? []).map((d) => normalizeHost(d)).filter(Boolean),
  );
  if (trusted.size === 0) {
    return "This protocol has no trusted websites configured.";
  }

  const allowedList = [...trusted].join(", ");
  const seenKeys = new Set<string>();
  for (const raw of urls) {
    const url = raw.trim();
    if (!url) {
      return "Evidence links must be non-empty.";
    }
    if (url.length > 2048) {
      return "Evidence link is too long (max 2048 chars).";
    }
    if (!/^https?:\/\//i.test(url)) {
      return `Evidence links must start with http:// or https://. Check: ${url}`;
    }
    const host = normalizeHost(url);
    if (!host) {
      return `Could not read the website from: ${url}`;
    }
    if (!trusted.has(host)) {
      return `“${host}” is not on this protocol’s trusted list (${allowedList}). Host your evidence on an allowed site, then paste that public URL.`;
    }
    // Mirror contracts/halt_module.py _normalize_evidence_url_key (scheme+host+path).
    let key = url.toLowerCase();
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/+$/, "") || "/";
      key = `${parsed.protocol}//${normalizeHost(url)}${path}`;
    } catch {
      /* keep lowercased raw */
    }
    if (seenKeys.has(key)) {
      return "Evidence links must be distinct (same page with different query strings still counts as one).";
    }
    seenKeys.add(key);
  }
  return null;
}

export function explorerTxUrl(hash: string): string {
  return `https://explorer-studio.genlayer.com/tx/${hash}`;
}

/**
 * Allow only http(s) URLs for use in href. Rejects javascript:, data:, etc.
 * Returns a normalized href, or null when the URL must not be linked.
 */
export function safeExternalUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}
