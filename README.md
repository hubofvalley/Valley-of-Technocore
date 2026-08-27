# Valley of Technocore

An unofficial, fully local toolkit for packaging supplied Ed25519-signed data as portable evidence and checking the supplied bytes for later tampering.

## 30-second path

### What it is

Valley of Technocore is a verifier-only CLI. It reads data from local standard input, checks a defined schema, payload hash, DID/key form, and detached Ed25519 signature, then prints one machine-readable JSON report. It makes no network requests and does not sign, fetch, or contact Technocore.

### Why it is useful

It gives you a deterministic record of what was supplied and a repeatable way to detect changes. A successful check means only that the supplied public key verifies the exact supplied payload bytes and that the recorded hash matches. It does not prove who controls a key, who wrote a message, server inclusion, source authenticity, contribution, eligibility, rewards, recognition, or authority.

### Try now

Requirements: Git and Node.js 22 or newer. There are no runtime dependencies and no `npm install` step.

```bash
git clone https://github.com/hubofvalley/Valley-of-Technocore.git
cd Valley-of-Technocore
npm test

node ./bin/valley-technocore.js create-evidence \
  < fixtures/valid-input.json > evidence.json

node ./bin/valley-technocore.js verify-evidence < evidence.json
printf '\nexit: %s\n' "$?"
```

Expected: a JSON report with `schema_status`, `payload_hash_status`, `did_status`, and `signature_status` set to `valid`, `server_attribution_status` set to `observed-only`, and `authority` set to `none`; the exit code is `0`.

### What the result means

`valid` is a cryptographic result for the bytes you supplied. It is not an external trust decision. `server_attribution_status: observed-only` records supplied attribution without authenticating it. `authority: none` is always explicit.

## Quick tutorial: valid, then one-byte mutation

The checked-in fixture uses a public RFC 8032 Ed25519 test vector. Create and verify it, then mutate one signature byte in a separate file:

```bash
node ./bin/valley-technocore.js create-evidence \
  < fixtures/valid-input.json > evidence.json
node ./bin/valley-technocore.js verify-evidence < evidence.json
printf '\nvalid exit: %s\n' "$?"

node -e "const fs = require('node:fs'); const e = JSON.parse(fs.readFileSync('evidence.json', 'utf8')); const b = Buffer.from(e.statement.signature.value, 'base64url'); b[0] ^= 1; e.statement.signature.value = b.toString('base64url'); fs.writeFileSync('evidence-mutated.json', JSON.stringify(e));"

node ./bin/valley-technocore.js verify-evidence < evidence-mutated.json
printf '\nmutated exit: %s\n' "$?"
```

The first command exits `0`. The second is processable but fails signature verification with exit `3`. This demonstrates tamper detection; it does not authenticate an external source.

Clean up generated files when finished:

```bash
rm -f evidence.json evidence-mutated.json
```

For a narrated terminal walkthrough, see [the video plan](docs/terminal-video-plan.md). For the full reproducibility matrix, see [the testing guide](docs/testing-and-reproducibility.md).

## Choose your depth

- [Testing and reproducibility](docs/testing-and-reproducibility.md) — clean-clone commands, expected outputs, and a source-of-results matrix.
- [v1 specification](docs/v1-spec.md) — exact schema, canonical bytes, validation contract, and exit codes.
- [Technocore message profile](docs/technocore-msg-v1.md) — the pinned stateless message format and its exclusions.
- [Release attestation specification](docs/release-attestation-v1.md) — signed metadata fields and the `external_facts_status: not-checked` boundary.
- [One-sample receipt mapping](docs/technocore-receipt-compatibility.md) — a third-party source-presented receipt and one offline byte mapping.
- [Public fact lock](docs/public-fact-lock.md) — approved public wording and non-claims.

## Evidence commands

`create-evidence` reads one supported object from stdin and writes deterministic evidence JSON. `verify-evidence` checks the evidence schema, payload hash, Ed25519 `did:key`, and detached signature. The stateless `verify-technocore-message` command checks a supplied message against the pinned profile. All commands are local and verifier-only.

`valley-attestation` verifies the checked-in release-attestation signature and reports `external_facts_status: not-checked`; it does not fetch or validate the repository, tag, digest, signing time, or signer identity.

Successful verification does not establish authenticity, identity, authorship, contribution, ownership, server inclusion, recognition, eligibility, rewards, repository control, or authority. The toolkit has no wallet, token, key-generation, private-key, deployment, watcher, cron, publishing, or autonomous-action flow.

## Exit codes

- `0` — verification succeeded.
- `1` — internal or runtime I/O failure.
- `2` — malformed, unsupported, or invalid command input.
- `3` — processable input whose payload hash or detached signature did not verify.

Diagnostics go to stderr. Processable output is one canonical JSON object on stdout without a trailing newline.

## Status and licence

Version `0.1.0-rc.6` is a prerelease. It is not a stable or final v1 release. Apache-2.0; see [LICENSE](LICENSE).
