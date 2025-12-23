/*
 * Shared utilities for parsing IDL values and common types.
 * Used across program SDKs.
 */

/* Transaction Options */

export interface TxOptions {
  includeCuBudget?: boolean;  // Include compute budget instruction (default: true)
  computeUnits?: number;      // Override default compute units
}

/*
 * Parse IDL bytes value string to Buffer.
 * e.g., "[99, 109, 105, 110, 116]" → Buffer.from([99, 109, 105, 110, 116])
 */
export function parseIdlBytes(value: string): Buffer {
  const bytes = JSON.parse(value) as number[];
  return Buffer.from(bytes);
}

/*
 * Get a constant from an IDL by name.
 * Throws if the constant is not found (helps catch mismatches after IDL sync).
 */
export function getIdlConstant(
  idl: { constants: Array<{ name: string; value: string }> },
  name: string
) {
  const constant = idl.constants.find((c) => c.name === name);
  if (!constant) {
    throw new Error(`IDL missing constant: ${name}`);
  }
  return constant.value;
}
