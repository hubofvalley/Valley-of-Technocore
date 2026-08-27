# Short terminal video plan

This is a reproducible storyboard for a 60–90 second adoption video. It is a documentation plan, not a claim that a recording has been made.

## Audience and promise

Show a new reader what the toolkit checks, how little setup it needs, and what a failed mutation means. End with the trust boundary: local cryptographic verification is not source authentication.

## Recording setup

- Start from a clean checkout of the reviewed commit.
- Use Node.js 22 or newer and a POSIX-compatible shell.
- Use a fresh terminal, large enough to show commands and JSON without scrolling.
- Do not show private keys, credentials, personal paths, or live service access.
- Record stdout, stderr, and exit codes; do not edit results after capture.

## Storyboard

| Time | Terminal action | Narration / on-screen point |
| --- | --- | --- |
| 0–8s | Show the repository title and `node --version`. | “This is an unofficial, local verifier for supplied signed bytes.” |
| 8–20s | Run `npm test`. | “The clean checkout runs its test suite locally; this is not a network check.” |
| 20–35s | Run `create-evidence` with `fixtures/valid-input.json`, then `verify-evidence`. | “The fixture verifies the supplied schema, hash, DID form, and Ed25519 signature.” |
| 35–43s | Show the report and `exit: 0`. | “The report keeps attribution observed-only and authority at none.” |
| 43–62s | Run the one-line mutation from the README, then verify `evidence-mutated.json`. | “Now one signature byte changes in a separate file.” |
| 62–72s | Show `payload_hash_status: invalid` and `exit: 3`. | “The verifier catches the change. This is tamper detection, not proof of who supplied the source.” |
| 72–90s | Show links to the testing guide and v1 specification. | “Use the quick path first; use the specification and reproducibility guide for exact contracts.” |

## Exact command sequence

Use the commands in the README’s [quick tutorial](../README.md#quick-tutorial-valid-then-one-byte-mutation). Keep the valid and mutated files separate. Capture the exit status immediately after each verification so the recording cannot confuse shell status with JSON output.

## Editorial guardrails

Say “the supplied signature verifies the supplied bytes”, “source-provided”, and “offline check”. Do not say “authentic receipt”, “verified identity”, “Technocore-confirmed”, “eligible”, “earned”, “recognised”, or “authorised”. Do not imply that a green local test or a valid signature checks live Technocore state or third-party repository facts.

## Reproduction note

Publish the reviewed commit SHA, Node.js version, operating system, commands, and unedited output with any recording. A video is illustrative; the repository documentation and machine-readable results remain the authoritative reproduction path.
