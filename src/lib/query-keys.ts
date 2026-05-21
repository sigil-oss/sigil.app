export const qk = {
  vaultBalances: (identities: string[]) => ["vault-balances", identities] as const,
  balance: (identity: string | null) => ["balance", identity] as const,
  txHistory: (identity: string | null) => ["tx-history", identity] as const,
  tickInfo: () => ["tick-info"] as const,
  lastProcessedTick: () => ["last-processed-tick"] as const,
  qearnEpochInfo: (epoch: number | null) => ["qearn-epoch-info", epoch] as const,
  qearnPositions: (identity: string | null, epoch: number | null) => ["qearn-positions", identity, epoch] as const,
  qutilSendManyFee: () => ["qutil-send-many-fee"] as const,
} as const;
