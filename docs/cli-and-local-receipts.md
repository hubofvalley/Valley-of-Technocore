# CLI and local receipt workflow

The verifier stays offline and stateless. It reads one JSON object from standard input and writes a report to standard output. It does not fetch a room, sign data, remember earlier messages, establish identity, decide eligibility, or prove server inclusion.

## Command hierarchy

```text
valley-technocore evidence create
valley-technocore evidence verify
valley-technocore message verify
valley-technocore receipt normalize
valley-technocore receipt verify
valley-attestation verify
```

The original `create-evidence`, `verify-evidence`, and `verify-technocore-message` names remain supported. JSON remains the default machine output. Add `--format human` for a line-oriented display intended for a person. Both formats use the same validation and exit codes:

- `0`: processed and valid, or normalisation completed
- `2`: malformed input, unsupported shape, or command error
- `3`: processable input with an invalid signature or payload hash
- `1`: unexpected internal failure

Errors go to standard error and begin with `error:`. Help exits `0` without reading standard input.

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
