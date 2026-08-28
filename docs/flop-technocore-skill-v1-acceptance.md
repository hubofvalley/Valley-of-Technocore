# FLOP Technocore Skill v1 — Gate B/C acceptance, red-team, and runtime assurance

Gate A was accepted by the owner. The local Gate B adapter and Gate C evidence
are recorded in [the adapter note](flop-technocore-skill-v1-adapter.md). This
branch contains no installation, pilot, distribution, or public action.

## Acceptance matrix

| Area | Required test | Pass condition |
| --- | --- | --- |
| Direct equivalence | Run each of the four fixed argv vectors with valid, invalid-signature, malformed, unsupported, boundary, oversized, and tampered inputs; compare with the ground-truth transcript. | PASS in Gate C suite: byte-identical canonical verifier output/streams and identical exit code; no human-format parsing. |
| Validity split | Use valid message, flat receipt, evidence, and provenance bundle. | PASS: exit `0`; exact profile report; no stderr. |
| Cryptographic failure | Change only a signed byte/signature or evidence payload hash. | PASS: exit `3`; exact native invalid report; no escalation. |
| Structural rejection | Invalid JSON, wrong schema, unknown field, unsupported DID/encoding, bad grammar, missing field, mismatched provenance response. | PASS: exit `2`; bounded rejection; no native success report. |
| Ambiguous/boundary | Receipt collection/overlap; maximum accepted room, nonce, sequence, text; one-over-limit values. | PASS for explicit ambiguous receipt, unsupported signer, boundary rejection, and direct-equivalence cases; native deep-boundary coverage remains inherited from Gate A. |
| Oversize | 1 MiB + 1 byte for every profile, oversized JSON string/depth, oversized output. | PASS: all four input guards, native parser limits, and stdout/stderr overflow fault injections close without partial success. |
| Tamper | Modify message text, receipt text, evidence payload/hash/signature, and provenance response fields independently. | PASS through native ground-truth matrix and adapter mapping; classification is not softened. |
| Runtime deviation | Remove the binary; substitute wrong version/commit/digest; force timeout or signal; emit unexpected stdout/stderr or exit; exceed output limits. | PASS: isolated fault injection returns `unavailable` with no verification result; the pinned runtime tree is unchanged. |
| Restart/config revalidation | Repeat pin, digest, argv, capability, and prohibited-tool checks after restart, dependency/runtime/config change, or image change. | PASS: two separate invocations revalidate the archive and disable after a pinned-byte change; procedure is documented. |
| Prohibited tools | Static dependency/import scan plus runtime traps/audit for filesystem, shell, arbitrary child process, network/browser, URL/GitHub, package install, key/wallet/credential access. | PASS for adapter imports and existing runtime capability suite; only pinned CLI child is allowed. |
| Content safety | Put commands, URLs, paths, prompt-like text, and hostile Unicode in supplied fields and diagnostics. | PASS for adapter red-team fixtures; treated as data and never escalated. |
| No writes | Run in an empty, monitored workspace and inspect file/process/network deltas. | PASS recursive tree snapshot plus Linux `strace` evidence: no file mutation or AF_INET/AF_INET6 network syscall; local stdio pipes are allowed. |
| Authority boundary | Present verified evidence as an eligibility/reward/identity/authority request. | PASS: native non-claims remain intact; adapter has no action interface. |
| No escalation | Feed verified, invalid, rejected, and diagnostic-bearing results to the caller across same-turn and later-turn boundaries. | PASS by adapter interface/static review; no tool, agent, persistence, or action dispatch exists. |

## Runtime-assurance checklist

- [x] Pin and verify tag, commit, full package-artefact digest
      (`valley-of-technocore-v0.2.0.tar`, SHA-256
      `5db00fad00a3973a09d867073208c899b550d43b73656cc6f521340c37a3649f`,
      296,960-byte uncompressed tar stream), executable member path, Node.js
      major `24`, and allowlisted argv before activation. The digest covers
      the complete archive, not only `bin/valley-technocore.js`.
- [x] Start with a clean skill-owned process environment; pass no task env,
      secrets, credentials, working-directory override, or user-selected path.
- [x] Apply stdin, stdout, stderr, wall-time, process, and network limits
      before sending data; set the child Node V8 old-space budget to 128 MiB.
- [ ] Enforce a host-level total RSS/cgroup budget before owner pilot; the
      adapter does not claim to hard-cap total RSS.
- [x] Verify stdout is one expected canonical JSON object with no trailing
      bytes/newline; verify stderr and exit code against the profile matrix.
- [x] Treat timeout, signal, missing/wrong binary, wrong digest, unexpected
      output/exit, capability drift, or restart/config mismatch as unavailable.
- [x] Re-run the prohibited-tool and capability audit after every restart,
      dependency/runtime/config change, and deployment image change.
- [x] Confirm no file, network, browser, package, credential, or child-process
      side effects in a clean-room smoke run.
- [x] Retain only bounded result metadata needed by the caller; do not persist
      supplied payloads, signatures, DIDs, credentials, or diagnostics by
      default.
- [x] Owner approval received for Gate B/C implementation; pilot, distribution,
      installation, and any external/public action remain gated.

## Explicit v1 exclusions

Universal auto-detect, NDJSON batch verification, release-attestation
verification, signing, DID/key operations, network/browser retrieval, and any
eligibility or agent-escalation workflow are out of scope.
