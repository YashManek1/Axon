/**
 * Axon Linux pilot release manifest generator.
 *
 * Schema v2 is a fail-closed candidate inventory. It records exact source,
 * artifact, image, protocol, and policy inputs; it does not attest build
 * provenance or runtime acceptance.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REQUIRED_POLICY = Object.freeze({
  executionProfile: 'pilot',
  deploymentMode: 'docker',
  targetPolicy: 'exact',
  approvalPolicy: 'server-bound',
  journalPolicy: 'durable',
  operatorResolutionEnabled: false,
  dispatchedUnknownReleaseEnabled: false,
  automaticRetryEnabled: false,
});

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be explicitly provided as a non-empty string`);
  }
  return value;
}

function validateReleaseId(releaseId) {
  requireString(releaseId, 'release ID');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(releaseId)) {
    throw new Error('release ID contains unsupported characters or is too long');
  }
}

function validateImageDigestReference(reference, label) {
  requireString(reference, `${label} image digest reference`);
  const immutableReference = /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[0-9]+)?\/)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[a-z0-9][a-z0-9._-]{0,127})?@sha256:[a-f0-9]{64}$/;
  if (!immutableReference.test(reference)) {
    throw new Error(`${label} image must be an immutable name@sha256:<64 lowercase hex> digest reference`);
  }
}

function validatePolicy(options) {
  for (const [field, requiredValue] of Object.entries(REQUIRED_POLICY)) {
    if (options[field] !== requiredValue) {
      throw new Error(`unsupported policy ${field}: must be ${JSON.stringify(requiredValue)}`);
    }
  }
}

function normalizedPath(path) {
  const resolved = realpathSync(path);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isWithin(parent, candidate) {
  const relation = relative(parent, candidate);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function resolveOutputPath(outputPath, sourceRoot) {
  requireString(outputPath, 'output path');
  if (!isAbsolute(outputPath)) {
    throw new Error('output path must be an explicit absolute path outside the source checkout');
  }

  const absoluteOutput = resolve(outputPath);
  if (existsSync(absoluteOutput)) {
    throw new Error(`output path already exists: ${absoluteOutput}`);
  }

  let outputParent;
  try {
    outputParent = normalizedPath(dirname(absoluteOutput));
  } catch (error) {
    throw new Error(`output parent must already exist: ${error.message}`);
  }
  const normalizedOutput = resolve(outputParent, absoluteOutput.slice(dirname(absoluteOutput).length + 1));
  if (isWithin(sourceRoot, normalizedOutput)) {
    throw new Error('output path must be outside the source checkout');
  }
  return absoluteOutput;
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = error.stderr?.toString().trim();
    throw new Error(`Git command failed${detail ? `: ${detail}` : ''}`);
  }
}

function readCleanSourceState(sourceRoot) {
  let repositoryRoot;
  try {
    repositoryRoot = normalizedPath(git(sourceRoot, ['rev-parse', '--show-toplevel']));
  } catch (error) {
    throw new Error(`source root is not a readable Git repository: ${error.message}`);
  }
  if (repositoryRoot !== sourceRoot) {
    throw new Error('source root must be the Git checkout root');
  }

  const commitSha = git(sourceRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commitSha)) {
    throw new Error('Git HEAD did not resolve to a full commit object ID');
  }

  const status = git(sourceRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status !== '') {
    throw new Error('source checkout must be clean with no tracked or untracked changes');
  }
  return { commitSha, cleanTree: true };
}

function readLinuxAgent(linuxAgentPath) {
  requireString(linuxAgentPath, 'Linux agent artifact path');
  if (!isAbsolute(linuxAgentPath)) {
    throw new Error('Linux agent artifact path must be absolute');
  }

  let stats;
  let bytes;
  try {
    stats = statSync(linuxAgentPath);
    if (!stats.isFile()) {
      throw new Error('path is not a regular file');
    }
    bytes = readFileSync(linuxAgentPath);
  } catch (error) {
    throw new Error(`Linux agent artifact is missing or unreadable: ${error.message}`);
  }

  if (bytes.length < 20 || !bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    throw new Error('Linux agent artifact must be an ELF64 x86_64 binary');
  }
  if (bytes[4] !== 2) {
    throw new Error('Linux agent artifact must be ELF64');
  }
  if (bytes[5] !== 1 && bytes[5] !== 2) {
    throw new Error('Linux agent artifact has an unsupported ELF byte order');
  }
  if (bytes[6] !== 1) {
    throw new Error('Linux agent artifact has an unsupported ELF version');
  }
  if (bytes[7] !== 0 && bytes[7] !== 3) {
    throw new Error('Linux agent artifact must use the System V or Linux ELF ABI');
  }
  const executableType = bytes[5] === 1 ? bytes.readUInt16LE(16) : bytes.readUInt16BE(16);
  if (executableType !== 2 && executableType !== 3) {
    throw new Error('Linux agent artifact must be an ELF executable or position-independent executable');
  }
  const machine = bytes[5] === 1 ? bytes.readUInt16LE(18) : bytes.readUInt16BE(18);
  if (machine !== 0x3e) {
    throw new Error('Linux agent artifact must target x86_64');
  }

  return {
    target: 'linux-x86_64-elf64',
    os: 'linux',
    format: 'ELF64',
    architecture: 'x86_64',
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export function generateReleaseManifest(options = {}) {
  validateReleaseId(options.releaseId);
  validateImageDigestReference(options.backendImage, 'backend');
  validateImageDigestReference(options.frontendImage, 'frontend');
  validateImageDigestReference(options.sandboxImage, 'sandbox');
  validatePolicy(options);

  const requestedSourceRoot = resolve(options.sourceRoot ?? process.cwd());
  let sourceRoot;
  try {
    sourceRoot = normalizedPath(requestedSourceRoot);
  } catch (error) {
    throw new Error(`source root is missing or unreadable: ${error.message}`);
  }
  const manifestPath = resolveOutputPath(options.outputPath, sourceRoot);
  const source = readCleanSourceState(sourceRoot);
  const linuxAgent = readLinuxAgent(options.linuxAgentPath);

  const manifest = {
    schemaVersion: 2,
    releaseId: options.releaseId,
    generatedAt: new Date().toISOString(),
    source,
    protocol: { version: 2 },
    artifacts: { linuxAgent },
    images: {
      backend: options.backendImage,
      frontend: options.frontendImage,
      sandbox: options.sandboxImage,
    },
    policy: { ...REQUIRED_POLICY },
  };

  const confirmedSource = readCleanSourceState(sourceRoot);
  if (confirmedSource.commitSha !== source.commitSha) {
    throw new Error('Git HEAD changed while generating the manifest');
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  return { manifest, manifestPath };
}

function parseExplicitFalse(value, label) {
  if (value !== 'false') {
    throw new Error(`${label} must be explicitly set to false`);
  }
  return false;
}

function cliOptions() {
  const { values } = parseArgs({
    allowPositionals: false,
    strict: true,
    options: {
      'source-root': { type: 'string' },
      output: { type: 'string' },
      'release-id': { type: 'string' },
      'linux-agent': { type: 'string' },
      'backend-image': { type: 'string' },
      'frontend-image': { type: 'string' },
      'sandbox-image': { type: 'string' },
      'execution-profile': { type: 'string' },
      'deployment-mode': { type: 'string' },
      'target-policy': { type: 'string' },
      'approval-policy': { type: 'string' },
      'journal-policy': { type: 'string' },
      'operator-resolution': { type: 'string' },
      'dispatched-unknown-release': { type: 'string' },
      'automatic-retry': { type: 'string' },
    },
  });

  return {
    sourceRoot: values['source-root'],
    outputPath: values.output,
    releaseId: values['release-id'],
    linuxAgentPath: values['linux-agent'],
    backendImage: values['backend-image'],
    frontendImage: values['frontend-image'],
    sandboxImage: values['sandbox-image'],
    executionProfile: values['execution-profile'],
    deploymentMode: values['deployment-mode'],
    targetPolicy: values['target-policy'],
    approvalPolicy: values['approval-policy'],
    journalPolicy: values['journal-policy'],
    operatorResolutionEnabled: parseExplicitFalse(values['operator-resolution'], '--operator-resolution'),
    dispatchedUnknownReleaseEnabled: parseExplicitFalse(
      values['dispatched-unknown-release'],
      '--dispatched-unknown-release',
    ),
    automaticRetryEnabled: parseExplicitFalse(values['automatic-retry'], '--automatic-retry'),
  };
}

const invokedDirectly = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const result = generateReleaseManifest(cliOptions());
    console.log(`Generated release manifest at ${result.manifestPath}`);
  } catch (error) {
    console.error(`Release manifest rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
