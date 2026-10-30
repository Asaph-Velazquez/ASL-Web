import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { createConsentRouter } from '../routes/consents.js';
import { Consent } from '../models/Consent.js';

test('CPM_MOV_001: HTTP consent validates acceptance and uses an idempotent server timestamp', async t => {
  const updates = [];
  const app = express();
  app.use(express.json());
  app.use('/api/consents', createConsentRouter({ updateOne: async (...args) => updates.push(args) }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const payload = { installationId: 'a'.repeat(32), policyVersion: '2026-10-26',
    privacyAccepted: true, cameraAccepted: true, cameraPermission: 'requested' };
  const post = body => fetch(`http://127.0.0.1:${server.address().port}/api/consents`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  for (const body of [{ ...payload, privacyAccepted: false }, { ...payload, installationId: 'hardware' },
    { ...payload, policyVersion: 'old' }, { ...payload, acceptedAt: '2000-01-01' }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(updates.length, 0);
  for (const cameraPermission of ['requested', 'denied', 'granted']) {
    const response = await post({ ...payload, cameraPermission });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accepted: true, policyVersion: payload.policyVersion });
  }
  assert.equal(updates.length, 3);
  for (const [filter, update, options] of updates) {
    assert.deepEqual(filter, { installationId: payload.installationId, policyVersion: payload.policyVersion });
    assert.ok(update.$setOnInsert.acceptedAt instanceof Date);
    assert.equal(update.$set.acceptedAt, undefined);
    assert.equal(options.upsert, true);
  }
});

test('CPM_MOV_001: real Mongo keeps one consent across concurrent retries and permission changes', {
  skip: !process.env.TEST_MONGODB_URI, timeout: 20000,
}, async t => {
  const target = new URL(process.env.TEST_MONGODB_URI);
  assert.equal(target.protocol, 'mongodb:');
  assert.equal(target.hostname, '127.0.0.1');
  assert.match(target.pathname, /^\/asl_qa_[a-zA-Z0-9_-]+$/);
  assert.equal(process.env.TEST_ALLOW_EPHEMERAL_DB, '1');
  target.pathname += `_consent_${randomUUID().replaceAll('-', '')}`;
  const connection = await mongoose.createConnection(target.toString(), { serverSelectionTimeoutMS: 5000 }).asPromise();
  t.after(async () => { await connection.dropDatabase(); await connection.close(); });
  const Model = connection.model('Consent', Consent.schema);
  await Model.init();
  const app = express();
  app.use(express.json());
  app.use('/api/consents', createConsentRouter(Model));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const installationId = 'b'.repeat(32);
  const post = async cameraPermission => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/consents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installationId, policyVersion: '2026-10-26',
        privacyAccepted: true, cameraAccepted: true, cameraPermission }),
    });
    assert.equal(response.status, 200);
  };
  await Promise.all(Array.from({ length: 5 }, () => post('requested')));
  assert.equal(await Model.countDocuments(), 1);
  const original = await Model.findOne({ installationId }).lean();
  assert.equal(original.privacyAccepted, true);
  assert.equal(original.cameraAccepted, true);
  assert.ok(original.acceptedAt instanceof Date);
  for (const permission of ['denied', 'granted']) {
    await post(permission);
    const updated = await Model.findOne({ installationId }).lean();
    assert.equal(updated.cameraPermission, permission);
    assert.equal(updated.acceptedAt.getTime(), original.acceptedAt.getTime());
    assert.ok(updated.permissionUpdatedAt >= original.permissionUpdatedAt);
    assert.equal(await Model.countDocuments(), 1);
  }
});
