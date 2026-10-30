import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadStayQr } from './stayQr.ts';
import fs from 'node:fs';
import ts from 'typescript';

test('CPM_STF_001: downloads the PNG bytes through a blob URL and cleans up after starting', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const events = [];
  let image;
  const link = { click() { events.push('click'); }, remove() { events.push('remove'); } };
  const doc = { createElement: tag => { assert.equal(tag, 'a'); return link; }, body: { appendChild: () => events.push('append') } };
  const urls = { createObjectURL(blob) { image = blob; return 'blob:qa-qr'; }, revokeObjectURL: url => events.push(url) };
  downloadStayQr(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`, 'stay-10', doc, urls);
  assert.equal(link.href, 'blob:qa-qr');
  assert.equal(link.download, 'stay-qr-stay-10.png');
  assert.equal(image.type, 'image/png');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes);
  assert.deepEqual(events, ['append', 'click', 'remove']);
  t.mock.timers.tick(1000);
  assert.equal(events.at(-1), 'blob:qa-qr');
});

test('CPM_STF_001: invalid QR data cannot start a download', () => {
  assert.throws(() => downloadStayQr('https://unexpected.test/image.png', 'stay-10', {}, {}), /Unable to download/);
});

test('CPM_STF_001: dedicated print view waits for the image and prints only on explicit action', () => {
  const state = [false, false];
  let hook = 0, printed = 0, closed = 0;
  const code = ts.transpileModule(fs.readFileSync(new URL('../components/StayQrPrintPreview.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = { exports: {} };
  const element = (type, props) => ({ type, props });
  const imports = {
    react: { useState: () => { const i = hook++; return [state[i], value => { state[i] = value; }]; } },
    'react/jsx-runtime': { jsx: element, jsxs: element },
  };
  new Function('module', 'exports', 'require', 'window', code)(mod, mod.exports, name => imports[name] || {}, { print: () => printed++ });
  const render = () => { hook = 0; return mod.exports.StayQrPrintPreview({ qrCode: 'data:image/png;base64,AQ==', stayId: 'QA10', onClose: () => closed++ }); };
  let tree = render();
  const buttons = () => tree.props.children[0].props.children;
  assert.equal(tree.props.role, 'dialog');
  assert.equal(buttons()[1].props.disabled, true);
  assert.equal(printed, 0);
  tree.props.children[2].props.onLoad();
  tree = render();
  assert.equal(buttons()[1].props.disabled, false);
  buttons()[1].props.onClick();
  assert.equal(printed, 1);
  buttons()[0].props.onClick();
  assert.equal(closed, 1);
});
