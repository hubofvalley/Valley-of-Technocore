# Self-Signed Release Attestation v1

Status: design contract. This document does not change the Valley of Technocore v0.1.0-rc.5 CLI or its evidence semantics.

## Purpose and limits

This format lets the controller of an Ed25519 `did:key` sign an exact release statement. A valid signature establishes only that the corresponding key signed the canonical statement bytes.

It does not independently establish identity, authorship, contribution, ownership, repository control, source authenticity, external recognition, eligibility, rewards, or authority. Repository, commit, tag, artifact digest, and signing time are signed declarations; an attestation-only verifier does not fetch or validate those external facts.

## Attestation object

Every field is required. Unknown fields are invalid.

```json
{
  "statement": {
    "schema": "gv.valley-of-technocore.release-attestation/1",
    "attestation_key_did": "did:key:z...",
    "repository": "https://github.com/hubofvalley/Valley-of-Technocore",
    "commit": "57a3119bb0686bf914b8a89b72937c700d10b147",
    "tag": "v0.1.0-rc.5",
    "digest": {
      "kind": "artifact",
      "sha256": "sha256:<64 lowercase hexadecimal characters>"
    },
    "signed_at": "2026-08-26T00:00:00Z"
  },
  "signature": {
    "algorithm": "Ed25519",
    "encoding": "base64url",
    "value": "<64-byte canonical unpadded base64url signature>"
  }
}
```

`digest.kind` v1 is exactly `artifact`. The digest covers the exact release-asset bytes selected for the signing ceremony. Conceptual release metadata is not supported because no canonical release-metadata byte format has been defined.

`signed_at` uses exactly `YYYY-MM-DDTHH:MM:SSZ`: uppercase `T` and `Z`, UTC, seconds required, no fractional seconds or offset. It is signer-declared and cryptographically covered, not trusted time.

Signed strings are not normalised. The repository URL, full lowercase commit SHA, tag, digest, and timestamp are bound exactly as encoded in the canonical statement.

## Signing bytes

The signed message is:

```text
UTF8("gv.valley-of-technocore.release-attestation/1")
|| 0x00
|| UTF8(RFC8785_JCS(statement))
```

Use pure Ed25519 over those exact bytes. There is no BOM, newline, pre-hash, Ed25519ph, or Ed25519ctx operation. RFC 8785 canonicalisation does not perform Unicode normalisation.

Signing and private-key custody are outside this repository. Valley of Technocore must not read, generate, import, store, or expose the private key. Only the public DID, statement, digest, declared timestamp, and signature may enter a published attestation.

## Offline verification contract

A future standalone verifier accepts one UTF-8 attestation object on stdin and performs no network, filesystem, subprocess, environment, or clock access. It must not be added to the existing `valley-technocore` command surface for RC5.

On processable input it emits one canonical report:

```json
{
  "schema_status": "valid",
  "did_status": "valid",
  "signature_status": "valid",
  "external_facts_status": "not-checked",
  "signed_at_status": "declared-only",
  "authority": "none"
}
```

The verifier checks strict schema, supported canonical Ed25519 `did:key`, signature encoding, canonical signing bytes, and signature validity. It checks digest syntax and its inclusion in the signed statement, but cannot recompute the artifact digest without artifact bytes.

Exit codes:

- `0` — supported structure, DID, and signature are valid.
- `1` — internal or runtime I/O failure.
- `2` — malformed or unsupported input.
- `3` — processable input with an invalid signature.

No output may say that a release, repository, commit, tag, artifact, identity, contribution, or external fact was verified.

## RC5 binding and ceremony gates

The first attestation is intended to bind:

- repository: `https://github.com/hubofvalley/Valley-of-Technocore`
- commit: `57a3119bb0686bf914b8a89b72937c700d10b147`
- tag: `v0.1.0-rc.5`
- digest: SHA-256 of one explicitly selected release artifact
- signer: a Grand Valley public Ed25519 `did:key` supplied through Sam's custody process

Before implementation can receive a valid public fixture:

1. Bertold approves the exact artifact bytes to hash.
2. Sam supplies the public DID and performs the signing ceremony outside this repository.
3. John independently reconstructs the canonical signing bytes and verifies the returned public signature.
4. The verifier and fixed public fixture receive mutation, parser-limit, weak-key, environment-invariance, and no-side-effect tests.
5. Oracle and Bertold review the implementation before any release or public claim.

RC5 remains immutable. This attestation cannot relax `public-fact-lock.md` or become proof of contribution/work.
