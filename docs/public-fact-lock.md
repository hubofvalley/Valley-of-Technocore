# Public fact lock — v0.1.0-rc.6

This page defines the factual boundary for public communication about Valley of Technocore `v0.1.0-rc.6` (`cd179a731a30ac6d16b1bb93b9ac547a2f143d79`). It is not launch copy and must not be treated as a stable or final v1 fact sheet.

## Required framing

Every substantive description must preserve these four points:

- **Unofficial:** this project does not claim Technocore or FLOP approval, affiliation, endorsement, or recognition.
- **Release candidate:** `v0.1.0-rc.6` is a prerelease for the offline v1 boundary, not a stable or final v1 release.
- **Offline and local:** the CLI consumes only local stdin and does not fetch or authenticate external records.
- **Cryptographic verification only:** successful verification covers the defined schema, payload hash, DID/key form, and detached Ed25519 signature. It does not authenticate the external source.

## Allowed claims

- Valley of Technocore is an unofficial, fully local Node.js CLI.
- It requires Git and Node.js 22 or newer, has no runtime dependencies, and needs no `npm install` step.
- The evidence CLI exposes two operations: `create-evidence` and `verify-evidence`.
- `create-evidence` creates deterministic canonical evidence from explicitly supplied, contract-valid public input. Identical logical input produces byte-identical evidence.
- `verify-evidence` checks the evidence schema, payload hash, supported DID/key form, and detached Ed25519 signature.
- A valid signature proves only that the public key in `signer_did` verifies the exact decoded payload bytes.
- One third-party public GitHub receipt, presented by its source as a Technocore signed-room receipt, has passed a one-sample offline mapping check; its supplied `room`, `sequence`, DID, nonce, text, and signature could be mapped into the v1 input and the detached signature verified. It does not authenticate the source or confirm the receipt against live room state.
- `server_attributed_did` remains `observed-only`; no relationship with `signer_did` is inferred.
- Verification output always has `authority: "none"`.
- The CLI cannot determine whether supplied input is genuine, complete, or current. Independent source validation remains the user's responsibility.
- It makes no network requests and has no wallet access, private-key handling or generation, server process, subprocess execution, watcher, cron job, token logic, or deployment behaviour.
- The package remains private and is not published to npm. `npm` is used only to run local tests.
- The project is licensed under Apache-2.0.

## Prohibited or misleading claims

Do not say or imply that:

- the project is official, approved, affiliated with, endorsed by, or recognised by Technocore or FLOP;
- evidence establishes identity, DID ownership, authorship, server ownership, authorisation, or authority;
- evidence proves FLOP eligibility, reward eligibility, contribution entitlement, or payment entitlement;
- successful verification proves that a supplied record is authentic, genuine, complete, or current;
- `server_attributed_did` is cryptographically bound to `signer_did`;
- the project provides wallets, keys, signing, token or reward logic, networking, servers, deployment, monitoring, production integration, or autonomous execution;
- the CLI is available through npm, `npm install`, `npx`, or a global `valley-technocore` installation;
- `v0.1.0-rc.6` is a stable or final v1 release.

Avoid the shorthand **“verified Technocore record”** or **“authentic record.”** Say exactly which cryptographic checks passed.

## Canonical references

- Repository: <https://github.com/hubofvalley/Valley-of-Technocore>
- Prerelease: <https://github.com/hubofvalley/Valley-of-Technocore/releases/tag/v0.1.0-rc.6>
- Version: `0.1.0-rc.6`
- Commit: `cd179a731a30ac6d16b1bb93b9ac547a2f143d79`
- Specification: [`v1-spec.md`](v1-spec.md)
- Licence: [`../LICENSE`](../LICENSE)

Canonical clean-clone and execution commands:

```bash
git clone https://github.com/hubofvalley/Valley-of-Technocore.git
cd Valley-of-Technocore
npm test

node ./bin/valley-technocore.js create-evidence \
  < fixtures/valid-input.json \
  > contribution-proof.json

node ./bin/valley-technocore.js verify-evidence \
  < contribution-proof.json
```

The bare `valley-technocore ...` syntax in the v1 specification describes the CLI contract. It is not an npm or global installation instruction.

## Stop-publish rule

Stop publication and return the draft for technical review if it:

- removes the unofficial, release-candidate, offline, or cryptographic-only boundary;
- changes the version, commands, repository, release, specification, or licence references;
- implies Technocore or FLOP endorsement or recognition;
- upgrades `observed-only` attribution or `authority: "none"`;
- claims identity, ownership, authority, eligibility, rewards, or source authenticity; or
- introduces wallet, server, deployment, network, npm-availability, or autonomous-operation claims.

Public drafts must be checked against the tagged release, not a newer branch state.
