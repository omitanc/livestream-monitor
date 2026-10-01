import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const userData = await mkdtemp(join(tmpdir(), 'livestream-monitor-smoke-'));
const output = process.env.LSM_QA_DIR;
if (output) await mkdir(output, { recursive: true });
const env = { ...process.env, LSM_TEST_DATA_DIR: userData };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
async function waitForState(page, predicate) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.monitor.snapshot());
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const state = await page.evaluate(() => window.monitor.snapshot());
  throw new Error(`State timeout: ${JSON.stringify({ ...state, thumbnail: !!state.thumbnail })}`);
}
try {
  const page = await app.firstWindow();
  await page.getByText('LiveStream Monitor', { exact: true }).waitFor();
  assert.equal(await page.title(), 'LiveStream Monitor');
  assert.equal(await page.getByText('配信を、視聴側から確かめる。').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'ローカル検証' }).count(), 0);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (output) await page.screenshot({ path: join(output, 'initial.png') });
  await page.getByRole('button', { name: '管理', exact: true }).click();
  await page.getByRole('heading', { name: 'アプリの管理' }).waitFor();
  await page.getByRole('button', { name: '更新を確認' }).click();
  await page.getByText('開発版です。', { exact: false }).waitFor();
  if (output) await page.screenshot({ path: join(output, 'settings.png') });
  await page.getByRole('button', { name: 'ローカル検証' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await waitForState(page, (s) => s.pageReady);
  await page.getByRole('button', { name: '取得を開始', exact: true }).click();
  await waitForState(page, (s) => s.count >= 3);
  let state = await page.evaluate(() => window.monitor.snapshot());
  assert.equal(state.status, 'capturing');
  assert.ok(state.thumbnail?.startsWith('data:image/jpeg;base64,'));
  const stopStyle = await page
    .getByRole('button', { name: '取得を停止', exact: true })
    .evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      color: getComputedStyle(element).color,
    }));
  assert.deepEqual(stopStyle, { background: 'rgb(201, 54, 70)', color: 'rgb(255, 255, 255)' });
  const count = state.count;
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
  await waitForState(page, (s) => s.count >= count + 3);
  state = await page.evaluate(() => window.monitor.snapshot());
  assert.equal(state.minimized, true);
  assert.ok(Date.now() - state.lastCaptureAt < 5000);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
  await page.getByRole('button', { name: '再読み込み', exact: true }).click();
  await waitForState(page, (s) => s.count >= state.count + 3);
  const captured = await page.evaluate(() => window.monitor.snapshot());
  assert.equal(captured.observing, true);
  assert.equal(captured.status, 'capturing');
  assert.ok(captured.events.length <= 100);
  if (output) await page.screenshot({ path: join(output, 'capturing.png') });
  await page.getByRole('button', { name: '取得を停止', exact: true }).click();
  await page.getByRole('button', { name: '管理', exact: true }).click();
  await page.getByRole('button', { name: 'キャッシュを削除', exact: true }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  assert.equal((await page.evaluate(() => window.monitor.snapshot())).status, 'stopped');
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        'launch',
        'settings',
        'development update guard',
        'fixture capture',
        'minimized capture',
        'reload recovery',
        'stop',
        'cache clear',
        'renderer errors',
      ],
      captures: captured.count,
      output,
    }),
  );
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
