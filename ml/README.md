# CityLift ML — Surge Prediction

Per-vehicle surge-multiplier models for CityLift, built with TensorFlow.js (pure JS).
This folder is self-contained — it has no dependencies on `src/`. To use the models from the
backend, import the serving functions (see **Integration** below); you do **not** need to
understand the training internals.

> **Heads-up for integrators:** the models are trained on **synthetic, rule-based data** (we
> have no real ride data). They produce sensible, consistent surge pricing that follows
> hand-defined domain rules — good for launch/cold-start — but they are not learned from real
> demand. See `ml/configs/*.js` for the exact rules each vehicle follows.

---

## The 8 models

One model per vehicle × scope. Models live in `ml/models/<name>/`.

| Scope | Vehicles | `vehicle` values | `scope` value |
|---|---|---|---|
| City (instant) | bike, rickshaw, mini car, economy car, parcel | `bike` `rickshaw` `minicar` `economy` `parcel` | `city` |
| Intercity (scheduled) | mini car, economy car, parcel | `minicar` `economy` `parcel` | `intercity` |

Each model folder contains `model.json`, `weights.bin`, `normalizer.json`, `features.json`.

---

## Integration (what the backend calls)

Import from `ml/prediction/predictor.js`. Both functions are `async`.

```js
import { predictSurge, estimateFare } from '../ml/prediction/predictor.js';

// Just the surge multiplier (number, clamped to the vehicle's [0.80, max_surge]):
const surge = await predictSurge('bike', 'city', rawInput);

// Surge + a transparent fare estimate:
const quote = await estimateFare('minicar', 'intercity', rawInput);
// → { surge_multiplier: 1.54, fare_before_surge: 13500, total_fare: 21844, currency: 'PKR' }
```

- Models are **loaded once and cached** in-process — first call per model reads files, later
  calls are fast. Safe to call on every request.
- Throws if `vehicle`/`scope` is invalid or a required `rawInput` field is missing/non-numeric.

### Example Express route (apply on your side, in `src/`)

```js
// e.g. src/routes/fare.routes.js  — written by the backend owner, not in ml/
import { Router } from 'express';
import { estimateFare } from '../../ml/prediction/predictor.js';

const router = Router();

router.post('/api/fare/estimate', async (req, res, next) => {
  try {
    const { vehicle, scope, conditions } = req.body;
    const quote = await estimateFare(vehicle, scope, conditions);
    res.json(quote);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
```

---

## `rawInput` field reference

Pass plain numbers. Cyclical fields (`hour`, `day`, `month`) are given as plain integers — the
encoder converts them to sin/cos internally, so **do not** pre-encode them.

**`weather_code` legend:** `0` Clear · `1` Cloudy · `2` LightRain · `3` ModRain · `4` HeavyRain ·
`5` Storm · `6` Fog · `7` Dust

### City (`scope: 'city'`) — 17 raw fields

| Field | Type / range | Notes |
|---|---|---|
| `distance_km` | number | trip distance |
| `travel_time_min` | number | estimated duration |
| `wait_time_min` | number | pickup wait |
| `traffic_ratio` | ~1.0–2.0 | 1.0 = free flow |
| `avg_speed_kmh` | number | |
| `weather_code` | 0–7 | see legend |
| `rain_mm` | number | |
| `visibility_m` | number | |
| `wind_speed` | number | km/h |
| `feels_like_temp` | number | °C |
| `demand_ratio` | ~0.5–5.0 | requests ÷ available drivers |
| `zone_driver_count` | int | drivers in pickup zone |
| `hour` | 0–23 | int |
| `day` | 0–6 | 0 = Mon (any consistent convention) |
| `is_weekend` | 0 / 1 | |
| `is_public_holiday` | 0 / 1 | |
| `is_ramadan` | 0 / 1 | |

### Intercity (`scope: 'intercity'`) — 25 raw fields

All of these (note: **no** `wait_time_min`; cars/parcel only):

