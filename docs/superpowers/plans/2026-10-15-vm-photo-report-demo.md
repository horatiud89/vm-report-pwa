# VM Photo Report Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working installable PWA demo where store 850 (Palladium Praha) uploads campaign photos per zone and Area VM / Area Manager / Head of VM / Director of Operations get push notifications, give feedback with circles + deadline, compare before/after, approve, see an overview and export PDF.

**Architecture:** React + Vite PWA on Firebase Hosting. Firebase Auth (email/password, custom claims), Firestore + Cloud Storage (`europe-west3`), Cloud Functions 2nd gen for every state change and for FCM push + hourly reminders. All domain rules live in a pure TypeScript `shared/` folder used by both app and functions and unit-tested in isolation.

**Tech Stack:** Node 22, TypeScript (strict), React 19, react-router-dom 7, Vite 8, vite-plugin-pwa 2 (injectManifest) + workbox 7, firebase JS SDK ^12.19, firebase-admin ^14, firebase-functions ^7, firebase-tools ^15, jsPDF ^4 + dejavu-fonts-ttf, Vitest 5 + jsdom + @testing-library/react, @firebase/rules-unit-testing ^5, esbuild (functions bundle), Playwright (smoke test, preinstalled Chromium at `/opt/pw-browsers/chromium`).

**Spec:** `docs/superpowers/specs/2026-10-15-vm-photo-report-demo-design.md` (Romanian; approved 15.10.2026, Approve = option A).

## Global Constraints

- Store: code `850`, name `Palladium Praha`, country `CZ`, timezone `Europe/Prague`, Firestore id `850`.
- Zones: exactly the 33 zones of spec §3, same order, 5 departments `WOMEN'S DEPARTMENT`, `MEN'S DEPARTMENT`, `ACC`, `HOME`, `WINDOW`. Zone and department names are English in every language.
- Roles: `store | avm | am | head_vm | director`; labels (English, never translated): `Store`, `Area VM`, `Area Manager`, `Head of VM`, `Director of Operations`.
- Countries `CZ | SK | RO`; reminder timezone `CZ, SK → Europe/Prague`, `RO → Europe/Bucharest`.
- Photos: 1 required for an included zone, max 3 per zone/version; resize to max 1920 px long side, JPEG quality 0.8; max upload 5 MB.
- Deadline is a date only, `YYYY-MM-DD`, not before the store's local today.
- Reminders at 09:00 store-local: day before deadline, and day after deadline if still uncorrected.
- Languages `en` (default), `cs`, `sk`, `ro`. Romanian follows Horațiu's VM glossary, natural wording, full diacritics (ș ț ă â î).
- Push title is always `VM Photo Report`.
- Region `europe-west3` for Firestore, Storage, Functions.
- Clients never write reports/zones/feedback directly: every state change goes through a callable. Clients may only write `users/{own uid}` fields `language`, `fcmTokens`, and create (never overwrite/delete) JPEGs in their own Storage draft/correction path.
- Horațiu's email never appears in the repo; seed reads `DEMO_EMAIL` from env (GitHub secret). Demo accounts use plus-addressing: `+store850`, `+headofvm`, `+director`, `+avmcz`, `+amcz`.
- Neutral look: white background, black text, greys; colour only for statuses (spec §6). No Medicine logo/fonts/colours.
- Timestamps stored as epoch milliseconds (`number`).
- Repo is public: no secrets, no service-account JSON, no `.env` with real values committed.

## Review Focus

