# Rates & Availability Admin Feature

## Context

The admin portal currently has zero real revenue-management control: every room type has one flat nightly price (`settings.price_d6`, `price_c3`, etc.), and the existing "Availability" tab's Min-Stay Rules and Website Quick Controls are localStorage-only decorations that never touch the backend or affect real guest bookings. The only genuinely persisted date-control mechanism (`room_blocks`) operates on individual physical rooms and isn't even enforced in the booking flow. The user wants an Expedia-extranet-style "Rates & Availability" calendar where they can, per room type and per date: set a custom rate, reduce the sellable room count, close a date to booking entirely (stop-sell), and set a minimum-stay requirement — and have this **actually control** what guests can book on the live site, not just be a dashboard.

Confirmed scope decisions (from user):
- **Granularity**: per room **type** (the 9 guest-facing types: single, twin, triple, double_single, family, large_family, group_6, group_mixed, large_group) — not per physical room code.
- **Enforcement**: real — must affect `rooms.html`/`booking.html`'s actual booking flow, not just be admin-only.
- **Feature set**: Core v1 only — rate override, available-count override, closed (stop-sell), min-stay. No Closed-to-Arrival/Departure, no max-stay (explicitly deferred).

## Approach

### 1. New table: `room_rate_calendar`

One row per `(room_type, date)` override; absence of a row = use today's defaults (flat settings price, full physical-room capacity, open, no min-stay). This makes the feature purely additive — an empty table changes nothing.

```sql
CREATE TABLE IF NOT EXISTS room_rate_calendar (
  id                  SERIAL PRIMARY KEY,
  room_type           VARCHAR(30) NOT NULL,
  date                DATE NOT NULL,
  rate                NUMERIC(8,2),
  available_override  SMALLINT,
  closed              BOOLEAN NOT NULL DEFAULT FALSE,
  min_stay            SMALLINT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT room_rate_calendar_type_date_uniq UNIQUE (room_type, date),
  CONSTRAINT room_rate_calendar_rate_positive  CHECK (rate IS NULL OR rate > 0),
  CONSTRAINT room_rate_calendar_avail_nonneg   CHECK (available_override IS NULL OR available_override >= 0),
  CONSTRAINT room_rate_calendar_minstay_pos    CHECK (min_stay IS NULL OR min_stay >= 1)
);
CREATE INDEX IF NOT EXISTS idx_rrc_room_type_date ON room_rate_calendar (room_type, date);
```

`room_type` is a plain `VARCHAR`, not an FK — matches the existing convention (`bookings.room_type` has no FK either; `ROOM_TYPES` in `backend/src/middleware/validate.js` is the sole source of truth, enforced in app code).

