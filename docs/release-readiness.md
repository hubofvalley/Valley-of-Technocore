# Stable release contract

This page defines the machine-checked contract for a stable Valley of Technocore release. It records release metadata, not authority: it does not establish identity, repository control, source authenticity, contribution, eligibility, reward, or Technocore/FLOP recognition.

## v0.1.0 status

- Stable tag: `v0.1.0`, resolving to `59ee7c10bf55c289b6a9b74fd83ba1d52ab10a49`.
- Published GitHub release: [Valley of Technocore v0.1.0](https://github.com/hubofvalley/Valley-of-Technocore/releases/tag/v0.1.0), published 27 August 2026 UTC.
- Required release assets:
  - `valley-of-technocore-v0.1.0.tar`
  - `valley-of-technocore-v0.1.0.tar.sha256`
- The archive is `git archive --format=tar --prefix=valley-of-technocore-v0.1.0/ v0.1.0`; its SHA-256 is `3986d8e9c601ac1cec704102072eec87284a35349e2a3e8d83bbb3c61ff47f15`.
- The package is `private: true`; this is not an npm publication.
- A stable `release-attestation-v1.json` is optional. None is claimed for v0.1.0.

The historical RC5 attestation fixture remains an RC5 fixture. It must not be presented as an attestation for this stable release.

## Contract

For package version `X.Y.Z`, a stable release must satisfy all of the following:

1. `package.json` has the exact stable version `X.Y.Z` and the exact tag is `vX.Y.Z`.
2. The local and GitHub tag references resolve to the same commit.
3. GitHub exposes a published, non-draft, non-prerelease release for that tag.
4. It attaches `valley-of-technocore-vX.Y.Z.tar` and `valley-of-technocore-vX.Y.Z.tar.sha256`.
5. The archive bytes exactly equal `git archive --format=tar --prefix=valley-of-technocore-vX.Y.Z/ vX.Y.Z`; the checksum file is exactly `<sha256><two spaces><archive name><newline>`.
6. If `release-attestation-v1.json` is attached, its signature must be valid and its signed repository, tag, commit, and SHA-256 declaration must bind the same release archive. Attestation remains an additional cryptographic declaration, not proof of external facts or authority.

## Check it

From a checkout with Git, Node.js 22+, authenticated `gh`, and the release tag available locally:

```bash
npm run check-release-contract
```

The checker is deterministic and contains no AI/model step. It reads package/tag data, fetches release metadata and assets through `gh`, reproduces the tagged archive, compares bytes and digest, and validates an attached optional attestation. It returns non-zero on any contract mismatch. GitHub Actions runs the same command on pull requests and pushes to `main`.

Release facts are mutable external state. Record the command output and time when making a release decision; do not infer future-release facts from this v0.1.0 record.
