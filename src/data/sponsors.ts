export interface Sponsor {
  name: string;
  amount: number; // QU contributed
}

export const DONATION_IDENTITY =
  "UVYAOYTNYCRBVFBHNFIJUEOUEPEDIDUWWEAXKFSJEBJVASCQEROJOVOEEATL";

const NAMED: Sponsor[] = [
  { name: "alez04",     amount: 2_000_000_000 },
  { name: "cryptonaut", amount: 800_000_000  },
  { name: "qnode",      amount: 500_000_000  },
  { name: "rektproof",  amount: 300_000_000  },
  { name: "nullbyte",   amount: 200_000_000  },
  { name: "hexwave",    amount: 150_000_000  },
  { name: "zeroday",    amount: 100_000_000  },
  { name: "gm_qubic",   amount: 75_000_000   },
  { name: "anon",       amount: 50_000_000   },
  { name: "fren",       amount: 20_000_000   },
];

// Simulate a long tail of smaller sponsors for layout testing
const TAIL: Sponsor[] = Array.from({ length: 490 }, (_, i) => ({
  name: `sponsor_${i + 1}`,
  // Exponential decay: most donate ~10–50M QU, a few hit 100M+
  amount: Math.round(10_000_000 * Math.pow(0.993, i) + 1_000_000),
}));

export const SPONSORS: Sponsor[] = [...NAMED, ...TAIL];
