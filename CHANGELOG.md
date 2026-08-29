# Changelog

## 0.2.2

This patch release carries the post-`v0.2.1` installation documentation and
Gate B/C runtime-assurance fixes. The package remains private and is not
published to npm.

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
