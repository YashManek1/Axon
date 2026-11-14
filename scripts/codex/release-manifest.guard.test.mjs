import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReleaseManifest } from './generate-release-manifest.mjs';

const scriptPath = fileURLToPath(new URL('./generate-release-manifest.mjs', import.meta.url));
const checkoutRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const digest = (character) => `registry.example/axon@sha256:${character.repeat(64)}`;

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function syntheticLinuxElf64X86_64(marker = 0) {
  const bytes = Buffer.alloc(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46], 0); // ELF magic
  bytes[4] = 2; // ELFCLASS64
  bytes[5] = 1; // little endian
  bytes[6] = 1; // ELF version
  bytes[7] = 3; // Linux ABI
  bytes.writeUInt16LE(2, 16); // executable
  bytes.writeUInt16LE(0x3e, 18); // EM_X86_64
  bytes.writeUInt32LE(1, 20); // ELF version
  bytes[63] = marker;
  return bytes;
}

function makeFixture(t) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'axon-release-manifest-'));
  t.after(() => rmSync(tempRoot, { recursive: true, force: true }));

  const sourceRoot = join(tempRoot, 'source');
  const artifactRoot = join(tempRoot, 'artifacts');
  mkdirSync(sourceRoot);
  mkdirSync(artifactRoot);
  writeFileSync(join(sourceRoot, 'README.md'), 'release source\n');
  runGit(sourceRoot, ['init', '--quiet']);
  runGit(sourceRoot, ['config', 'user.email', 'release-guard@example.invalid']);
  runGit(sourceRoot, ['config', 'user.name', 'Axon release guard']);
  runGit(sourceRoot, ['add', 'README.md']);
  runGit(sourceRoot, ['commit', '--quiet', '-m', 'fixture']);

  const linuxAgentPath = join(artifactRoot, 'axon-agent');
  writeFileSync(linuxAgentPath, syntheticLinuxElf64X86_64());

  const outputPath = join(tempRoot, 'candidate-manifest.json');
  const options = {
    sourceRoot,
    outputPath,
    releaseId: 'axon-linux-pilot-2026-11-06',
    linuxAgentPath,
    backendImage: digest('a'),
    frontendImage: digest('b'),
    sandboxImage: digest('c'),
    executionProfile: 'pilot',
    deploymentMode: 'docker',
    targetPolicy: 'exact',
    approvalPolicy: 'server-bound',
    journalPolicy: 'durable',
    operatorResolutionEnabled: false,
    dispatchedUnknownReleaseEnabled: false,
    automaticRetryEnabled: false,
  };

  return { tempRoot, sourceRoot, linuxAgentPath, outputPath, options };
}

function assertRejectedWithoutOutput(fixture, pattern) {
  assert.throws(() => generateReleaseManifest(fixture.options), pattern);
  assert.equal(existsSync(fixture.outputPath), false, 'rejection must not create output');
}

test('writes schema v2 for an explicit clean Linux pilot candidate', (t) => {
  const fixture = makeFixture(t);
  const result = generateReleaseManifest(fixture.options);
  const bytes = readFileSync(fixture.linuxAgentPath);

  assert.equal(result.manifestPath, fixture.outputPath);
  assert.deepEqual(JSON.parse(readFileSync(fixture.outputPath, 'utf8')), result.manifest);
  assert.equal(result.manifest.schemaVersion, 2);
  assert.equal(result.manifest.releaseId, fixture.options.releaseId);
  assert.equal(result.manifest.source.commitSha, runGit(fixture.sourceRoot, ['rev-parse', '--verify', 'HEAD']));
  assert.equal(result.manifest.source.cleanTree, true);
  assert.deepEqual(result.manifest.protocol, { version: 2 });
  assert.equal(result.manifest.artifacts.linuxAgent.format, 'ELF64');
  assert.equal(result.manifest.artifacts.linuxAgent.architecture, 'x86_64');
  assert.equal(result.manifest.artifacts.linuxAgent.target, 'linux-x86_64-elf64');
  assert.equal(result.manifest.artifacts.linuxAgent.sizeBytes, bytes.length);
  assert.equal(
    result.manifest.artifacts.linuxAgent.sha256,
    createHash('sha256').update(bytes).digest('hex'),
  );
  assert.deepEqual(result.manifest.images, {
    backend: fixture.options.backendImage,
    frontend: fixture.options.frontendImage,
    sandbox: fixture.options.sandboxImage,
  });
  assert.deepEqual(result.manifest.policy, {
    executionProfile: 'pilot',
    deploymentMode: 'docker',
    targetPolicy: 'exact',
    approvalPolicy: 'server-bound',
    journalPolicy: 'durable',
    operatorResolutionEnabled: false,
    dispatchedUnknownReleaseEnabled: false,
    automaticRetryEnabled: false,
  });
  assert.equal('buildProvenance' in result.manifest, false);
  assert.equal('runtimeAcceptance' in result.manifest, false);
});

