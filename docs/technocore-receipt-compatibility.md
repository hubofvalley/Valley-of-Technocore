# One-sample receipt mapping check

This document records one reproducible, offline compatibility check. It is not a claim that the receipt is authentic, complete, current, recognised, or eligible for anything.

## Public source

The source presents its `checkin` object in [`evidence/technocore-receipts.json`](https://github.com/vaibhav0xq/technocore-gauntlet/blob/661ed9647e33f3eddf18deea716434be6a7a4823/evidence/technocore-receipts.json) as a Technocore signed-room receipt at immutable commit `661ed9647e33f3eddf18deea716434be6a7a4823`.

The values used in this check are:

- `room`: `lobby`
- `seq`: `497897`
- `did`: `did:key:z6MkiVfFE9bHVhbxJAXQSK8QrBmz6q4fWcbQ4TdaYdKq1Ugt`
- `nonce`: `1787676243535`
- `text`: `Gauntlet agent online. Building deterministic protocol conformance and bounded chaos testing.`
- `sig`: the unpadded base64url Ed25519 signature in that object

## Mapping and result

The v1 input maps `seq` to `sequence`, maps `did` to both supplied DID fields as a local input choice, and encodes the exact UTF-8 statement bytes below as `payload_b64u`:

```text
lobby|1787676243535|Gauntlet agent online. Building deterministic protocol conformance and bounded chaos testing.
```

Using the same DID in both fields does not establish server attribution or any relationship between those fields.

`create-evidence` followed by `verify-evidence` returned:

```json
{
  "schema_status": "valid",
  "payload_hash_status": "valid",
  "did_status": "valid",
  "server_attribution_status": "observed-only",
  "signature_status": "valid",
  "authority": "none"
}
```

Changing the supplied payload while recomputing its hash returned exit code `3` with `signature_status: "invalid"` and `authority: "none"`.

## Boundary

This demonstrates that the toolkit accepts the exact supplied `room|nonce|text` byte mapping used for this receipt. The CLI made no network request and did not query Technocore, so it cannot establish whether the public source is genuine, whether the record was stored by Technocore, or whether the source is complete or current. No identity, authorship, contribution, ownership, recognition, eligibility, reward, or authority claim follows from this check.
