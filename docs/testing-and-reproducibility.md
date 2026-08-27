# Testing and reproducibility

This document shows how to reproduce the repository's local test results from a clean checkout. It also separates results produced locally by this toolkit from CI records and claims copied from a third-party source.

None of these checks establishes Technocore or FLOP authenticity, affiliation, recognition, identity, authorship, contribution, ownership, eligibility, rewards, authority, or source validity.

## Prerequisites

Use a clean directory with:

- Git;
- Node.js 22 or newer, including `npm`; and
- a POSIX-compatible shell with `cmp`, `rm`, and `test` (for example, Linux, macOS, WSL, or Git Bash).

The package has no runtime dependencies, so there is no `npm install` step. Network access is needed only to clone the repositories. The toolkit commands themselves consume local standard input and make no network requests.

Start from a clean clone:

```bash
git clone https://github.com/hubofvalley/Valley-of-Technocore.git
cd Valley-of-Technocore
node --version
git rev-parse HEAD
```

`node --version` must print `v22.0.0` or newer. Record the commit from `git rev-parse HEAD` with any result you publish.

## Run the repository test suite

```bash
npm test
```

A successful run exits `0`. The test output reports the number of passing and failing tests. This result applies only to the recorded checkout, Node.js version, operating system, and command invocation.

## Reproduce the RFC 8032 fixture flow

The checked-in `fixtures/valid-input.json` uses a public RFC 8032 Ed25519 test vector. It contains no private key or secret.

Create evidence and verify it:

```bash
node ./bin/valley-technocore.js create-evidence \
  < fixtures/valid-input.json \
  > evidence.json

if node ./bin/valley-technocore.js verify-evidence \
  < evidence.json; then
  verify_status=0
else
  verify_status=$?
fi

printf '\n%s\n' "$verify_status"
test "$verify_status" -eq 0
```

The verification report is:

```json
{"authority":"none","did_status":"valid","payload_hash_status":"valid","schema_status":"valid","server_attribution_status":"observed-only","signature_status":"valid"}
```

The exit code is `0`. This verifies the supplied payload hash and detached Ed25519 signature against the public key encoded by the supplied DID. It does not validate an external source or the meaning of the payload.

### Check deterministic output

Create the same evidence twice and compare the exact bytes:

```bash
node ./bin/valley-technocore.js create-evidence \
  < fixtures/valid-input.json \
  > evidence.json

node ./bin/valley-technocore.js create-evidence \
  < fixtures/valid-input.json \
  > evidence-again.json

if cmp evidence.json evidence-again.json; then
  equality_status=0
else
  equality_status=$?
fi

printf '%s\n' "$equality_status"
test "$equality_status" -eq 0
```

`cmp` prints nothing and exits `0` when both outputs are byte-identical.

### Check tamper detection

Change only the recorded payload hash in a separate generated file:

```bash
node -e "const fs = require('node:fs'); const evidence = JSON.parse(fs.readFileSync('evidence.json', 'utf8')); evidence.statement.payload_sha256 = 'sha256:' + '0'.repeat(64); fs.writeFileSync('evidence-tampered.json', JSON.stringify(evidence));"

if node ./bin/valley-technocore.js verify-evidence \
  < evidence-tampered.json; then
  tamper_status=0
else
  tamper_status=$?
fi

echo "$tamper_status"
test "$tamper_status" -eq 3
```

The report contains `"payload_hash_status":"invalid"`, and the captured exit code is `3`. Exit `3` means the evidence was processable but its payload hash or signature was invalid; it is not a source-authenticity judgement.

## Reproduce the one-sample receipt mapping

