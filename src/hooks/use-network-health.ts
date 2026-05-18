import { useTickInfo } from "./use-tick-info";

export type NetworkHealth = "healthy" | "degraded" | "offline";

export function useNetworkHealth(): NetworkHealth {
  const { isError, isSuccess, dataUpdatedAt } = useTickInfo();
  if (isError) return "offline";
  if (isSuccess && Date.now() - dataUpdatedAt > 15_000) return "degraded";
  if (isSuccess) return "healthy";
  return "degraded";
}