**Where**: insert into the existing migration IIFE in `backend/src/routes/admin.js` (lines 22–63), right after the `room_blocks` CREATE TABLE (line 46) and before `admin_sessions` (line 47) — this file is where admin-portal-specific tables are already added (confirmed: `room_blocks`/`admin_sessions` both created here, not in `backend/server.js`'s `initDb()`, which is reserved for the core `bookings`/`contacts`/`settings` tables). No separate migration tool exists in this repo — this idempotent-`CREATE TABLE IF NOT EXISTS` pattern, run on every boot, is how all schema changes are shipped.

### 2. Backend API — new endpoints in `backend/src/routes/admin.js`

All guarded by the existing `adminAuth` middleware (already imported), no new rate-limiter needed (every other admin write endpoint relies solely on the app-wide `globalLimiter`).

- **`GET /api/admin/rates?start=YYYY-MM-DD&end=YYYY-MM-DD`** — returns effective (merged) rate/availability/closed/min-stay for all 9 `ROOM_TYPES` × every date in range, with `*_is_override` flags per cell so the frontend can style overridden cells without recomputing defaults itself. Validate range ≤ 366 days.

- **`PUT /api/admin/rates/bulk`** — body `{ room_types: [...], start_date, end_date, days_of_week?: [0-6], set: { rate?, available_override?, closed?, min_stay? } }`. Partial update semantics: only keys present in `set` are touched (upsert via `ON CONFLICT (room_type,date) DO UPDATE ... CASE WHEN <field-was-supplied> THEN EXCLUDED.<field> ELSE room_rate_calendar.<field> END`), so a bulk "just close these dates" call never clobbers an existing rate override on the same cells. Single query using `unnest(room_types) CROSS JOIN generate_series(start,end,'1 day')`, filtered by `days_of_week` if given. This is the main Expedia-style power tool (e.g. "set £150 + close Fri/Sat for Twin+Triple, Dec 20–31").

- **`POST /api/admin/rates/bulk-clear`** — body `{ room_types, start_date, end_date, days_of_week? }` → deletes matching rows, resetting to defaults.

- **`PUT /api/admin/rates/cell`** — body `{ room_type, date, rate, available_override, closed, min_stay }`, all four required (nulls clear that field). Used by inline single-cell quick-edit. If all four end up null/false after the write, delete the row instead of leaving a dead all-default row.

- **`DELETE /api/admin/rates?room_type=&date=`** — reset one cell to default.

### 3. Enforcement — `backend/src/controllers/bookingController.js`

This is the part that makes it "real." Add one shared helper that, for a given `(room_type, checkin_date, checkout_date)`, runs **one SQL query** (not a per-night loop) using `generate_series` + `LEFT JOIN room_rate_calendar` to get effective rate/capacity/closed/min-stay per night of the stay, `COALESCE`d against the existing flat `settings.price_X` and `typeInfo.codes.length` defaults. A second single query (same `generate_series` technique, joined against live `bookings` overlap counts) determines whether any night in the stay is closed or over capacity.

Three existing functions change:

- **`createBooking`** (currently lines 19–178): inside the existing `BEGIN` + `pg_advisory_xact_lock(hashtext(room_type))` transaction (lock granularity stays per-`room_type`, still correct since all new constraints are also per-`room_type`/date), replace the current single `COUNT(*) ... WHERE checkin_date < $3 AND checkout_date > $2` aggregate-overlap check (lines 64–79) with: (a) a min-stay check against the check-in date's row → 400 if `nights < min_stay`, (b) the per-night closed/capacity query → 409 naming the specific date and reason (closed vs fully booked) if any night fails, (c) compute `total_amount` as the exact sum of each night's effective rate (replacing the current flat `nights * pricePerNight`, line 52) and `price_per_night` as `total / nights` (becomes an average when rates vary within a stay — acceptable since `total_amount`, not `price_per_night`, is the billing source of truth; flag this to whoever reviews admin booking-detail screens).

- **`checkAvailability`** (lines 181–214, the pre-submission check called at booking-wizard step 2): replace the same aggregate `COUNT(*)` query with the per-night query; response gains `reason` (`"closed" | "capacity" | "min_stay"`) and a human `message` so the frontend can show a specific error instead of a generic one.

- **`checkAvailabilityBatch`** (lines 285–321, used at step 1 to hide sold-out room cards): switch from `GROUP BY room_type` aggregate counting to the same per-night-per-type technique across all 9 types in one query (cross join types × `generate_series`), treating `closed` as equivalent to fully-booked for card-hiding purposes. Min-stay is intentionally not checked here (no room type chosen yet).

- **New `getQuote` function** + **`GET /api/bookings/quote?room_type=&checkin_date=&checkout_date=`** (wire in `backend/src/routes/bookings.js`): read-only endpoint returning `{ nights, total_amount, price_per_night_avg, nightly: [{date, rate}, ...] }`, reusing the same stay-pricing query. This becomes the authoritative price source for the guest-facing wizard (see §4) — the client never computes or sends price; the server always recomputes `total_amount` at actual submission time regardless of what was quoted, preserving the existing security model.

Concurrency: the existing advisory lock is unchanged and remains sufficient — no new lock granularity needed since capacity/closed/min-stay are all still scoped to `room_type` + date.

### 4. Public price display

- **`rooms.html`** / `/api/settings/prices.js`: leave untouched. No date picker exists on this page, so the flat "from £X/night" continues to correctly mean "the default rate" (still accurate, since `settings.price_X` remains the fallback whenever no override row exists for a date). Adding a true date-aware "from" price here is a nice-to-have explicitly out of Core-v1 scope.

- **`js/booking.js`**: currently computes price entirely client-side as `state.nights * room.price` in two places — `buildConfirmSummary()` (~line 348) and `updateSummary()` (~line 476) — using only the static flat-price `ROOM_TYPES` object. Change: after the existing step-2 availability check succeeds, also call the new `GET /api/bookings/quote`, store the result as `state.quote`, and have both functions use `state.quote.total_amount` (falling back to the old client math only if the quote call errors, matching the existing defensive `catch` pattern already used for the availability call). Invalidate `state.quote = null` whenever check-in/check-out/room selection changes. No changes needed to the final `POST /api/bookings` submit — it already never sends price, and the backend now always recomputes it server-side per §3.

### 5. Admin frontend — new "Rates & Availability" section

Follows the existing "Availability" tab's visual language exactly (`.av-panel`, `.av-kpi-*`, `.av-leg`, `.cf-input`, `.btn-modal-confirm/cancel`, `.block-field`/`.block-form-footer` — all confirmed present in `css/admin.css` around line 3266+ and 852–896).

- **`admin.html`**: new nav item in the sidebar (`<nav class="sidebar-nav">`, after the existing `data-section="availability"` item at line 70) and a new `<section class="admin-section hidden" id="sectionRates">` (after the Availability section closes at line 642, before Guests at line 642+). Contents:
  - A scrollable grid: 9 room-type rows × a rolling date window (default 30 days, Prev/Next-30 + "Today" nav buttons — mirrors the existing Calendar tab's week-nav pattern but at 30-day granularity). Each cell shows rate + available count, with distinct background colors for default / rate-override / reduced-availability / closed (plus a small "Nn min" badge when min-stay is set).
  - Click a cell → small popover editor (positioned via `getBoundingClientRect()`, no library) calling `PUT /api/admin/rates/cell`, re-rendering just that cell on save.
  - A "Bulk Edit" panel (toggled by a header button, same show/hide pattern as the existing Block-a-Room form): room-type checkboxes (9), date range, optional day-of-week checkboxes, and per-field "apply this?" checkboxes for rate/available/closed/min-stay, calling `PUT /api/admin/rates/bulk`; plus a "Clear Overrides in Range" button calling `POST /api/admin/rates/bulk-clear`.

- **`js/admin.js`**: new block after the existing Availability functions (after line ~2594): a hardcoded `RATE_ROOM_TYPES` mirror array (same pattern as the existing `CAL_ROOMS` mirror of backend `VALID_ROOMS`, line 24–36), `loadRates()`/`renderRatesGrid()`/`ratesShiftWindow()`/cell-editor functions/bulk-panel functions — all using the existing `apiFetch()` helper, `esc()`, `fmtDate()`, `_localDate()` utilities already defined. One new line in `showSection()` (line 87) to call `loadRates()` when the `rates` section is opened.

- **`css/admin.css`**: new `.rates-*` / `.rc-cell` (+ 4 state modifiers) classes appended near the existing `.av-*` block, reusing `.cf-input`/`.btn-modal-*`/`.block-field` primitives rather than redefining them.

Rough size: ~200 lines admin.html, ~300 lines admin.js, ~150 lines admin.css, ~180 lines backend (routes + controller changes combined).

## Rollout / safety notes

1. **Empty table = zero behavior change.** Every new query `COALESCE`s against current defaults, so shipping the backend migration + enforcement changes is safe on its own, before the admin UI even exists. Recommend deploying backend first, confirming `GET /api/admin/rates` on a fresh table returns values matching today's flat prices, then shipping the admin UI.
2. **Test on far-future, booking-free dates first** before relying on this for near-term real inventory.
3. **`room_blocks` (per physical room, unenforced) and `room_rate_calendar` (per room type, enforced) are intentionally separate systems** — do not attempt to reconcile them in this pass; that's a distinct future enhancement.
4. Consider adding a composite index `ON bookings (room_type, checkin_date, checkout_date) WHERE status != 'cancelled'` alongside this migration if the new per-night queries show sequential scans under real load (the existing `idx_bookings_availability` index is keyed on `room_code`, not `room_type`).

## Critical files

- `backend/src/routes/admin.js` — migration block (insert after line 46) + 5 new `/api/admin/rates*` endpoints
- `backend/src/controllers/bookingController.js` — rewrite `createBooking`, `checkAvailability`, `checkAvailabilityBatch`; add shared stay-pricing helper + new `getQuote`
- `backend/src/routes/bookings.js` — wire `GET /quote`
- `backend/src/middleware/validate.js` — reuse `ROOM_TYPES` as-is (no changes)
- `js/booking.js` — `buildConfirmSummary()` (~line 348), `updateSummary()` (~line 476), step-2 handler
- `admin.html` — sidebar nav (after line 70), new `#sectionRates` (after line 642)
- `js/admin.js` — new functions after line ~2594, one new line in `showSection()` (line 87)
- `css/admin.css` — new rules near line 3266+, reusing existing primitives

## Verification

1. Backend: after deploying, hit `GET /api/admin/rates?start=<today>&end=<+29d>` with a valid admin token — confirm all 9 types return effective values matching current `settings.price_X` and full capacity, `closed:false`, `min_stay:null` everywhere (proves the migration + defaults work before any UI exists).
2. Set an override via `PUT /api/admin/rates/cell` on a far-future date with no existing bookings (e.g. `twin`, +9 months, `available_override:0`) — confirm `GET /api/bookings/availability?room_type=twin&checkin_date=<that date>&checkout_date=<+1d>` now returns `available:false, reason:"capacity"`, and that `POST /api/bookings` for those dates is rejected 409. Clear it via `DELETE /api/admin/rates?...` and confirm availability returns to normal.
3. Set a `closed:true` override and confirm both `checkAvailability` and `checkAvailabilityBatch` reflect it, and the room card is hidden/blocked in the live `booking.html` wizard (manual browser test).
4. Set a `min_stay:3` override on a check-in date and confirm a 1-night booking attempt for that date is rejected with the min-stay message, while a 3-night booking succeeds.
5. Set a `rate` override that differs from the flat price, confirm `GET /api/bookings/quote` returns the correct blended total for a stay spanning both overridden and default-rate nights, and that the booking wizard's summary/confirm screens display that total (not the old flat-rate client math) — manual browser walkthrough of the full booking flow in `booking.html`.
6. Admin UI: open the new Rates & Availability tab, verify the 30-day grid renders effective values, edit a single cell and confirm it persists on reload, run a bulk edit across a date range + room-type selection and confirm all matching cells update, then bulk-clear and confirm reset to defaults.