| Field | Type / range | Notes |
|---|---|---|
| `distance_km` | number | long-haul (50–500) |
| `travel_time_min` | number | |
| `traffic_ratio` | ~1.0–1.5 | |
| `avg_speed_kmh` | number | highway speeds |
| `weather_code` | 0–7 | origin weather |
| `rain_mm` | number | origin |
| `visibility_m` | number | origin |
| `wind_speed` | number | origin |
| `feels_like_temp` | number | origin |
| `dest_weather_code` | 0–7 | destination weather |
| `dest_rain_mm` | number | destination |
| `demand_ratio` | ~0.5–5.0 | |
| `zone_driver_count` | int | |
| `booking_lead_time_hours` | number | hours before departure (1–168) |
| `toll_cost` | number | PKR, added on top of surged fare |
| `dead_return_factor` | ~1.0–1.6 | 1.0 = return fare found, higher = empty return |
| `seats_booked` | int | for parcel use 1 |
| `seat_capacity` | int | mini/economy = 4, parcel = 1 |
| `hour` | 0–23 | int |
| `day` | 0–6 | int |
| `month` | 0–11 | int (0 = Jan) — seasonality |
| `is_weekend` | 0 / 1 | |
| `is_public_holiday` | 0 / 1 | |
| `is_ramadan` | 0 / 1 | |
| `cancellation_risk` | 0.0–0.6 | |

---

## Where each `rawInput` field comes from in production

The ML side doesn't fetch any of these — the caller (backend quote endpoint) collects them
and passes them in. This section is the integration cheat sheet: which existing service /
DB / external API supplies each field. **`needs adding`** means the source doesn't exist in
the codebase yet at the time of writing.

### 1. Trip geometry — Google Routes API (`src/services/googleRoutes.service.js`, wired)

| Field | How to obtain |
|---|---|
| `distance_km` | `route.distanceMeters / 1000` |
| `travel_time_min` | `route.duration` (seconds) ÷ 60. Use **traffic-aware** duration for city, free-flow for intercity. |
| `traffic_ratio` | `duration_in_traffic / duration_static` — request both by calling Routes with `TRAFFIC_AWARE` and `TRAFFIC_UNAWARE` routing preferences. 1.0 = free flow, 2.0 = stuck. |
| `avg_speed_kmh` | Derived: `distance_km / (travel_time_min / 60)`. Don't store separately. |

### 2. Pickup wait — driver-matching layer (city only)

| Field | How to obtain |
|---|---|
| `wait_time_min` | After matching the nearest driver, call Google Routes from `driver.currentLocation → pickup` and take the duration in minutes. Source data: `src/models/driverLocation.model.js`. |

### 3. Weather — external API (**needs adding**)

| Field | How to obtain |
|---|---|
| `weather_code` (0–7) | Call a weather API at pickup lat/lng and map the provider's condition code into the 0–7 legend above. |
| `rain_mm` | precipitation in last hour (mm) |
| `visibility_m` | direct field |
| `wind_speed` | km/h (convert from m/s if needed) |
| `feels_like_temp` | apparent temperature °C |
| `dest_weather_code`, `dest_rain_mm` (intercity) | Same API, queried at **destination** lat/lng. |

