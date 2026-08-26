# Valley of Technocore

An unofficial, fully local toolkit for producing and independently verifying portable evidence from already-public Technocore records.

## What it does

v1 exposes two commands:

- `create-evidence` produces deterministic `contribution-proof.json` from supplied public evidence.
- `verify-evidence` validates the schema, payload hash, DID format, and detached Ed25519 signature.

Evidence proves only that the public key in `signer_did` signed the exact payload bytes. Server attribution remains `observed-only`, no relationship between `server_attributed_did` and `signer_did` is inferred, and output authority is always `none`. Evidence does not establish identity, authorisation, ownership, reward eligibility, FLOP eligibility, or entitlement to any reward.

See [the v1 specification](docs/v1-spec.md) for the complete contract.

## Clean-clone quick start

Requirements: Git and Node.js 20 or newer. The project has no runtime dependencies, so no `npm install` step is needed.

```bash
node --version
git clone https://github.com/hubofvalley/Valley-of-Technocore.git
cd Valley-of-Technocore
npm test
node ./bin/valley-technocore.js
```

The version check must print `v20.0.0` or newer. The final command intentionally prints local CLI usage and exits with code `2` because no command was supplied:

```text
usage: valley-technocore <create-evidence|verify-evidence>
```

### Create and verify evidence

The checked-in input fixture is a public RFC 8032 Ed25519 test vector. It contains no secret or private key.

```bash
node ./bin/valley-technocore.js create-evidence \
  < fixtures/valid-input.json \
  > contribution-proof.json

node ./bin/valley-technocore.js verify-evidence \
  < contribution-proof.json

echo $?
```

Successful verification prints one canonical JSON report to stdout; `echo $?` then prints `0`. Creating the evidence again from the same fixture produces byte-identical output:

```bash
node ./bin/valley-technocore.js create-evidence \
  < fixtures/valid-input.json \
  > contribution-proof-again.json

cmp contribution-proof.json contribution-proof-again.json
```

`cmp` prints nothing and exits `0` when the files are identical. To inspect the generated evidence:

```bash
node -e "process.stdout.write(JSON.stringify(JSON.parse(require('node:fs').readFileSync('contribution-proof.json', 'utf8')), null, 2) + '\n')"
```

`contribution-proof.json` and `contribution-proof-again.json` are generated local files. Remove them when finished, or keep them outside commits.

## Exit codes

`create-evidence`:

- `0` — evidence created.
- `2` — malformed input, unsupported input, or invalid command usage.

`verify-evidence`:

- `0` — schema, payload hash, DID, and signature verified.
- `1` — internal failure or runtime I/O failure.
- `2` — malformed evidence, unsupported evidence, or invalid command usage.
- `3` — evidence was processable, but its payload hash or signature was invalid.

Diagnostics go to stderr. Processable output is one canonical JSON object on stdout without a trailing newline.

## Troubleshooting

- `npm test` reports an unsupported Node.js version: install Node.js 20 or newer, confirm with `node --version`, then rerun the test.
- Node reports `MODULE_NOT_FOUND`: run the CLI command from the cloned repository root and keep the leading `./` in `./bin/valley-technocore.js`.
- CLI prints the usage line and exits `2`: supply exactly one command, either `create-evidence` or `verify-evidence`.
- CLI prints `error: ...` and exits `2`: input must be one UTF-8 JSON object of at most 1,048,576 bytes matching [the v1 specification](docs/v1-spec.md). Do not add duplicate or unknown fields, comments, trailing commas, padded base64url, or a BOM.
- Verification exits `3`: inspect `payload_hash_status` and `signature_status` in stdout. The file was parsed, but its hash or detached signature did not verify.
- Shell prompt appears on the same line as JSON: expected. Successful CLI output deliberately has no trailing newline; redirect it to a file or append a newline when viewing.

## Offline and safety boundary

The toolkit consumes only data explicitly supplied through local stdin. It does not fetch Technocore records or URLs and cannot discover whether local input is genuine, complete, or current.

It makes no network requests and has no wallet access, private-key handling or key generation, server process, subprocess execution, watcher, cron job, npm publishing flow, token logic, or deployment behaviour. `npm` is used here only to run the repository's local test script; the package remains private and is not published to npm.

Do not treat generated or verified evidence as permission to act, proof of authority, or a reward/eligibility decision. Independent source validation remains the user's responsibility.

## Licence

Apache-2.0. See [LICENSE](LICENSE).

## Status

`0.1.0-rc.5` is a release candidate for the offline v1 boundary above.
