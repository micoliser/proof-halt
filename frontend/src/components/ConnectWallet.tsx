"use client";

import { useHasMounted } from "@/hooks/useHasMounted";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectWallet() {
  const mounted = useHasMounted();

  if (!mounted) {
    return (
      <div className="h-9 w-36 animate-pulse rounded-sm bg-line/60" aria-hidden />
    );
  }

  return <ConnectButton showBalance={false} />;
}
