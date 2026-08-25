# Valley of Technocore v1 specification

## Purpose

Create deterministic portable evidence and verify detached-signature provenance for public Technocore records, entirely offline.

## CLI contract

```text
valley-technocore create-evidence < input.json > contribution-proof.json
valley-technocore verify-evidence < contribution-proof.json
```

`create-evidence` accepts one UTF-8 JSON object on stdin containing `room`, `sequence`, `server_attributed_did`, `signer_did`, `payload_b64u`, and `signature_b64u`. It outputs canonical evidence JSON. Exit codes: `0` success, `2` malformed or unsupported input.

`verify-evidence` accepts one evidence object on stdin and outputs a verification report with `schema_status`, `payload_hash_status`, `did_status`, `server_attribution_status`, `signature_status`, and `authority`. Exit codes: `0` verified, `2` malformed or unsupported evidence, `3` hash or signature failure.

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

All fields are required and every object rejects unknown properties. v1 supports only one Ed25519 public key through `did:key`.

`server_attributed_did` is an observed attribution, not cryptographic authority. A verified detached signature proves only that the supplied public key verifies the exact supplied payload bytes.

## Determinism

- Reject duplicate JSON keys, floats, comments, trailing commas, and unknown fields.
- Treat `payload_b64u` as opaque bytes. Never trim or normalise it.
- Require canonical unpadded base64url.
- Compute `payload_sha256` as lowercase SHA-256 hex over decoded payload bytes, prefixed with `sha256:`.
- Serialize evidence with RFC 8785 JSON Canonicalization Scheme.
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
