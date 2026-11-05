# Gate 0 report — Trustbook (5 Nov 2026)

## Verdict: not passed; Phase 1 can start on conditions
Everything Phase 1 builds on works on mainnet: the anchor contract, sponsored transactions, Tatum reads, and storing and recovering an encrypted record without the relayer. Gate 0 is not passed: record renewal, restore into an empty index, and behaviour at scale are untested. Phase 1 can start on the proven parts once the three storage decisions below are made, because they change how records are written.

Evidence and transaction digests are in [VERIFIED.md](VERIFIED.md).

## Proven on mainnet
| Area | Result |
|---|---|
| Anchor contract | Move build and 3/3 tests pass. Package `0xe8ff…41be` published. |
| Sponsored anchor update | Sender and gas payer were different keys; the update succeeded. |
| Anchor read-back through Tatum | Digest, day, hash and count matched what was written. |
| Sponsored USDC payment | 0.05 USDC sent with sponsor-paid gas and returned in full. |
| Tatum | Keyed reads, simulate and execute work. USDC→NGN rate returns a decimal string. |
| Gemini | `gemini-3.5-flash` parsed a Pidgin sentence to the schema. `gemini-3.8-flash` returned 503 twice. |
| Walrus Memory writes | 6 records stored, 17.6–36.2s each. |
| Path A over open servers | Two records stored through the relayer, then decrypted in new processes with no relayer, API key or embedding provider. Either open server alone was enough. |
| Recovery spike | 3 chained records found and verified; tampering detected. |

## Measured costs
| Action | Cost |
|---|---|
| Publish anchor package | 0.00907 SUI (one-off) |
| Create an anchor | 0.00319 SUI per shop |
| Sponsored anchor update | 0.00042 SUI |
| Sponsored USDC payment | 0.00010 SUI |
| Plain USDC transfer creating a new coin | 0.00142 SUI |
| Storing a record | Free to us so far; the relayer paid ~7 months |
| Extending a record by 1 year | ~0.128 WAL per record, at epoch 43 prices |

Gas varies with storage created. WAL prices change each epoch.

## Decisions needed before Phase 1
1. **Write records through the open Seal servers.** Records written the normal way can only be read without the relayer through a paid Enoki plan, and there is no budget for one. The open servers proved free. Recommended: yes, and from the first real record.
2. **How many servers must release a key.** Either one of two keeps records readable while one server is down, but either server alone could then release the key. Requiring both is stricter, and a single outage blocks recovery; Overclock failed some runs. Recommended: either one.
3. **How many days go in one stored record.** Each record costs the same regardless of size, so the yearly cost of extending one shop's history scales with the number of records:

   | Batching | Records a year | Extra year of storage |
   |---|---|---|
   | Daily | 365 | ~47 WAL |
   | Weekly | 52 | ~6.7 WAL |
   | Monthly | 12 | ~1.5 WAL |

   Fewer records cost less, but more days sit only on the device before they are stored. Whether larger records stay at the same price was not checked. Recommended: weekly, with the anchor updated daily so the newest days stay tamper-evident.

Also to decide:
- **Who pays for renewals.** Only the account owner wallet `0x6c74…f526` can extend records. It holds no SUI or WAL today.
- **Upgrade rights.** The sponsor wallet holds the anchor package's upgrade cap, so whoever has that key can change the contract. Keep it, or make the package immutable before launch.
- **Gas sponsorship.** The self-run sponsor key worked. Recommended: adopt it, as no extra service is needed.

## Risks
- **The relayer accepts a random vector instead of an embedding.** This is undocumented. If it stops, Path A writes need an embedding provider.
- **Records expire.** Records are kept for about 7 months unless extended. A lapsed renewal loses history.
- **Records are deletable.** The owner wallet can delete any record. The hash chain and anchor must flag missing days.
- **Discovery needs the relayer.** Without it, records can only be read from blob IDs kept elsewhere. Text search does not work on Path A records.
- **Open key servers.** Free today, with no published terms or rate limits checked.
- **Rate limits.** Tatum returned 429s under repeated testing; the app needs pacing and retries. Gemini needs a fallback model.
- **USDsui.** No official coin type found. Do not use until sourced.

## Not tested
- Extending a record's storage
- `restore` rebuilding an empty index
- Recall and restore limits with many records
- Open-server rate limits and terms
- Mainnet anchor for a real shop (the test anchor holds a dummy hash)

## Wallet balances after testing
Sponsor wallet: 0.2256 SUI, 0.2736 USDC. Account owner wallet: empty.
