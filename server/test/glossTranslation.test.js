import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { translateRequestMessage } from '../services/glossTranslation.js';
import { persistNewRequest } from '../services/requestPersistence.js';

const payload = () => ({ id: 'gloss-1', roomNumber: 'QA', guestName: 'QA',
  type: 'room-service', message: 'I_ME NEED WATER',
  details: { sourceMode: 'asl', generatedFromSignCapture: true } });
const guest = { stayId: 'qa-stay', guestName: 'QA' };
const result = text => ({ gloss: text, english: 'I need water.', input_type: 'gloss',
  corrected: text, preprocessed: 'X-I NEED WATER' });
const env = { GLOSS_TRANSLATOR_URL: 'http://translator:8000' };

test('ASL and text messages use autodetection regardless of client mode metadata', async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.equal(String(url), 'http://translator:8000/translate');
    assert.deepEqual(JSON.parse(options.body), { text: 'I_ME NEED WATER' });
    assert.equal(options.redirect, 'error');
    return Response.json(result('I_ME NEED WATER'));
  };
  assert.equal(await translateRequestMessage(payload(), { env: {}, fetchImpl }), null);
  for (const details of [undefined, { sourceMode: 'text' }, { sourceMode: 'text_guided' }]) {
    const manual = await translateRequestMessage({ message: 'I_ME NEED WATER', details }, { env, fetchImpl });
    assert.equal(manual.english, 'I need water.');
  }
  const translated = await translateRequestMessage(payload(), { env, fetchImpl });
  assert.equal(calls, 4);
  assert.equal(translated.original, 'I_ME NEED WATER');
  assert.equal(translated.english, 'I need water.');
  assert.equal(translated.engine, 'asl-translator-fp32');
});

test('legacy ASL tag lets model detect natural English rather than forcing gloss', async () => {
  const original = 'I need water.';
  const translated = await translateRequestMessage({ message: original, details: { sourceMode: 'ASL' } }, {
    env, fetchImpl: async (_, options) => {
      assert.deepEqual(JSON.parse(options.body), { text: original });
      return Response.json({ gloss: original, english: original, input_type: 'english' });
    },
  });
  assert.equal(translated.english, original);
});

test('selected engine is server-owned, defaults to FP32 and accepts only supported variants', async () => {
  const input = { ...payload(), translation: { engine: 'forged' } };
  const fetchImpl = async () => Response.json(result(input.message));
  assert.equal((await translateRequestMessage(input, { env, fetchImpl })).engine, 'asl-translator-fp32');
  assert.equal((await translateRequestMessage(input, {
    env: { ...env, GLOSS_TRANSLATOR_ENGINE: 'asl-translator-int8-dynamic' }, fetchImpl,
  })).engine, 'asl-translator-int8-dynamic');
  await assert.rejects(translateRequestMessage(input, {
    env: { ...env, GLOSS_TRANSLATOR_ENGINE: 'unknown' },
    fetchImpl: () => assert.fail('invalid engine must not send a request'),
  }), /CONFIGURATION INVALID/);
});

test('camera draft edited to English uses autodetection and keeps category and text exactly', async () => {
  const original = 'FOOD: I need more towels.';
  const translated = await translateRequestMessage({ ...payload(), message: original }, {
    env, fetchImpl: async (_, options) => {
      assert.deepEqual(JSON.parse(options.body), { text: 'I need more towels.' });
      return Response.json({ gloss: 'I need more towels.', english: 'I need more towels.', input_type: 'english' });
    },
  });
  assert.equal(translated.english, original);
  assert.equal(translated.original, original);
  assert.equal(translated.inputType, 'english');
});

test('mobile category prefix stays outside model input and is restored for reception', async () => {
  const input = { ...payload(), message: 'Room Service: I_ME NEED WATER' };
  const translated = await translateRequestMessage(input, { env, fetchImpl: async (_, options) => {
    assert.equal(JSON.parse(options.body).text, 'I_ME NEED WATER');
    return Response.json(result('I_ME NEED WATER'));
  } });
  assert.equal(translated.original, input.message);
  assert.equal(translated.glossInput, 'I_ME NEED WATER');
  assert.equal(translated.english, 'Room Service: I need water.');
});

test('unknown categories and nested colons do not silently discard user text', async () => {
  for (const [message, expected] of [['UNKNOWN: I_ME NEED WATER', 'UNKNOWN: I_ME NEED WATER'],
    ['FOOD: I_ME NEED: WATER', 'I_ME NEED: WATER'], ['I_ME NEED WATER', 'I_ME NEED WATER']]) {
    await translateRequestMessage({ ...payload(), message }, { env, fetchImpl: async (_, options) => {
      assert.equal(JSON.parse(options.body).text, expected);
      return Response.json(result(expected));
    } });
  }
});

