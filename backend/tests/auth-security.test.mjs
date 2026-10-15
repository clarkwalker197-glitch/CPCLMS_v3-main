import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const frontendApiPath = new URL('../../frontend/lib/api.ts', import.meta.url);
const authControllerPath = new URL('../src/controllers/auth.controller.ts', import.meta.url);

const read = (fileUrl) => fs.readFileSync(fileUrl, 'utf8');

test('refresh tokens are not stored in browser localStorage', () => {
  const source = read(frontendApiPath);
  assert.equal(source.includes("localStorage.setItem('refreshToken'"), false);
  assert.equal(source.includes('localStorage.setItem("refreshToken"'), false);
});

test('backend auth controller sets refresh cookies on successful auth responses', () => {
  const source = read(authControllerPath);
  assert.equal(source.includes('res.cookie('), true);
});
