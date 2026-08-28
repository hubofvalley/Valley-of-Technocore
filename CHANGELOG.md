# Changelog

## 0.2.0-rc.1 (release candidate)

This candidate carries the offline v0.2 verification surface. The intended tag,
prerelease publication, deterministic archive, checksum manifest, and any
release attestation remain separate release-owner gates.

- Universal stdin-only verification for evidence, messages, local receipts,
  provenance, and release attestations.
- Bounded NDJSON batch verification for evidence, messages, and local receipts.
- Offline provenance capture/bundle handling and the public compatibility corpus.
- P0.5 first-run proof and integrator output, error, and exit-code contracts.

## 0.1.0

Stable v0.1.0 package and release metadata.

- Deterministic offline evidence creation and verification.
- Grouped CLI commands with canonical JSON output and optional human-readable
  verification reports.
- Local normalisation and verification of one supplied Technocore receipt at a
  time.
- Stateless technocore.msg.v1 verification with explicit non-claim
  boundaries.
- Standalone offline verification of the checked-in release-attestation
  format.
