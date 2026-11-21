/** Shared schema for the JS oracle, Rust core, and eventual WASM adapter. */
export const NATIVE_AI_PROTOCOL_VERSION = 1 as const;

export type NativeAction =
  | { type: 'strike' }
  | { type: 'exceed' }
  | { type: 'prepare' }
  | { type: 'reshuffle' }
  | { type: 'changecards'; n: number }
  | { type: 'move'; target: number }
  | { type: 'boost'; uid: string }
  | { type: 'action'; direction?: 'advance' | 'retreat' }
  | { type: 'burst'; boostUid: string };

export interface NativePublicPlayer {
  characterKey: string;
  life: number;
  maxLife: number;
  pos: number;
  handCount: number;
  deckCount: number;
  gaugeKeys: readonly string[];
  discardKeys: readonly string[];
  boostKeys: readonly string[];
  exceeded: boolean;
  reshuffleUsed: boolean;
}

export interface NativeDecisionSnapshot {
  protocolVersion: typeof NATIVE_AI_PROTOCOL_VERSION;
  seed: number;
  actor: NativePublicPlayer & { handKeys: readonly string[] };
  opponent: NativePublicPlayer;
  canExceed: boolean;
}

export function canonicalizeTrace(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeTrace);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(source).sort().map((key) => [key, canonicalizeTrace(source[key])]));
  }
  return value;
}

/** FNV-1a, kept byte-for-byte compatible with native/src/lib.rs. */
export function canonicalTraceHash(value: unknown): string {
  const json = JSON.stringify(canonicalizeTrace(value));
  let hash = 0xcbf29ce484222325n;
  for (const char of json) {
    hash ^= BigInt(char.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