test('changed Linux agent bytes produce a changed hash', (t) => {
  const fixture = makeFixture(t);
  const first = generateReleaseManifest({
    ...fixture.options,
    outputPath: join(fixture.tempRoot, 'candidate-1.json'),
  });
  writeFileSync(fixture.linuxAgentPath, syntheticLinuxElf64X86_64(1));
  const second = generateReleaseManifest({
    ...fixture.options,
    outputPath: join(fixture.tempRoot, 'candidate-2.json'),
  });

  assert.notEqual(
    first.manifest.artifacts.linuxAgent.sha256,
    second.manifest.artifacts.linuxAgent.sha256,
  );
});

test('rejects Git failure before output', (t) => {
  const fixture = makeFixture(t);
  fixture.options.sourceRoot = join(fixture.tempRoot, 'not-a-repository');
  mkdirSync(fixture.options.sourceRoot);
  assertRejectedWithoutOutput(fixture, /Git|repository/i);
});

test('rejects dirty tracked source before output', (t) => {
  const fixture = makeFixture(t);
  writeFileSync(join(fixture.sourceRoot, 'README.md'), 'dirty source\n');
  assertRejectedWithoutOutput(fixture, /clean|dirty/i);
});

test('rejects untracked source before output', (t) => {
  const fixture = makeFixture(t);
  writeFileSync(join(fixture.sourceRoot, 'untracked.txt'), 'untracked\n');
  assertRejectedWithoutOutput(fixture, /clean|untracked/i);
});

test('rejects a missing Linux agent before output', (t) => {
  const fixture = makeFixture(t);
  fixture.options.linuxAgentPath = join(fixture.tempRoot, 'missing-agent');
  assertRejectedWithoutOutput(fixture, /agent|artifact|missing/i);
});

for (const [name, bytes] of [
  ['non-ELF bytes', Buffer.from('not an ELF')],
  ['ELF32 bytes', (() => { const value = syntheticLinuxElf64X86_64(); value[4] = 1; return value; })()],
  ['non-executable ELF bytes', (() => { const value = syntheticLinuxElf64X86_64(); value.writeUInt16LE(1, 16); return value; })()],
  ['non-x86_64 bytes', (() => { const value = syntheticLinuxElf64X86_64(); value.writeUInt16LE(0xb7, 18); return value; })()],
]) {
  test(`rejects ${name} before output`, (t) => {
    const fixture = makeFixture(t);
    writeFileSync(fixture.linuxAgentPath, bytes);
    assertRejectedWithoutOutput(fixture, /ELF64|x86_64|Linux/i);
  });
}

for (const field of ['backendImage', 'frontendImage', 'sandboxImage']) {
  test(`rejects an invalid ${field} digest reference before output`, (t) => {
    const fixture = makeFixture(t);
    fixture.options[field] = 'registry.example/axon:latest';
    assertRejectedWithoutOutput(fixture, /digest|sha256|image/i);
  });
}

test('rejects missing explicit release ID before output', (t) => {
  const fixture = makeFixture(t);
  delete fixture.options.releaseId;
  assertRejectedWithoutOutput(fixture, /release ID/i);
});

for (const [field, unsupported] of [
  ['executionProfile', 'legacy'],
  ['deploymentMode', 'native'],
  ['targetPolicy', 'any'],
  ['approvalPolicy', 'run-bound'],
  ['journalPolicy', 'memory'],
  ['operatorResolutionEnabled', true],
  ['dispatchedUnknownReleaseEnabled', true],
  ['automaticRetryEnabled', true],
]) {
  test(`rejects unsupported policy ${field} before output`, (t) => {
    const fixture = makeFixture(t);
    fixture.options[field] = unsupported;
    assertRejectedWithoutOutput(fixture, /policy|unsupported|must be/i);
  });
}

test('requires an explicit output outside the source checkout', (t) => {
  const fixture = makeFixture(t);
  delete fixture.options.outputPath;
  assertRejectedWithoutOutput(fixture, /output/i);

  fixture.options.outputPath = join(fixture.sourceRoot, 'manifest.json');
  fixture.outputPath = fixture.options.outputPath;
  assertRejectedWithoutOutput(fixture, /outside|output/i);
});

test('preserves an existing output file', (t) => {
  const fixture = makeFixture(t);
  const sentinel = Buffer.from('existing candidate must survive\n');
  writeFileSync(fixture.outputPath, sentinel);

  assert.throws(() => generateReleaseManifest(fixture.options), /already exists|output/i);
  assert.deepEqual(readFileSync(fixture.outputPath), sentinel);
});

test('current workspace default invocation fails closed without touching its manifest', () => {
  const checkoutManifest = join(checkoutRoot, 'release-manifest.json');
  const existedBefore = existsSync(checkoutManifest);
  const bytesBefore = existedBefore ? readFileSync(checkoutManifest) : null;
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: checkoutRoot,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0, 'default invocation must fail');
  assert.equal(existsSync(checkoutManifest), existedBefore);
  if (bytesBefore) {
    assert.deepEqual(readFileSync(checkoutManifest), bytesBefore);
  }
});
