# VERIFIED — Phase 0 (status: INCOMPLETE, 5 Nov 2026)

Early sections predate the credentials and the Sui CLI. Later dated sections supersede them.

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

## Keyed run, 4 Nov 2026 (LIVE; supersedes SKIPPED and anonymous notes above)
- Tatum with `x-api-key`: checkpoint, tx by digest, balance, metadata and object reads pass.
- Balance change shape confirmed on a real tx: `amount` (signed string), `coinType.repr` (full 64-hex address form), `owner.address`. Compare coin types after normalising addresses.
- USDC→NGN rate: HTTP 200, `value` 1345.41476546, `source` CoinGecko. `value` is a decimal string; do not parse it into a float for money.
- Gemini: `gemini-3.8-flash` returned 503 twice (high demand). `gemini-3.5-flash` parsed the Pidgin sentence to the schema: Tunde, 9000. `GEMINI_MODEL=gemini-3.5-flash`. App needs retries/fallback.
- Walrus: 401 `AUTH_REJECTED`. Private key derives `MEMWAL_AGENT_ID`, but `MEMWAL_ACCOUNT_ID` is not an object on mainnet. Awaiting the correct ID.
- Sponsor wallet: 0.021 SUI, 0 USDC. Too little for the remaining tests.

## Walrus and recovery spike, 4 Nov 2026 (LIVE, mainnet; supersedes the Walrus 401 note)
- Account ID must be the dashboard's Account ID, not the connected wallet. Object type `...::account::MemWalAccount`; delegate key is in it.
- 4 confirmed test memories. Write times: 25.7s, 36.2s, 22.3s, 17.6s. Example blob: `glx6zeZf82cbbbYlsIGZAPrB8hEy0_H3NO_X9-39198`.
- `recall` and `restore` with limit=500 were accepted, not rejected. With so few records this does **not** reveal any cap.
- `listMemories` returned all 3 records with blob IDs. `end_epoch` and `expires_at` were **null**, so expiry display is not available from it yet (at least for fresh writes).
- Spike: 3 chained records sealed; a separate process given only the namespace plus credentials found 3/3, and hashes, chain and tamper detection passed.
- **Not proven:** `restore` reported `restored: 0, skipped: 3` because the relayer's index still held them. We cannot wipe that index, so restore rebuilding an empty index is untested, and reads still depend on the relayer. Dates were supplied to the rebuild, not discovered. Path A not tested. Multi-namespace/owner cap not tested at scale.

## Anchor, sponsored payment and Path A, 5 Nov 2026 (LIVE, mainnet; supersedes earlier Sui CLI and sponsor notes)
- Sui CLI 1.82.3 installed (no Windows build of 1.83.1). Move build passes; 3/3 Move tests pass.
- Anchor package: `0xe8ff894bb09f22b812fca3b5bb940c54bb440973a0ceff59ee39b9e235bf41be`, publish digest `G4fxiTkDE1WeRERAFQD1gXEky7FzgytayteDmoeN5cqB`, 9,068,000 MIST. UpgradeCap `0x46403b855282437edbc1a61905095d8733ad049af9524e26141feb1835ccc1f6` is held by the sponsor wallet, so the package can still be upgraded.
- Test anchor (`shop_id` phase0-test, now at `day_count` 1, holds a dummy hash): `0x8693a0242bb46a1ec5d0216cee99fdccd977fdf72deec1ba8a9cebced76fef41`; cap `0x7028474559f4fb239a3591edc5099b52e1b8b4c0bb9516640cc901692880f5e4`, held by the sponsor wallet. Real shops need their own anchor.
- Gas (net MIST): create 3,193,200; sponsored update 419,509, digest `9kKg1n7EUte3bYSLrAajUaok8ZWkZrTRDmDkVSGLx9cn`; plain USDC transfer 1,422,400 (creates a new coin object); sponsored USDC payment 100,132, digest `HyEeWBpyB66yS7iRcawoJ7HzH82w15g6xRtDHPk7wKpm`. Sender and sponsor were different keys on the sponsored transactions. Costs vary with storage created.
- Tatum read-back after the update matched `previousTransaction`, `last_day`, `head_hash` and `day_count`. Tatum also carried simulate and execute.
- Sponsored USDC: 0.05 USDC went out and came back; the test sender ended at 0.
- **Path A not proven.** Download from the Walrus aggregator works without the relayer and the blob parses as Seal. Decrypt is blocked: relayer-written blobs are sealed to committee key server `0x686098f1439237fff9f36b99c7329683c22979d2005c2465cb891acb012a7595` (threshold 1), not the SDK's manual-mode defaults, so `MemWalManual` defaults cannot read them. Key requests go through `https://seal-aggregator-mainnet.mystenlabs.com`, which needs an Enoki-issued key (docs; live call returned "No API key found in request"). No embedding key is needed for this route (read in SDK source; decrypt untested). `scripts/check-path-a.ts` needs `SEAL_API_KEY`. The Enoki portal's Create API Key form offers no Seal option and allows mainnet on paid plans only, and Maris has no budget for a paid plan.
- **Free route, partly proven.** `scripts/check-open-seal.ts` encrypts locally with the SDK's id layout, then decrypts through a fresh client using the open servers Overclock and Studio Mirai, with the delegate key and **no API key**. Nothing was stored on Walrus.
  - Both servers, threshold 2: 3 of 3 runs that reached the test passed. 2 more runs failed on Tatum 429s caused by repeated testing.
  - Alone, first test in a process: Studio Mirai 1/1 passed. Overclock 2/4 passed, with 1 `fetch failed` and 1 `Session key has expired`.
  - Alone, after another test in the same process: always `Session key has expired`, even with a new session key. Cause unknown; do not treat this as server reliability data.
  - Relayer-written records stay on the committee server and still need the Enoki key.
- **Path A over open servers: passed once end to end (5 Nov 2026).** `scripts/check-open-seal-walrus.ts` sealed one demo record with threshold 1 of 2, stored it through `/api/remember/manual` in 25.6s, and got blob `q_q0JELQoWr-e2yCG95MLbM0jbk9QGn5oONcpwSzrMU`. New processes downloaded it from the aggregator and decrypted it with no relayer, through Studio Mirai alone, Overclock alone, and both configured. `listMemories` found it by namespace, status `active`.
  - No API key, embedding provider or WAL from us. The relayer accepted a 1536-value hash-derived vector in place of an embedding. That tolerance is undocumented and could change.
  - Do not ship the hash of record text as the vector: on guessable records it could let the relayer confirm a guess. Use a random vector.
  - Text `recall` will not work for these records. Discovery uses `listMemories`, which needs the relayer. Reading with no relayer needs blob IDs kept elsewhere.
  - Threshold 1 means either server alone can release the key, and the record is readable while one is up. Threshold 2 requires both, and Overclock was flaky in earlier runs. Design decision pending.
  - **Not proven:** retention (`end_epoch` and `expires_at` were null earlier), `restore` on these records, behaviour at scale, open-server rate limits and terms.

## Not done
| Required check | State |
|---|---|
| Path A, relayer-written records | Blocked on a paid Enoki key |
| Path A, open servers | Passed for one record; retention, restore and scale not tested |
| Real recall and restore caps, write latency | Not run |