1. **Huge or rotated phone photos** (48 MP, HEIC from iPhone gallery, portrait EXIF): must upload upright and ≤1920 px. Pinned by `fitWithin` tests (Task 12) + checklist item (Task 18).
2. **Upload interrupted mid-zone:** a zone must never reference a Storage file that doesn't exist. Pinned by `updateDraftZone rejects missing photo paths` (Task 6).
3. **Two reviewers acting at once** (one approves, another gives feedback): state must stay consistent, the late action fails cleanly. Pinned by transaction tests `approve after feedback fails with failed-precondition` (Task 7).
4. **Past or malformed deadline:** rejected server-side even if the UI is bypassed. Pinned by `giveFeedback rejects deadline before store-local today` (Task 7).
5. **Czech/Slovak/Romanian diacritics in PDF** (store comments like „Přeskládat"): must render, not garble. Pinned by the DejaVu font test (Task 16).

---

## File Structure

```
package.json                  root: npm workspaces [app, functions], scripts
tsconfig.base.json            strict TS, path alias @shared/* -> shared/src/*
vitest.config.ts              projects: shared(node), functions(node), app(jsdom); excludes *.emu.test.ts
vitest.emulators.config.ts    runs *.emu.test.ts only
firebase.json                 hosting(app/dist, SPA rewrite), firestore, storage, functions(source functions), emulators
firestore.rules  firestore.indexes.json  storage.rules
shared/src/
  types.ts                    domain types
  store850.ts                 STORE_850 definition (33 zones)
  status.ts                   zone state machine, report status, counts
  access.ts                   who sees what, who is notified
  dates.ts                    store-local dates, deadline validation, reminders
  i18n/en.ts cs.ts sk.ts ro.ts index.ts
shared/test/*.test.ts
functions/
  package.json                deps firebase-admin, firebase-functions; build = esbuild bundle -> lib/index.js
  src/index.ts                onCall/onSchedule wrappers only
  src/caller.ts               Caller from request auth
  src/deps.ts                 Deps (db, bucket, notifier, now)
  src/summary.ts              recomputeSummary
  src/draft.ts                createDraft, updateDraftZone, sendReport, markSeen
  src/review.ts               giveFeedback, sendCorrection, approveZone, approveAllWithoutFeedback
  src/notifier.ts             Notifier, FcmNotifier, LogNotifier, buildMessage
  src/reminders.ts            runReminders
  src/seed.ts                 seed script
  test/*.test.ts (unit) test/*.emu.test.ts (emulator)
app/
  index.html vite.config.ts
  public/icons/ (192, 512, maskable, apple-touch)
  src/main.tsx App.tsx routes.tsx styles.css
  src/sw.ts                   workbox precache + FCM background
  src/firebase.ts             init + emulator connect
  src/api.ts                  typed callable wrappers
  src/data/hooks.ts           Firestore realtime hooks
  src/auth/                   AuthProvider.tsx LoginPage.tsx ResetPage.tsx
  src/i18n/I18nProvider.tsx   useT()
  src/push/                   push.ts platform.ts InstallGuide.tsx NotificationsButton.tsx
  src/ui/                     Layout.tsx StatusBadge.tsx SettingsPage.tsx Toast.tsx
  src/photos/                 compress.ts PhotoPicker.tsx PhotoWithStrokes.tsx
  src/store/                  StoreHome.tsx NewReportPage.tsx DraftReportPage.tsx DraftZonePage.tsx CorrectionPage.tsx
  src/review/                 ReviewHome.tsx ReviewReportPage.tsx ReviewZonePage.tsx AnnotationCanvas.tsx strokes.ts FeedbackForm.tsx BeforeAfter.tsx OverviewPage.tsx
  src/pdf/                    buildReportPdf.ts exportReport.ts
  test/*.test.ts(x)
e2e/smoke.mjs                 Playwright smoke run against emulators
.github/workflows/            ci.yml deploy.yml seed.yml
docs/setup/                   firebase-setup.ro.md test-checklist.ro.md
```

Routes: `/login`, `/reset`, `/` (StoreHome or ReviewHome by role), `/new`, `/r/:reportId`, `/r/:reportId/z/:zoneId`, `/overview`, `/settings`. Report and zone routes render the store or reviewer page by role and report status.

---

### Task 1: Repo scaffold, shared types, store 850

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `.nvmrc` (`22`), `shared/src/types.ts`, `shared/src/store850.ts`
- Test: `shared/test/store850.test.ts`

**Interfaces:**
- Produces (`shared/src/types.ts`):

```ts
export type Role = 'store' | 'avm' | 'am' | 'head_vm' | 'director';
export type Country = 'CZ' | 'SK' | 'RO';
export type Lang = 'en' | 'cs' | 'sk' | 'ro';
export type ZoneState = 'empty' | 'photo_added' | 'not_in_campaign'
  | 'submitted' | 'needs_correction' | 'correction_sent' | 'approved';
export interface Claims { role: Role; country: Country | null; storeId: string | null }
export interface ZoneDef { id: string; name: string }
export interface DepartmentDef { id: string; name: string; zones: ZoneDef[] }
export interface StoreDef { id: string; code: string; name: string; country: Country; timezone: string; departments: DepartmentDef[] }
export interface PhotoRef { path: string; width: number; height: number }
export interface ZoneVersion { n: number; photos: PhotoRef[]; storeComment: string; createdAt: number }
export interface ZoneDoc { id: string; reportId: string; storeId: string; country: Country; departmentId: string; name: string; order: number;
  state: ZoneState; versions: ZoneVersion[]; earliestOpenDeadline: string | null;
  reminderDayBeforeSentFor: string | null; reminderOverdueSentFor: string | null; approvedBy: string | null; approvedAt: number | null }
export interface ZoneSummary { state: ZoneState; deadline: string | null }
export interface ReportDoc { id: string; storeId: string; storeCode: string; storeName: string; country: Country; timezone: string;
  campaignName: string; status: 'draft' | 'sent'; createdAt: number; sentAt: number | null; seenBy: string[];
  zoneSummary: Record<string, ZoneSummary> }
export interface Stroke { points: number[] }   // flat [x0,y0,x1,y1,…], each 0..1 (Firestore forbids nested arrays)
export interface FeedbackDoc { id: string; authorUid: string; authorRole: Role; authorName: string; version: number; photoIndex: number;
  comment: string; strokes: Stroke[]; deadline: string; createdAt: number; status: 'open' | 'answered' }
export interface UserDoc { email: string; role: Role; country: Country | null; storeId: string | null; displayName: string; language: Lang; fcmTokens: string[] }
```

- Produces (`shared/src/store850.ts`): `export const STORE_850: StoreDef`, `export function allZones(store: StoreDef): Array<ZoneDef & { departmentId: string; order: number }>`.
  Department ids `women`, `men`, `acc`, `home`, `window`; zone ids are kebab slugs of the name prefixed by department, e.g. `women-image`, `women-wall-1`, `women-art-series-zone`, `men-denim-table-chest-of-drawers`, `acc-cash-desk-ladders`, `home-small-table`, `window-window-1`. `order` is 0..32 across departments in spec order.

- [ ] **Step 1: Scaffold.** Root `package.json` with `"private": true`, `"workspaces": ["app", "functions"]`, `"engines": {"node": ">=22"}`, scripts `test` (`vitest run`), `test:emulators` (`firebase emulators:exec --only auth,firestore,storage --project demo-vm-report "vitest run --config vitest.emulators.config.ts"`), `typecheck` (`tsc -p app && tsc -p functions && tsc -p shared`), `build` (`npm run build -w app && npm run build -w functions`). `shared/tsconfig.json` extends base. `vitest.config.ts` uses `test.projects` (shared + functions in `node`, app in `jsdom`), alias `@shared` → `shared/src`, `exclude: ['**/*.emu.test.ts', '**/node_modules/**']`. `.gitignore`: `node_modules`, `dist`, `lib`, `functions/.env*`, `*.log`, `.firebase/`, `service-account*.json`.
- [ ] **Step 2: Write the failing test** `shared/test/store850.test.ts`:

```ts
test('store 850 identity', () => expect([STORE_850.id, STORE_850.code, STORE_850.name, STORE_850.country, STORE_850.timezone])
  .toEqual(['850', '850', 'Palladium Praha', 'CZ', 'Europe/Prague']));
test('departments in order', () => expect(STORE_850.departments.map(d => d.name))
  .toEqual(["WOMEN'S DEPARTMENT", "MEN'S DEPARTMENT", 'ACC', 'HOME', 'WINDOW']));
test('33 zones, exact names and order', () => expect(allZones(STORE_850).map(z => z.name)).toEqual([
  "Women's Image", "Women's Wall 1", "Women's Art. Series zone", "Women's Denim panel", "Women's Denim table (chest of drawers)",
  "Women's Wall 2", "Women's Table 1", "Women's Table 2", "Women's Wall 3", "Women's Free-standing zone A", "Women's Free-standing zone B",
  "Men's Wall 1", "Men's Denim panel", "Men's Denim table (chest of drawers)", "Men's Wall 2", "Men's Table 1", "Men's Image",
  "Men's Table 2", "Men's Wall 3", "Men's Free-standing zone A", "Men's Free-standing zone B", "Men's Art. Series zone",
  "Men's Ladders zone A", "Women's Ladders zone A", "Men's Ladders zone B", "Women's Ladders zone B", "Cash desk ladders", "ACC wall",
  'Home wall', 'Small table', 'Large table', 'Window 1', 'Window 2']));
test('zone ids unique, order 0..32', () => { const z = allZones(STORE_850);
  expect(new Set(z.map(x => x.id)).size).toBe(33); expect(z.map(x => x.order)).toEqual([...Array(33).keys()]); });
```

- [ ] **Step 3:** `npm install -D typescript vitest@^5 jsdom @vitejs/plugin-react` then `npx vitest run shared/test/store850.test.ts` → FAIL (module not found).
- [ ] **Step 4:** Implement `types.ts`, `store850.ts` (`allZones` flattens departments, adds `departmentId` and running `order`).
- [ ] **Step 5:** `npx vitest run shared/test/store850.test.ts` → 4 passed.
- [ ] **Step 6: Commit** `feat(shared): domain types and store 850 zone list`.

---

### Task 2: Zone state machine and report status

**Files:** Create `shared/src/status.ts`; Test `shared/test/status.test.ts`

**Interfaces:**
- Consumes: `ZoneState`, `ZoneSummary` (Task 1).
- Produces:

```ts
export const MAX_PHOTOS = 3;
export type ZoneAction = 'send' | 'feedback' | 'correction' | 'approve';
export class TransitionError extends Error { constructor(readonly state: ZoneState, readonly action: ZoneAction) }
export function draftState(photoCount: number, notInCampaign: boolean): ZoneState;   // throws Error if notInCampaign && photoCount>0 or photoCount>MAX_PHOTOS
export function nextState(state: ZoneState, action: ZoneAction): ZoneState;          // throws TransitionError
export function canSend(states: ZoneState[]): boolean;
export type ReportStatus = 'draft' | 'sent' | 'corrections_open' | 'approved';
export function reportStatus(status: 'draft' | 'sent', summary: Record<string, ZoneSummary>): ReportStatus;
export function countStates(summary: Record<string, ZoneSummary>): Record<ZoneState, number>;  // all 7 keys present
export function openCorrections(summary: Record<string, ZoneSummary>): number;              // needs_correction + correction_sent
```

Transition table (everything else throws): `send`: photo_added→submitted, not_in_campaign→not_in_campaign. `feedback`: submitted | needs_correction | correction_sent | approved → needs_correction. `correction`: needs_correction→correction_sent. `approve`: submitted | correction_sent → approved.
`canSend`: every state ∈ {photo_added, not_in_campaign} and at least one photo_added.
`reportStatus`: `draft` if draft; `approved` if every non-`not_in_campaign` zone is `approved`; `corrections_open` if `openCorrections > 0`; else `sent`.

- [ ] **Step 1: Failing tests** — one `test.each` row per allowed transition above; `expect(() => nextState('empty','send')).toThrow(TransitionError)`, same for `('needs_correction','approve')`, `('approved','correction')`, `('not_in_campaign','feedback')`; `draftState(0,false)==='empty'`, `draftState(2,false)==='photo_added'`, `draftState(0,true)==='not_in_campaign'`, `draftState(1,true)` throws, `draftState(4,false)` throws; `canSend(['photo_added','not_in_campaign'])` true, `canSend(['not_in_campaign'])` false, `canSend(['photo_added','empty'])` false; `reportStatus('sent',{a:{state:'approved',deadline:null},b:{state:'not_in_campaign',deadline:null}})==='approved'`; with one `correction_sent` → `'corrections_open'`; with only `submitted` → `'sent'`; `openCorrections` of {needs_correction, correction_sent, approved} → 2.
- [ ] **Step 2:** `npx vitest run shared/test/status.test.ts` → FAIL.
- [ ] **Step 3:** Implement `status.ts` with a lookup table `Record<ZoneAction, Partial<Record<ZoneState, ZoneState>>>`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(shared): zone state machine and report status`.

---

### Task 3: Access rules, recipients, store-local dates and reminders

**Files:** Create `shared/src/access.ts`, `shared/src/dates.ts`; Test `shared/test/access.test.ts`, `shared/test/dates.test.ts`

**Interfaces:**

```ts
// access.ts
export const ROLE_LABEL: Record<Role, string>;  // Store, Area VM, Area Manager, Head of VM, Director of Operations
export function isReviewer(role: Role): boolean;
export function canViewCountry(claims: Claims, country: Country): boolean;           // head_vm/director: all; avm/am: own country; store: false
export function canViewStore(claims: Claims, store: { id: string; country: Country }): boolean; // store: own id only
export function isReviewerFor(user: { role: Role; country: Country | null }, storeCountry: Country): boolean;
// dates.ts
export const REMINDER_HOUR = 9;
export function localDate(nowMs: number, tz: string): string;   // 'YYYY-MM-DD' via Intl.DateTimeFormat('en-CA',{timeZone})
export function localHour(nowMs: number, tz: string): number;
export function addDays(date: string, days: number): string;    // pure calendar arithmetic in UTC
export function isValidDeadline(deadline: string, nowMs: number, tz: string): boolean; // real calendar date and >= localDate
export function isOverdue(deadline: string | null, nowMs: number, tz: string): boolean; // localDate > deadline
export function formatDayMonth(date: string): string;           // '2026-10-16' -> '16.10'
export type ReminderKind = 'day_before' | 'overdue';
export function reminderDue(z: Pick<ZoneDoc,'state'|'earliestOpenDeadline'|'reminderDayBeforeSentFor'|'reminderOverdueSentFor'>, nowMs: number, tz: string): ReminderKind | null;
export function dayBeforeAlreadyCovered(deadline: string, nowMs: number, tz: string): boolean; // localDate >= deadline-1
```

`reminderDue`: null unless `state==='needs_correction'`, deadline set, `localHour>=9`. Then `'overdue'` if `localDate > deadline` and `reminderOverdueSentFor !== deadline`; else `'day_before'` if `localDate === addDays(deadline,-1)` and `reminderDayBeforeSentFor !== deadline`; else null. (Refines spec §15: reminder flags live on the zone, keyed by deadline, so a new earlier deadline re-arms them.)

- [ ] **Step 1: Failing tests.** Access: `canViewStore({role:'avm',country:'CZ',storeId:null},{id:'850',country:'CZ'})` true; same with country `'SK'` false; `head_vm` sees SK true; store `850` sees `850` true and `851` false; `isReviewerFor({role:'am',country:'CZ'},'CZ')` true, `({role:'am',country:'RO'},'CZ')` false, `({role:'director',country:null},'SK')` true, `({role:'store',country:'CZ'},'CZ')` false. Dates (use `Date.UTC`): `localDate(Date.UTC(2026,9,15,22,30),'Europe/Prague')==='2026-10-16'` (UTC+2); `localHour(Date.UTC(2026,9,15,7,0),'Europe/Prague')===9`; `addDays('2026-03-01',-1)==='2026-02-28'`; `isValidDeadline('2026-10-14', Date.UTC(2026,9,15,8),'Europe/Prague')` false, `'2026-10-15'` true, `'2026-02-30'` false, `'16.10.2026'` false; `isOverdue('2026-10-15', Date.UTC(2026,9,15,20),'Europe/Prague')` false, next day true; `formatDayMonth('2026-10-16')==='16.10'`. Reminders with deadline `2026-10-16`, tz Prague: at `2026-10-15 08:30 local` → null; at `2026-10-15 09:05` → `'day_before'`; same with `reminderDayBeforeSentFor:'2026-10-16'` → null; at `2026-10-17 09:00` → `'overdue'`; state `correction_sent` → null; `dayBeforeAlreadyCovered('2026-10-16', <2026-10-15 15:00 local>)` true, at `2026-10-14` false.
- [ ] **Step 2:** Run both files → FAIL.
- [ ] **Step 3:** Implement. `localDate`/`localHour` use `Intl.DateTimeFormat` with `timeZone`; no date library.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(shared): access rules and store-local deadline logic`.

---

### Task 4: Translations (EN, CS, SK, RO)

**Files:** Create `shared/src/i18n/en.ts`, `cs.ts`, `sk.ts`, `ro.ts`, `index.ts`; Test `shared/test/i18n.test.ts`

**Interfaces:**

```ts
export const en = { … } as const;                 // source of keys
export type MsgKey = keyof typeof en;
export type Dict = Record<MsgKey, string>;          // cs, sk, ro typed as Dict -> missing key is a compile error
export const LANGS: Lang[];                         // ['en','cs','sk','ro']
export const LANG_NAME: Record<Lang, string>;       // English, Čeština, Slovenčina, Română
export function t(lang: Lang, key: MsgKey, params?: Record<string, string | number>): string; // replaces {name}; falls back to en
export function stateLabel(lang: Lang, s: ZoneState | 'overdue'): string;
```

English copy (fixed by spec; other languages translate these, Romanian per glossary): `login.title` "Sign in", `login.email` "Email", `login.password` "Password", `login.submit` "Sign in", `login.reset` "Set / forgot password", `reset.sent` "Check your email for the link to set your password.", `nav.home` "Reports", `nav.overview` "Overview", `nav.settings` "Settings", `settings.language` "Language", `settings.logout` "Log out", `store.newReport` "New report", `store.campaignName` "Campaign name", `store.correctionsToDo` "Corrections to do", `store.takePhoto` "Take photo", `store.choosePhoto` "Choose from gallery", `store.addPhoto` "Add photo ({n}/3)", `store.comment` "Comment (optional)", `store.notInCampaign` "Not part of this campaign", `store.send` "Send", `store.sendHint` "Every zone needs a photo or the “Not part of this campaign” mark.", `store.sendCorrection` "Send correction", `store.draftExists` "You already have a draft report.", `review.new` "New", `review.allCountries` "All countries", `review.feedback` "Feedback", `review.markOnPhoto` "Mark on photo", `review.undo` "Undo", `review.deadline` "Deadline", `review.sendFeedback` "Send feedback", `review.approve` "Approve", `review.approveAll` "Approve all without feedback", `review.before` "Before", `review.after` "After", `review.exportPdf` "Export PDF", `review.storeComment` "Store comment", `common.deadline` "Deadline {date}", `push.enable` "Turn on notifications", `push.enabled` "Notifications are on", `install.iosTitle` "Add the app to your Home Screen", `install.iosStep1` "Tap the Share button in Safari", `install.iosStep2` "Choose “Add to Home Screen”", `install.iosStep3` "Open the app from your Home Screen and sign in", `install.android` "Install app", `error.generic` "Something went wrong. Try again.", `error.noAccess` "This account is not set up for the app.", status labels `state.empty` "Empty", `state.photo_added` "Photo added", `state.not_in_campaign` "Not part of this campaign", `state.submitted` "Submitted", `state.needs_correction` "Needs correction", `state.overdue` "Overdue", `state.correction_sent` "Correction sent", `state.approved` "Approved", `report.draft` "Draft", `report.sent` "Sent", `report.corrections_open` "Corrections open ({n})", `report.approved` "Approved", push bodies `push.reportSent` "{store} sent a report: {campaign}", `push.feedback` "Feedback: {zone} — deadline {date}", `push.correctionSent` "{store} sent a correction: {zone}", `push.zoneApproved` "Approved: {zone}", `push.allApproved` "{campaign}: {n} zones approved", `push.reminderDayBefore` "Reminder: {zone} — deadline tomorrow ({date})", `push.reminderOverdue` "Overdue: {zone} — deadline was {date}". Add further keys as screens need them, always in all four files.

- [ ] **Step 1: Failing tests:** every `Dict` has exactly the keys of `en` and no empty string; every `{param}` placeholder set in each translation equals the one in `en`; `t('ro','push.feedback',{zone:"Women's Wall 1",date:'16.10'})` contains `Women's Wall 1` and `16.10`; `t('cs', 'nav.home')` differs from `en`; ro strings contain no `stivă`/`manechine` (glossary guard).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Write the four dictionaries + `t`. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(shared): EN/CS/SK/RO translations`.

---

### Task 5: Firebase config, security rules, indexes

**Files:** Create `firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `vitest.emulators.config.ts`; Test `functions/test/rules.emu.test.ts`

**Rules (decisions):**
- Custom claims on token: `role`, `country`, `storeId`. Helper functions mirror `access.ts`.
- `users/{uid}`: read if `request.auth.uid == uid`; update if same uid and `affectedKeys().hasOnly(['language','fcmTokens'])`, `language in ['en','cs','sk','ro']`, `fcmTokens is list && size() <= 10`. No create/delete.
- `stores/{id}`: read if store claim matches id, or reviewer can view `resource.data.country`.
- `reports/{id}`: read if (store and `resource.data.storeId == token.storeId`) or (reviewer, `resource.data.status == 'sent'`, can view country). Subcollections `zones`, `zones/*/feedback`: read via `get(/databases/$(database)/documents/reports/$(id))` with the same condition. All writes `false`.
- Storage `reports/{country}/{storeId}/{reportId}/{zoneId}/{file}`: read if store owns `storeId` or reviewer can view `country`; `create` if role store, `token.storeId == storeId`, `token.country == country`, `request.resource.contentType == 'image/jpeg'`, `request.resource.size < 5 * 1024 * 1024`; `update, delete: if false`.
- Indexes: `reports` (storeId ASC, createdAt DESC), (status ASC, sentAt DESC), (status ASC, country ASC, sentAt DESC); `zones` collection-group field override on `state` (ASC) for reminders; `users` (role ASC, country ASC).
- `firebase.json`: hosting `public: app/dist`, rewrite `** → /index.html`, header `Cache-Control: no-cache` for `/sw.js`; functions `source: functions`, `predeploy: npm run build -w functions`, `runtime: nodejs22`; emulators auth 9099, firestore 8080, storage 9199, functions 5001, hosting 5000, `ui.enabled: false`.

- [ ] **Step 1: Failing tests** (`initializeTestEnvironment({projectId:'demo-vm-report', firestore:{rules}, storage:{rules}})`, seed with `withSecurityRulesDisabled`): store850 reads own draft ✔; store851 reads it ✘; avm CZ reads sent CZ report ✔, draft ✘; avm SK reads sent CZ report ✘; director reads sent CZ ✔; store writes `reports/x` ✘; store updates own `users` doc `language:'cs'` ✔, `role:'director'` ✘; store creates `reports/CZ/850/r1/women-image/a.jpg` (image/jpeg, 1 KB) ✔, same as `image/png` ✘, under `851` ✘, overwrite existing ✘, delete ✘; avm CZ reads that file ✔, avm SK ✘.
- [ ] **Step 2:** `npm i -D firebase-tools@^15 @firebase/rules-unit-testing@^5 firebase@^12.19` ; `npm run test:emulators` → FAIL.
- [ ] **Step 3:** Write rules, indexes, `firebase.json`, emulator vitest config (`include: ['**/*.emu.test.ts']`, `fileParallelism: false`).
- [ ] **Step 4:** `npm run test:emulators` → all rules tests PASS.
- [ ] **Step 5: Commit** `feat: firebase config, security rules, indexes`.

---

### Task 6: Functions — draft, send, seen

**Files:** Create `functions/package.json`, `functions/tsconfig.json`, `functions/src/deps.ts`, `functions/src/caller.ts`, `functions/src/summary.ts`, `functions/src/draft.ts`, `functions/src/notifier.ts` (types `ReportRef`, `PushEvent`, `Notifier` exactly as listed in Task 8 — only the types here); Test `functions/test/draft.emu.test.ts`, `functions/test/helpers.ts`

**Interfaces:**

```ts
// deps.ts
export interface Deps { db: Firestore; bucket: Bucket; notifier: Notifier; now: () => number }
// caller.ts
export interface Caller { uid: string; claims: Claims; name: string }
export function callerFrom(auth: { uid: string; token: Record<string, unknown> } | undefined): Caller; // HttpsError 'unauthenticated' / 'permission-denied' if claims missing
// summary.ts
export async function recomputeSummary(tx: Transaction, db: Firestore, reportId: string): Promise<Record<string, ZoneSummary>>; // reads all zones in tx, returns map; caller writes it
// draft.ts
export async function createDraft(c: Caller, data: { campaignName: string }, d: Deps): Promise<{ reportId: string }>;
export async function updateDraftZone(c: Caller, data: { reportId: string; zoneId: string; photos: PhotoRef[]; storeComment: string; notInCampaign: boolean }, d: Deps): Promise<void>;
export async function sendReport(c: Caller, data: { reportId: string }, d: Deps): Promise<void>;
export async function markSeen(c: Caller, data: { reportId: string }, d: Deps): Promise<void>;
```

Behaviour (all mutations in `db.runTransaction`; errors are `HttpsError` from `firebase-functions/https`):
- `createDraft`: role `store` only; `campaignName` trimmed, 1–80 chars; `failed-precondition` if the store already has a `draft`; creates `reports/{auto}` (`status:'draft'`, store fields from `stores/{storeId}`, `seenBy:[]`) and 33 `zones/{zoneId}` docs from the store's departments with `state:'empty'`, `versions:[{n:1,photos:[],storeComment:'',createdAt:now}]`, then `zoneSummary`.
- `updateDraftZone`: own store, report `draft`; `photos.length <= 3`; every `path` starts with `reports/{country}/{storeId}/{reportId}/{zoneId}/` **and** `bucket.file(path).exists()` is true, else `invalid-argument`; `storeComment` ≤ 500 chars; `state = draftState(...)`; updates version 1 + `zoneSummary`.
- `sendReport`: own store, `draft`, `canSend(states)` else `failed-precondition`; applies `nextState(s,'send')` to every zone, sets `status:'sent'`, `sentAt`; after commit `notifier.notify({kind:'report_sent', report})`.
- `markSeen`: reviewer who can view the report's country; `arrayUnion(uid)` on `seenBy`.

`helpers.ts`: `testDeps()` with admin SDK on emulator (`FIRESTORE_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`), a `RecordingNotifier` (`events: PushEvent[]`), fixed `now`; `seedStore850(db)`; callers `storeCaller`, `avmCz`, `avmSk`, `headVm`, `director`; `putPhoto(bucket, path)` writes a tiny JPEG.

- [ ] **Step 1: Failing tests:** createDraft creates 33 zones all `empty` and summary has 33 keys; second createDraft → `failed-precondition`; reviewer createDraft → `permission-denied`; campaign `'   '` → `invalid-argument`; updateDraftZone with uploaded photo → state `photo_added`; **`updateDraftZone rejects missing photo paths`** (path never uploaded) → `invalid-argument`; path under another zone → `invalid-argument`; 4 photos → `invalid-argument`; notInCampaign with 0 photos → `not_in_campaign`; sendReport with an `empty` zone → `failed-precondition`; after filling all zones (photo or not-in-campaign) sendReport → status `sent`, photo zones `submitted`, one `report_sent` event recorded; updateDraftZone after send → `failed-precondition`; markSeen by avmSk → `permission-denied`, by headVm → `seenBy` contains uid.
- [ ] **Step 2:** `npm run test:emulators -- functions/test/draft.emu.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `functions/package.json`: `"main": "lib/index.js"`, `"engines": {"node": "22"}`, deps `firebase-admin@^14`, `firebase-functions@^7`; devDep `esbuild`; script `build`: `esbuild src/index.ts --bundle --platform=node --target=node22 --format=cjs --outfile=lib/index.js --external:firebase-admin --external:firebase-functions --alias:@shared=../shared/src`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(functions): draft, send and seen callables`.

---

### Task 7: Functions — feedback, correction, approvals

**Files:** Create `functions/src/review.ts`; Test `functions/test/review.emu.test.ts`

**Interfaces:**

```ts
export async function giveFeedback(c: Caller, data: { reportId: string; zoneId: string; version: number; photoIndex: number;
  comment: string; strokes: Stroke[]; deadline: string }, d: Deps): Promise<{ feedbackId: string }>;
export async function sendCorrection(c: Caller, data: { reportId: string; zoneId: string; photos: PhotoRef[]; storeComment: string }, d: Deps): Promise<void>;
export async function approveZone(c: Caller, data: { reportId: string; zoneId: string }, d: Deps): Promise<void>;
export async function approveAllWithoutFeedback(c: Caller, data: { reportId: string }, d: Deps): Promise<{ approved: number }>;
```

Behaviour (each in a transaction, then `recomputeSummary` → write `zoneSummary`, then notify after commit):
- `giveFeedback`: reviewer for report country; report `sent`; `nextState(state,'feedback')`; `version` = an existing version n and `photoIndex` < its photo count; `comment` trimmed 1–1000 chars; `strokes` ≤ 50, each `points` even length ≤ 2000, all values in [0,1]; `isValidDeadline(deadline, now, report.timezone)` else `invalid-argument`. Writes feedback (`status:'open'`, `authorName = caller.name`), zone `needs_correction`, `earliestOpenDeadline = min(open deadlines)`, and if `dayBeforeAlreadyCovered` set `reminderDayBeforeSentFor = deadline`. Notify `{kind:'feedback', zoneName, deadline}`.
- `sendCorrection`: own store, zone `needs_correction`; photos 1–3 under `…/{zoneId}/` and existing; appends version `n+1`; open feedback → `answered`; `earliestOpenDeadline:null`; state `correction_sent`. Notify `correction_sent`.
- `approveZone`: reviewer; `nextState(state,'approve')`, sets `approvedBy`, `approvedAt`. Notify `zone_approved`.
- `approveAllWithoutFeedback`: reviewer; approves every zone in `submitted`; returns count; one `all_approved` event if count > 0.
- A `TransitionError` maps to `failed-precondition`.

- [ ] **Step 1: Failing tests** (start from a sent report built with Task 6 handlers): avmCz feedback → zone `needs_correction`, feedback stored, `feedback` event; avmSk feedback → `permission-denied`; store feedback → `permission-denied`; **`giveFeedback rejects deadline before store-local today`** → `invalid-argument`; stroke value `1.5` → `invalid-argument`; empty comment → `invalid-argument`; feedback on `not_in_campaign` zone → `failed-precondition`; two feedbacks with deadlines `2026-10-20` then `2026-10-18` → `earliestOpenDeadline === '2026-10-18'`; sendCorrection → version 2, feedback `answered`, state `correction_sent`, `correction_sent` event; sendCorrection on `submitted` zone → `failed-precondition`; approveZone on `correction_sent` → `approved`; **`approve after feedback fails with failed-precondition`** (zone `needs_correction`); feedback on an approved zone → back to `needs_correction`; approveAllWithoutFeedback approves only `submitted` zones (a `correction_sent` zone stays) and returns that count, one `all_approved` event; report `zoneSummary` matches zone docs after each call.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(functions): feedback, correction and approval callables`.

---

### Task 8: Functions — push notifier, reminders, entry point

**Files:** Modify `functions/src/notifier.ts` (types from Task 6; add `audience`, `buildMessage`, `FcmNotifier`, `LogNotifier`); Create `functions/src/reminders.ts`, `functions/src/index.ts`; Test `functions/test/notifier.test.ts`, `functions/test/reminders.emu.test.ts`

**Interfaces:**

```ts
export interface ReportRef { id: string; storeId: string; storeCode: string; storeName: string; country: Country; campaignName: string }
export type PushEvent =
  | { kind: 'report_sent'; report: ReportRef }
  | { kind: 'feedback'; report: ReportRef; zoneId: string; zoneName: string; deadline: string }
  | { kind: 'correction_sent'; report: ReportRef; zoneId: string; zoneName: string }
  | { kind: 'zone_approved'; report: ReportRef; zoneId: string; zoneName: string }
  | { kind: 'all_approved'; report: ReportRef; count: number }
  | { kind: 'reminder_day_before' | 'reminder_overdue'; report: ReportRef; zoneId: string; zoneName: string; deadline: string };
export interface Notifier { notify(e: PushEvent): Promise<void> }
export function audience(e: PushEvent): 'reviewers' | 'store';     // report_sent, correction_sent -> reviewers; rest -> store
export function buildMessage(e: PushEvent, lang: Lang, appUrl: string): { title: string; body: string; link: string };
export class FcmNotifier implements Notifier { constructor(db: Firestore, messaging: Messaging, appUrl: string) }
export class LogNotifier implements Notifier {}                     // used when FUNCTIONS_EMULATOR === 'true'
export async function runReminders(d: Deps): Promise<number>;      // returns reminders sent
```

- `buildMessage`: title `VM Photo Report`; body from `t(lang, 'push.*')` with `store = "{storeCode} {storeName}"`, `date = formatDayMonth`; link `${appUrl}/r/{reportId}` or `${appUrl}/r/{reportId}/z/{zoneId}` when the event has a zone.
- `FcmNotifier.notify`: recipients = users with `role in ['head_vm','director']` plus users with `role in ['avm','am']` and `country == report.country` (reviewers), or users with `storeId == report.storeId` (store); groups tokens by user language; `messaging.sendEachForMulticast({ tokens, notification:{title, body}, webpush:{ fcmOptions:{ link } }, data:{ link } })`; removes tokens whose error code is `messaging/registration-token-not-registered` or `messaging/invalid-registration-token` (`arrayRemove`). Never throws to the caller (log and continue): a push failure must not fail the user's action.
- `runReminders`: collection-group query `zones` where `state == 'needs_correction'`; for each, tz from parent report; `reminderDue`; notify `reminder_day_before` / `reminder_overdue`; set `reminderDayBeforeSentFor` / `reminderOverdueSentFor = earliestOpenDeadline`.
- `index.ts`: `setGlobalOptions({ region: 'europe-west3' })`; `initializeApp()`; `APP_URL = defineString('APP_URL')`; one `onCall` per handler in Tasks 6–7 (`req => handler(callerFrom(req.auth), req.data, deps())`); `reminders = onSchedule({ schedule: 'every 1 hours', timeZone: 'Europe/Prague' }, () => runReminders(deps()))`.

- [ ] **Step 1: Failing tests.** `notifier.test.ts` (no emulator): `audience` per kind; `buildMessage(feedbackEvent,'en','https://x.web.app')` → `{title:'VM Photo Report', body:"Feedback: Women's Wall 1 — deadline 16.10", link:'https://x.web.app/r/r1/z/women-wall-1'}`; `report_sent` body `"850 Palladium Praha sent a report: <campaign>"`; `FcmNotifier` with fake db (avm CZ `cs` + director `en` + avm SK) and fake messaging returns one failure `messaging/registration-token-not-registered` → called once per language group, SK user excluded, failed token removed, `notify` resolves when messaging rejects. `reminders.emu.test.ts`: deadline `2026-10-16`, `now` = 2026-10-15 09:10 Prague → 1 `reminder_day_before` and flag set; second run → 0; `now` = 2026-10-17 09:10 → 1 `reminder_overdue`; zone `correction_sent` → 0.
- [ ] **Step 2:** Run both → FAIL. **Step 3:** Implement. **Step 4:** `npm test` and `npm run test:emulators` → PASS; `npm run build -w functions` produces `functions/lib/index.js`.
- [ ] **Step 5: Commit** `feat(functions): FCM notifier, hourly reminders, entry point`.

---

### Task 9: Seed script (store 850 + demo accounts)

**Files:** Create `functions/src/seed.ts`; Modify `functions/package.json` (script `seed`: `node lib/seed.js`, add esbuild entry `src/seed.ts`); Test `functions/test/seed.emu.test.ts`

**Interfaces:**

```ts
export function plusAddress(base: string, tag: string): string;   // 'a.b@gmail.com','store850' -> 'a.b+store850@gmail.com'; throws on invalid base
export const DEMO_ACCOUNTS: Array<{ tag: string; role: Role; country: Country | null; storeId: string | null; displayName: string }>;
//   store850/store/CZ/'850'/'Store 850 Palladium Praha', headofvm/head_vm/null/null/'Head of VM', director/director/null/null/'Director of Operations',
//   avmcz/avm/CZ/null/'Area VM CZ', amcz/am/CZ/null/'Area Manager CZ'
export async function seed(opts: { db: Firestore; auth: Auth; baseEmail: string }): Promise<void>;
```

`seed` writes `stores/850` from `STORE_850`; for each account gets-or-creates the Auth user (random 32-char password, `displayName`), `setCustomUserClaims({role,country,storeId})`, merges `users/{uid}` (`language:'en'` only on create, `fcmTokens:[]` only on create). Idempotent. Main (`require.main === module`): reads `DEMO_EMAIL`, exits 1 with a message if missing; prints only tags and roles, never addresses.

- [ ] **Step 1: Failing tests:** `plusAddress('x@gmail.com','amcz')==='x+amcz@gmail.com'`; `plusAddress('nope','a')` throws; after `seed` against auth+firestore emulator: 5 users with expected claims, `stores/850` has 33 zones; running `seed` twice keeps 5 users and preserves a user's changed `language`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(functions): seed script for store 850 and demo accounts`.

---

### Task 10: App shell — PWA, auth, routing, language, layout

**Files:** Create `app/package.json`, `app/tsconfig.json`, `app/vite.config.ts`, `app/index.html`, `app/public/icons/*`, `app/src/main.tsx`, `App.tsx`, `routes.tsx`, `styles.css`, `firebase.ts`, `api.ts`, `auth/*`, `i18n/I18nProvider.tsx`, `ui/Layout.tsx`, `ui/StatusBadge.tsx`, `ui/SettingsPage.tsx`, `ui/Toast.tsx`; Test `app/test/StatusBadge.test.tsx`, `app/test/LoginPage.test.tsx`

**Interfaces:**
- `firebase.ts`: `export const app, auth, db, storage, functions` (functions region `europe-west3`); config from `import.meta.env.VITE_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,STORAGE_BUCKET,MESSAGING_SENDER_ID,APP_ID}`; if `VITE_USE_EMULATORS === 'true'` connect to emulator ports of Task 5.
- `api.ts`: typed `httpsCallable` wrappers with the exact names and data shapes of Tasks 6–7: `createDraft, updateDraftZone, sendReport, markSeen, giveFeedback, sendCorrection, approveZone, approveAllWithoutFeedback`.
- `auth/AuthProvider.tsx`: `useSession(): { user: User | null; claims: Claims | null; profile: UserDoc | null; loading: boolean }` (claims from `getIdTokenResult`, profile via `onSnapshot(users/{uid})`). Users without `role` claim see `error.noAccess` and a Log out button.
- `i18n/I18nProvider.tsx`: `useT(): { lang: Lang; t: (k: MsgKey, p?) => string; setLang(l: Lang): Promise<void> }` — lang from profile, default `en`; `setLang` updates `users/{uid}.language`.
- `ui/StatusBadge.tsx`: `<StatusBadge state={ZoneState | 'overdue'} />` — colours: empty `#d9d9d9` text black; photo_added & submitted black outline; not_in_campaign grey `#8c8c8c`; needs_correction red `#d32f2f`; overdue dark red `#8e0000`; correction_sent orange `#ef6c00`; approved green `#2e7d32`.
- `vite.config.ts`: react plugin, alias `@shared`, `server.fs.allow: ['..']`, `VitePWA({ strategies:'injectManifest', srcDir:'src', filename:'sw.ts', registerType:'autoUpdate', manifest:{ name:'VM Photo Report', short_name:'VM Report', display:'standalone', start_url:'/', background_color:'#ffffff', theme_color:'#ffffff', icons:[192,512,maskable] } })`.
- Styles: system font stack, base 16px, min touch target 48px, max content width 640px, 16px side padding, no horizontal scroll at 360px width.
- Icons: generate simple black-on-white "VM" PNGs (192, 512, maskable 512, apple-touch 180) with a small node script using Playwright screenshot of an SVG; commit the PNGs, not the script.

- [ ] **Step 1: Failing tests:** StatusBadge renders translated label (`ro` → Romanian `needs_correction` text from dict) and red background for `needs_correction`; LoginPage: submit calls `signInWithEmailAndPassword` (mocked) with typed email/password; "Set / forgot password" link navigates to `/reset`; Reset page calls `sendPasswordResetEmail` and shows `reset.sent`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement shell, routes (role-based home), Settings (language list with `LANG_NAME`, Log out). **Step 4:** `npm test` PASS; `npm run build -w app` succeeds.
- [ ] **Step 5: Commit** `feat(app): PWA shell, auth, routing, language`.

---

### Task 11: Push notifications and installation

**Files:** Create `app/src/sw.ts`, `app/src/push/push.ts`, `platform.ts`, `InstallGuide.tsx`, `NotificationsButton.tsx`; Modify `app/src/ui/Layout.tsx`, `app/src/auth/AuthProvider.tsx` (logout cleanup); Test `app/test/platform.test.ts`

**Interfaces:**

```ts
// platform.ts
export type Platform = 'ios-browser' | 'ios-standalone' | 'android' | 'other';
export function detectPlatform(ua: string, maxTouchPoints: number, standalone: boolean): Platform; // iPadOS reports Macintosh + touch points > 1
export function iosVersion(ua: string): number | null;   // 'OS 17_4' -> 17.4
export function pushSupported(p: Platform, iosVer: number | null, hasNotification: boolean): boolean; // ios-standalone needs >= 16.4
// push.ts
export async function enablePush(uid: string): Promise<'granted' | 'denied' | 'unsupported'>; // requestPermission on click, getToken({vapidKey, serviceWorkerRegistration}), arrayUnion token
export async function disablePush(uid: string): Promise<void>;  // deleteToken + arrayRemove; called before signOut
export function onForegroundMessage(cb: (p: { title: string; body: string; link?: string }) => void): () => void;
```

- `sw.ts`: `precacheAndRoute(self.__WB_MANIFEST)`, `NavigationRoute` to `index.html`; `initializeApp(config)` + `getMessaging` from `firebase/messaging/sw` (FCM displays `notification` payloads); `notificationclick` focuses an open client or opens `data.link`.
- Layout banner: `ios-browser` → `<InstallGuide>` (3 steps, `install.ios*`); `android` with captured `beforeinstallprompt` → "Install app" button; otherwise if `pushSupported` and permission not granted → `<NotificationsButton>`; foreground messages → `Toast` with link.
- VAPID key from `VITE_FIREBASE_VAPID_KEY`.

- [ ] **Step 1: Failing tests:** iPhone Safari UA + standalone false → `ios-browser`; same standalone true → `ios-standalone`; iPad (`Macintosh`, maxTouchPoints 5) → `ios-browser`; Android Chrome → `android`; `iosVersion('… CPU iPhone OS 16_3 like Mac OS X …')===16.3` and `pushSupported('ios-standalone',16.3,true)` false, `16.4` true; desktop Chrome → `other` and supported.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; build succeeds and `app/dist/sw.js` exists.
- [ ] **Step 5: Commit** `feat(app): push notifications and install guidance`.

---

### Task 12: Store flow — home, new report, draft, zone editor, send

**Files:** Create `app/src/data/hooks.ts`, `app/src/photos/compress.ts`, `app/src/photos/PhotoPicker.tsx`, `app/src/store/StoreHome.tsx`, `NewReportPage.tsx`, `DraftReportPage.tsx`, `DraftZonePage.tsx`; Test `app/test/compress.test.ts`, `app/test/DraftReportPage.test.tsx`

**Interfaces:**

```ts
// data/hooks.ts  (onSnapshot-based)
export interface Live<T> { data: T; loading: boolean; error: Error | null }
export function useStoreReports(storeId: string): Live<ReportDoc[]>;          // where storeId ==, orderBy createdAt desc
export function useSentReports(claims: Claims, country: Country | 'all'): Live<ReportDoc[]>; // status=='sent' (+country for avm/am or filter), orderBy sentAt desc
export function useReport(id: string): Live<ReportDoc | null>;
export function useZones(reportId: string): Live<ZoneDoc[]>;                  // orderBy order
export function useZone(reportId: string, zoneId: string): Live<ZoneDoc | null>;
export function useFeedback(reportId: string, zoneId: string): Live<FeedbackDoc[]>; // orderBy createdAt
export function useStore(storeId: string): Live<StoreDef | null>;
export function usePhotoUrl(path: string): string | null;                    // getDownloadURL, cached in a Map
// photos/compress.ts
export function fitWithin(w: number, h: number, max: number): { width: number; height: number };
export async function compressImage(file: File, max = 1920, quality = 0.8): Promise<{ blob: Blob; width: number; height: number }>;
//   createImageBitmap(file, { imageOrientation: 'from-image' }) -> canvas -> toBlob('image/jpeg', quality)
export async function uploadZonePhoto(report: ReportDoc, zoneId: string, version: number, file: File): Promise<PhotoRef>;
//   path `reports/{country}/{storeId}/{reportId}/{zoneId}/v{version}_{crypto.randomUUID()}.jpg`, uploadBytes with contentType image/jpeg
```

Screens:
- **StoreHome:** "Corrections to do" (from each sent report's `zoneSummary` where state `needs_correction`, sorted by deadline, overdue in red via `isOverdue`), then report list (campaign, date, `reportStatus` label), "New report" button (if a draft exists it opens the draft instead and shows `store.draftExists`).
- **NewReportPage:** campaign name input (required, max 80) → `createDraft` → navigate `/r/{id}`.
- **DraftReportPage:** departments with zone rows (name + `StatusBadge`), Send button enabled only when `canSend(states)`, else shows `store.sendHint`; Send → `sendReport` → toast, back home.
- **DraftZonePage:** photo thumbnails (max 3, remove), `PhotoPicker` with two buttons: Take photo (`<input type=file accept="image/*" capture="environment">`) and Choose from gallery (`accept="image/*"`, no capture); upload progress; comment textarea (max 500); "Not part of this campaign" toggle (disabled while photos exist); every change → `updateDraftZone` immediately (auto-save).

- [ ] **Step 1: Failing tests:** `fitWithin(8064,6048,1920)` → `{1920,1440}`; `fitWithin(3024,4032,1920)` → `{1440,1920}`; `fitWithin(800,600,1920)` → unchanged; DraftReportPage (hooks mocked) with one `empty` zone → Send disabled and hint shown; all zones `photo_added`/`not_in_campaign` → Send enabled and click calls `api.sendReport({reportId})`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(app): store report flow`.

---

### Task 13: Store correction flow

**Files:** Create `app/src/photos/PhotoWithStrokes.tsx`, `app/src/store/CorrectionPage.tsx`; Test `app/test/CorrectionPage.test.tsx`

**Interfaces:**
- `<PhotoWithStrokes path={string} strokes={Stroke[]} />` — `<img>` with an absolutely positioned `<svg viewBox="0 0 1 1" preserveAspectRatio="none">` of red polylines, `vector-effect="non-scaling-stroke"`, stroke width 4px. Uses `strokesToPolylinePoints` from Task 14's `strokes.ts` (create that file here with only this function; Task 14 adds the rest).
- **CorrectionPage** (store, zone `needs_correction`): latest version photos each with its open feedback (author name + role label, date, comment, deadline, `PhotoWithStrokes`); new photos 1–3 via `PhotoPicker` uploaded to version `n+1`; optional comment; "Send correction" → `api.sendCorrection`. Zone in another state shows read-only history (versions + all feedback).

- [ ] **Step 1: Failing tests:** with one open feedback (hooks mocked) the comment, `Deadline 16.10` and author `Area VM CZ` render; Send correction disabled with 0 new photos, enabled with 1; click calls `sendCorrection` with the uploaded `PhotoRef`s and comment.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(app): store correction flow`.

---

### Task 14: Reviewer flow — list, report, feedback with circles, approve, before/after

**Files:** Create `app/src/review/ReviewHome.tsx`, `ReviewReportPage.tsx`, `ReviewZonePage.tsx`, `AnnotationCanvas.tsx`, `FeedbackForm.tsx`, `BeforeAfter.tsx`; Modify `app/src/review/strokes.ts`; Test `app/test/strokes.test.ts`, `app/test/FeedbackForm.test.tsx`

**Interfaces:**

```ts
// strokes.ts
export function normalizePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): [number, number]; // clamped 0..1
export function appendPoint(points: number[], x: number, y: number, minDist = 0.005): number[]; // skips points closer than minDist, rounds to 3 decimals
export function strokesToPolylinePoints(s: Stroke): string;  // "x0,y0 x1,y1 …"
```

- `AnnotationCanvas`: props `{ photoUrl: string; strokes: Stroke[]; onChange(strokes: Stroke[]): void }`; pointer events (`touch-action: none`) draw red strokes over the image; Undo removes the last stroke.
- `FeedbackForm`: props `{ report: ReportDoc; zone: ZoneDoc; version: number; photoIndex: number }`; comment (required, max 1000), "Mark on photo" toggles `AnnotationCanvas`, `<input type="date" min={localDate(now, report.timezone)}>`; "Send feedback" disabled until comment and deadline are set; calls `api.giveFeedback`.
- **ReviewHome:** sent reports for the caller's scope (`useSentReports`), "New" badge when `!seenBy.includes(uid)`, country filter (`All countries`/CZ/SK/RO) shown only to `head_vm`/`director`; row shows `{storeCode} {storeName}`, country, campaign, sent date, `reportStatus`.
- **ReviewReportPage:** calls `markSeen` once on open; departments → zones with `StatusBadge` (`overdue` when `isOverdue`); "Approve all without feedback" (shown when any zone `submitted`) → confirm dialog → `api.approveAllWithoutFeedback`; "Export PDF" (Task 16).
- **ReviewZonePage:** current version photos, store comment, all feedback (author, role, date, comment, deadline, status); under each photo a `FeedbackForm`; Approve button when state `submitted` or `correction_sent`; when version > 1, `BeforeAfter` shows previous version photos with their feedback strokes next to the current ones.

- [ ] **Step 1: Failing tests:** `normalizePoint(150,100,{left:100,top:50,width:200,height:100})` → `[0.25,0.5]`; out-of-bounds clamps to `[1,0]`; `appendPoint([0.1,0.1],0.102,0.1)` unchanged, `appendPoint([0.1,0.1],0.2,0.2)` → `[0.1,0.1,0.2,0.2]`; `strokesToPolylinePoints({points:[0,0,0.5,0.25]})==='0,0 0.5,0.25'`. FeedbackForm: Send disabled without deadline; filled → calls `giveFeedback` with `{reportId, zoneId, version, photoIndex, comment, strokes:[], deadline}`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(app): reviewer flow with circles, approve and before/after`.

---

### Task 15: Overview

**Files:** Create `app/src/review/OverviewPage.tsx`; Modify `app/src/routes.tsx`, `app/src/ui/Layout.tsx` (nav item for reviewers); Test `app/test/OverviewPage.test.tsx`

**Interfaces:**
- Consumes `useSentReports`, `useStore`, `countStates`, `isOverdue`, `StatusBadge`.
- Shows, per store in scope, the latest sent report: store `{code} {name}`, country, campaign, sent date; a grid per department of small squares coloured by zone state (overdue overrides needs_correction), zone name on tap/long-press (title attribute); counters "Needs correction / Overdue / Approved". Tapping the store opens `/r/{reportId}`. Country filter as in ReviewHome.

- [ ] **Step 1: Failing test:** two sent reports for `850` (older + newer) → only the newer campaign renders; counters match a summary with 2 `needs_correction` (one overdue at mocked now) and 5 `approved` → "1", "1", "5" in the respective counters (overdue counted separately, not double).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(app): overview panel`.

---

### Task 16: Export PDF

**Files:** Create `app/src/pdf/buildReportPdf.ts`, `app/src/pdf/exportReport.ts`; Test `app/test/buildReportPdf.test.ts`

**Interfaces:**

```ts
export interface PdfPhoto { dataUrl: string; width: number; height: number }        // JPEG with strokes already drawn
export interface PdfZone { department: string; name: string; state: ZoneState | 'overdue'; storeComment: string; photos: PdfPhoto[];
  feedback: Array<{ author: string; role: string; date: string; comment: string; deadline: string; status: string }> }
export interface PdfReport { storeCode: string; storeName: string; country: Country; campaignName: string; sentAt: string; exportedAt: string; zones: PdfZone[] }
export function buildReportPdf(r: PdfReport, lang: Lang, fontBase64: string): jsPDF;   // A4 portrait, 15 mm margins
export async function exportReport(report: ReportDoc, zones: ZoneDoc[], lang: Lang): Promise<void>;
//  loads feedback per zone, fetches photos via getBlob, draws strokes on a canvas scaled to max 1000 px, JPEG 0.7,
//  loads DejaVuSans.ttf (import url from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url'), builds, then
//  navigator.share({ files:[pdf] }) when available, else download `VM-Report-{storeCode}-{campaign}.pdf`
```

Layout: header block (store, country, campaign, sent, exported), then per department heading, per zone: name + state label, photos in a row (max 3, fit 55 mm height), store comment, feedback lines; `addPage` when the next block doesn't fit. Font `DejaVuSans` registered via `addFileToVFS` + `addFont`, used for all text.
Storage CORS must allow the app origin (Task 17) for `getBlob`.

- [ ] **Step 1: Failing tests** (node env, font read from `node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf` as base64, 1×1 JPEG data URL fixture, `vi.spyOn(jsPDF.prototype,'text')`): 33 zones → `getNumberOfPages() > 1`; text calls include `850 Palladium Praha`, `Women's Wall 1`, and a store comment `Přeskládat stůl, doplnit velikosti` exactly; the font list of the doc contains `DejaVuSans`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** `npm i -w app jspdf@^4 dejavu-fonts-ttf@^2.37.3`; implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(app): export report as PDF`.

---

### Task 17: CI, deploy and seed workflows

**Files:** Create `.github/workflows/ci.yml`, `deploy.yml`, `seed.yml`, `storage.cors.template.json`

**Decisions:**
- `ci.yml`: on push/PR; Node 22, `npm ci`, `npm run typecheck`, `npm test`, `npm run test:emulators` (Java is preinstalled on ubuntu-latest).
- `deploy.yml`: on push to `claude/medicine-photo-feedback-app-uk8m8b` and `main`, plus `workflow_dispatch`. First step checks that secret `FIREBASE_SERVICE_ACCOUNT` is set; if not, prints "Firebase not configured yet — skipping deploy" and exits 0. Then: tests; build app with env `VITE_FIREBASE_*` from secrets `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_VAPID_KEY` (`AUTH_DOMAIN` = `{projectId}.firebaseapp.com`); write `functions/.env` with `APP_URL=https://{projectId}.web.app`; `google-github-actions/auth@v2` with `credentials_json`; `npx firebase-tools deploy --project "$FIREBASE_PROJECT_ID" --only hosting,firestore,storage,functions --non-interactive --force`; render `storage.cors.template.json` with the two hosting origins and apply `gcloud storage buckets update gs://$BUCKET --cors-file=storage.cors.json` (method GET, maxAge 3600).
- `seed.yml`: `workflow_dispatch` only; secrets `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_PROJECT_ID`, `DEMO_EMAIL`; `npm ci && npm run build -w functions && npm run seed -w functions` with `GOOGLE_APPLICATION_CREDENTIALS` and `GCLOUD_PROJECT`.
- No secret values or emails in workflow files.

- [ ] **Step 1:** Write the three workflows and the CORS template.
- [ ] **Step 2: Verify** `for f in .github/workflows/*.yml; do npx --yes @action-validator/cli@0.6.0 "$f"; done` → no errors; `grep -ri "gmail" .github` → nothing.
- [ ] **Step 3: Commit** `ci: tests, deploy to Firebase, seed workflow`.

---

### Task 18: Smoke test, Romanian setup guide and test checklist

**Files:** Create `e2e/smoke.mjs`, `docs/setup/firebase-setup.ro.md`, `docs/setup/test-checklist.ro.md`; Modify root `package.json` (script `smoke`)

**Smoke test** (`npm run smoke`): `firebase emulators:exec --only auth,firestore,storage,functions --project demo-vm-report` running: seed with `DEMO_EMAIL=demo@example.com`, set known passwords via admin SDK, `vite build` with `VITE_USE_EMULATORS=true` + `vite preview`, then Playwright (Chromium `/opt/pw-browsers/chromium`, viewport 390×844): store logs in → New report "Test campaign" → uploads `e2e/fixtures/zone.jpg` (portrait 3000×4000) to Women's Image → marks the other 32 zones Not part of this campaign → Send. Head of VM logs in → sees report with "New" → opens Women's Image → draws a stroke → deadline tomorrow → Send feedback. Store sees it in "Corrections to do" → sends correction. Head of VM sees Before/After → Approve. Exports PDF (download event fires). Screenshots of every screen saved to the scratchpad; script asserts no horizontal scroll (`scrollWidth <= innerWidth`) on each screen and that the uploaded photo is ≤ 1920 px and portrait.

**Setup guide (Romanian, for Horațiu, step by step with exact menu names):** create Firebase project; upgrade to Blaze + budget alert 5 USD; Firestore → create database `europe-west3`, production mode; Storage → get started `europe-west3`; Authentication → enable Email/Password; Project settings → add Web app → copy the 6 config values; Cloud Messaging → Web Push certificates → Generate key pair → copy VAPID key; Google Cloud IAM → create service account `github-deploy` with roles Firebase Admin, Cloud Functions Admin, Cloud Run Admin, Service Account User, Cloud Scheduler Admin, Artifact Registry Administrator, Cloud Build Editor, Service Usage Admin, Storage Admin, API Keys Admin → create JSON key; GitHub → Settings → Secrets and variables → Actions → add `FIREBASE_SERVICE_ACCOUNT` (whole JSON), `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_VAPID_KEY`, `DEMO_EMAIL`; Actions → "Deploy" → Run workflow; Actions → "Seed demo" → Run workflow; open `https://{projectId}.web.app`, "Set / forgot password" for each of the 5 addresses; then delete the JSON key file from the laptop. Note: if the first deploy fails on a missing permission, the error names the role; add it and re-run.

**Test checklist (Romanian):** the full cycle on iPhone (iOS ≥ 16.4, added to Home Screen) + laptop Chrome, then on Android; includes: portrait photo from iPhone gallery uploads upright; notification arrives on the reviewer device within a minute and opens the right zone; language switch to CS/SK/RO; overdue reminder by setting a deadline of today and checking the next morning; PDF opens with diacritics.

- [ ] **Step 1:** Write `e2e/smoke.mjs` + fixture; `npm run smoke` → all steps pass; review the screenshots for cut-off text, overlaps, broken layout; fix and re-run until clean.
- [ ] **Step 2:** Write both Romanian docs (natural Romanian, full diacritics, glossary terms).
- [ ] **Step 3:** Full verification: `npm run typecheck && npm test && npm run test:emulators && npm run build && npm run smoke` → all green.
- [ ] **Step 4: Commit** `test: emulator smoke test; docs: Romanian setup guide and test checklist`; push.
