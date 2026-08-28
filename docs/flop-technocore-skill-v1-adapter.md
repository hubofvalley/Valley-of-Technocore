# FLOP Technocore Skill v1 — Gate B adapter and Gate C evidence

Gate A was accepted by the owner. This branch contains the local Gate B
adapter and Gate C evidence only; no installation, pilot, distribution, or
public action has occurred.

## Adapter boundary

The adapter is `skill/flop-technocore-v1/adapter.js`. It accepts exactly one
profile and the literal operation `verify`:

```text
node skill/flop-technocore-v1/adapter.js message verify
node skill/flop-technocore-v1/adapter.js receipt verify
node skill/flop-technocore-v1/adapter.js evidence verify
node skill/flop-technocore-v1/adapter.js provenance verify
```

Input is one complete JSON object on stdin. The adapter owns the working
directory, executable, environment, and argv. It passes no task-controlled
path, URL, flag, command, environment value, credential, or secret. It uses
`spawn` with `shell: false`, a fixed executable path, a fixed argv map, and a
minimal environment. Unsupported profiles and operations reject before the
verifier is started.

Before every invocation it verifies Node major 24, the complete pinned archive,
the archive bytes for every eagerly imported runtime member, and the fixed
runtime-member paths and their SHA-256 values. Any missing file,
symlink/path mismatch, byte mismatch, runtime mismatch, or failed check returns
`unavailable` and starts no verifier. The child is bounded to 1 MiB stdin,
64 KiB stdout, 16 KiB stderr, 5 seconds wall time, and a 128 MiB Node V8
old-space budget. Gate C proves that cap in the actual adapter-launched child:
on the pinned Node 24 runtime its reported V8 heap limit must be ≤384 MiB, so
a missing or ineffective `NODE_OPTIONS` setting fails the test. Linux `strace`
is mandatory for the no-write/no-network trace; a missing tracer fails Gate C,
not skips it. Total RSS requires a host cgroup or equivalent owner-pilot
control; the adapter does not claim to hard-cap it.

The adapter maps only these outcomes: exact canonical exit-0 reports to
`verified`; exact canonical exit-3 reports to `cryptographic_invalid`; bounded
exit-2 error lines with empty stdout to `input_rejected`; and all other exit,
signal, timeout, output, digest, path, or contract deviations to
`unavailable`. Verifier bytes are treated as data and are never interpreted as
instructions or routed to another action.

## Gate C procedure and evidence

Run from the repository root:

```bash
node --test --test-concurrency=1 test/flop-technocore-skill-v1.test.js
npm test
git diff --check main...HEAD
```

The suite covers direct fixture equivalence for all four profiles, malformed,
unsupported, cryptographic-invalid, tampered, ambiguous, boundary, and over-1
MiB inputs; prompt-injection, URL/path/command payloads; known-signer
non-claims, valid unknown-signer invalidity, and unsupported signer rejection; unsupported operations; fixed-pin
preflight; clean-room no-write snapshots; and static absence of network/action
imports. It also injects isolated fake child behaviours to prove wrong
output, wrong exit, signal, timeout, output overflow, malformed UTF-8, wrong
pin, missing member, and revalidation failures return `unavailable`; those
fakes never replace the pinned runtime in the skill tree. Existing repository
capability tests cover the verifier runtime's filesystem, process, environment,
network, and side-effect boundaries.

Restart/config revalidation remains a fail-closed procedure, not an activation
action in this branch. After each restart, dependency/runtime, config, or image
change, run the pin and runtime-member checks, capability scan, fixed-argv check,
direct matrix, and clean-room side-effect check again:

```bash
node --version                         # must be v24.x
node --test --test-concurrency=1 test/flop-technocore-skill-v1.test.js
npm test
git diff --check main...HEAD
```

A single failed check leaves the adapter disabled until the complete sequence
passes. Before owner pilot, add and verify a host cgroup or equivalent total
RSS control; the adapter only sets the child Node V8 old-space cap.

Dogfood inputs are checked-in fixtures and manually supplied local artefacts
only. No fetch, package installation, GitHub, network, browser, signing, DID,
key, wallet, credential, secret, filesystem write, or action escalation is
performed by the adapter or this branch.
