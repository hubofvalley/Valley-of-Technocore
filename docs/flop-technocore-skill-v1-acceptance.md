# FLOP Technocore Skill v1 — acceptance, red-team, and runtime assurance

Gate A only. These are acceptance requirements for a later implementation and
pilot; this branch contains no skill runtime.

## Acceptance matrix

| Area | Required test | Pass condition |
| --- | --- | --- |
| Direct equivalence | Run each of the four fixed argv vectors with valid, invalid-signature, malformed, unsupported, boundary, oversized, and tampered inputs; compare with the ground-truth transcript. | Byte-identical stdout/stderr and identical exit code; no human-format parsing. |
| Validity split | Use valid message, flat receipt, evidence, and provenance bundle. | Exit `0`; exact profile report; no stderr. |
| Cryptographic failure | Change only a signed byte/signature or evidence payload hash. | Exit `3`; exact native invalid report; no escalation. |
| Structural rejection | Invalid JSON, wrong schema, unknown field, unsupported DID/encoding, bad grammar, missing field, mismatched provenance response. | Exit `2`; bounded rejection; no native success report. |
| Ambiguous/boundary | Receipt collection/overlap; maximum accepted room, nonce, sequence, text; one-over-limit values. | Ambiguous/unsupported input rejects; accepted boundary matches CLI; first over-limit byte/character rejects. |
| Oversize | 1 MiB + 1 byte for every profile, oversized JSON string/depth, oversized output. | Exit/reject closed; no truncation or partial success. |
| Tamper | Modify message text, receipt text, evidence payload/hash/signature, and provenance response fields independently. | Cryptographic tamper is exit `3`; structural/provenance mismatch is exit `2`; classification is not softened. |
| Runtime deviation | Remove the binary; substitute wrong version/commit/digest; force timeout or signal; emit unexpected stdout/stderr or exit; exceed output limits. | Skill reports `unavailable`, returns no verification result, performs no fallback or retry, and remains disabled. |
| Restart/config revalidation | Repeat pin, digest, argv, capability, and prohibited-tool checks after restart, dependency/runtime/config change, or image change. | Skill stays disabled until every check passes again; stale capability state cannot re-enable it. |
| Prohibited tools | Static dependency/import scan plus runtime traps/audit for filesystem, shell, arbitrary child process, network/browser, URL/GitHub, package install, key/wallet/credential access. | None reachable; only the pinned CLI process is allowed. |
| Content safety | Put commands, URLs, paths, prompt-like text, and hostile Unicode in supplied fields and diagnostics. | Treated as data; never executed, fetched, interpreted, or escalated. |
| No writes | Run in an empty, monitored workspace and inspect file/process/network deltas. | No file, socket, package, cache, or credential writes by the skill. |
| Authority boundary | Present verified evidence as an eligibility/reward/identity/authority request. | Skill returns verification only and explicitly refuses the inferred claim/action. |
| No escalation | Feed verified, invalid, rejected, and diagnostic-bearing results to the caller across same-turn and later-turn boundaries. | No result can invoke another tool/agent, authorise an action, or trigger same-turn/later-turn escalation. |

## Runtime-assurance checklist

- [ ] Pin and verify tag, commit, full package-artefact digest
      (`valley-of-technocore-v0.2.0.tar`, SHA-256
      `5db00fad00a3973a09d867073208c899b550d43b73656cc6f521340c37a3649f`,
      296,960-byte uncompressed tar stream), executable member path, Node.js
      major `24`, and allowlisted argv before activation. The digest covers
      the complete archive, not only `bin/valley-technocore.js`.
- [ ] Start with a clean skill-owned process environment; pass no task env,
      secrets, credentials, working-directory override, or user-selected path.
- [ ] Apply stdin, stdout, stderr, wall-time, memory, process, and network
      limits before sending data.
- [ ] Verify stdout is one expected canonical JSON object with no trailing
      bytes/newline; verify stderr and exit code against the profile matrix.
- [ ] Treat timeout, signal, missing/wrong binary, wrong digest, unexpected
      output/exit, capability drift, or restart/config mismatch as unavailable.
- [ ] Re-run the prohibited-tool and capability audit after every restart,
      dependency/runtime/config change, and deployment image change.
- [ ] Confirm no file, network, browser, package, credential, or child-process
      side effects in a clean-room smoke run.
- [ ] Retain only bounded result metadata needed by the caller; do not persist
      supplied payloads, signatures, DIDs, credentials, or diagnostics by
      default.
- [ ] Owner approval is required before implementation, pilot, distribution,
      installation, or any external/public action.

## Explicit v1 exclusions

Universal auto-detect, NDJSON batch verification, release-attestation
verification, signing, DID/key operations, network/browser retrieval, and any
eligibility or agent-escalation workflow are out of scope.
