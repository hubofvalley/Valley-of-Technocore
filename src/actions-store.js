import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { ActionsConflictError, ActionsInputError, newState, validateState } from './actions.js';

export const MAX_STATE_BYTES = 8 * 1024 * 1024;

export function validateStatePath(path) { if (typeof path !== 'string' || !isAbsolute(path) || path.endsWith('/')) throw new ActionsInputError('state path must be an absolute file path'); }

function assertRegularBounded(path) {
  const entry = lstatSync(path); if (!entry.isFile() || entry.isSymbolicLink()) throw new ActionsInputError('state must be a regular file');
  if (entry.size > MAX_STATE_BYTES) throw new ActionsInputError('state exceeds 8 MiB');
}

export function loadState(path) {
  validateStatePath(path); if (!existsSync(path)) return newState(); assertRegularBounded(path);
  const bytes = readFileSync(path); if (bytes.length > MAX_STATE_BYTES) throw new ActionsInputError('state exceeds 8 MiB');
  const text = bytes.toString('utf8'); if (!Buffer.from(text, 'utf8').equals(bytes)) throw new ActionsInputError('state must be UTF-8');
  let state; try { state = JSON.parse(text); } catch { throw new ActionsInputError('state is not valid JSON'); } return validateState(state);
}

function acquireLock(lockPath) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { const fd = openSync(lockPath, 'wx', 0o600); writeFileSync(fd, `${process.pid}\n`, 'utf8'); fsyncSync(fd); return fd; }
    catch (error) {
      if (error.code !== 'EEXIST' || attempt === 1) throw new ActionsConflictError('state is locked');
      let pid; try { pid = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10); } catch { throw new ActionsConflictError('state is locked'); }
      try { process.kill(pid, 0); throw new ActionsConflictError('state is locked'); }
      catch (probe) { if (probe instanceof ActionsConflictError || probe.code !== 'ESRCH') throw new ActionsConflictError('state is locked'); unlinkSync(lockPath); }
    }
  }
  throw new ActionsConflictError('state is locked');
}

function atomicSave(path, state) {
  validateStatePath(path); validateState(state); const serialized = JSON.stringify(state);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) throw new ActionsInputError('state exceeds 8 MiB');
  const directory = dirname(path); mkdirSync(directory, { recursive: true, mode: 0o700 }); const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`); let file;
  try { file = openSync(temporary, 'wx', 0o600); writeFileSync(file, serialized, 'utf8'); fsyncSync(file); closeSync(file); file = undefined; renameSync(temporary, path); const parent = openSync(directory, 'r'); try { fsyncSync(parent); } finally { closeSync(parent); } }
  finally { if (file !== undefined) closeSync(file); try { unlinkSync(temporary); } catch {} }
}

export function withStateTransaction(path, mutate) {
  validateStatePath(path); const directory = dirname(path); mkdirSync(directory, { recursive: true, mode: 0o700 }); const lockPath = `${path}.lock`; const lock = acquireLock(lockPath);
  try { const state = loadState(path); const result = mutate(state); atomicSave(path, state); return result; }
  finally { closeSync(lock); try { unlinkSync(lockPath); } catch {} }
}

export function saveState(path, state) { atomicSave(path, state); }
