# FLOP Technocore Skill v1 — direct-CLI ground truth

Status: Gate A design record. This is a verifier-integration contract, not an implementation.

## Pin and invocation boundary

The skill pins Valley of Technocore `v0.2.0`, tag `v0.2.0`, tag target
`908a5050d2c2222e92e08dd5352e454f876634d7`. The approved Gate A runtime pin
is Node.js major `24`; the direct matrix ran under `v24.18.0`. Node.js 22 and
24 remain CI compatibility lanes, but major 24 is the only activation pin.
The skill-owned package artefact is the complete uncompressed tar stream
`valley-of-technocore-v0.2.0.tar`, generated with
`git archive --format=tar --prefix=valley-of-technocore-v0.2.0/ v0.2.0` at that
commit: 296,960 bytes and SHA-256
`5db00fad00a3973a09d867073208c899b550d43b73656cc6f521340c37a3649f`.
That digest covers the full archive, including the executable member
`valley-of-technocore-v0.2.0/bin/valley-technocore.js`, `package.json`, and
all imported `src/` modules. The runtime-member allowlist covers the executable
and imported modules only; package metadata is not a runtime dependency. The
four allowed direct invocations are fixed,
stdin-only commands:

```text
node ./bin/valley-technocore.js message verify
node ./bin/valley-technocore.js receipt verify
node ./bin/valley-technocore.js evidence verify
node ./bin/valley-technocore.js provenance verify
```

The skill supplies one complete JSON object on stdin. It does not pass a path,
URL, glob, flag, environment setting, or task-controlled executable. The CLI's
default output is canonical JSON without a trailing newline. Human output is
not part of the skill contract.

Fixtures used below: `technocore-msg-v1-gauntlet.json` (message),
`valid-evidence.json` (evidence), and the bundle produced by feeding
`technocore-provenance-capture-v1.json` to `provenance create` outside the
skill. A flat receipt is the message fixture mapped to
`{room,did,nonce,text,signature}`. No private key or network source is used.

## Deterministic transcript matrix

`stdout` values are exact canonical JSON for the representative rows. `stderr`
is exact, including its final newline, where shown. A blank value means the
stream is empty. Every processable result has empty stderr; every rejected
single-object input has empty stdout.

