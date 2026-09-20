import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('verified install docs track the current stable package release assets', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/u.test(pkg.version)) return;

  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const archiveName = `valley-of-technocore-v${pkg.version}.tar`;
  const releaseBase = `https://github.com/hubofvalley/Valley-of-Technocore/releases`;
  const download = `${releaseBase}/download/v${pkg.version}/${archiveName}`;

  assert.ok(readme.includes(`curl -fLO ${download}\n`));
  assert.ok(readme.includes(`curl -fLO ${download}.sha256\n`));
  assert.ok(readme.includes(`sha256sum -c ${archiveName}.sha256`));
  assert.ok(readme.includes(`./${archiveName}`));
  assert.ok(readme.includes(`[v${pkg.version} release](${releaseBase}/tag/v${pkg.version})`));
});