**Recommended provider:** [Open-Meteo](https://open-meteo.com/) — free, no API key required,
returns all of the above in a single call. Backup: OpenWeather free tier. Cache responses
per-zone for ~10 min so the API isn't hit on every quote.

### 4. Supply / demand — your own DB

| Field | How to obtain |
|---|---|
| `zone_driver_count` | Count drivers currently in the pickup zone. Use `src/services/neo4j/driverArea.service.js` (already wired). |
| `demand_ratio` | `(open ride requests in zone in last 5–10 min) ÷ (available drivers in zone)`. **Needs adding** — implement as a rolling-window aggregator (Redis sliding window, or a 1-minute cron job that snapshots into Postgres). |

### 5. Time / calendar — server clock + lookup tables

| Field | How to obtain |
|---|---|
| `hour`, `day`, `month` | `new Date()` in `Asia/Karachi`. ⚠️ Match the convention used in training: `day` is 0 = Mon. |
| `is_weekend` | In Pakistan: Sat + Sun. Derive from `day`. |
| `is_public_holiday` | Static JSON file (`pakistan_holidays_<year>.json`) in the repo, or a calendar API (e.g. Calendarific). Static is fine — holidays are known in advance. |
| `is_ramadan` | Use the [`moment-hijri`](https://www.npmjs.com/package/moment-hijri) npm package, or a small hardcoded date-range table. **Needs adding.** |

### 6. Intercity-only fields

| Field | How to obtain |
|---|---|
| `booking_lead_time_hours` | `(scheduledPickupTime - now) / 3_600_000`. Comes straight from the booking request body. |
| `toll_cost` | Google Routes returns tolls when called with `extraComputations: ["TOLLS"]`. Alternative: maintain a static route→toll table (Pakistan toll structure is stable, e.g. Lahore↔Islamabad motorway ~PKR 1500). |
| `dead_return_factor` | Heuristic: check whether there is matchable return demand at the destination in the scheduled return window. If yes → 1.0, if no → 1.3–1.6. **Start with a constant 1.3** and refine later once booking history exists. |
| `seats_booked` | From booking input. Parcel always 1. |
| `seat_capacity` | Constant per vehicle: `minicar` = 4, `economy` = 4, `parcel` = 1. |
| `cancellation_risk` | `(rider's cancelled bookings) / (rider's total bookings)` from the bookings table. **Default 0.1** for new riders with no history. |

### Readiness snapshot

| Source | Status |
|---|---|
| Google Routes (geometry, traffic, tolls) | ✅ wired |
| Driver locations + zone counts (Neo4j) | ✅ wired |
| Booking inputs (lead time, seats, scheduled time) | ✅ from request body |
| Server clock + day/weekend flags | ✅ trivial |
| Weather API | ❌ needs adding (Open-Meteo recommended) |
| `demand_ratio` rolling aggregator | ❌ needs adding |
| Holiday + Ramadan lookups | ❌ small JSON / npm package |
| Rider cancellation rate | ⚠️ available once bookings exist; default `0.1` until then |

---

## Fare estimate — calibration note

`estimateFare` is intentionally simple and transparent:

```
fare_before_surge = base_fare + per_km·distance_km + per_min·travel_time_min   (per_min = 0 intercity)
total_fare        = max(min_fare, fare_before_surge · surge)  (+ toll_cost for intercity)
```

The **surge multiplier is the ML output**; the fare arithmetic is plain business logic in the
config. Intercity totals currently run high (the whole long-haul base is multiplied by surge,
and shared seats aren't split). Adjust the fare formula / `fare` configs to match real CityLift
pricing policy — that's a pricing decision, not a model change.

---

## Regenerating / retraining (model owner)

Run from the **repo root** (`E:\CityLiftProject\CityLift-Backend`), not from inside `ml/`.

```bash
# Regenerate a dataset (default 100000 rows)
node ml/data/generator.js <model_name> [size]

# Train a model from its dataset
node ml/training/train.js <model_name>

# Quick checks
node ml/data/checkWeather.js <model_name>   # avg surge by weather
node ml/prediction/testPredict.js           # end-to-end serving sanity
```

Valid `<model_name>`: `bike_city`, `rickshaw_city`, `minicar_city`, `economy_city`,
`parcel_city`, `minicar_intercity`, `economy_intercity`, `parcel_intercity`.

To tune a vehicle's behavior or fares, edit its file in `ml/configs/`, then regenerate +
retrain that one model. To add a new feature, update `ml/lib/features.js` (the single source of
truth shared by training and prediction) so encoding stays consistent everywhere.

---

## Folder map

```
ml/
├── lib/        sampling.js · features.js (feature source of truth) · intercity.js
├── configs/    one file per model + index.js registry
├── data/       generator.js · checkData.js · checkWeather.js · datasets/*.csv
├── training/   train.js · normalizer.js
├── models/     <name>/ {model.json, weights.bin, normalizer.json, features.json}
└── prediction/ predictor.js (predictSurge, estimateFare) · testPredict.js
```
