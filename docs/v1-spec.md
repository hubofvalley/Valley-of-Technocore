# Valley of Technocore v1 specification

## Purpose

Create deterministic portable evidence and verify detached-signature provenance for public Technocore records, entirely offline.

## CLI contract

```text
valley-technocore create-evidence < input.json > contribution-proof.json
valley-technocore verify-evidence < contribution-proof.json
```

`create-evidence` accepts one UTF-8 JSON object on stdin containing `room`, `sequence`, `server_attributed_did`, `signer_did`, `payload_b64u`, and `signature_b64u`. It outputs canonical evidence JSON. Exit codes: `0` success, `2` malformed or unsupported input.

`verify-evidence` accepts one evidence object on stdin and outputs a verification report with `schema_status`, `payload_hash_status`, `did_status`, `server_attribution_status`, `signature_status`, and `authority`. Validation statuses are `valid` or `invalid`; `server_attribution_status` is `match` when both DIDs are identical and otherwise `mismatch`, while `authority` is always `none`. Exit codes: `0` verified, `1` internal or runtime I/O failure, `2` malformed or unsupported evidence, `3` hash or signature failure. A DID mismatch is informational and does not change the exit code.

Both commands read stdin once, write exactly one canonical JSON object without a trailing newline to stdout on processable input, and accept at most 1,048,576 bytes including whitespace. Diagnostics go to stderr. Input must be UTF-8 without a BOM and contain exactly one JSON object; surrounding JSON whitespace is allowed. `sequence` is an integer token from 0 through 9007199254740991. `room` is 1–256 UTF-8 bytes with ASCII control characters forbidden and is always inert data.

## Evidence schema v1

```json
{
  "schema": "gv.valley-of-technocore.evidence/1",
  "source": { "kind": "technocore-room", "room": "lobby", "sequence": 0 },
  "attribution": { "server_attributed_did": "did:key:..." },
  "statement": {
    "signer_did": "did:key:...",
    "payload_b64u": "...",
    "payload_sha256": "sha256:...",
    "signature": { "algorithm": "Ed25519", "encoding": "base64url", "value": "..." }
  },
  "authority": "none"
}
```

All fields are required and every object rejects unknown properties. v1 accepts only `did:key:z<base58btc>`. Its canonical base58btc decoding must be exactly the Ed25519 multicodec prefix `ed 01` followed by a non-weak 32-byte Ed25519 public key. DID URLs, other multibase encodings, other codecs, noncanonical encodings, and weak keys are unsupported.

`server_attributed_did` is an observed attribution, not cryptographic authority. A verified detached signature proves only that the public key from `signer_did` verifies the exact decoded `payload_b64u` bytes using pure Ed25519. It is never checked against the base64url text, hash, canonical JSON, or `server_attributed_did`, and does not use Ed25519ph or Ed25519ctx.

## Determinism

- Reject duplicate JSON keys, floats, comments, trailing commas, and unknown fields.
- Treat `payload_b64u` as opaque bytes. Never trim or normalise it.
- Require canonical unpadded base64url.
- Compute `payload_sha256` as lowercase SHA-256 hex over decoded payload bytes, prefixed with `sha256:`.
- Serialize evidence with RFC 8785 JSON Canonicalization Scheme and no trailing newline. Verification accepts noncanonical property order and insignificant JSON whitespace.
- Do not include timestamps, paths, hostnames, random values, or environment-derived values.

Identical logical input must produce byte-identical evidence.

## Non-negotiable exclusions

- private-key handling or DID generation
- networking, URL fetching, or a Technocore MCP clone
- wallet, token, reward, or eligibility logic
- subprocess/shell execution
- cron, watchers, autonomous actions, or production infrastructure integration
- environment/secret scanning or undeclared file access

## Required tests and release gate

Tests must cover valid fixtures, modified payload/signature, malformed JSON, duplicate keys, unsupported DID/key types, invalid base64url, oversized input, and malicious strings/URLs. A valid malicious payload may verify cryptographically but must always retain `authority: none`.

The independent safe-to-run review must establish zero network connections, subprocesses, secret/private-key reads, undeclared file reads, filesystem writes, and authority escalation. Any failure stops release.