test('upstream errors, invalid JSON, wrong original, empty and oversized responses fail closed', async () => {
  const failures = [new Response('', { status: 503 }), new Response('not json'),
    Response.json({ ...result('different'), english: 'Forged' }),
    Response.json({ ...result('I_ME NEED WATER'), english: '' }),
    new Response('x'.repeat(32769))];
  for (const response of failures) {
    await assert.rejects(translateRequestMessage(payload(), { env, fetchImpl: async () => response }),
      error => error.code === 'GLOSS_TRANSLATION_UNAVAILABLE' && error.retryable === true);
  }
  for (const status of [413, 422]) {
    await assert.rejects(translateRequestMessage(payload(), {
      env, fetchImpl: async () => new Response('', { status }),
    }), error => error.code === 'GLOSS_TRANSLATION_INVALID_INPUT' && error.retryable === false);
  }
});

test('configuration cannot include credentials, alternate paths or unbounded mobile timeout', async () => {
  for (const GLOSS_TRANSLATOR_URL of ['file:///tmp/a', 'http://user:pass@host', 'http://host/other']) {
    await assert.rejects(translateRequestMessage(payload(), { env: { GLOSS_TRANSLATOR_URL },
      fetchImpl: () => assert.fail('must not send') }), /CONFIGURATION INVALID/);
  }
  await assert.rejects(translateRequestMessage(payload(), { env: { ...env, GLOSS_TRANSLATOR_TIMEOUT_MS: '15000' },
    fetchImpl: () => assert.fail('must not send') }), /CONFIGURATION INVALID/);
});

test('real HTTP timeout is bounded and does not expose upstream text', async t => {
  let received = false;
  const server = createServer((_, response) => {
    received = true;
    response.on('error', () => {});
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const start = Date.now();
  await assert.rejects(translateRequestMessage(payload(), { env: {
    GLOSS_TRANSLATOR_URL: `http://127.0.0.1:${server.address().port}`, GLOSS_TRANSLATOR_TIMEOUT_MS: '100',
  } }), error => error.code === 'GLOSS_TRANSLATION_UNAVAILABLE' && error.retryable);
  assert.equal(received, true);
  assert.ok(Date.now() - start >= 80);
  assert.ok(Date.now() - start < 2000);
});

function repository() {
  let state;
  return {
    get state() { return state; },
    findOne() { return { lean: async () => state ? structuredClone(state) : null }; },
    async create(document) {
      if (state) throw Object.assign(new Error('duplicate'), { code: 11000 });
      state = structuredClone(document);
      return { toObject: () => structuredClone(state) };
    },
  };
}

test('persistence stores English and original metadata, ignores forged metadata, retries original without retranslating', async () => {
  const db = repository();
  let calls = 0;
  const translate = async value => { calls += 1; return {
    original: value.message, english: 'I need water.', inputType: 'gloss', engine: 'test', translatedAt: new Date(),
  }; };
  const input = { ...payload(), translation: { original: 'forged', english: 'forged' } };
  const created = await persistNewRequest(input, guest, db, translate);
  assert.equal(created.message, 'I need water.');
  assert.equal(created.translation.original, 'I_ME NEED WATER');
  assert.equal(created.history[0].note, 'I need water.');
  const retry = await persistNewRequest(input, guest, db, () => assert.fail('retry must not call service'));
  assert.deepEqual(retry, created);
  assert.equal(calls, 1);
  await assert.rejects(persistNewRequest({ ...input, message: 'OTHER' }, guest, db, translate), /Duplicate/);
  await assert.rejects(persistNewRequest(input, { stayId: 'other' }, db, translate), /Duplicate/);
});

test('failed translation creates no request and same ID can be retried successfully', async () => {
  const db = repository();
  await assert.rejects(persistNewRequest(payload(), guest, db,
    async () => { throw new Error('unavailable'); }), /unavailable/);
  assert.equal(db.state, undefined);
  const created = await persistNewRequest(payload(), guest, db,
    async value => ({ original: value.message, english: 'I need water.' }));
  assert.equal(created.message, 'I need water.');
});

test('concurrent original retries keep one server result even if generated English differs', async () => {
  const db = repository();
  let calls = 0;
  const translate = async value => ({ original: value.message, english: `English ${++calls}` });
  const [a, b] = await Promise.all([persistNewRequest(payload(), guest, db, translate),
    persistNewRequest(payload(), guest, db, translate)]);
  assert.equal(a.message, b.message);
  assert.equal(a.creationFingerprint, b.creationFingerprint);
});
