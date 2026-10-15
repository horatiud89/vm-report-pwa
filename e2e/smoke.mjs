// Smoke test of the whole report cycle in a real browser against the Firebase emulators: `npm run smoke`.
//
// Run as `node e2e/smoke.mjs`, it prepares and then runs itself again inside `firebase emulators:exec`, which
// stops the emulators however the run ends:
//   1. outside: APP_URL for the functions emulator (functions/.env.demo-vm-report, git-ignored), the functions
//      build, and an app build that talks to the emulators (in a temporary folder, so app/dist stays as it was);
//   2. inside: seed store 850 and the demo accounts, set known passwords, serve the build with `vite preview`
//      and drive Chromium through store → Head of VM → store → Head of VM, with a screenshot of every screen.
//
// Environment: CHROMIUM_PATH (default /opt/pw-browsers/chromium), SMOKE_OUT (screenshots and the PDF; default
// <tmp>/vm-report-smoke).

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROJECT_ID = 'demo-vm-report';
const BUCKET = `${PROJECT_ID}.appspot.com`;
const PREVIEW_PORT = 4173;
const APP_URL = `http://127.0.0.1:${PREVIEW_PORT}`;
const ENV_FILE = join(ROOT, 'functions', `.env.${PROJECT_ID}`);
const OUT = process.env.SMOKE_OUT ?? join(tmpdir(), 'vm-report-smoke');
const CHROMIUM = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const FIXTURE = join(ROOT, 'e2e', 'fixtures', 'zone.jpg');

const DEMO_EMAIL = 'demo@example.com';
const PASSWORD = 'smoke-test-password';
const CAMPAIGN = 'Test campaign';
const ZONE = "Women's Image";
const PHONE = { width: 390, height: 844 };
const SMALL_PHONE = { width: 360, height: 740 };
const LANG_NAME = { cs: 'Čeština', sk: 'Slovenčina', ro: 'Română' };

/** The app build's Firebase config: any well-formed values do, the emulators accept every key. No VAPID key: no push. */
const EMULATOR_BUILD_ENV = {
  VITE_USE_EMULATORS: 'true',
  VITE_FIREBASE_API_KEY: 'demo-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
  VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000',
  VITE_FIREBASE_VAPID_KEY: '',
};

// The emulators need no credentials: no Google Cloud metadata probe (and its warning) in any process of the run.
process.env.METADATA_SERVER_DETECTION ??= 'none';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.error?.message ?? `exit ${result.status}`})`);
}

// ---------------------------------------------------------------------------------------------------------------
// Stage 1: builds, then this file again inside the emulators.

/** Whether something already listens on the port (vite preview would refuse to start, or another server would answer). */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

async function outside() {
  if (await portInUse(PREVIEW_PORT)) throw new Error(`port ${PREVIEW_PORT} is in use; stop whatever runs there (often another vite preview)`);
  const dist = mkdtempSync(join(tmpdir(), 'vm-report-smoke-dist-'));
  writeFileSync(ENV_FILE, `APP_URL=${APP_URL}\n`);
  try {
    run('npm', ['run', 'build', '-w', 'functions']);
    run('npm', ['run', 'build', '-w', 'app', '--', '--outDir', dist, '--emptyOutDir'], { env: { ...process.env, ...EMULATOR_BUILD_ENV } });
    run(join(ROOT, 'node_modules', '.bin', 'firebase'), [
      'emulators:exec', '--only', 'auth,firestore,storage,functions', '--project', PROJECT_ID, '--log-verbosity', 'QUIET',
      'node e2e/smoke.mjs',
    ], { env: { ...process.env, SMOKE_STAGE: 'emulators', SMOKE_DIST: dist } });
  } finally {
    rmSync(dist, { recursive: true, force: true });
    rmSync(ENV_FILE, { force: true });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Stage 2: inside `firebase emulators:exec` (the emulator host variables are set).

async function inside() {
  // Only what an earlier run wrote is removed: SMOKE_OUT may point at a folder with other files.
  mkdirSync(OUT, { recursive: true });
  for (const file of readdirSync(OUT)) {
    if (/^\d{2}-.+\.png$|^VM-Report-.+\.pdf$/.test(file)) rmSync(join(OUT, file));
  }

  step('Seed store 850 and the demo accounts');
  run(process.execPath, ['functions/lib/seed.js'], { env: { ...process.env, DEMO_EMAIL } });

  const { initializeApp, deleteApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore } = await import('firebase-admin/firestore');
  const admin = initializeApp({ projectId: PROJECT_ID }, 'smoke');
  const backend = { db: getFirestore(admin) };
  for (const tag of ['store850', 'headofvm', 'director', 'avmcz', 'amcz']) {
    const user = await getAuth(admin).getUserByEmail(account(tag));
    await getAuth(admin).updateUser(user.uid, { password: PASSWORD });
  }

  const preview = spawn(process.execPath, [
    join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview',
    '--outDir', process.env.SMOKE_DIST, '--host', '127.0.0.1', '--port', String(PREVIEW_PORT), '--strictPort',
  ], { cwd: join(ROOT, 'app'), stdio: ['ignore', 'ignore', 'inherit'] });
  const previewExit = new Promise((resolve) => preview.once('exit', resolve));
  let browser;
  try {
    await waitForHttp(APP_URL, previewExit);
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: CHROMIUM });
    await cycle(browser, backend);
  } finally {
    await browser?.close();
    preview.kill('SIGTERM');
    await previewExit;
    await deleteApp(admin);
  }
}

const account = (tag) => DEMO_EMAIL.replace('@', `+${tag}@`);

function step(text) {
  console.log(`\n▶ smoke: ${text}`);
}

async function waitForHttp(url, exited) {
  let gone = false;
  void exited.then(() => { gone = true; });
  for (let i = 0; i < 100; i += 1) {
    if (gone) throw new Error('vite preview stopped before it served the app');
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${url} did not answer`);
}

