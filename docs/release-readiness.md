# Release-readiness facts

This page records only facts that a reviewer can verify from repository files, Git references, or GitHub release metadata. It does not authorise a tag, publication, deployment, or key change.

## Current verified boundary

- `package.json` declares version `0.1.0-rc.6` and `private: true`.
- The latest published GitHub release in the `v0.1.0*` series is the prerelease tag `v0.1.0-rc.6`.
- The `v0.1.0-rc.6` tag resolves to commit `cd179a731a30ac6d16b1bb93b9ac547a2f143d79`.
- That release exposes `release-attestation-v1.json` and an archive explicitly named `valley-of-technocore-v0.1.0-rc.5.tar`.
- No stable `v0.1.0` tag, version, package, or release artefact is claimed here.

The checked-in attestation is deliberately narrower. Its signed statement declares the RC5 tag, commit, and artefact digest. The supplied signature verifies over those exact declaration bytes under the public key encoded in the supplied DID. It does not fetch or independently validate the tag, commit, archive bytes, digest, signing time, signer identity, repository control, or any external fact.

## Recheck before release decisions

From a clean clone, record the exact checkout and local package metadata:

```bash
git rev-parse HEAD
node -p "const p=require('./package.json'); JSON.stringify({version:p.version,private:p.private})"
git tag --list 'v0.1.0*'
```

With authenticated GitHub CLI access, inspect the published prerelease and its assets:

```bash
gh release view v0.1.0-rc.6 \
  --repo hubofvalley/Valley-of-Technocore \
  --json tagName,isPrerelease,isDraft,targetCommitish,assets,url

gh api repos/hubofvalley/Valley-of-Technocore/git/ref/tags/v0.1.0-rc.6 \
  --jq '{ref:.ref,object:.object}'
```

Release facts are mutable external state. Record the command outputs and timestamp rather than copying a branch's version or artefact claim into release copy without rechecking it.
