# CLI and local receipt workflow

The verifier stays offline and stateless. It reads one JSON object from standard input and writes a report to standard output. It does not fetch a room, sign data, remember earlier messages, establish identity, decide eligibility, or prove server inclusion.

## Command hierarchy

```text
valley-technocore evidence create
valley-technocore evidence verify
valley-technocore message verify
valley-technocore receipt normalize
valley-technocore receipt verify
valley-technocore batch verify <evidence|message|receipt>
valley-attestation verify
```

The original `create-evidence`, `verify-evidence`, and `verify-technocore-message` names remain supported. JSON remains the default machine output. Verification commands accept `--format human` for a line-oriented report intended for a person. Artefact-producing commands (`evidence create` and `receipt normalize`) always write canonical JSON and reject `--format human`; their output must remain suitable for later verification.

JSON and human verification reports use the same validation and exit codes:

- `0`: processed and valid, or normalisation completed
- `2`: malformed input, unsupported shape, or command error
- `3`: processable input with an invalid signature or payload hash
- `1`: unexpected internal failure

Errors go to standard error and begin with `error:`. Help exits `0` without reading standard input.

## Batch verification (NDJSON only)

`batch verify` reads a bounded NDJSON stream from standard input. Select exactly one profile for the stream: `evidence`, `message`, or `receipt`. Receipt records use the same local normalisation contract as `receipt verify`; the other two profiles use their existing verifier contracts.

```sh
node ./bin/valley-technocore.js batch verify receipt < local-exports.ndjson
```

For each input line, standard output contains a canonical JSONL item record with a one-based `index`, profile, outcome, and either the ordinary verification report or a validation error. A final canonical JSONL summary gives `verified`, `invalid`, `malformed`, and `total` counts. Output order is input order.

The exit code is `0` when every record verifies, `3` when one or more processable records are invalid, and `2` when one or more records are malformed; `2` takes precedence if both occur. This interface never accepts a directory, path, URL, or glob. It reads no files and does not perform HTTP, signing, key generation, wallet operations, or eligibility decisions.

## Normalise a local receipt export

`receipt normalize` accepts one local JSON object in any of these bounded forms:

```json
{"room":"lobby","did":"did:key:z...","nonce":"123","text":"hello","signature":"..."}
```

```json
{"room":"lobby","signer_did":"did:key:z...","nonce":"123","message":"hello","signature":"..."}
```

```json
{"room":"lobby","receipt":{"did":"did:key:z...","nonce":"123","text":"hello","signature":"..."}}
```

Canonical `technocore.msg.v1` input is also accepted. Unknown fields and ambiguous collection exports are rejected. The normaliser does not read a path or URL embedded in input. A detached signature must be present; otherwise the command exits `2` with a specific missing-signature error.

```bash
valley-technocore receipt normalize < exported-receipt.json > message.json
valley-technocore message verify < message.json
```

For a single step:

```bash
valley-technocore receipt verify --format human < exported-receipt.json
```

Normalisation only maps field names into the existing verifier input. A valid result proves that the supplied message bytes match the supplied signature and public key. It does not prove who controls the key, where the export came from, whether a server stored it, whether it is new rather than replayed, or whether it carries authority or eligibility.

## Package verification

The repository test suite runs `npm pack`, installs the resulting tarball into a clean temporary prefix without lifecycle scripts, and executes the installed `valley-technocore` binary against the signed fixture. Test and fixture directories are intentionally excluded from the package.
