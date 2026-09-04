# Changelog

## Unreleased

- Adds the source-checkout `valley-technocore-receipt-intake` compatibility
  entrypoint for losslessly preserving a bare 1-19 digit JSON `nonce` before
  normalising it into canonical `technocore.msg.v1` string form.
- Keeps the existing `valley-technocore` runtime and FLOP Skill v1 v0.2.0 pin
  unchanged; direct message verification retains its existing strict nonce
  type and integer limits.

## 0.2.3

This documentation-only patch publishes the current `main` line after the
separately cut `v0.2.2` release. The package remains private and is not
published to npm.

- Adds the checkout-bound FLOP harness installation guide and cross-links it
  from the skill and README.
- Documents Grand Valley's `d-grand-valley` room, owner DID, and the precise
  signed write boundary: the owner or an explicitly allowlisted key may write.
- Streamlines pilot and source-checkout installation guidance without changing
  verifier CLI behaviour.

## 0.2.2

This published patch release carries the post-`v0.2.1` installation
documentation and Gate B/C runtime-assurance fixes. The package remains
private and is not published to npm.

- Documents the verified source-checkout path and the separately gated,
  commit-pinned pilot installation path.
- Makes the FLOP adapter's Linux `strace` assurance non-skippable and counts
  both `execve` and `execveat` forms in the process trace.
- Adds an active V8 old-space enforcement probe and records the host-envelope
  pilot evidence without changing verifier CLI behaviour.

## 0.2.1

This patch release adds the FLOP Technocore Skill v1 verifier adapter. The
package remains private and is not published to npm.

- Four explicit stdin-only verifier profiles for messages, receipts, evidence,
  and provenance.
- The adapter is pinned to the reviewed `v0.2.0` release and preserves its
  network, filesystem-write, signing, and action-escalation boundaries.
- Existing `v0.2.0` verifier CLI commands and output/exit behaviour are
  unchanged; `v0.2.0` users are unaffected.

## 0.2.0

This release carries the offline v0.2 verification surface. The package remains
private and is not published to npm.

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
