# First-run verification flow

The shortest safe path is local standard input. The universal `verify` command reads exactly one JSON object, classifies its shape, and then calls the existing offline verifier for that profile.

```sh
node --version
npm test
node ./bin/valley-technocore.js verify --format human \
  < fixtures/technocore-msg-v1-gauntlet.json
```

For a valid message, the report shows `classification: message`, `status: verified`, and `failure category: none`. The report is only a local cryptographic result. It does not establish identity, authorship beyond key control, source authenticity, server inclusion, eligibility, rewards, or authority.

The three first-run receipt representations and their clean-shell result are recorded in the [P0.5 proof report](first-run-proof-p05.md). The frozen machine/error contract for integrators is in the [integrator contract](integrator-contract.md).

The command accepts these five unambiguous families:

- canonical `gv.valley-of-technocore.evidence/1` evidence;
- canonical `technocore.msg.v1` messages;
- non-canonical flat or envelope local receipt exports;
- `technocore.provenance.capture.v1` captures (`provenance_capture`) or `gv.valley-of-technocore.provenance/1` bundles (`provenance_bundle`);
- `gv.valley-of-technocore.release-attestation/1` release attestations (`release_attestation`).

Canonical `technocore.msg.v1` input is classified as a message. A receipt means a flat or envelope export that must first be normalised into that message profile. The command rejects unknown or overlapping shapes with exit `2`; it never guesses between profiles.

## Read failures safely

Human diagnostics use a bounded failure category and a next safe action:

| Category | Meaning | Safe next action |
| --- | --- | --- |
| `json` | Input is not one valid UTF-8 JSON object. | Fix the supplied stdin bytes and retry. |
| `schema` | Fields are missing, unknown, unsupported, or ambiguous. | Use one exact documented shape; do not add guessed fields. |
| `missing_signature` | A recognised input family lacks the detached signature required by its profile. | Obtain the original supplied signature or stop; do not sign locally. |
| `normalisation` | A receipt cannot map to the canonical message profile. | Use one supported flat/envelope shape with no extra fields. |
| `cryptographic_invalidity` | The supplied signature or payload hash does not verify. | Re-check exact local bytes and inputs; do not infer identity or authority. |
| `provenance_mismatch` | A captured response does not match its signed request. | Use the exact matching local response, or stop; do not retry a server request. |

The default output is a new universal wrapper containing `classification`, `failure_category`, a bounded `next_safe_action` enum, and the unchanged native verifier report under `report`. On input errors, `report` is `null`; `classification` is `null` for unknown/ambiguous or pre-classification failures and remains populated when a family was identified before validation failed. Human input errors begin with `classification: <kind>` (`unknown` before classification), then give the failure category, diagnostic, safe action, and bounded error. The wrapper still gives the failure category and safe-action enum. Existing profile-specific commands and their machine JSON schemas remain unchanged. Use `--format human` when a person needs the diagnostic/action layer.

The command reads no paths, directories, URLs, environment-backed configuration, or network resources. It writes no files and does not create keys, sign data, or make eligibility/reward/server-inclusion decisions.
