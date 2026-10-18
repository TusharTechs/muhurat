# Friction report

Each entry: what we did, what we expected, what happened, versions, how to reproduce, and what would fix it. Only issues we reproduced ourselves are listed.

## F1. A failed send is reported as "Execution error without revert data"

- **Surface:** TypeScript SDK, `executeBatch` / any write (`sendArkivTransaction`)
- **Versions:** `@arkiv-network/sdk` 0.8.1, `viem` 2.x, Node 22.22
- **Found:** 17 Oct 2026, step 1 spike

**What we did.** Ran `executeBatch` through a viem `custom` transport whose `eth_sendRawTransaction` throws `Error("captured")`, standing in for any transport failure (network drop, HTTP 413 on a large payload, HTTP 429 on quota).

**Expected.** An error whose message says the send failed and why, for example `Transaction failed: captured`.

**Actual.** `EntityMutationError: Transaction failed: Execution error without revert data`, with `txHash: undefined`. The real reason exists only on `error.cause`. The message points at contract execution, but nothing was executed: the transaction never left the client.

**Why.** In `src/utils/arkivTransactions.ts`, viem wraps the transport error in `ContractFunctionExecutionError`. Its `cause` is not a `ContractFunctionRevertedError`, so the SDK takes the "without revert data" branch and drops `error.shortMessage` and the cause's details.

**Reproduce.** `npm run spike:offline` exercises the path (step "build the Arkiv batch"). Alternatively, minimal repro:

```ts
const t = custom({ async request({ method }) {
  if (method === "eth_sendRawTransaction") throw new Error("captured")
  // answer eth_chainId, eth_blockNumber, eth_call, eth_getTransactionCount,
  // eth_getBlockByNumber, eth_maxPriorityFeePerGas, eth_estimateGas
}})
await createWalletClient({ chain: tiramisu, transport: t, account }).executeBatch({ creates: [/* any */] })
// -> EntityMutationError: Transaction failed: Execution error without revert data
```

**Suggested fix.** In the `ContractFunctionExecutionError` branch, when the cause is not a revert, append `error.cause?.shortMessage ?? error.shortMessage`. Alternatively, distinguish "not sent" (no `txHash`) from "reverted" in the message.

## F2. Tested paths that worked (live on Tiramisu, 17 Oct 2026)

Documented with the same rigour as the issues, because a smooth path is evidence too. Run: `npm run spike:live`, setter `0x518dFCA1563A3C64a397509E8C3F71E3F014bA53`, tx `0xa8b1591ebb053eb36eb0b47198534da8d85e572cf1a510fbf9eb64deb922e09b`. Versions: `@arkiv-network/sdk` 0.8.1, viem 2.x, Node 22.23 (macOS).

| What we tested | Expected | Actual |
| --- | --- | --- |
| `predictEntityKeys({ owner, count: 1 })`, then `executeBatch({ creates: [c], ownershipChanges: [{ entityKey: predicted, newOwner: 0x…dEaD }] })` | The create and the transfer land in one transaction; the minted key equals the prediction | As expected. `createdEntities[0]` equalled the predicted key |
| Query `and(eq("app"), eq("kind"), eq("exam"))` with `select({ creator, owner, creationFlags, expiresAt, payload })` | Returns the new entity right after the receipt | As expected. `creator` = setter, `owner` = `0x…dEaD`, `creationFlags.readonly` and `.permissionlessExtension` both true |
| The setter calls `patchEntity({ entityKey, set: { section } })` after the transfer | Revert, with a reason a builder can act on | `Transaction failed: entity 0xc7656e1a…87cda7 is owned by 0x000000000000000000000000000000000000dEaD, not 0x518dFCA1563A3C64a397509E8C3F71E3F014bA53`. Clear: it names the entity, the owner and the caller |
| 128 KiB payload budget with a ~16 KB armored tlock ciphertext | Fits in one create with 8 attributes | Signed transaction was 18.4 KB; cost about 0.0007 GLM |

## F3. The anonymous query budget is about 100 queries an hour, and running out looks like a hang

- **Surface:** Tiramisu public RPC (`arkiv_query`) and the TypeScript SDK's query builder over viem's `http` transport
- **Versions:** `@arkiv-network/sdk` 0.8.1, `viem` 2.x, Node 22.23 (macOS)
- **Found:** 18 Oct 2026, live run of `schedule` + `centres` with the app open at the bell

**What we did.** Kept an exam page open through a live bell. It re-reads the exam (6 queries) when entity events arrive. Then we ran `loadExam` from Node.

**Expected.** Either the read succeeds or it fails quickly with an error that says "rate limited".

**Actual.** The RPC answers `HTTP 429` with `{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}` and `ratelimit: limit=10000, remaining=0, reset=<seconds>`, with a matching `retry-after`. Every `arkiv_query` costs a flat `arkiv-cost: 100`, with or without payload, so the budget is about **100 queries an hour per client** (we saw `reset` count down from 2478 s, so it's an hourly window). `eth_*` calls were not refused. viem honours `Retry-After` before each of its 3 default retries, so `for await (… of publicClient.select()…)` sits silent for up to 3 × `retry-after` (minutes to most of an hour) and then throws a generic `HttpRequestError: HTTP request failed.` with `details: "ANON_COST_LIMITED"`. In the app, one exam refresh was 6 queries every few seconds. The receipts query lost the race and the page showed "Receipts 0/3" while all three receipts were on chain. The next time, a fresh page could not load the exam at all. The budget is not in the docs we could find, and neither is how to pass an access key.

**Reproduce.** Serve that 429 body with `retry-after: 3` from a local HTTP server, point `createPublicClient({ transport: http(url) })` at it, and iterate any `select()`. Four requests 3 s apart, then the throw at 9 s. With the real header the gaps are the rest of the hour.

**What we changed.**
- `loadExam` makes one query (`app` + `exam`) and splits the result by `kind` on the client, instead of one query per kind. The `$creator` checks are unchanged.
- The app's read client uses `http(rpc, { retryCount: 0 })` and keeps the last good state with a plain "rate-limiting" note.
- The exam page re-reads at most once a minute on entity events (every 4 s in the minute after the bell, when receipts arrive), every 2 minutes as a fallback, and never while the tab is hidden.
- The Arkiv beacon fallback is only consulted once drand is 10 s late.
- See `src/arkiv.ts`, `web/chain.ts` and `web/pages/Exam.tsx`.

**Suggested fix.** Document the anonymous budget and the cost per query next to the query docs. In the SDK, map `ANON_COST_LIMITED` to a typed error, and default the query client to fail fast (or cap the `Retry-After` wait) so a UI can say what is happening. A batched "several queries, one cost" call would also help apps that read one record's whole neighbourhood.

**Related, seen live the same run (F1 in the wild).** A centre wallet sent a lease renewal while the same wallet's beacon relay was in flight. One lost the nonce race, and the error read `Transaction failed: Execution error without revert data`. We now serialise each centre's writes (`scripts/centres.ts`).

## Adjacent (not Arkiv): tlock-js does not check the drand chain

`tlock-js` 0.9.0 `timelockDecrypt` reads the round from the age stanza but never compares the stanza's chain hash with the client's chain (its source carries the comment "should probably verify chain hash here too"). For a timelock app this matters: a ciphertext sealed to a private drand network can be opened by whoever runs that network. We check the header ourselves before accepting a bank (`src/seal.ts` `assertSealedFor`). Noted here because any Arkiv app storing timelocked payloads inherits it.
