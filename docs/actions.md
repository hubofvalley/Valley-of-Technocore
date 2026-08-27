# Local Actions MVP

Status: local MVP. It includes one fixed, two-step proof workflow; it is not a general workflow engine.

## Start the product surface

Requirements: Node.js 20 or newer. No dependency installation is needed.

```bash
mkdir -p "$PWD/.local-actions"
node ./bin/valley-actions.js \
  --state "$PWD/.local-actions/actions.json"
```

The server binds only to `127.0.0.1` and prints its local URL. Stop it with `Ctrl+C`. The state path must be an absolute file path.

## User flow

1. Open the printed URL to see the Actions index.
2. Create a named Action by choosing one fixed operation.
3. Select the Action, supply its explicitly listed bounded inputs, and press **Run action**.
4. Inspect status, exact input snapshot, output, error, exit code, and duration.
5. Inspect the Action's newest-first run history.
6. A failed run exposes **Retry failed run**. Retry creates a new run with the same inputs and a `retry_of` link; it never overwrites the original run.

## Proof workflow

The built-in **Verify & export proof receipt** workflow is the intended FLOP-facing path:

1. Supply a short receipt label and one evidence JSON object.
2. It verifies the evidence as step one. Invalid or unsupported evidence stops the run there.
3. A valid result formats a receipt as step two, with per-step status and output retained in run history. The receipt includes the SHA-256 hash of the exact submitted evidence string, so it remains tied to the evidence bytes it verified.
4. Export the completed receipt as JSON or Markdown. Export uses a browser download; the server does not choose or write an export path.

Workflow definitions are fixed and allowlisted. A failed workflow can be re-run with the same input, producing a new run linked by `retry_of`.

## Allowlisted operations

| Operation | Inputs | Result |
| --- | --- | --- |
| `evidence.verify.v1` | `evidence_json`, maximum 65,536 characters | Existing evidence verification semantics: exit `0` valid, `2` malformed/unsupported, `3` processable but invalid. |
| `text.uppercase` | `text`, maximum 4,096 characters | Uppercase output; useful as a minimal successful local Action. |
| `text.require-equal` | `actual` and `expected`, maximum 4,096 characters each | Exit `0` when equal; exit `1` otherwise. |
| `json.pretty` | `json`, maximum 16,384 characters | Formatted JSON on success; exit `1` for invalid JSON. |

Operations are statically mapped to internal JavaScript functions. Action data cannot select a command, executable, module, path, environment variable, network destination, or credential.

## Local state and safety

The state file stores Action definitions and run history as JSON. Each run snapshots its inputs and terminal result. Writes use a mode-`0600` same-directory temporary file, file sync, atomic rename, and a short-lived exclusive lock. The parent directory is created with mode `0700` when absent.

The UI checks the exact loopback Host and Origin, requires JSON for mutations, uses a per-process request-protection token, sends no CORS allowance, and applies a restrictive content-security policy. Stored state is strictly schema-validated before use and displayed content is HTML-escaped. The token and loopback binding are request/CSRF protections, not authentication: run this MVP only on a trusted single-user host. Do not share the local URL or state directory.

This is not a sandbox, durable job queue, or tamper-evident audit log. A process crash during the small synchronous execution window may prevent the in-memory `running` state from being written. The current single-file store is capped at 8 MiB before read and write and has no pruning UI. Mutations take an exclusive lock across load, mutate, validate, cap-check, and atomic save; an abandoned lock is recovered only when its recorded local PID no longer exists.

## Explicit non-features

No generic workflow builder, schedules, triggers, branching, editing, deletion, plugins, arbitrary commands, action-selected filesystem operations, outbound networking, remote workers, accounts, credentials, sharing, deployment, or public Actions. The Actions service itself writes only its caller-selected local state file and same-directory lock/temporary files.
