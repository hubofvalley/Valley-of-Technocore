import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { ActionsConflictError, ActionsInputError, newState, validateState } from './actions.js';

const MAX_STATE_BYTES = 8 * 1024 * 1024;

export function validateStatePath(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.endsWith('/')) throw new ActionsInputError('state path must be an absolute file path');
}

export function loadState(path) {
  validateStatePath(path);
  if (!existsSync(path)) return newState();
  const bytes = readFileSync(path);
  if (bytes.length > MAX_STATE_BYTES) throw new ActionsInputError('state exceeds 8 MiB');
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new ActionsInputError('state must be UTF-8');
  let state; try { state = JSON.parse(text); } catch { throw new ActionsInputError('state is not valid JSON'); }
  return validateState(state);
}

export function saveState(path, state) {
  validateStatePath(path); validateState(state);
  const directory = dirname(path); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`; let lock;
  try { lock = openSync(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new ActionsConflictError('state is locked'); throw error; }
  const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`); let file;
  try {
    file = openSync(temporary, 'wx', 0o600);
    writeFileSync(file, JSON.stringify(state), 'utf8'); fsyncSync(file); closeSync(file); file = undefined;
    renameSync(temporary, path);
    const parent = openSync(directory, 'r'); try { fsyncSync(parent); } finally { closeSync(parent); }
  } finally {
    if (file !== undefined) closeSync(file);
    try { unlinkSync(temporary); } catch {}
    closeSync(lock); try { unlinkSync(lockPath); } catch {}
  }
}
