export {};

declare global {
  interface Window {
    ethereum?: {
      iswallet?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}
