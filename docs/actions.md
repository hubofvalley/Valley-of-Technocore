# Local Actions MVP

Status: local MVP. This is an Actions capability, not a multi-step workflow engine.

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

The UI checks the exact loopback Host and Origin, requires JSON for mutations, uses a per-process request token, sends no CORS allowance, and applies a restrictive content-security policy. Stored content is HTML-escaped before display.

This is not a sandbox, durable job queue, or tamper-evident audit log. A process crash during the small synchronous execution window may prevent the in-memory `running` state from being written. The current single-file store is capped at 8 MiB and has no pruning UI.

## Explicit non-features

No multi-step workflows, schedules, triggers, branching, editing, deletion, plugins, arbitrary commands, filesystem operations, outbound networking, remote workers, accounts, credentials, sharing, deployment, or public Actions.
