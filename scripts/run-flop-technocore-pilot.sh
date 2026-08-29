#!/usr/bin/env bash
# One-shot, local-only FLOP Technocore Skill v1 pilot.
# Creates no persistent unit and removes all temporary evidence on exit.
set -euo pipefail

readonly MEMORY_MAX_BYTES=402653184 # 384 MiB
readonly TASKS_MAX=32
readonly SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
readonly REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd -P)"
readonly ADAPTER="$REPO_ROOT/skill/flop-technocore-v1/adapter.js"
readonly NATIVE="$REPO_ROOT/bin/valley-technocore.js"
readonly FIXTURE="$REPO_ROOT/fixtures/technocore-msg-v1-gauntlet.json"

fail() {
  printf 'pilot error: %s\n' "$*" >&2
  exit 1
}

cgroup_path_for_pid() {
  awk -F: '$1 == "0" { print $3; exit }' "/proc/$1/cgroup"
}

contains_pid() {
  local wanted="$1"
  shift
  local pid
  for pid in "$@"; do
    [[ "$pid" == "$wanted" ]] && return 0
  done
  return 1
}

run_in_scope() {
  local result_file="$1"
  local evidence_file="$2"
  local scope_path cgroup_dir adapter_pid child_pid child_pids
  local saw_adapter=0 saw_child=0 status=0

  scope_path="$(cgroup_path_for_pid "$$")"
  [[ -n "$scope_path" ]] || fail 'scope cgroup path unavailable'
  cgroup_dir="/sys/fs/cgroup$scope_path"
  [[ "$(stat -fc %T /sys/fs/cgroup)" == 'cgroup2fs' ]] || fail 'cgroup v2 unavailable'
  [[ -r "$cgroup_dir/memory.max" && -r "$cgroup_dir/memory.swap.max" && -r "$cgroup_dir/pids.max" ]] || fail 'memory/pids controller unavailable'
  [[ "$(cat "$cgroup_dir/memory.max")" == "$MEMORY_MAX_BYTES" ]] || fail 'memory.max mismatch'
  [[ "$(cat "$cgroup_dir/memory.swap.max")" == '0' ]] || fail 'memory.swap.max mismatch'
  [[ "$(cat "$cgroup_dir/pids.max")" == "$TASKS_MAX" ]] || fail 'pids.max mismatch'

  node "$ADAPTER" message verify < "$FIXTURE" > "$result_file" &
  adapter_pid=$!
  while kill -0 "$adapter_pid" 2>/dev/null; do
    read -r -a child_pids <<< "$(cat "/proc/$adapter_pid/task/$adapter_pid/children" 2>/dev/null || true)"
    if contains_pid "$adapter_pid" $(cat "$cgroup_dir/cgroup.procs"); then
      saw_adapter=1
    fi
    for child_pid in "${child_pids[@]:-}"; do
      [[ -n "$child_pid" ]] || continue
      [[ "$(cgroup_path_for_pid "$child_pid")" == "$scope_path" ]] || fail 'verifier child escaped scope'
      saw_child=1
    done
    sleep 0.001
  done
  wait "$adapter_pid" || status=$?
  [[ "$status" == 0 ]] || fail "adapter failed with exit $status"
  [[ "$saw_adapter" == 1 ]] || fail 'adapter was not observed in scope'
  [[ "$saw_child" == 1 ]] || fail 'verifier child was not observed in scope'

  local memory_events memory_peak
  memory_events="$(cat "$cgroup_dir/memory.events")"
  memory_peak="$(cat "$cgroup_dir/memory.peak")"
  [[ "$memory_events" =~ (^|$'\n')oom[[:space:]]+0($|$'\n') ]] || fail 'cgroup reported OOM'
  [[ "$memory_events" =~ (^|$'\n')oom_kill[[:space:]]+0($|$'\n') ]] || fail 'cgroup reported OOM kill'
  printf '%s\n' "$scope_path" > "$evidence_file"
  printf '%s\n' "$memory_peak" >> "$evidence_file"
}

if [[ "${1:-}" == '--inside-scope' ]]; then
  [[ "$#" == 3 ]] || fail 'invalid scoped invocation'
  run_in_scope "$2" "$3"
  exit 0
fi

[[ "$#" == 0 ]] || fail 'this pilot accepts no arguments'
[[ -f "$ADAPTER" && -f "$NATIVE" && -f "$FIXTURE" ]] || fail 'pinned pilot files unavailable'
systemctl --user is-active --quiet default.target || fail 'user systemd manager inactive'

expected="$(node "$NATIVE" message verify < "$FIXTURE")"
[[ -n "$expected" ]] || fail 'native expected result unavailable'

pilot_tmp="$(mktemp -d "${TMPDIR:-/tmp}/flop-technocore-pilot.XXXXXX")"
trap 'rm -rf -- "$pilot_tmp"' EXIT
result_file="$pilot_tmp/result.json"
evidence_file="$pilot_tmp/evidence.txt"
unit="flop-technocore-pilot-${RANDOM}-${RANDOM}.scope"

systemd-run --user --scope --collect --quiet --unit="$unit" \
  -p MemoryAccounting=yes \
  -p "MemoryMax=$MEMORY_MAX_BYTES" \
  -p MemorySwapMax=0 \
  -p TasksAccounting=yes \
  -p "TasksMax=$TASKS_MAX" \
  -- /usr/bin/env bash "$0" --inside-scope "$result_file" "$evidence_file"

[[ "$(cat "$result_file")" == "$expected" ]] || fail 'adapter result differs from pinned direct CLI'
mapfile -t evidence < "$evidence_file"
[[ "${#evidence[@]}" == 2 && "${evidence[1]}" =~ ^[0-9]+$ && "${evidence[1]}" -gt 0 ]] || fail 'invalid cgroup evidence'
[[ ! -e "/sys/fs/cgroup${evidence[0]}" ]] || fail 'transient scope was not collected'
printf 'PASS: local-only pilot verified under cgroup-v2 MemoryMax=384MiB, MemorySwapMax=0, TasksMax=32; peak=%s bytes\n' "${evidence[1]}"