The third-party source presents a `checkin` object as a Technocore signed-room receipt in [`evidence/technocore-receipts.json`](https://github.com/vaibhav0xq/technocore-gauntlet/blob/661ed9647e33f3eddf18deea716434be6a7a4823/evidence/technocore-receipts.json) at commit `661ed9647e33f3eddf18deea716434be6a7a4823`.

Clone that source beside this repository and detach at the exact commit:

```bash
git clone https://github.com/vaibhav0xq/technocore-gauntlet.git \
  ../technocore-gauntlet-661ed964

git -C ../technocore-gauntlet-661ed964 checkout --detach \
  661ed9647e33f3eddf18deea716434be6a7a4823

test "$(git -C ../technocore-gauntlet-661ed964 rev-parse HEAD)" = \
  "661ed9647e33f3eddf18deea716434be6a7a4823"
```

Map the source-provided `checkin` fields into this toolkit's v1 input. The source's `seq` becomes `sequence`; using its DID in both DID fields is a local mapping choice and does not establish server attribution. The signed bytes are the exact UTF-8 encoding of `room|nonce|text`.

```bash
node - <<'NODE' > receipt-input.json
const fs = require('node:fs');

const source = JSON.parse(fs.readFileSync(
  '../technocore-gauntlet-661ed964/evidence/technocore-receipts.json',
  'utf8'
));
const receipt = source.receipts.find(
  ({ kind, seq }) => kind === 'checkin' && seq === 497897
);
if (!receipt) throw new Error('expected checkin receipt not found');

const payload = Buffer.from(
  `${receipt.room}|${receipt.nonce}|${receipt.text}`,
  'utf8'
).toString('base64url');

process.stdout.write(JSON.stringify({
  room: receipt.room,
  sequence: receipt.seq,
  server_attributed_did: receipt.did,
  signer_did: receipt.did,
  payload_b64u: payload,
  signature_b64u: receipt.sig
}));
NODE

node ./bin/valley-technocore.js create-evidence \
  < receipt-input.json \
  > receipt-evidence.json

if node ./bin/valley-technocore.js verify-evidence \
  < receipt-evidence.json; then
  receipt_status=0
else
  receipt_status=$?
fi

printf '\n%s\n' "$receipt_status"
test "$receipt_status" -eq 0
```

The report has valid schema, payload hash, DID, and signature statuses; server attribution remains `observed-only`, authority remains `none`, and the exit code is `0`.

This is one offline byte-mapping and signature check against values supplied by another repository. It does not prove that the source is genuine, complete, current, or recognised; that Technocore stored the record; that the DID belongs to a person or organisation; or that any contribution, eligibility, reward, or authority exists. See the [compatibility record](technocore-receipt-compatibility.md) for the recorded field values and boundary.

## Reproduce the `technocore.msg.v1` fixture

`fixtures/technocore-msg-v1-gauntlet.json` is the same public `checkin` receipt represented as the strict stateless profile. It targets upstream Technocore commit `9c7df0e3616cf28d17e7c8ebeb0c05de6adf117c` and never contacts either upstream service or the third-party repository at runtime.

```sh
node ./bin/valley-technocore.js verify-technocore-message \
  < fixtures/technocore-msg-v1-gauntlet.json
test "$?" -eq 0
```

The profile contract and non-claims are in [`technocore-msg-v1.md`](technocore-msg-v1.md).

## Verify the release attestation

The checked-in attestation declares RC5 release metadata and is verified by the standalone verifier in the current checkout:

```bash
if node ./bin/valley-attestation.js \
  < fixtures/release-attestation-v1.json; then
  attestation_status=0
else
  attestation_status=$?
fi

printf '\n%s\n' "$attestation_status"
test "$attestation_status" -eq 0
```

The report contains `"signature_status":"valid"`, `"external_facts_status":"not-checked"`, `"signed_at_status":"declared-only"`, and `"authority":"none"`; the exit code is `0`.

This verifies the strict attestation schema, public DID form, canonical signing bytes, and detached Ed25519 signature. It checks that repository, commit, tag, digest, and signing-time strings are covered by the signature. It does not fetch or independently validate the repository, commit, tag, artifact bytes, digest, signing time, signer identity, source, contribution, recognition, eligibility, rewards, or authority. See the [release-attestation specification](release-attestation-v1.md).

## Evidence matrix

| Evidence class | What a reader can inspect or reproduce | What it does not establish |
| --- | --- | --- |
| Locally observed | Run `npm test`; create and verify `evidence.json`; compare two outputs; run the tamper check; verify the checked-in release attestation; record the local commit, Node.js version, OS, output, and exit code. | Results on another checkout or environment, external facts, or source validity. |
| CI-recorded | Inspect the public [Node CI workflow runs](https://github.com/hubofvalley/Valley-of-Technocore/actions/workflows/test.yml) and open the run for the pull request under review. A `pull_request` run tests GitHub's generated merge result and records the associated pull request head SHA. The workflow runs `npm test` on Node.js 22 and 24. | A local run, untested environments, or any claim outside the test suite. A green badge is not a source-authenticity check. |
| Source-provided | Check out the immutable third-party commit, inspect its receipt fields, run the documented mapping, and verify the supplied signature locally. | Authenticity, completeness, live Technocore state, affiliation, identity, contribution, recognition, eligibility, rewards, or authority. |

For an independently reviewable result, publish the exact commit SHA, `node --version`, operating system, commands run, stdout, stderr, and exit codes. Link a CI run only when its recorded head SHA matches the commit being discussed. Keep source-provided statements labelled as source-provided rather than converting them into toolkit findings.

## Clean up generated files

```bash
rm -f \
  evidence.json \
  evidence-again.json \
  evidence-tampered.json \
  receipt-input.json \
  receipt-evidence.json

rm -r ../technocore-gauntlet-661ed964
```

Run `git status --short` afterwards. A clean checkout prints nothing.
