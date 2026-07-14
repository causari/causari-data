#!/usr/bin/env node

const SHA256 = /^[a-f0-9]{64}$/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validIsoDate(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function validateArtifact(artifact, label) {
  const errors = [];

  if (!isObject(artifact)) {
    return [`${label}.artifact must be an object when connector output is truncated`];
  }
  if (!isNonEmptyString(artifact.uri)) {
    errors.push(`${label}.artifact.uri must point to the full stored payload`);
  }
  if (!isNonEmptyString(artifact.sha256) || !SHA256.test(artifact.sha256)) {
    errors.push(`${label}.artifact.sha256 must be a 64-character SHA-256 hex digest`);
  }
  if (!isNonNegativeInteger(artifact.byteLength)) {
    errors.push(`${label}.artifact.byteLength must be a non-negative integer`);
  }
  if (!isNonEmptyString(artifact.preview)) {
    errors.push(`${label}.artifact.preview must be a non-empty bounded preview`);
  }
  if (!isNonEmptyString(artifact.retrievalHint)) {
    errors.push(`${label}.artifact.retrievalHint must explain how to read the full payload`);
  }

  return errors;
}

/**
 * Validate optional evidence-capture metadata attached to an event source.
 *
 * Legacy/direct URL citations do not need `capture`. Once evidence is obtained
 * through a connector, `capture.mode = "connector"` makes truncation explicit.
 * A truncated connector response is invalid unless the full payload is stored
 * and addressable by a checksummed artifact reference.
 */
export function validateSourceCapture(source, label = 'source') {
  const errors = [];

  if (!isObject(source)) {
    return [`${label} must be an object`];
  }

  const capture = source.capture;
  if (capture === undefined) return errors;
  if (!isObject(capture)) return [`${label}.capture must be an object`];

  if (!['direct', 'connector'].includes(capture.mode)) {
    errors.push(`${label}.capture.mode must be "direct" or "connector"`);
    return errors;
  }

  if (capture.capturedAt !== undefined && !validIsoDate(capture.capturedAt)) {
    errors.push(`${label}.capture.capturedAt must be an ISO date-time`);
  }

  if (capture.mode === 'direct') {
    if (capture.truncated === true) {
      errors.push(`${label}.capture: direct evidence cannot claim a truncated connector payload`);
    }
    return errors;
  }

  if (typeof capture.truncated !== 'boolean') {
    errors.push(`${label}.capture.truncated must be an explicit boolean for connector evidence`);
    return errors;
  }

  if (capture.truncated === true) {
    errors.push(...validateArtifact(capture.artifact, label));
  } else if (capture.artifact !== undefined) {
    errors.push(...validateArtifact(capture.artifact, label));
  }

  return errors;
}
