/** Pull a write-method return value out of a GenLayer receipt when present. */

export function extractWriteReturn(receipt: unknown): unknown {
  if (!receipt || typeof receipt !== "object") return undefined;
  const rec = receipt as Record<string, unknown>;

  const candidates = [
    rec.result,
    rec.data,
    rec.return_value,
    rec.returnValue,
    rec.consensus_data,
    rec.consensusData,
    rec.execution_result,
    rec.executionResult,
    rec.txExecutionResult,
  ];

  for (const candidate of candidates) {
    const nested = unwrapReturn(candidate);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/**
 * JSON.stringify throws on bigint. Viem's getTransaction formats a non-zero
 * `value` (deposit, reporter bond) as bigint, so receipts must be serialized
 * with a replacer or confirmation polling never resolves.
 */
function receiptBlob(receipt: unknown): string | null {
  try {
    return JSON.stringify(receipt, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
  } catch {
    return null;
  }
}

/**
 * Best-effort UserError / rollback text from a GenLayer receipt.
 * Keep this narrow — do not match generic JSON "message" fields (false positives).
 */
export function extractExecutionError(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== "object") return null;
  const blob = receiptBlob(receipt);
  if (!blob) return null;
  const patterns = [
    /Withdraw blocked[^"\\]*/i,
    /insufficient balance/i,
    /must send a non-zero amount/i,
    /UserError[:\s"]+([^"\\]+)/i,
    /"Rollback"\s*:\s*"([^"]+)"/i,
    /Rollback[:\s]+([^"\\]+)/i,
  ];
  for (const re of patterns) {
    const m = blob.match(re);
    if (m) {
      const text = (m[1] || m[0] || "").trim();
      if (text && text.length < 400) return text;
    }
  }
  return null;
}

function unwrapReturn(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^-?\d+$/.test(trimmed)) return trimmed;
    return value;
  }
  if (Array.isArray(value) && value.length === 1) return unwrapReturn(value[0]);
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("return_value" in obj) return unwrapReturn(obj.return_value);
    if ("returnValue" in obj) return unwrapReturn(obj.returnValue);
    if ("result" in obj) return unwrapReturn(obj.result);
    if ("data" in obj) return unwrapReturn(obj.data);
    if ("value" in obj) return unwrapReturn(obj.value);
  }
  return undefined;
}

export function asOnchainId(value: unknown): number | null {
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= 0 ? n : null;
  }
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) ? n : null;
  }
  if (Array.isArray(value) && value.length === 1) return asOnchainId(value[0]);
  return null;
}

export function humanizeTxError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);

  // Viem simulation errors often hide the actual revert string deep in the cause/details.
  // We stringify the entire error object to search for UserError patterns.
  try {
    const blob = JSON.stringify(err, Object.getOwnPropertyNames(err));
    const patterns = [
      /Withdraw blocked[^"\\]*/i,
      /insufficient balance/i,
      /must send a non-zero amount/i,
      /UserError[:\s"]+([^"\\]+)/i,
      /"Rollback"\s*:\s*"([^"]+)"/i,
      /Rollback[:\s]+([^"\\]+)/i,
    ];
    for (const re of patterns) {
      const m = blob.match(re);
      if (m) {
        const text = (m[1] || m[0] || "").trim();
        if (text && text.length < 400) return text;
      }
    }
  } catch {
    // Ignore stringify errors
  }

  const lower = raw.toLowerCase();

  if (
    lower.includes("user rejected") ||
    lower.includes("denied") ||
    lower.includes("rejected the request")
  ) {
    return "Transaction was rejected in wallet.";
  }
  if (lower.includes("rate limit")) {
    return "Network is rate-limiting requests. Wait a few seconds and try again.";
  }
  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("failed to fetch")
  ) {
    return "Could not confirm the transaction from this browser. Refresh the page to see the latest status.";
  }
  if (
    lower.includes("insufficient funds") ||
    lower.includes("exceeds the balance")
  ) {
    return "Not enough GEN. Fund your wallet from the Studio faucet (💧).";
  }
  if (
    lower.includes("must send exactly") ||
    lower.includes("as reporter bond") ||
    lower.includes("as challenge bond") ||
    lower.includes("as unhalt bond")
  ) {
    return "Wrong bond amount. Report, challenge, and unhalt all require exactly the protocol stake B.";
  }
  if (lower.includes("withdraw blocked") || lower.includes("not allowed")) {
    return "Withdrawal is paused while this protocol is halted. Your balance was not changed.";
  }
  if (
    lower.includes("rejected on-chain") ||
    lower.includes("finished_with_error") ||
    lower.includes("reverted")
  ) {
    return raw.length < 200 && !lower.includes("finished_with_error")
      ? raw
      : "This action was rejected on-chain. Your balance was not changed.";
  }
  if (lower.includes("only wallet")) {
    return raw;
  }
  return raw || "Transaction failed.";
}

export function isUserRejection(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("user rejected") ||
    lower.includes("denied") ||
    lower.includes("rejected in wallet")
  );
}
