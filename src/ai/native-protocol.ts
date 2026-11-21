/** Shared schema for the JS oracle, Rust core, and eventual WASM adapter. */
export const NATIVE_AI_PROTOCOL_VERSION = 1 as const;

export type NativeDecisionKind = 'neutral' | 'strike' | 'defense';

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

export type NativeStrikeAction =
  | { kind: 'single'; cardUid: string; cardKey: string; critical?: boolean }
  | { kind: 'ex'; cardUid: string; exCardUid: string; cardKey: string; critical?: boolean }
  | { kind: 'wild_swing'; critical?: boolean };

export interface NativePublicPlayer {
  characterKey: string;
  life: number;
  maxLife: number;
  /** Arena space index 0..8 (displayed as 1..9 in UI). */
  pos: number;
  handCount: number;
  deckCount: number;
  gaugeKeys: readonly string[];
  discardKeys: readonly string[];
  boostKeys: readonly string[];
  exceeded: boolean;
  reshuffleUsed: boolean;
  overdriveKeys?: readonly string[];
  sealedKeys?: readonly string[];
  eddiePos?: number | null;
  activeBoostMods?: Record<string, number | boolean>;
}

export interface NativeDecisionSnapshot {
  protocolVersion: typeof NATIVE_AI_PROTOCOL_VERSION;
  seed: number;
  turnNumber?: number;
  activePlayer?: 'actor' | 'opponent';
  actor: NativePublicPlayer & {
    handKeys: readonly string[];
    knownDeckTop?: readonly string[];
    knownDeckBottom?: readonly string[];
  };
  opponent: NativePublicPlayer;
  canExceed: boolean;
}

export interface NativeDiagnostics {
  nashMix?: readonly { label: string; probability: number }[];
  topLines?: readonly { label: string; visits: number; qValue: number }[];
  beliefThreats?: readonly { cardKey: string; probAtLeastOne: number; probExReady: number }[];
}

export interface NativeDecisionResponse<T = NativeAction | NativeStrikeAction> {
  action: T;
  diagnostics?: NativeDiagnostics;
}

export function canonicalizeTrace(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeTrace);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(source).sort().map((key) => [key, canonicalizeTrace(source[key])]));
  }
  return value;
}

const utf8Encoder = new TextEncoder();

/** FNV-1a over UTF-8 bytes, kept byte-for-byte compatible with native/src/lib.rs. */
export function canonicalTraceHash(value: unknown): string {
  const bytes = utf8Encoder.encode(JSON.stringify(canonicalizeTrace(value)));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}
