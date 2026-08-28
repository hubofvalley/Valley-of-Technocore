# Integrator contract

This document freezes the machine-output, error, and exit-code contract for Valley of Technocore v0.2 offline verification work. It applies to the PR #19 command surface and preserves the native profile reports already used by existing integrations.

## Invocation boundary

Pass exactly one supplied JSON object through standard input for single-object commands:

```sh
node ./bin/valley-technocore.js verify --format json < supplied.json
```

The verifier consumes stdin only. It does not accept a path, directory, URL, glob, environment-backed configuration, network resource, wallet, private key, signing operation, key generation, or write destination. Shell redirection may open an input file; that file access belongs to the caller, not to the verifier.

Do not parse human output in automation. Use the default JSON format, check the exit code first, then validate the documented object shape. Unknown fields and guessed profile fallbacks are not forward-compatibility mechanisms.

## Exit-code matrix

`1` means an unexpected runtime or I/O failure. The other codes are deterministic contract outcomes:

| Command/profile | Valid or completed | Processable cryptographic invalidity | Malformed, unsupported, or command error |
| --- | ---: | ---: | ---: |
| `evidence create` | `0` (canonical evidence artefact) | n/a | `2` |
| `evidence verify` | `0` (native evidence report) | `3` (native report) | `2` |
| `message verify` / `verify-technocore-message` | `0` (native message report) | `3` (native report) | `2` |
| `receipt normalize` | `0` (canonical `technocore.msg.v1` artefact) | n/a | `2` |
| `receipt verify` | `0` (native message report) | `3` (native message report) | `2` |
| `provenance create` | `0` (canonical bundle artefact) | `3` (native provenance report) | `2` |
| `provenance verify` | `0` (native provenance report) | `3` (native provenance report) | `2` |
| `valley-attestation verify` | `0` (native attestation report) | `3` (native attestation report) | `2` |
| universal `verify` | `0` (wrapper with `failure_category: none`) | `3` (wrapper with `cryptographic_invalidity`) | `2` |
| `batch verify evidence|message|receipt` | `0` when every item is verified | `3` when at least one item is processable-invalid | `2` when at least one item is malformed; takes precedence over `3` |

The matrix also applies to `--format human` where that option is supported. Format changes presentation, not validation or exit status. `batch verify` is JSONL-only and has no human format.

## Output and error taxonomy

### Native single-object reports

These profile-specific machine reports are stable and remain unchanged:

| Profile | Native report fields |
| --- | --- |
| evidence | `schema_status`, `payload_hash_status`, `did_status`, `server_attribution_status`, `signature_status`, `authority` |
| message and receipt verification | `profile`, `decision`, `signature_status`, `reasons`, `non_claims` |
| provenance capture/bundle | `profile`, `decision`, `signature_status`, `reasons`, `non_claims` |
| release attestation | `schema_status`, `did_status`, `signature_status`, `external_facts_status`, `signed_at_status`, `authority` |

On exit `3`, the corresponding native report remains on stdout. It is a processable result, not a transport or schema error. On profile-specific exit `2`, no native report is promised; the bounded error is on stderr and begins with `error:`. Exit `1` is reserved for unexpected failure.

Artefact commands emit their existing canonical artefact on stdout only when they complete successfully. `evidence create`, `receipt normalize`, and successful `provenance create` do not accept human format.

### Universal `verify`

Universal verification classifies without trial-verifying multiple profiles. Its successful machine wrapper has exactly:

```json
{
  "classification": "message",
  "failure_category": "none",
  "next_safe_action": "interpret_with_non_claims",
  "report": {"...": "unchanged native report"}
}
```

`classification` is one of `evidence`, `message`, `receipt`, `provenance_capture`, `provenance_bundle`, or `release_attestation`. Unknown or ambiguous input has `classification: null`; a recognised family remains populated if validation later fails. Input errors have `report: null`.

The bounded `failure_category` values are:

| Category | Meaning | Safe action enum |
| --- | --- | --- |
| `none` | Selected profile verified. | `interpret_with_non_claims` |
| `json` | Input is not one valid UTF-8 JSON object. | `fix_local_json` |
| `schema` | Shape is unknown, ambiguous, or invalid for the selected profile. | `use_one_supported_shape` |
| `missing_signature` | Recognised family lacks its required detached signature. | `supply_existing_detached_signature` |
| `normalisation` | Receipt export cannot map to the canonical message profile. | `convert_supported_receipt_shape` |
| `cryptographic_invalidity` | Supplied signed bytes or payload hash did not verify. | `recheck_exact_supplied_bytes` |
| `provenance_mismatch` | Captured response does not match its signed request. | `compare_captured_request_response` |

Universal JSON input errors are canonical wrapper objects on stdout, with `report: null`, and exit `2`; they do not use the profile-specific `error:` stderr line. Universal human input errors go to stderr and begin with `classification: <kind>` (`unknown` before classification), followed by the failure category, diagnostic, safe action, and bounded error. Successful and processable-invalid human reports go to stdout.

### Batch JSONL

`batch verify` emits one canonical JSON object with `type: "item"` per input line, in input order, then one `type: "summary"` object. Item `outcome` is `verified`, `invalid`, or `malformed`; malformed items carry a bounded `error` string and do not carry a native report. The summary carries `verified`, `invalid`, `malformed`, `total`, and `profile`. Stream-level input/command errors remain stderr with exit `2` or `1`.

## Minimal GitHub Actions example

This example verifies an already-supplied checked-in JSON object. The surrounding checkout and Node setup actions may contact GitHub or download Node; that setup activity is outside the verifier boundary. The verification step itself does not install packages, fetch a receipt, call an API, create keys, sign, post, or scan a directory. Replace the example input with an artifact your workflow already has; keep the verifier invocation stdin-only.

```yaml
name: Verify supplied object

on:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false

      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
        with:
          node-version: 22

      - name: Verify supplied JSON through stdin
        run: node ./bin/valley-technocore.js verify --format json < fixtures/technocore-msg-v1-gauntlet.json
```

Treat exit `0` as verified under the selected local profile only. Treat exit `3` as a processable cryptographic failure requiring review of the supplied bytes. Treat exit `2` as an input/contract failure requiring correction of the supplied object. No result establishes external source authenticity, identity, server inclusion, eligibility, rewards, or authority.
