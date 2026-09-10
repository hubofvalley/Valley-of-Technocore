# Offline Technocore room-export inspection

This Baconvalley source-checkout tool inspects an already-supplied Technocore
room export without fetching the room or changing any remote state. It is an
independent evidence aid, not a Technocore server feature.

## Source contract

The compatibility boundary is pinned to the public Technocore `v0.13.0`
release commit `45921c3e3699e01a55cde391674815367e0cff6b`. Its tests specify
that `GET /r/<room>/export` returns the
retained room file as raw JSONL, byte-identical to stored bytes, and that a
stored signed record can be re-verified offline from the dump plus the room
name. The response also carries `X-Room-Generation`; Technocore changes that
generation when a room is reaped and recreated.

Primary source:

- <https://github.com/flop-labs/technocore-chat/blob/45921c3e3699e01a55cde391674815367e0cff6b/tests/http/test_export.py>

The inspector does not perform that HTTP request. Capture the body and its
`X-Room-Generation` header using a tool you trust, then pass the exact body on
standard input and the observed metadata as fixed CLI arguments:

```bash
node ./bin/valley-technocore-room-export.js inspect \
  --room lobby \
  --generation 7 \
  < room-export.jsonl
```

Use `--format human` for a human-readable report. JSON is the deterministic
machine format.

## What the report binds

The report records:

- SHA-256 of the exact supplied export bytes, before any parsing;
- supplied room name and supplied generation text;
- byte and record counts;
- first and last sequence numbers observed in the supplied capture, preserved
  as exact decimal strings;
- unsigned record count;
- signed records that could be re-verified from their stored `sig`;
- valid and invalid signature counts; and
- older signed-looking records whose stored shape has no `sig`, reported as
  unverifiable rather than invalid.

The parser is bounded and fail-closed. Input is capped at 16 MiB and 262,144
records, each record at 64 KiB. Duplicate JSON keys, unsupported record fields,
non-UTF-8 input, a torn final JSONL record, invalid nonce grammar, and
non-increasing sequence order are rejected. Sequence integers are preserved
lexically (up to a tool-owned 64-digit resource bound), and bare 1-19 digit
nonce tokens are preserved lexically before signature verification, so
JavaScript numeric coercion cannot change either value.

Exit `0` means the supplied structure was processable and no stored signature
failed. Exit `3` means at least one processable stored signature was invalid.
Exit `2` is malformed or unsupported input, and exit `1` is an unexpected
runtime failure.

## Non-claims

The SHA-256 binds the report to supplied bytes; it does not establish where
those bytes came from. The supplied generation is also metadata, not a signed
field. A successful inspection therefore does **not** establish source
authenticity, server inclusion, capture completeness beyond the supplied
bytes, authenticity of the generation header, recency, identity, authority,
eligibility, or rewards. An unsigned record is counted, not authenticated.

The tool also does not validate a protocol embedded inside `text`. In
particular, a Technocore record can have a valid transport signature while its
message is still malformed, non-canonical, or otherwise non-conforming under
`tclk/1`. Protocol conformance requires a separately pinned protocol validator;
this inspector deliberately stops at the Technocore record boundary. It does
not infer tclk deal state, settlement, value transfer, or any other protocol
semantics from message text.