// ---------------------------------------------------------------------------------------------------------------
// The cycle.

const shots = [];
const pageErrors = [];

async function phone(browser, viewport = PHONE, options = {}) {
  const context = await browser.newContext({ viewport, baseURL: APP_URL, ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  return page;
}

/** Everything on screen has arrived: no spinner, no photo placeholder, every image decoded. */
async function settled(page) {
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"], .photo-wait, .thumb-wait')
    && [...document.images].every((img) => img.complete && img.naturalWidth > 0));
}

/**
 * A whole-page image would draw the sticky header and action bar where the screen happened to be, in the middle of
 * the page; for the picture only, they stay in their place in the page (top and end).
 */
const SCREENSHOT_STYLE = '.app-header, .action-bar { position: static !important; }';

/** Screenshot of the whole page, after checking it does not scroll sideways. */
async function screen(page, name) {
  await settled(page);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  if (scrollWidth > innerWidth) throw new Error(`${name}: the page scrolls sideways (${scrollWidth} px > ${innerWidth} px)`);
  const file = `${String(shots.length + 1).padStart(2, '0')}-${name}.png`;
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(OUT, file), fullPage: true, style: SCREENSHOT_STYLE });
  shots.push(file);
}

async function signIn(page, tag) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account(tag));
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${APP_URL}/`);
}

const heading = (page, name) => page.getByRole('heading', { level: 1, name, exact: true });

/** The toast at the bottom of the screen saying `text`. */
const toast = (page, text) => page.getByRole('status').filter({ hasText: text }).waitFor();

/** Waits until the button can be pressed (visible, enabled), without pressing it. */
const pressable = (button) => button.click({ trial: true });

/** The row link of a zone (or a report) by the exact text of its title. */
const rowLink = (page, title) => page.getByRole('link').filter({ has: page.getByText(title, { exact: true }) });

async function openZone(page, name) {
  await rowLink(page, name).click();
  await heading(page, name).waitFor();
}

async function chooseFromGallery(page) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose from gallery' }).click(),
  ]);
  await chooser.setFiles(FIXTURE);
}

/** The date `days` after today in Prague (store 850's time zone), as YYYY-MM-DD. */
function pragueDate(days) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Width and height from a JPEG's start-of-frame segment. */
function jpegSize(bytes) {
  let i = 2;
  while (i + 9 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  throw new Error('not a JPEG with a frame header');
}

/**
 * The uploaded photo as the zone records it and as stored (fetched from the URL the app shows it from): at most
 * 1920 px on the long side and portrait, like the fixture.
 */
async function checkStoredPhoto({ db }, reportId, url) {
  const zone = (await db.doc(`reports/${reportId}/zones/women-image`).get()).data();
  const photo = zone?.versions?.[0]?.photos?.[0];
  if (!photo) throw new Error('the zone has no photo');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`the stored photo could not be read (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const stored = jpegSize(bytes);
  for (const [what, size] of [['PhotoRef', photo], ['stored JPEG', stored]]) {
    if (Math.max(size.width, size.height) > 1920 || size.height <= size.width) {
      throw new Error(`${what} is ${size.width}×${size.height}: expected portrait, at most 1920 px`);
    }
  }
  console.log(`  photo stored as ${stored.width}×${stored.height} (${Math.round(bytes.length / 1024)} kB)`);
}

