# VERIFIED — Phase 0 (status: INCOMPLETE, 4 Nov 2026)

No credentials or Sui CLI were available, so nothing has been written to Walrus or sent on-chain yet.

Evidence levels: **LIVE** = observed from a real call. **TYPES** = read in the installed package. **DOCS** = official docs only. **NOT VERIFIED** = not proven.

## Installed versions
@mysten-incubation/memwal 0.1.13 · @mysten/sui 2.39.0 · @mysten/seal 1.5.3 · @mysten/walrus 1.2.38 · @mysten/dapp-kit-react 2.1.44 · @mysten/enoki 1.3.3 · @google/genai 2.32.0 · ai 7.0.162 · zod 4.6.7 · typescript 7.0.2 · Node 26.4.0 · pnpm 10.34.6

## Walrus Memory
| Item | Result | Level |
|---|---|---|
| Relayer `https://relayer.memory.walrus.xyz` up, mainnet, `write_ready: true` | Confirmed; apiVersion 1.0.0 | LIVE (`/health`, `/config`) |
| `MemWal.create({key, accountId, serverUrl, namespace})` | Matches the brief | TYPES |
| `remember`, `waitForRememberJob`, `rememberAndWait`, `recall({query, limit, namespace})`, `restore(namespace, limit)` | All exist | TYPES |
| `remember` returns `job_id`; final result has `blob_id` | Confirmed | TYPES |
| Recall default 10, relayer cap 100 | Stated in a type comment; not tested | TYPES |
| Idempotent writes: `idempotencyKey`, `dedupe` | Exist; useful for the outbox | TYPES |
| `listMemories` / `listNamespaces` | **Not in the brief.** Cursor-paginated metadata, including `blob_id`, `status`, `end_epoch`, `expires_at` | TYPES |
| Write, recall, restore, write latency | Script ready, not run | NOT VERIFIED |

### Differences from the brief
1. **Restore cap (6.8b).** The SDK does not describe "100 blobs per call, newest first". `limit` selects missing blobs "in unspecified order", the SDK sends it without clamping, and discovery also has a **per-owner source cap shared across namespaces**. `truncated=false` is documented as not proving every blob was seen. Per-month namespaces may therefore not guarantee full restore. The real cap is unknown until tested.
2. **`restore` returns counts, not content.** It rebuilds the relayer's index. Reading records back still takes `recall`, so recovery depends on the relayer and on semantic search finding each header.
3. **Expiry may be visible (#1115).** `MemorySummary.expires_at` / `end_epoch` exist in types. Whether they are populated is untested.
4. **`created_at` on recall results** is write time, so the brief's own `occurredAt` remains necessary.
5. **Path A cost.** `MemWalManual` needs a Sui signer and an embedding API key for its own flows. Whether an embedding key can be avoided for read-only decryption is not verified.

## Tatum
| Item | Result | Level |
|---|---|---|
| GraphQL URL is `https://sui-mainnet.gateway.tatum.io/graphql` | Works; the bare host returns 404 | LIVE |
| `SuiGraphQLClient` with `url`, `network`, `headers`, `fetch` | Works against Tatum (run anonymously) | LIVE |
| Latest checkpoint, tx by digest, SUI balance, USDC metadata (6 decimals) | All returned data | LIVE |
| `object { previousTransaction { digest } }` (anchor read shape) | Works, tested on `0x6` | LIVE |
| Balance change fields | Query valid, but the sampled tx returned an empty list, so non-empty shape is unproven | LIVE (partial) |
| Anonymous limit | **5 requests/minute** (429 message) | LIVE |
| Keyed free-tier limit, `x-api-key` | Not tested | NOT VERIFIED |
| `events` query | Unfiltered query worked; contradicts reported block, but newest-looking result was dated Aug 2026, so do not rely on it. Design stays digest-based | LIVE (partial) |
| gRPC host | Responds (HTTP 405 to a plain GET); no gRPC call made | LIVE (reachability only) |
| USDC→NGN | NGN and USDC are in docs lists; endpoint returned 401 without a key | DOCS |

## Sui
- `setSender`, `setGasOwner`, `setGasPayment`, `signTransaction`, `verifyTransactionSignature`: a sponsored transaction was built offline and dual-signed with throwaway keys, 199 bytes, **not broadcast** (LIVE, local only).
- Wallet UI: `@mysten/dapp-kit-react` is the actively published package (2.1.44, Nov 2026); `@mysten/dapp-kit` last changed Aug 2026 (npm).
- USDC coin type resolves on-chain to symbol USDC (LIVE).
- USDsui coin type: **not found in an official source**. Do not use until sourced.
- Sui CLI is not installed; Move build, test and publish are blocked.

## Gas sponsorship (proposed)
Self-run sponsor key, pending Maris's decision. It needs no extra service, matches `SUI_SPONSOR_PRIVATE_KEY`, and can share the anchor key. Enoki's `createSponsoredTransaction` exists in types, but its free-tier terms were not verified.

## Swap aggregator (P1, npm metadata only)
- Aftermath `aftermath-ts-sdk` 6.4.0: peer `@mysten/sui >=2 <3`, compatible. Best candidate.
- Cetus `@cetusprotocol/aggregator-sdk` 1.7.5: pins `@mysten/sui` 2.31.2, so a duplicate SDK is likely.
- 7K `@7kprotocol/sdk-ts` 4.0.0: peer `^1.44.0`, incompatible.
- None installed and no types read.

## Gemini
`@google/genai` installed. `models.list` and `generateContent` typecheck in `scripts/check-gemini.ts`. No key, so no model list and no model chosen.

## Not done
| Required check | State |
|---|---|
| `check-walrus`, `check-gemini`, `check-rate` | Written; SKIPPED, no credentials |
| Keyed Tatum run | `check-tatum` passes anonymously; rerun with key |
| Path A / Path B and end-to-end recovery spike | Not written or run |
| Anchor publish, `update`, read back, gas cost | Not written or run; Move package not written |
| Real sponsored USDC payment | Not written or run |
| Real recall and restore caps, write latency | Not run |
