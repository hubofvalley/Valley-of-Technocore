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

A live interoperability report filed as
[`flop-labs/tclk#149`](https://github.com/flop-labs/tclk/issues/149) on
2026-09-10 demonstrates why the lexical-preservation rule below is load-bearing:
a retained `tclk-offers` export contained bare 19-digit transport nonces above
`Number.MAX_SAFE_INTEGER`, including `1789031965581931047`; ordinary
`JSON.parse` rounded those digits before tclk's transcript verifier could use
them. The regression suite pins that observed failure class independently of
any unresolved upstream parser patch. As of 2026-09-11, the related tclk parser
change remains an open PR and is not treated as this tool's normative contract.

The inspector does not perform that HTTP request. Capture the body and its
`X-Room-Generation` header using a tool you trust, then pass the exact body on
standard input and the observed metadata as fixed CLI arguments:

```bash
node ./bin/valley-technocore-room-export.js inspect \
  --room lobby \
  --generation 7 \
  < room-export.jsonl
```

If you also have a durable checkpoint from an earlier observation of the same
room, supply its sequence and generation together:

```bash
node ./bin/valley-technocore-room-export.js inspect \
  --room lobby \
  --generation 7 \
  --checkpoint-seq 123456 \
  --checkpoint-generation 7 \
  < room-export.jsonl
```

Omit both checkpoint flags on a cold start. Sequence `0` is not used as a
synthetic checkpoint.

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

## Durable checkpoint assessment

Technocore room reads deliberately return the newest bounded window. A durable
consumer that falls farther behind than that window can therefore skip records
while continuing to receive successful responses. The public interoperability
report in [`technocore-chat#481`](https://github.com/flop-labs/technocore-chat/issues/481)
documents this failure in a production consumer, and a 2026-09-12 recheck still
reproduces it on the live service when the lag exceeds the read limit.

The optional checkpoint flags let this offline inspector compare one already-
supplied export with one already-supplied durable checkpoint. No network read
or recovery is performed. The machine report classifies only what the supplied
bytes show:

- `continuous_from_checkpoint`: in the supplied generation, the first observed
  record after the checkpoint is exactly `checkpoint_seq + 1`;
- `gap_after_checkpoint`: the first observed newer sequence is greater than the
  expected next sequence; `unobserved_seq_start` and `unobserved_seq_end` name
  that sequence range;
- `no_newer_record_observed`: the capture contains no record after the supplied
  checkpoint;
- `empty_capture`: the supplied export body has no records;
- `generation_mismatch`: the supplied checkpoint and supplied capture name
  different room generations, so sequence continuity is not assessed; or
- `not_supplied`: no checkpoint was provided.

`gap_after_checkpoint` is deliberately an evidence statement, not a diagnosis:
it does not prove that the server deleted those sequences, that the capture is
complete, or that either supplied metadata value is authentic. Upstream work
currently separates live retained-floor discovery (`technocore-chat#800`) from
bridge recovery through `/export` (`technocore-chat#545`); this tool duplicates
neither. It only makes an offline comparison reproducible after collection.

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
eligibility, or rewards. A supplied checkpoint is also caller-provided metadata
and is not authenticated by the export. An unsigned record is counted, not
authenticated.

The tool also does not validate a protocol embedded inside `text`. In
particular, a Technocore record can have a valid transport signature while its
message is still malformed, non-canonical, or otherwise non-conforming under
`tclk/1`. Protocol conformance requires a separately pinned protocol validator;
this inspector deliberately stops at the Technocore record boundary. It does
not infer tclk deal state, settlement, value transfer, or any other protocol
semantics from message text.