async function chooseLanguage(page, lang) {
  await page.goto('/settings');
  await page.getByRole('radio', { name: LANG_NAME[lang] }).click(); // checked once the saved language comes back
  await page.waitForFunction((code) => document.documentElement.lang === code, lang);
}

async function cycle(browser, backend) {
  const store = await phone(browser);
  const reviewer = await phone(browser);

  step('Store signs in');
  await store.goto('/login');
  await screen(store, 'login');
  await store.getByRole('link', { name: 'Set / forgot password' }).click();
  await store.getByRole('button', { name: 'Send link' }).waitFor();
  await screen(store, 'reset-password');
  await signIn(store, 'store850');
  await heading(store, '850 Palladium Praha').waitFor();
  await screen(store, 'store-home-empty');

  step(`New report "${CAMPAIGN}"`);
  await store.getByRole('button', { name: 'New report' }).click();
  await heading(store, 'New report').waitFor();
  await screen(store, 'new-report');
  await store.getByLabel('Campaign name').fill(CAMPAIGN);
  await store.getByRole('button', { name: 'Start report' }).click();
  await heading(store, CAMPAIGN).waitFor();
  const reportId = new URL(store.url()).pathname.split('/')[2];
  await screen(store, 'draft-report');

  step(`Photo 3000×4000 for ${ZONE}`);
  await openZone(store, ZONE);
  await screen(store, 'draft-zone');
  await chooseFromGallery(store);
  await store.getByText('Saved', { exact: true }).waitFor();
  await screen(store, 'draft-zone-photo');
  await checkStoredPhoto(backend, reportId, await store.getByRole('img', { name: 'Photo 1' }).getAttribute('src'));
  await store.getByRole('link', { name: 'Back' }).click();
  await heading(store, CAMPAIGN).waitFor();

  step('The other 32 zones: Not part of this campaign');
  const storeDef = (await backend.db.doc('stores/850').get()).data();
  const others = storeDef.departments.flatMap((d) => d.zones).filter((z) => z.name !== ZONE);
  if (others.length !== 32) throw new Error(`expected 32 other zones, found ${others.length}`);
  for (const [index, zone] of others.entries()) {
    await openZone(store, zone.name);
    await store.getByRole('checkbox', { name: 'Not part of this campaign' }).check();
    await store.getByText('Saved', { exact: true }).waitFor();
    if (index === 0) await screen(store, 'draft-zone-not-in-campaign');
    await store.getByRole('link', { name: 'Back' }).click();
    await heading(store, CAMPAIGN).waitFor();
  }
  const send = store.getByRole('button', { name: 'Send', exact: true });
  await pressable(send);
  await screen(store, 'draft-report-ready');
  await send.click();
  await store.waitForURL(`${APP_URL}/`);
  await toast(store, 'Report sent.');
  await screen(store, 'store-home-sent');

  step('Head of VM sees the report as New and gives feedback with a circle');
  await signIn(reviewer, 'headofvm');
  await heading(reviewer, 'Reports').waitFor();
  const row = rowLink(reviewer, '850 Palladium Praha');
  await row.getByText('New', { exact: true }).waitFor();
  await screen(reviewer, 'review-home-new');
  await row.click();
  await heading(reviewer, '850 Palladium Praha').waitFor();
  await reviewer.getByRole('button', { name: 'Approve all without feedback' }).waitFor();
  await screen(reviewer, 'review-report');
  await openZone(reviewer, ZONE);
  await screen(reviewer, 'review-zone');
  await reviewer.getByRole('button', { name: 'Mark on photo' }).click();
  const surface = reviewer.getByRole('group', { name: 'Mark on photo' });
  await surface.scrollIntoViewIfNeeded();
  await settled(reviewer);
  const box = await surface.boundingBox();
  const [cx, cy, r] = [box.x + box.width * 0.5, box.y + box.height * 0.4, box.width * 0.18];
  await reviewer.mouse.move(cx + r, cy);
  await reviewer.mouse.down();
  for (let a = 0; a <= 2 * Math.PI + 0.01; a += Math.PI / 16) await reviewer.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a));
  await reviewer.mouse.up();
  if (!(await reviewer.getByRole('button', { name: 'Undo' }).isEnabled())) throw new Error('the stroke was not recorded');
  await reviewer.getByLabel('Feedback', { exact: true }).fill('Přeskládat trička podle barev, prosím.');
  await reviewer.getByLabel('Deadline', { exact: true }).fill(pragueDate(1));
  await screen(reviewer, 'review-zone-feedback-form');
  await reviewer.getByRole('button', { name: 'Send feedback' }).click();
  await toast(reviewer, 'Feedback sent.');
  await reviewer.getByText('Přeskládat trička podle barev, prosím.').waitFor();
  await screen(reviewer, 'review-zone-feedback-sent');

  step('Store sees the correction to do and sends one');
  await store.getByRole('heading', { name: 'Corrections to do' }).waitFor();
  await screen(store, 'store-home-corrections');
  await openZone(store, ZONE);
  await store.getByText('Přeskládat trička podle barev, prosím.').waitFor();
  await screen(store, 'correction');
  await chooseFromGallery(store);
  const sendCorrection = store.getByRole('button', { name: 'Send correction' });
  await pressable(sendCorrection); // enabled once the new photo is stored
  await store.getByLabel('Comment (optional)').fill('Hotovo, přeskládáno.');
  await screen(store, 'correction-photo');
  await sendCorrection.click();
  await store.waitForURL(`${APP_URL}/`);
  await toast(store, 'Correction sent');
  await screen(store, 'store-home-correction-sent');
  await rowLink(store, CAMPAIGN).click();
  await heading(store, CAMPAIGN).waitFor();
  await screen(store, 'store-report-sent');
  await openZone(store, ZONE);
  await screen(store, 'store-zone-history');

  step('Head of VM compares Before/After and approves');
  await reviewer.getByRole('heading', { name: 'Before and after' }).waitFor();
  await reviewer.getByText('Before · Photo 1').waitFor();
  await reviewer.getByText('After · Photo 1').waitFor();
  await screen(reviewer, 'review-before-after');
  await reviewer.getByRole('button', { name: 'Approve', exact: true }).click();
  await reviewer.waitForURL(`${APP_URL}/r/${reportId}`);
  await rowLink(reviewer, ZONE).getByText('Approved').waitFor();
  await screen(reviewer, 'review-report-approved');

  step('Overview');
  await reviewer.getByRole('link', { name: 'Overview' }).click();
  await heading(reviewer, 'Overview').waitFor();
  await reviewer.getByRole('button', { name: `${ZONE}: Approved` }).click();
  await reviewer.getByRole('status').filter({ hasText: `${ZONE}: Approved` }).waitFor();
  await screen(reviewer, 'overview');

  step('Export PDF');
  await reviewer.goto(`/r/${reportId}`);
  await heading(reviewer, '850 Palladium Praha').waitFor();
  const [download] = await Promise.all([
    reviewer.waitForEvent('download', { timeout: 60_000 }),
    reviewer.getByRole('button', { name: 'Export PDF' }).click(),
  ]);
  const pdfPath = join(OUT, download.suggestedFilename());
  await download.saveAs(pdfPath);
  const pdf = readFileSync(pdfPath);
  if (pdf.subarray(0, 4).toString('latin1') !== '%PDF') throw new Error('the export is not a PDF');
  console.log(`  ${download.suggestedFilename()} (${Math.round(pdf.length / 1024)} kB)`);

  step('Settings, and the main screens at 360×740 in Czech, Slovak and Romanian');
  await reviewer.goto('/settings');
  await screen(reviewer, 'settings');
  for (const lang of ['cs', 'sk', 'ro']) {
    for (const [page, path, name] of [[store, '/', 'store-home'], [reviewer, `/r/${reportId}`, 'review-report']]) {
      await chooseLanguage(page, lang);
      await page.setViewportSize(SMALL_PHONE);
      await page.goto(path);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await screen(page, `${name}-360-${lang}`);
      await page.setViewportSize(PHONE);
    }
  }
  await reviewer.goto('/settings');
  await screen(reviewer, 'settings-ro');

  step('iPhone Safari shows how to add the app to the Home Screen');
  const iphone = await phone(browser, PHONE, {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  });
  await signIn(iphone, 'director');
  await iphone.getByRole('heading', { name: 'Add the app to your Home Screen' }).waitFor();
  await screen(iphone, 'iphone-safari-install-guide');

  step('Log out');
  await store.goto('/settings');
  await store.getByRole('button', { name: 'Ieși din cont' }).click();
  await store.waitForURL(`${APP_URL}/login`);

  if (pageErrors.length > 0) throw new Error(`uncaught errors in the app:\n${pageErrors.join('\n')}`);
  console.log(`\n✔ smoke: passed. ${shots.length} screenshots and the PDF in ${OUT}`);
}

// ---------------------------------------------------------------------------------------------------------------

try {
  if (process.env.SMOKE_STAGE === 'emulators') await inside();
  else await outside();
} catch (error) {
  console.error(`\n✘ smoke: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
