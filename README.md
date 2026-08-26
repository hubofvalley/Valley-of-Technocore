# Valley of Technocore

An unofficial, fully local toolkit for producing and independently verifying portable evidence from already-public Technocore records.

## v1 boundary

v1 will expose two commands only:

- `create-evidence` — produces deterministic `contribution-proof.json` from supplied public evidence.
- `verify-evidence` — validates the schema, payload hash, DID format, and detached signature when supported.

It will not generate or load private keys, create DIDs, access a wallet, connect to a network, fetch URLs, execute subprocesses, run cron/watchers, or determine FLOP eligibility or rewards.

Evidence is not trust, authorisation, eligibility, or a reward claim. See [the v1 specification](docs/v1-spec.md).

## Safety gates

1. Build against the frozen v1 contract.
2. Pass deterministic and hostile-input tests.
3. Pass an independent safe-to-run review.
4. Publish only after internal approval and a public-repository hygiene review.

## Development

Requires Node.js 20 or newer.

```bash
npm test
```

## Licence

Apache-2.0. See [LICENSE](LICENSE).

## Status

`0.1.0-rc.4` is the initial public source release. It is deliberately limited to the offline v1 boundary above.
