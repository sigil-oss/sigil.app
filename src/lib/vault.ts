import { invoke } from "@tauri-apps/api/core";
import {
  generateSeed,
  toSeed,
  validateSeed,
  exportVault,
  importVault,
  createWallet,
  SC_DESTINATION,
  WalletError,
  VaultDecryptionError,
  InvalidVaultError,
} from "@qubic.org/wallet";
import type { Seed } from "@qubic.org/types";
import type {
  VaultData,
  Wallet,
  SignedTransaction,
  TransferParams,
  ScTransactionParams,
} from "@qubic.org/wallet";

export {
  generateSeed,
  toSeed,
  validateSeed,
  exportVault,
  importVault,
  createWallet,
  SC_DESTINATION,
  WalletError,
  VaultDecryptionError,
  InvalidVaultError,
};

export type {
  VaultData,
  Wallet,
  SignedTransaction,
  TransferParams,
  ScTransactionParams,
};

export async function createVault(password: string, seeds: Seed[]): Promise<VaultData> {
  return invoke<VaultData>("encrypt_vault", {
    password,
    seeds: [...seeds],
  });
}

export async function unlockVault(vaultData: VaultData, password: string): Promise<Seed[]> {
  return invoke<Seed[]>("decrypt_vault", {
    vaultData,
    password,
  });
}

export async function addToVault(vaultData: VaultData, password: string, seed: Seed): Promise<VaultData> {
  const seeds = await unlockVault(vaultData, password);
  return createVault(password, [...seeds, seed]);
}
