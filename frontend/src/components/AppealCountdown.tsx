"use client";

import { useEffect, useState } from "react";
import { formatDuration, formatTimestamp, msUntil } from "@/lib/format";

export function AppealCountdown({
  appealEndsAt,
}: {
  appealEndsAt: string | null | undefined;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!appealEndsAt) {
    return <p className="text-sm text-muted">No challenge window on record.</p>;
  }
  if (now == null) {
    return (
      <p className="text-sm text-muted">
        Challenge deadline {formatTimestamp(appealEndsAt)}
      </p>
    );
  }

  const remaining = msUntil(appealEndsAt, now);
  if (remaining == null) {
    return <p className="text-sm text-muted">No challenge window on record.</p>;
  }

  const open = remaining > 0;
  return (
    <div className="space-y-1 text-sm">
      <p>
        {open ? (
          <>
            Challenge window closes in{" "}
            <span className="font-mono text-ink">{formatDuration(remaining)}</span>
          </>
        ) : (
          <span>Challenge window is closed.</span>
        )}
      </p>
      <p className="text-xs text-muted">
        Based on indexer time ({formatTimestamp(appealEndsAt)}). The GenVM clock
        still enforces the real deadline.
      </p>
    </div>
  );
}
