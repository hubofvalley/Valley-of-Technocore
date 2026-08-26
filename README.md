# Valley of Technocore

An unofficial, fully local toolkit for packaging supplied Ed25519-signed data as portable evidence and checking it for later tampering.

An independent, unofficial tool by Grand Valley; it is not affiliated with Technocore.

## Try it from a clean clone

Requirements: Git and Node.js 20 or newer. The project has no runtime dependencies, so no `npm install` step is needed.

```bash
node --version
git clone https://github.com/hubofvalley/Valley-of-Technocore.git
cd Valley-of-Technocore
npm test

node ./bin/valley-technocore.js create-evidence \
  < fixtures/valid-input.json \
  > evidence.json

node ./bin/valley-technocore.js verify-evidence \
  < evidence.json

echo $?
```

`node --version` must print `v20.0.0` or newer. The fixture is a public RFC 8032 Ed25519 test vector; it contains no secret or private key. Successful verification prints this report and `echo $?` prints `0`:

```json
{"authority":"none","did_status":"valid","payload_hash_status":"valid","schema_status":"valid","server_attribution_status":"observed-only","signature_status":"valid"}
```

### See tamper detection fail safely

Make a separate local copy with only its recorded payload hash changed, then verify it:

```bash
node -e "const fs = require('node:fs'); const evidence = JSON.parse(fs.readFileSync('evidence.json', 'utf8')); evidence.statement.payload_sha256 = 'sha256:' + '0'.repeat(64); fs.writeFileSync('evidence-tampered.json', JSON.stringify(evidence));"

node ./bin/valley-technocore.js verify-evidence \
  < evidence-tampered.json

echo $?
```

The report contains `"payload_hash_status":"invalid"`, and `echo $?` prints `3`. This changes only the new `evidence-tampered.json` file; the fixture and `evidence.json` remain untouched.

Remove the generated files when finished, or keep them outside commits:

```bash
rm evidence.json evidence-tampered.json
```

## When this is useful

Use this toolkit to package already-supplied signed bytes in a deterministic JSON format, verify the included Ed25519 signature and payload hash offline, or demonstrate that a packaged file changed after creation.

Compatibility with a real public Technocore record has not yet been demonstrated. The current flow uses only a public RFC 8032 fixture. The toolkit does not fetch, authenticate, or independently validate Technocore records or any other external source.

A valid report cannot prove authenticity, identity, authorship, contribution, ownership, recognition, eligibility, rewards, repository control, or authority. It proves only that the public key in `signer_did` verifies the exact supplied payload bytes and that the recorded payload hash matches them. `server_attributed_did` remains observed attribution only; no relationship between the two DIDs is inferred.

## Evidence commands

v1 exposes two evidence commands:

- `create-evidence` writes deterministic evidence JSON to stdout from a supported object supplied on stdin.
- `verify-evidence` checks the evidence schema, payload hash, Ed25519 `did:key`, and detached signature.

See [the evidence v1 specification](docs/v1-spec.md) for the exact schema and validation contract.

### Exit codes

`create-evidence`:

- `0` — evidence created.
- `2` — malformed input, unsupported input, or invalid command usage.

`verify-evidence`:

- `0` — schema, payload hash, DID, and signature verified.
- `1` — internal failure or runtime I/O failure.
- `2` — malformed evidence, unsupported evidence, or invalid command usage.
- `3` — evidence was processable, but its payload hash or signature was invalid.

Diagnostics go to stderr. Processable output is one canonical JSON object on stdout without a trailing newline.

## Verify the release attestation

The separate `valley-attestation` command verifies the checked-in self-signed release attestation locally:

```bash
node ./bin/valley-attestation.js \
  < fixtures/release-attestation-v1.json

echo $?
```

Successful verification prints a canonical report with `signature_status` set to `valid`, `external_facts_status` set to `not-checked`, and `authority` set to `none`; `echo $?` then prints `0`.

This verifier verifies only the signature over the exact signed statement bytes using the public key encoded by the public DID. It does not independently prove identity, authorship, contribution, ownership, repository control, source authenticity, external recognition, FLOP eligibility, rewards, or authority.

See [the release-attestation v1 specification](docs/release-attestation-v1.md) for the exact schema, signing bytes, limitations, and exit codes.

## Offline and safety boundary

The toolkit consumes only data explicitly supplied through local stdin. It cannot discover whether that input is genuine, complete, recognised, eligible, or current.

It makes no network requests and has no URL fetching, wallet access, private-key handling or key generation, server process, subprocess execution, watcher, cron job, npm publishing flow, token logic, or deployment behaviour. `npm` is used here only to run the repository's local test script; the package remains private and is not published to npm.

Generated or verified evidence grants no permission to act and carries no authority. Independent source validation remains the user's responsibility.

## Troubleshooting

- `npm test` reports an unsupported Node.js version: install Node.js 20 or newer, confirm with `node --version`, then rerun the test.
- Node reports `MODULE_NOT_FOUND`: run the CLI command from the cloned repository root and keep the leading `./` in `./bin/valley-technocore.js`.
- CLI prints the usage line and exits `2`: supply exactly one supported command.
- CLI prints `error: ...` and exits `2`: input must be one UTF-8 JSON object of at most 1,048,576 bytes matching [the v1 specification](docs/v1-spec.md). Do not add duplicate or unknown fields, comments, trailing commas, padded base64url, or a BOM.
- Verification exits `3`: inspect `payload_hash_status` and `signature_status` in stdout. The file was parsed, but its hash or detached signature did not verify.
- Shell prompt appears on the same line as JSON: expected. Successful CLI output deliberately has no trailing newline; redirect it to a file or append a newline when viewing.

## Status

`0.1.0-rc.6` adds the standalone release-attestation verifier. The original evidence CLI and immutable `v0.1.0-rc.5` tag retain their existing semantics.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
