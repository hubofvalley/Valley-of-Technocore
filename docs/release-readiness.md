# Release contract and readiness

This page defines the machine-checked contract for Valley of Technocore stable
releases and release candidates. It records release metadata, not authority: it
does not establish identity, repository control, source authenticity,
contribution, eligibility, reward, or Technocore/FLOP recognition.

## v0.2.1 stable release

- Stable package version: `0.2.1`; the package remains `private: true`.
- Stable tag: `v0.2.1`.
- The GitHub release is created only after this tagged commit and its required
  artefacts have passed the release contract.
- This additive release includes the FLOP Technocore Skill v1 verifier-only
  adapter. Existing `v0.2.0` verifier CLI commands, output, and exit behaviour
  are unchanged; `v0.2.0` users are unaffected.
- Required stable artefacts are `valley-of-technocore-v0.2.1.tar` and its exact
  `valley-of-technocore-v0.2.1.tar.sha256` manifest.
- The archive is reproduced from the release tag with:
  `git archive --format=tar --prefix=valley-of-technocore-v0.2.1/ v0.2.1`.

## v0.2.0 stable reference

- Stable package version: `0.2.0`; the package remains `private: true`.
- Stable tag: `v0.2.0`.
- Published GitHub release: [Valley of Technocore v0.2.0](https://github.com/hubofvalley/Valley-of-Technocore/releases/tag/v0.2.0).
- Required stable artefacts are `valley-of-technocore-v0.2.0.tar` and its exact
  `valley-of-technocore-v0.2.0.tar.sha256` manifest.
- The archive is reproduced from the immutable `v0.2.0` tag with:
  `git archive --format=tar --prefix=valley-of-technocore-v0.2.0/ v0.2.0`.
- Local mode binds the package version and `private` flag to the committed
  `HEAD:package.json`, even if the working-tree package file was edited. The
  supplied archive path must use the exact versioned filename above.
- Reproduce the stable archive locally without GitHub access:

  ```bash
  npm run check-release-contract -- \
    --mode local \
    --archive /path/to/valley-of-technocore-v0.2.0.tar
  ```

  The checker reproduces `v0.2.0`, compares archive bytes, checks the exact
  checksum manifest, and reports the stable commit and digest. Local mode also
  requires the working `package.json` metadata to match `HEAD:package.json` and
  requires the archive basename to be exactly
  `valley-of-technocore-v0.2.0.tar`.

The previously published `v0.2.0-rc.1` prerelease was the validation phase for
this same v0.2 surface. Stable promotion uses the final stable metadata and
does not reuse the RC tag.

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

For a release candidate `X.Y.Z-rc.N`, distinguish these two stages:

- Local candidate mode (`--mode candidate`) validates the committed `HEAD`
  without GitHub access. It requires matching working-tree and committed
  package metadata, the exact `vX.Y.Z-rc.N` archive basename, deterministic
  archive bytes, and the exact checksum manifest. It creates or checks no tag
  or GitHub release.
- Post-tag prerelease validation uses the normal remote contract after the
  `vX.Y.Z-rc.N` tag and GitHub prerelease exist. It checks that the local and
  remote tag targets match, that GitHub reports a published non-draft
  prerelease, and that the attached archive and checksum assets satisfy the
  same byte and manifest rules. This stage may call `gh`; it is not the local
  candidate mode.

For a stable `X.Y.Z` preparation, local mode validates the committed package
metadata, exact archive name, deterministic `HEAD` archive, and checksum before
any tag or release exists. After the GitHub release is published, the normal
stable contract validates the local and remote tag targets, published release
metadata, assets, archive bytes, checksum, and any optional attestation.

## Check it

From a checkout with Git, Node.js 22+, authenticated `gh`, and the release tag available locally:

```bash
npm run check-release-contract
```

For this local stable preparation, use the offline local mode shown above; it
does not call `gh` and does not require a tag.

The checker is deterministic and contains no AI/model step. The release-contract
job in `.github/workflows/test.yml` selects the contract from the event and
package metadata:

- For a package on a branch, pull request, or manual workflow run, CI creates
  the archive and exact checksum in the runner temporary directory, then runs
  local mode selected from the package version:

  ```bash
  contract_mode='local'
  if [[ "$package_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$ ]]; then
    contract_mode='candidate'
  fi
  npm run check-release-contract -- \
    --mode "$contract_mode" \
    --archive "$archive_dir/$archive_name"
  ```

  The actual mode is `candidate` for `X.Y.Z-rc.N` and `local` for stable
  `X.Y.Z`. This validates checked-out `HEAD`, does not call `gh`, and does not
  claim that a tag or GitHub release exists.
- For a published GitHub `release` event, CI runs
  `npm run check-release-contract` with `GH_TOKEN`. That is the post-release
  remote contract: it fetches GitHub release metadata/assets, reproduces the
  tagged archive, compares bytes and digest, and validates an attached optional
  attestation.

Both paths return non-zero on any contract mismatch. Pre-publication local
validation and post-release remote validation are deliberately separate, so a
stable branch or pull request does not fail merely because its release has not
been published yet.

Release facts are mutable external state. Record the command output and time
when making a release decision; do not infer future-release facts from the
v0.1.0 stable record or the previously published v0.2.0-rc.1 prerelease.
