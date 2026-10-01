import test from 'node:test';
import assert from 'node:assert/strict';
import { getCallServerUrl } from '../routes/calls.js';

test('call URLs keep the gateway origin for HTTPS, LAN and local requests', () => {
  const keys = ['CALL_SERVER_URL', 'CALL_SERVER_PATH', 'CALL_SERVER_PORT'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    delete process.env.CALL_SERVER_URL;
    process.env.CALL_SERVER_PATH = '/calls';
    process.env.CALL_SERVER_PORT = '3101';
    for (const [host, proto, expected] of [
      ['example.ngrok-free.app', 'https', 'wss://example.ngrok-free.app/calls'],
      ['192.168.1.20:8080', 'http', 'ws://192.168.1.20:8080/calls'],
      ['localhost:8080', 'http', 'ws://localhost:8080/calls'],
      ['localhost:3001', 'http', 'ws://localhost:3001/calls'],
      ['[::1]:8080', 'http', 'ws://[::1]:8080/calls'],
      ['example.test:8443', 'https', 'wss://example.test:8443/calls'],
    ]) {
      assert.equal(getCallServerUrl({
        headers: { 'x-forwarded-host': host, 'x-forwarded-proto': proto },
        protocol: 'http', get: () => 'internal:3001',
      }), expected);
    }
    assert.equal(getCallServerUrl({ headers: {}, protocol: 'http', get: () => 'localhost:8080' }), 'ws://localhost:8080/calls');
    process.env.CALL_SERVER_URL = 'wss://explicit.example/calls';
    assert.equal(getCallServerUrl({ headers: {} }), 'wss://explicit.example/calls');
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
