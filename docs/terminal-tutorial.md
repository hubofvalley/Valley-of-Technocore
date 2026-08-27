# Terminal tutorial: valid evidence to one-byte tamper

This tutorial starts from a fresh clone, creates canonical evidence from the public RFC 8032 fixture, verifies it, changes exactly one ASCII byte in the detached signature, and verifies the changed copy again.

Requirements: Git, Node.js 22 or newer, and a POSIX-compatible shell. The repository has no runtime dependencies, so no `npm install` step is needed.

```bash
git clone https://github.com/hubofvalley/Valley-of-Technocore.git
cd Valley-of-Technocore
node --version
git rev-parse HEAD
npm test

node ./bin/valley-technocore.js evidence create \
  < fixtures/valid-input.json \
  > evidence.json

node ./bin/valley-technocore.js evidence verify \
  < evidence.json
printf '\nvalid exit: %s\n' "$?"

node - <<'NODE'
const fs = require('node:fs');
const source = fs.readFileSync('evidence.json');
const marker = Buffer.from('"value":"');
const offset = source.indexOf(marker) + marker.length;
if (offset < marker.length) throw new Error('signature value not found');
const changed = Buffer.from(source);
changed[offset] = changed[offset] === 65 ? 66 : 65;
if (source.length !== changed.length) throw new Error('length changed');
let differences = 0;
for (let i = 0; i < source.length; i += 1) differences += source[i] !== changed[i] ? 1 : 0;
if (differences !== 1) throw new Error(`expected one changed byte, got ${differences}`);
fs.writeFileSync('evidence-tampered.json', changed);
NODE

if node ./bin/valley-technocore.js evidence verify \
  < evidence-tampered.json; then
  tamper_status=0
else
  tamper_status=$?
fi
printf '\ntampered exit: %s\n' "$tamper_status"
test "$tamper_status" -eq 3
```

Expected valid report:

```json
{"authority":"none","did_status":"valid","payload_hash_status":"valid","schema_status":"valid","server_attribution_status":"observed-only","signature_status":"valid"}
```

Expected tampered report:

```json
{"authority":"none","did_status":"valid","payload_hash_status":"valid","schema_status":"valid","server_attribution_status":"observed-only","signature_status":"invalid"}
```

The first verification exits `0`; the one-byte-tampered copy exits `3`. Exit `3` means the supplied evidence was processable but its detached signature did not verify. It does not establish who supplied either file, who controls the key, whether a server included the data, or any identity, contribution, recognition, eligibility, reward, or authority claim.

Creation and normalisation commands always emit canonical JSON artefacts. `--format human` applies only to verification/report commands.

Clean up the two generated files, then confirm that the checkout is unchanged:

```bash
rm -f evidence.json evidence-tampered.json
git status --short
```

A clean checkout prints nothing.
