# Release contract and readiness

This page defines the machine-checked contract for Valley of Technocore stable
releases and release candidates. It records release metadata, not authority: it
does not establish identity, repository control, source authenticity,
contribution, eligibility, reward, or Technocore/FLOP recognition.

## v0.2.0-rc.1 candidate

- Candidate package version: `0.2.0-rc.1`; the package remains `private: true`.
- Intended prerelease tag: `v0.2.0-rc.1`.
- This local preparation creates no tag, GitHub release, archive upload, or
  release attestation. The candidate must remain clearly separate from the
  published stable `v0.1.0` record below.
- Required candidate artefacts are
  `valley-of-technocore-v0.2.0-rc.1.tar` and its exact
  `valley-of-technocore-v0.2.0-rc.1.tar.sha256` manifest.
- The archive is reproduced from the candidate commit with:
  `git archive --format=tar --prefix=valley-of-technocore-v0.2.0-rc.1/ HEAD`.
- Validate the local candidate without GitHub access:

  ```bash
  npm run check-release-contract -- \
    --mode candidate \
    --archive /path/to/valley-of-technocore-v0.2.0-rc.1.tar
  ```

  The checker reproduces `HEAD`, compares archive bytes, checks the exact
  checksum manifest, and reports the candidate commit and digest.

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

For a release candidate `X.Y.Z-rc.N`, the local candidate contract is the same
for package metadata, archive naming, archive bytes, and checksum formatting,
but the intended tag is `vX.Y.Z-rc.N`, the release channel is prerelease, and
the archive is checked against the candidate commit directly because this
preparation does not create or inspect a remote tag or release.

## Check it

From a checkout with Git, Node.js 22+, authenticated `gh`, and the release tag available locally:

```bash
npm run check-release-contract
```

For this local release candidate, use the offline candidate mode shown above;
it does not call `gh` and does not require a tag.

The checker is deterministic and contains no AI/model step. It reads package/tag data, fetches release metadata and assets through `gh`, reproduces the tagged archive, compares bytes and digest, and validates an attached optional attestation. It returns non-zero on any contract mismatch. GitHub Actions runs the same command on pull requests and pushes to `main`.

Release facts are mutable external state. Record the command output and time
when making a release decision; do not infer future-release facts from the
v0.1.0 stable record or this v0.2.0-rc.1 local candidate.
