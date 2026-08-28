# P0.5 first-run proof

This is a local evidence record for the first-run path at PR #19 head `5ebcfef93d49795a51462781f5dcf5f0a7bff7c0`. It checks the same already-captured public check-in in its three supported receipt/message representations:

1. canonical `technocore.msg.v1` message;
2. flat receipt export (`did`, `text`, `signature`); and
3. wrapped receipt export (`receipt.signer_did`, `receipt.message`, `receipt.signature`).

The flat and wrapped objects were stdin-only field-name adapters over the checked-in captured values. No signed field was changed, no key or signature was created, and no network source was contacted.

## Clean-shell method

Each verifier process ran from a fresh empty working directory with `PATH=/nonexistent`, `HOME=/nonexistent`, `TZ=UTC`, and `LANG=C`. The test driver supplied each variant through standard input and invoked the absolute executables below (the checkout root is shown as a public-safe placeholder):

```sh
env -i PATH=/nonexistent HOME=/nonexistent TZ=UTC LANG=C \
  /usr/bin/node /absolute/path/to/checkout/bin/valley-technocore.js verify --format json
```

`/usr/bin/node` and the CLI path were absolute in the actual run; `/absolute/path/to/checkout` replaces the local workspace path here so this public proof does not disclose a host username or filesystem layout. The verifier itself received no path, directory, URL, environment-backed configuration, or writable output path.

The shell adapters read the checked-in canonical fixture only to present the flat and wrapped stdin variants. They did not alter any signed field.

## Evidence

| Representation | Exit | Classification | Failure category | Signature result | Files created by verifier |
| --- | ---: | --- | --- | --- | ---: |
| canonical message | `0` | `message` | `none` | `valid` | `0` |
| flat receipt | `0` | `receipt` | `none` | `valid` | `0` |
| wrapped receipt | `0` | `receipt` | `none` | `valid` | `0` |

All three outputs were deterministic canonical JSON wrappers. Native `technocore.msg.v1` reports stayed nested unchanged. No first-run defect was reproduced, so no runtime behaviour change was made for P0.5.

A separate clean-shell missing-signature probe returned exit `2`, `classification: receipt`, `failure category: missing_signature`, and the actionable `supply_existing_detached_signature` guidance. Recovery therefore needs no runtime fix: obtain the original supplied signature or stop, never sign locally.

This proves local parsing, classification, normalisation, and signature verification for the supplied bytes only. It does not establish source authenticity, DID ownership, server inclusion, identity, eligibility, rewards, or authority.