| Surface | Case / supplied change | Exit | stdout | stderr |
| --- | --- | ---: | --- | --- |
| message verify | valid fixture | 0 | `{"decision":"verified","non_claims":["identity_not_established","authorship_beyond_key_control_not_established","source_authenticity_not_established","server_inclusion_not_established","recognition_eligibility_rewards_authority_not_established"],"profile":"technocore.msg.v1","reasons":[],"signature_status":"valid"}` | empty |
| message verify | first signature base64url character changed (`q` → `r`) | 3 | same shape; `decision:"invalid"`, `reasons:["signature_invalid"]`, `signature_status:"invalid"` | empty |
| message verify | `{` | 2 | empty | `error: object key must be a string\n` |
| message verify | schema changed to `technocore.msg.v2` | 2 | empty | `error: unsupported schema\n` |
| message verify | maximum nonce `9007199254740999999` with its matching supplied signature | 0 | valid report above | empty |
| message verify | room length 49 | 2 | empty | `error: room must match the pinned Technocore grammar\n` |
| message verify | text >4096 swept characters | 2 | empty | `error: text exceeds 4096 characters after the Technocore sweep\n` |
| message verify | input >1 MiB | 2 | empty | `error: input exceeds 1 MiB\n` |
| message verify | signed text changed without changing signature | 3 | invalid report above | empty |
| receipt verify | valid flat receipt | 0 | valid message report above | empty |
| receipt verify | first supplied signature base64url character changed (`q` → `r`) | 3 | invalid message report above | empty |
| receipt verify | `{` | 2 | empty | `error: object key must be a string\n` |
| receipt verify | ambiguous/overlapping shape (flat receipt fields plus `receipt`) | 2 | empty | `error: unsupported receipt export shape\n` |
| receipt verify | unknown extra field | 2 | empty | `error: unsupported receipt export shape\n` |
| receipt verify | room length 48 and nonce length 19, with matching signature | 0 | valid message report | empty |
| receipt verify | input >1 MiB | 2 | empty | `error: input exceeds 1 MiB\n` |
| receipt verify | text changed without changing signature | 3 | invalid message report above | empty |
| evidence verify | valid `valid-evidence.json` | 0 | `{"authority":"none","did_status":"valid","payload_hash_status":"valid","schema_status":"valid","server_attribution_status":"observed-only","signature_status":"valid"}` | empty |
| evidence verify | statement signature changed | 3 | same report with `signature_status:"invalid"` | empty |
| evidence verify | `{` | 2 | empty | `error: object key must be a string\n` |
| evidence verify | schema changed to `/2` or authority changed | 2 | empty | `error: unsupported schema or authority\n` |
| evidence verify | room length 128 and sequence `9007199254740991` | 0 | valid evidence report | empty |
| evidence verify | input >1 MiB | 2 | empty | `error: input exceeds 1 MiB\n` |
| evidence verify | payload hash changed to 64 zeroes | 3 | same report with `payload_hash_status:"invalid"` | empty |
| provenance verify | valid generated bundle | 0 | `{"decision":"verified","non_claims":["identity_not_established","authorship_beyond_key_control_not_established","source_authenticity_not_established","server_inclusion_not_established","recognition_eligibility_rewards_authority_not_established"],"profile":"gv.valley-of-technocore.provenance/1","reasons":[],"signature_status":"valid"}` | empty |
| provenance verify | first request signature base64url character changed (`q` → `r`) | 3 | same shape; `decision:"invalid"`, `reasons:["request_signature_invalid"]`, `signature_status:"invalid"` | empty |
| provenance verify | `{` | 2 | empty | `error: object key must be a string\n` |
| provenance verify | bundle schema changed to `/2` | 2 | empty | `error: unsupported provenance bundle schema\n` |
| provenance verify | response `from` changed | 2 | empty | `error: response posted from does not match request did\n` |
| provenance verify | response nonce changed | 2 | empty | `error: response posted nonce does not match request nonce\n` |
| provenance verify | response swept text changed | 2 | empty | `error: response posted text does not match swept request text\n` |
| provenance verify | response HTTP status changed to 201 | 2 | empty | `error: response http_status must be 200\n` |
| provenance verify | response contains unknown field `trace` | 2 | empty | `error: response has missing or unknown fields\n` |
| provenance verify | input >1 MiB | 2 | empty | `error: input exceeds 1 MiB\n` |

The exact report key order is canonical and stable. For exit `3`, the report is
still a processable cryptographic result. Exit `2` is rejection before a native
verification report. Exit `1` is unexpected runtime/I/O failure and is never
interpreted as verification success.

For completeness, these are the exact canonical stdout values referenced by
the shorthand rows above:

```text
message-invalid:
{"decision":"invalid","non_claims":["identity_not_established","authorship_beyond_key_control_not_established","source_authenticity_not_established","server_inclusion_not_established","recognition_eligibility_rewards_authority_not_established"],"profile":"technocore.msg.v1","reasons":["signature_invalid"],"signature_status":"invalid"}

evidence-signature-invalid:
{"authority":"none","did_status":"valid","payload_hash_status":"valid","schema_status":"valid","server_attribution_status":"observed-only","signature_status":"invalid"}

evidence-hash-invalid:
{"authority":"none","did_status":"valid","payload_hash_status":"invalid","schema_status":"valid","server_attribution_status":"observed-only","signature_status":"valid"}

provenance-invalid:
{"decision":"invalid","non_claims":["identity_not_established","authorship_beyond_key_control_not_established","source_authenticity_not_established","server_inclusion_not_established","recognition_eligibility_rewards_authority_not_established"],"profile":"gv.valley-of-technocore.provenance/1","reasons":["request_signature_invalid"],"signature_status":"invalid"}
```

## Limits relevant to the skill

Each explicit verifier accepts at most 1,048,576 input bytes, UTF-8 without a
BOM, one JSON object, maximum JSON depth 16, and maximum decoded string length
262,144 UTF-16 code units. Message/receipt inputs additionally cap swept text
at 4,096 Unicode characters, rooms at 48 lowercase ASCII grammar characters,
and nonces at 1–19 ASCII decimal digits. Evidence rooms are 1–128 ASCII
grammar characters and sequences are 0–`2^53-1`. Provenance uses the same
message limits and requires a positive safe-integer response sequence.
