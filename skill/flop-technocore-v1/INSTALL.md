# FLOP Technocore Skill v1 — harness installation

## Harness registration ≠ runtime installation

This is a checkout-bound verifier skill, not a portable standalone bundle.
Keep the complete `Valley-of-Technocore` checkout intact. The adapter resolves
the repository root two levels above its own directory, then checks the pinned
manifest, release archive, and runtime members there.

Do not copy `skill/flop-technocore-v1/` into a detached harness directory. A
detached copy cannot resolve the repository runtime and fails closed as
`unavailable`. A harness registration symlink is for discovery only; invoke the
exact commands in `SKILL.md` from the checkout root, not through the symlinked
skill path.

The adapter uses the security-pinned `v0.2.0` runtime archive and manifest
recorded in `SKILL.md`. Harness registration does not select, update, or
auto-follow another runtime.

## Common requirements

For every harness:

1. Keep the skill at `skill/flop-technocore-v1/` inside the original repository
   checkout, with the checkout root as the command working directory.
2. Use Node.js major version `24`. The adapter rejects another major version.
3. Expose only the four fixed commands in `SKILL.md`; do not add flags, profile
   auto-detection, path arguments, or environment-backed settings.
4. Pass exactly one complete JSON object through stdin and preserve the
   adapter's stdout, stderr, and exit status verbatim.
5. Allow the adapter to spawn only its one fixed Node 24 verifier child. Do not
   add network, filesystem-write, signing, key, wallet, or action-dispatch
   capability.

## Claude Code

Claude Code supports project skills under `.claude/skills/` and follows a
skill-directory symlink. Register the checkout-local skill as a project skill,
then start Claude Code from that same checkout root:

```bash
cd /absolute/path/to/Valley-of-Technocore
mkdir -p .claude/skills
ln -s ../../skill/flop-technocore-v1 .claude/skills/flop-technocore-v1
claude
```

The symlink lets Claude Code discover `SKILL.md`; it does not relocate the
adapter. Keep the working directory at the checkout root and use the commands
from `SKILL.md`, for example:

```bash
node skill/flop-technocore-v1/adapter.js message verify < message.json
```

Do not copy the skill into `~/.claude/skills/`, and do not replace the fixed
command with `node .claude/skills/flop-technocore-v1/adapter.js ...`. The
registration path is not an execution path. See the [Claude Code skill
documentation](https://code.claude.com/docs/en/skills).

## OpenClaw

Set the target OpenClaw agent's workspace to the repository checkout root. In
that checkout, register the skill with a workspace symlink:

```bash
cd /absolute/path/to/Valley-of-Technocore
mkdir -p skills
ln -s ../skill/flop-technocore-v1 skills/flop-technocore-v1
```

Because OpenClaw treats the workspace `skills/` directory as a containment
boundary, allow only this narrow real target directory in the OpenClaw config:

```json5
{
  agents: {
    defaults: {
      workspace: "/absolute/path/to/Valley-of-Technocore",
    },
  },
  skills: {
    load: {
      allowSymlinkTargets: [
        "/absolute/path/to/Valley-of-Technocore/skill",
      ],
    },
  },
}
```

Keep `skills.workshop.allowSymlinkTargetWrites` disabled; registration does
not need write-through access. Start a new OpenClaw session after changing the
workspace or skill layout, then check visibility:

```bash
openclaw skills list --json
node skill/flop-technocore-v1/adapter.js message verify < message.json
```

The list must show `flop-technocore-v1` as an eligible workspace skill. Do not
run `openclaw skills install ./skill/flop-technocore-v1`: local installation
copies the directory into `skills/` and breaks the checkout-relative adapter
relationship. See the [OpenClaw skills configuration
documentation](https://docs.openclaw.ai/tools/skills-config).

## Generic/manual harness

Register or expose `SKILL.md` without detaching its directory from the
repository. The harness must preserve the `../..` relationship from
`skill/flop-technocore-v1/` to the checkout root, pass one JSON object via
stdin, use Node 24, permit one fixed verifier subprocess, and return the
adapter's stdout, stderr, and exit code unchanged.

If the harness cannot preserve that layout and working directory, do not load
this skill. Use the source checkout directly or stop with `unavailable`.
