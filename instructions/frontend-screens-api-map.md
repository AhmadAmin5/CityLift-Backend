# Frontend Screens and API Usage Map — Uber Clone Lab App

## 1. Purpose

This document finalizes the frontend screens/pages needed for the React + Capacitor app and maps every screen to the REST APIs and Socket.IO events it depends on.

It is designed for parallel development:

1. Frontend team builds screens against a mock server.
2. Backend team implements Node.js + Express APIs using the finalized API contract.
3. The mock server can later be replaced with the real backend without changing frontend request/response shapes.

## 2. Frontend Stack Assumptions

| Area           | Decision                           |
| -------------- | ---------------------------------- |
| Web framework  | React JS                           |
| Mobile runtime | Capacitor Android WebView          |
| Language       | Plain JavaScript, not TypeScript   |
| Maps           | Mapbox                             |
| Realtime       | Socket.IO client                   |
| API format     | JSON, snake_case keys              |
| Base API URL   | `/api/v1`                          |
| Auth           | Bearer token stored in app storage |

## 3. Screen Priority Levels

| Priority | Meaning                                               |
| -------- | ----------------------------------------------------- |
| P0       | Required for core demo and ride lifecycle             |
| P1       | Required for shortlisted features but can be simpler  |
| P2       | Admin/demo/analytics screens; useful for lab showcase |

## 4. App Navigation Groups

The app should be organized into these major flows:

1. Auth flow
2. Rider app flow
3. Driver app flow
4. Admin/demo web flow
5. Shared profile/settings flow

A single React app can route users based on `user.role` from `GET /auth/me`.

---

# 5. Auth and Shared Screens

## 5.1 Splash / App Boot Screen

| Field    | Value                                                    |
| -------- | -------------------------------------------------------- |
| Priority | P0                                                       |
| Route    | `/splash` or initial app load                            |
| Users    | rider, driver, admin                                     |
| Purpose  | Check saved token and route user to correct home screen. |

### APIs

| Method | Endpoint       | Usage                                            |
| ------ | -------------- | ------------------------------------------------ |
| GET    | `/auth/me`     | Validate token and fetch current user profile.   |
| GET    | `/maps/config` | Optional preload for Mapbox public token/config. |

### Frontend Logic

| Condition             | Navigation         |
| --------------------- | ------------------ |
| No token              | `/auth/login`      |
| User role is `rider`  | `/rider/home`      |
| User role is `driver` | `/driver/home`     |
| User role is `admin`  | `/admin/dashboard` |

---

## 5.2 Login Screen

| Field    | Value                  |
| -------- | ---------------------- |
| Priority | P0                     |
| Route    | `/auth/login`          |
| Users    | rider, driver, admin   |
| Purpose  | Log in existing users. |

### APIs

| Method | Endpoint      | Usage                            |
| ------ | ------------- | -------------------------------- |
| POST   | `/auth/login` | Submit email/phone and password. |

### Request Fields

```json
{
    "email_or_phone": "ali@example.com",
    "password": "password123"
}
```

### Success Navigation

| Role   | Navigate To        |
| ------ | ------------------ |
| rider  | `/rider/home`      |
| driver | `/driver/home`     |
| admin  | `/admin/dashboard` |

---

## 5.3 Register Rider Screen

| Field    | Value                  |
| -------- | ---------------------- |
| Priority | P0                     |
| Route    | `/auth/register/rider` |
| Users    | rider                  |
| Purpose  | Create rider account.  |

### APIs

| Method | Endpoint               | Usage                                  |
| ------ | ---------------------- | -------------------------------------- |
| POST   | `/auth/register/rider` | Create rider account and return token. |

### Request Fields

```json
{
    "name": "Ali Khan",
    "email": "ali@example.com",
    "phone": "+923001234567",
    "password": "password123"
}
```

### Success Navigation

Navigate to `/auth/verify-otp` or directly to `/rider/home` if OTP is skipped in demo mode.

---

## 5.4 Register Driver Screen

| Field    | Value                   |
| -------- | ----------------------- |
| Priority | P0                      |
| Route    | `/auth/register/driver` |
| Users    | driver                  |
| Purpose  | Create driver account.  |

### APIs

| Method | Endpoint                | Usage                                   |
| ------ | ----------------------- | --------------------------------------- |
| POST   | `/auth/register/driver` | Create driver account and return token. |

### Request Fields

```json
{
    "name": "Ahmed Raza",
    "email": "ahmed@example.com",
    "phone": "+923009876543",
    "password": "password123"
}
```

### Success Navigation

Navigate to `/driver/onboarding`.

---

## 5.5 OTP Verification Screen

| Field    | Value                              |
| -------- | ---------------------------------- |
| Priority | P1                                 |
| Route    | `/auth/verify-otp`                 |
| Users    | rider, driver                      |
| Purpose  | Mock email/phone OTP verification. |

### APIs

| Method | Endpoint           | Usage                                              |
| ------ | ------------------ | -------------------------------------------------- |
| POST   | `/auth/otp/send`   | Send mock OTP to email or phone.                   |
| POST   | `/auth/otp/verify` | Verify mock OTP and update verified timestamp.     |
| GET    | `/auth/me`         | Refresh user verification state after OTP success. |

### Frontend Notes

For the lab demo, use mock OTP such as `123456`. The screen still calls the real contract endpoints so backend replacement works.

---

## 5.6 Profile Screen

| Field    | Value                                 |
| -------- | ------------------------------------- |
| Priority | P1                                    |
| Route    | `/profile`                            |
| Users    | rider, driver, admin                  |
| Purpose  | View and update current user profile. |

### APIs

| Method | Endpoint                  | Usage                                           |
| ------ | ------------------------- | ----------------------------------------------- |
| GET    | `/auth/me`                | Fetch current user.                             |
| PATCH  | `/users/me`               | Update name, email, phone.                      |
| POST   | `/users/me/profile-photo` | Upload profile photo using multipart form data. |
| POST   | `/auth/logout`            | Logout user.                                    |

---

# 6. Rider Screens

## 6.1 Rider Home Map Screen

| Field    | Value                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------- |
| Priority | P0                                                                                                 |
| Route    | `/rider/home`                                                                                      |
| Users    | rider                                                                                              |
| Purpose  | Main rider map screen for pickup/dropoff selection, nearby drivers, surge display, and ride start. |

### APIs

| Method | Endpoint                  | Usage                                           |
| ------ | ------------------------- | ----------------------------------------------- |
| GET    | `/auth/me`                | Confirm logged-in user.                         |
| GET    | `/riders/me`              | Fetch rider profile and rating.                 |
| GET    | `/maps/config`            | Load Mapbox configuration.                      |
| GET    | `/riders/me/saved-places` | Show Home, Work, Favorites shortcuts.           |
| GET    | `/maps/reverse-geocode`   | Convert current GPS or pin location to address. |
| GET    | `/maps/nearby-drivers`    | Show nearby available drivers before booking.   |
| GET    | `/maps/surge-zones`       | Show demand/surge zones on map.                 |

### Socket.IO Events

| Direction       | Event                   | Usage                                         |
| --------------- | ----------------------- | --------------------------------------------- |
| server → client | `nearby_drivers:update` | Optional realtime refresh of nearby drivers.  |
| server → client | `surge:update`          | Optional realtime refresh of surge zone data. |

### UI States

| State                  | Description                                 |
| ---------------------- | ------------------------------------------- |
| locating_user          | Waiting for device GPS permission/location. |
| choosing_pickup        | User adjusts pickup pin.                    |
| choosing_dropoff       | User selects destination.                   |
| ready_to_estimate      | Pickup/dropoff selected.                    |
| loading_nearby_drivers | Nearby drivers loading.                     |
| surge_visible          | Demand zone overlay visible.                |

---

## 6.2 Address Search Screen / Bottom Sheet

| Field    | Value                                                      |
| -------- | ---------------------------------------------------------- |
| Priority | P0                                                         |
| Route    | `/rider/search-location` or modal/bottom sheet             |
| Users    | rider                                                      |
| Purpose  | Search pickup/dropoff addresses using Mapbox autocomplete. |

### APIs

| Method | Endpoint                  | Usage                                    |
| ------ | ------------------------- | ---------------------------------------- |
| GET    | `/maps/autocomplete`      | Search address suggestions.              |
| GET    | `/maps/reverse-geocode`   | Resolve selected map pin to address.     |
| GET    | `/riders/me/saved-places` | Show saved places in search suggestions. |

### Query Parameters for Autocomplete

```text
q=<search text>
latitude=<optional current latitude>
longitude=<optional current longitude>
```

---

## 6.3 Ride Estimate / Confirm Ride Screen

| Field    | Value                                                                         |
| -------- | ----------------------------------------------------------------------------- |
| Priority | P0                                                                            |
| Route    | `/rider/ride/confirm`                                                         |
| Users    | rider                                                                         |
| Purpose  | Show route preview, fare estimate, surge multiplier, stops, and confirm ride. |

### APIs

| Method | Endpoint              | Usage                                                  |
| ------ | --------------------- | ------------------------------------------------------ |
| POST   | `/maps/route-preview` | Fetch route polyline, ETA, distance, traffic duration. |
| POST   | `/rides/estimate`     | Calculate fare range and ML prediction.                |
| POST   | `/rides`              | Create ride request after rider confirms.              |

### Required Frontend Data

```json
{
    "ride_type": "standard",
    "scheduled_pickup_at": null,
    "recurrence_rule": null,
    "rider_note_to_driver": "Call me when arrived",
    "stops": [
        {
            "stop_order": 1,
            "stop_type": "pickup",
            "latitude": 31.5204,
            "longitude": 74.3587,
            "address": "Pickup address"
        },
        {
            "stop_order": 2,
            "stop_type": "dropoff",
            "latitude": 31.47,
            "longitude": 74.27,
            "address": "Dropoff address"
        }
    ],
    "vehicle_type": "car"
}
```

### Success Navigation

After `POST /rides`, navigate to `/rider/ride/:ride_id/searching`.

---

## 6.4 Scheduled / Recurring Ride Options Screen

| Field    | Value                                               |
| -------- | --------------------------------------------------- |
| Priority | P1                                                  |
| Route    | `/rider/ride/schedule` or modal from confirm screen |
| Users    | rider                                               |
| Purpose  | Choose standard, scheduled, or recurring ride.      |

### APIs

No immediate API is required until estimate/create ride.

### Data Passed Forward

```json
{
    "ride_type": "scheduled",
    "scheduled_pickup_at": "2026-05-25T10:00:00Z",
    "recurrence_rule": null
}
```

For recurring ride demo:

```json
{
    "ride_type": "recurring",
    "scheduled_pickup_at": "2026-05-25T10:00:00Z",
    "recurrence_rule": "FREQ=DAILY;COUNT=5"
}
```

---

## 6.5 Searching Driver Screen

| Field    | Value                                         |
| -------- | --------------------------------------------- |
| Priority | P0                                            |
| Route    | `/rider/ride/:ride_id/searching`              |
| Users    | rider                                         |
| Purpose  | Show that backend is matching nearby drivers. |

### APIs

| Method | Endpoint                 | Usage                                    |
| ------ | ------------------------ | ---------------------------------------- |
| GET    | `/rides/:ride_id`        | Fetch ride state if screen is refreshed. |
| GET    | `/rides/:ride_id/live`   | Fetch live state if available.           |
| POST   | `/rides/:ride_id/cancel` | Cancel before driver accepts.            |

### Socket.IO Events

| Direction       | Event                | Usage                                           |
| --------------- | -------------------- | ----------------------------------------------- |
| client → server | `ride:join`          | Join ride room.                                 |
| server → client | `ride:status:update` | Detect transition to `accepted` or `cancelled`. |
| server → client | `ride:cancelled`     | Show cancellation state.                        |

### Navigation Rules

| Event / Status | Navigate To                 |
| -------------- | --------------------------- |
| `accepted`     | `/rider/ride/:ride_id/live` |
| `cancelled`    | `/rider/home`               |

---

## 6.6 Rider Live Ride Tracking Screen

| Field    | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Priority | P0                                                                 |
| Route    | `/rider/ride/:ride_id/live`                                        |
| Users    | rider                                                              |
| Purpose  | Track assigned driver, ETA, route, status, and live ride progress. |

### APIs

| Method | Endpoint                 | Usage                                         |
| ------ | ------------------------ | --------------------------------------------- |
| GET    | `/rides/:ride_id`        | Fetch ride details, driver, vehicle, fare.    |
| GET    | `/rides/:ride_id/route`  | Fetch route polyline and navigation metadata. |
| GET    | `/rides/:ride_id/live`   | Fetch current live location/ETA.              |
| POST   | `/rides/:ride_id/cancel` | Cancel only before ride is started.           |

### Socket.IO Events

| Direction       | Event                | Usage                                          |
| --------------- | -------------------- | ---------------------------------------------- |
| client → server | `ride:join`          | Join ride room.                                |
| client → server | `ride:leave`         | Leave room on screen exit.                     |
| server → client | `ride:live:update`   | Update driver marker, ETA, remaining distance. |
| server → client | `ride:route:update`  | Update route after rerouting.                  |
| server → client | `ride:status:update` | Update UI for arrived, started, completed.     |
| server → client | `ride:cancelled`     | Show cancellation state.                       |

### UI by Ride Status

| Status    | UI Behavior                                      |
| --------- | ------------------------------------------------ |
| accepted  | Driver is on the way. Show driver-to-pickup ETA. |
| arrived   | Show driver arrived state.                       |
| started   | Show trip progress to destination.               |
| completed | Navigate to receipt/rating flow.                 |
| cancelled | Navigate to home with message.                   |

---

## 6.7 Ride Completion / Receipt Screen

| Field    | Value                                                                         |
| -------- | ----------------------------------------------------------------------------- |
| Priority | P0                                                                            |
| Route    | `/rider/ride/:ride_id/receipt`                                                |
| Users    | rider                                                                         |
| Purpose  | Show final fare, distance, duration, route, and mock receipt delivery status. |

### APIs

| Method | Endpoint                  | Usage                                                   |
| ------ | ------------------------- | ------------------------------------------------------- |
| GET    | `/rides/:ride_id`         | Fetch completed ride summary.                           |
| GET    | `/rides/:ride_id/receipt` | Fetch receipt object generated from ride and fare data. |

### Success Navigation

After user views receipt, navigate to `/rider/ride/:ride_id/rating` if rating not submitted.

---

## 6.8 Rate Driver Screen

| Field    | Value                                     |
| -------- | ----------------------------------------- |
| Priority | P0                                        |
| Route    | `/rider/ride/:ride_id/rating`             |
| Users    | rider                                     |
| Purpose  | Rider rates driver after ride completion. |

### APIs

| Method | Endpoint                 | Usage                                        |
| ------ | ------------------------ | -------------------------------------------- |
| POST   | `/rides/:ride_id/rating` | Submit 1–5 star rating and optional comment. |

### Request Fields

```json
{
    "rating": 5,
    "comment": "Great driver"
}
```

---

## 6.9 Rider Ride History Screen

| Field    | Value                               |
| -------- | ----------------------------------- |
| Priority | P1                                  |
| Route    | `/rider/rides`                      |
| Users    | rider                               |
| Purpose  | List rider's past and active rides. |

### APIs

| Method | Endpoint | Usage                       |
| ------ | -------- | --------------------------- |
| GET    | `/rides` | Fetch current user's rides. |

### Suggested Query Parameters

```text
status=completed&page=1&limit=20
```

---

## 6.10 Rider Ride Detail Screen

| Field    | Value                                                     |
| -------- | --------------------------------------------------------- |
| Priority | P1                                                        |
| Route    | `/rider/rides/:ride_id`                                   |
| Users    | rider                                                     |
| Purpose  | View ride details, stops, driver, fare, and receipt link. |

### APIs

| Method | Endpoint                  | Usage                                     |
| ------ | ------------------------- | ----------------------------------------- |
| GET    | `/rides/:ride_id`         | Fetch full ride details.                  |
| GET    | `/rides/:ride_id/route`   | Optional route display.                   |
| GET    | `/rides/:ride_id/receipt` | Optional receipt display/download screen. |

---

## 6.11 Saved Places Screen

| Field    | Value                             |
| -------- | --------------------------------- |
| Priority | P1                                |
| Route    | `/rider/saved-places`             |
| Users    | rider                             |
| Purpose  | Manage Home, Work, and Favorites. |

### APIs

| Method | Endpoint                                  | Usage                                   |
| ------ | ----------------------------------------- | --------------------------------------- |
| GET    | `/riders/me/saved-places`                 | List saved places.                      |
| POST   | `/riders/me/saved-places`                 | Create saved place.                     |
| PATCH  | `/riders/me/saved-places/:saved_place_id` | Update saved place.                     |
| DELETE | `/riders/me/saved-places/:saved_place_id` | Delete saved place.                     |
| GET    | `/maps/autocomplete`                      | Search address when creating/updating.  |
| GET    | `/maps/reverse-geocode`                   | Resolve map pin when creating/updating. |

---

# 7. Driver Screens

## 7.1 Driver Home / Online Map Screen

| Field    | Value                                                                                        |
| -------- | -------------------------------------------------------------------------------------------- |
| Priority | P0                                                                                           |
| Route    | `/driver/home`                                                                               |
| Users    | driver                                                                                       |
| Purpose  | Driver dashboard with online/offline toggle, current map, demand zones, and incoming offers. |

### APIs

| Method | Endpoint                   | Usage                                         |
| ------ | -------------------------- | --------------------------------------------- |
| GET    | `/drivers/me`              | Fetch driver profile, approval, availability. |
| PATCH  | `/drivers/me/availability` | Toggle online/offline.                        |
| POST   | `/drivers/me/location`     | Update latest driver location.                |
| GET    | `/maps/config`             | Load Mapbox config.                           |
| GET    | `/maps/surge-zones`        | Show demand/heatmap zones.                    |
| GET    | `/drivers/me/ride-offers`  | Fetch active/pending ride offers on refresh.  |

### Socket.IO Events

| Direction       | Event                    | Usage                          |
| --------------- | ------------------------ | ------------------------------ |
| client → server | `driver:location:update` | Send realtime driver location. |
| server → client | `ride:offer`             | Receive incoming ride request. |
| server → client | `ride:offer:expired`     | Remove expired offer.          |
| server → client | `surge:update`           | Refresh demand zones.          |

### Important UI Gate

Driver should not go online unless:

1. `approval_status = approved`
2. At least one active approved vehicle exists
3. Required documents are submitted/approved according to demo rules

---

## 7.2 Driver Onboarding Screen

| Field    | Value                                             |
| -------- | ------------------------------------------------- |
| Priority | P0                                                |
| Route    | `/driver/onboarding`                              |
| Users    | driver                                            |
| Purpose  | Guide driver through documents and vehicle setup. |

### APIs

| Method | Endpoint                                      | Usage                               |
| ------ | --------------------------------------------- | ----------------------------------- |
| GET    | `/drivers/me`                                 | Fetch approval status.              |
| GET    | `/drivers/me/documents`                       | Show uploaded documents.            |
| POST   | `/drivers/me/documents`                       | Upload CNIC, license, registration. |
| GET    | `/drivers/me/vehicles`                        | Show vehicles.                      |
| POST   | `/drivers/me/vehicles`                        | Add vehicle.                        |
| POST   | `/drivers/me/vehicles/:vehicle_id/set-active` | Select active vehicle.              |

---

## 7.3 Driver Documents Screen

| Field    | Value                                                              |
| -------- | ------------------------------------------------------------------ |
| Priority | P1                                                                 |
| Route    | `/driver/documents`                                                |
| Users    | driver                                                             |
| Purpose  | Upload and view CNIC, license, and vehicle registration documents. |

### APIs

| Method | Endpoint                | Usage                                                            |
| ------ | ----------------------- | ---------------------------------------------------------------- |
| GET    | `/drivers/me/documents` | List uploaded documents.                                         |
| POST   | `/drivers/me/documents` | Upload document using multipart form data.                       |
| GET    | `/drivers/me/vehicles`  | Needed when uploading vehicle registration for selected vehicle. |

---

## 7.4 Driver Vehicles Screen

| Field    | Value                                      |
| -------- | ------------------------------------------ |
| Priority | P1                                         |
| Route    | `/driver/vehicles`                         |
| Users    | driver                                     |
| Purpose  | Create, update, and select active vehicle. |

### APIs

| Method | Endpoint                                      | Usage                 |
| ------ | --------------------------------------------- | --------------------- |
| GET    | `/drivers/me/vehicles`                        | List driver vehicles. |
| POST   | `/drivers/me/vehicles`                        | Create vehicle.       |
| PATCH  | `/drivers/me/vehicles/:vehicle_id`            | Update vehicle.       |
| POST   | `/drivers/me/vehicles/:vehicle_id/set-active` | Set active vehicle.   |

---

## 7.5 Incoming Ride Offer Modal / Screen

| Field    | Value                                                   |
| -------- | ------------------------------------------------------- |
| Priority | P0                                                      |
| Route    | Modal over `/driver/home` or `/driver/offers/:offer_id` |
| Users    | driver                                                  |
| Purpose  | Driver accepts or declines incoming ride offer.         |

### APIs

| Method | Endpoint                                    | Usage                                |
| ------ | ------------------------------------------- | ------------------------------------ |
| GET    | `/drivers/me/ride-offers`                   | Fetch pending offers if app resumes. |
| POST   | `/drivers/me/ride-offers/:offer_id/accept`  | Accept offer.                        |
| POST   | `/drivers/me/ride-offers/:offer_id/decline` | Decline offer.                       |

### Socket.IO Events

| Direction       | Event                | Usage                   |
| --------------- | -------------------- | ----------------------- |
| server → client | `ride:offer`         | Display incoming offer. |
| server → client | `ride:offer:expired` | Close offer if expired. |

### Success Navigation

After accept, navigate to `/driver/ride/:ride_id/to-pickup`.

---

## 7.6 Driver To Pickup Navigation Screen

| Field    | Value                                                  |
| -------- | ------------------------------------------------------ |
| Priority | P0                                                     |
| Route    | `/driver/ride/:ride_id/to-pickup`                      |
| Users    | driver                                                 |
| Purpose  | Navigate driver from current location to rider pickup. |

### APIs

| Method | Endpoint                   | Usage                                              |
| ------ | -------------------------- | -------------------------------------------------- |
| GET    | `/rides/:ride_id`          | Fetch rider, pickup, note, stops, fare estimate.   |
| GET    | `/rides/:ride_id/route`    | Fetch driver-to-pickup route or current route.     |
| GET    | `/rides/:ride_id/live`     | Fetch live state after refresh.                    |
| POST   | `/rides/:ride_id/arrive`   | Mark driver arrived at pickup.                     |
| POST   | `/rides/:ride_id/cancel`   | Driver cancellation before ride starts.            |
| POST   | `/rides/:ride_id/tracking` | Submit location point if not using Socket.IO only. |

### Socket.IO Events

| Direction       | Event                    | Usage                                    |
| --------------- | ------------------------ | ---------------------------------------- |
| client → server | `ride:join`              | Join ride room.                          |
| client → server | `driver:location:update` | Update location while driving to pickup. |
| server → client | `ride:route:update`      | Update route if rerouted.                |
| server → client | `ride:status:update`     | Update state after arrive/cancel.        |

---

## 7.7 Driver Arrived / Waiting Screen

| Field    | Value                                           |
| -------- | ----------------------------------------------- |
| Priority | P0                                              |
| Route    | `/driver/ride/:ride_id/arrived`                 |
| Users    | driver                                          |
| Purpose  | Show arrived state and allow starting the ride. |

### APIs

| Method | Endpoint                 | Usage                             |
| ------ | ------------------------ | --------------------------------- |
| GET    | `/rides/:ride_id`        | Fetch pickup/rider details.       |
| POST   | `/rides/:ride_id/start`  | Start ride.                       |
| POST   | `/rides/:ride_id/cancel` | Cancel before starting if needed. |

### Socket.IO Events

| Direction       | Event                | Usage                       |
| --------------- | -------------------- | --------------------------- |
| server → client | `ride:status:update` | Sync status with rider app. |

---

## 7.8 Driver Active Trip Navigation Screen

| Field    | Value                                                                                         |
| -------- | --------------------------------------------------------------------------------------------- |
| Priority | P0                                                                                            |
| Route    | `/driver/ride/:ride_id/active`                                                                |
| Users    | driver                                                                                        |
| Purpose  | Navigate from pickup through intermediate stops to dropoff, send tracking, and complete ride. |

### APIs

| Method | Endpoint                   | Usage                                             |
| ------ | -------------------------- | ------------------------------------------------- |
| GET    | `/rides/:ride_id`          | Fetch stops, rider note, fare data.               |
| GET    | `/rides/:ride_id/route`    | Fetch pickup-to-dropoff route.                    |
| POST   | `/rides/:ride_id/tracking` | Submit GPS point.                                 |
| POST   | `/rides/:ride_id/complete` | Complete ride and trigger final fare calculation. |

### Socket.IO Events

| Direction       | Event                    | Usage                                   |
| --------------- | ------------------------ | --------------------------------------- |
| client → server | `ride:tracking:update`   | Send tracking point during active ride. |
| client → server | `driver:location:update` | Update driver latest location.          |
| server → client | `ride:route:update`      | Update route after reroute.             |
| server → client | `ride:status:update`     | Detect completion/cancellation.         |

### Completion Navigation

After successful `POST /rides/:ride_id/complete`, navigate to `/driver/ride/:ride_id/summary`.

---

## 7.9 Driver Ride Summary Screen

| Field    | Value                                                           |
| -------- | --------------------------------------------------------------- |
| Priority | P0                                                              |
| Route    | `/driver/ride/:ride_id/summary`                                 |
| Users    | driver                                                          |
| Purpose  | Show completed ride, final fare, and estimated driver earnings. |

### APIs

| Method | Endpoint                  | Usage                           |
| ------ | ------------------------- | ------------------------------- |
| GET    | `/rides/:ride_id`         | Fetch final ride/fare details.  |
| GET    | `/rides/:ride_id/receipt` | Optional receipt-style summary. |

### Frontend Calculation Allowed

Frontend may display estimated driver earning as:

```text
estimated_driver_earning = final_fare * 0.80
```

This is for display only. Official fare comes from backend.

---

## 7.10 Driver Earnings Screen

| Field    | Value                                         |
| -------- | --------------------------------------------- |
| Priority | P1                                            |
| Route    | `/driver/earnings`                            |
| Users    | driver                                        |
| Purpose  | Show daily, weekly, monthly earnings summary. |

### APIs

| Method | Endpoint               | Usage                     |
| ------ | ---------------------- | ------------------------- |
| GET    | `/drivers/me/earnings` | Fetch earnings dashboard. |

### Suggested Query Parameters

```text
period=daily
period=weekly
period=monthly
```

---

## 7.11 Driver Ratings Screen

| Field    | Value                                   |
| -------- | --------------------------------------- |
| Priority | P1                                      |
| Route    | `/driver/ratings`                       |
| Users    | driver                                  |
| Purpose  | Show average rating and rider comments. |

### APIs

| Method | Endpoint              | Usage                              |
| ------ | --------------------- | ---------------------------------- |
| GET    | `/drivers/me/ratings` | Fetch driver ratings and feedback. |

---

## 7.12 Driver Ride History Screen

| Field    | Value                                  |
| -------- | -------------------------------------- |
| Priority | P1                                     |
| Route    | `/driver/rides`                        |
| Users    | driver                                 |
| Purpose  | List driver completed/cancelled rides. |

### APIs

| Method | Endpoint | Usage                         |
| ------ | -------- | ----------------------------- |
| GET    | `/rides` | Fetch current driver's rides. |

---

# 8. Admin / Lab Demo Screens

These screens can be built as simple web pages inside the same React app or as a separate admin route group. They are useful for demonstrating database control, ML, and surge logic.

## 8.1 Admin Dashboard Screen

| Field    | Value                                                                     |
| -------- | ------------------------------------------------------------------------- |
| Priority | P2                                                                        |
| Route    | `/admin/dashboard`                                                        |
| Users    | admin                                                                     |
| Purpose  | Simple dashboard linking to pricing, documents, surge zones, and ML logs. |

### APIs

| Method | Endpoint               | Usage                              |
| ------ | ---------------------- | ---------------------------------- |
| GET    | `/auth/me`             | Confirm admin user.                |
| GET    | `/admin/pricing-rules` | Show current pricing rule summary. |
| GET    | `/maps/surge-zones`    | Show current demand/surge zones.   |

---

## 8.2 Pricing Rules Screen

| Field    | Value                                                           |
| -------- | --------------------------------------------------------------- |
| Priority | P2                                                              |
| Route    | `/admin/pricing-rules`                                          |
| Users    | admin                                                           |
| Purpose  | View/create/update base fare, per-km, per-minute, minimum fare. |

### APIs

| Method | Endpoint                                | Usage                |
| ------ | --------------------------------------- | -------------------- |
| GET    | `/admin/pricing-rules`                  | List pricing rules.  |
| POST   | `/admin/pricing-rules`                  | Create pricing rule. |
| PATCH  | `/admin/pricing-rules/:pricing_rule_id` | Update pricing rule. |

---

## 8.3 Driver Document Review Screen

| Field    | Value                               |
| -------- | ----------------------------------- |
| Priority | P2                                  |
| Route    | `/admin/driver-documents`           |
| Users    | admin                               |
| Purpose  | Approve or reject driver documents. |

### APIs

| Method | Endpoint                                      | Usage                          |
| ------ | --------------------------------------------- | ------------------------------ |
| PATCH  | `/admin/driver-documents/:document_id/review` | Approve/reject a document.     |
| PATCH  | `/admin/drivers/:driver_id/approval`          | Update driver approval status. |

### Note

The finalized API contract has review/update endpoints but no admin document listing endpoint. For fast lab delivery, use seeded/mock document IDs or show document review from a known driver profile. If a real admin listing is required later, add `GET /admin/driver-documents` deliberately to the API contract.

---

## 8.4 Surge Zone / Heatmap Admin Screen

| Field    | Value                                                                 |
| -------- | --------------------------------------------------------------------- |
| Priority | P2                                                                    |
| Route    | `/admin/surge-zones`                                                  |
| Users    | admin                                                                 |
| Purpose  | Create/update simple demand zones and demonstrate MongoDB surge data. |

### APIs

| Method | Endpoint             | Usage                   |
| ------ | -------------------- | ----------------------- |
| GET    | `/maps/surge-zones`  | Display existing zones. |
| POST   | `/admin/surge-zones` | Upsert surge zone.      |

---

## 8.5 ML Model / Prediction Logs Screen

| Field    | Value                                                   |
| -------- | ------------------------------------------------------- |
| Priority | P2                                                      |
| Route    | `/admin/ml`                                             |
| Users    | admin                                                   |
| Purpose  | Demonstrate ML model metadata and fare prediction logs. |

### APIs

| Method | Endpoint                                     | Usage                                          |
| ------ | -------------------------------------------- | ---------------------------------------------- |
| GET    | `/admin/ml-models`                           | List active ML models.                         |
| GET    | `/admin/rides/:ride_id/fare-prediction-logs` | Show ML prediction logs for a selected ride.   |
| GET    | `/rides/:ride_id`                            | Optional fetch ride final fare for comparison. |

---

# 9. Shared Reusable UI Components

The following components should be reusable across screens.

| Component           | Used In                                             | APIs/Events                                                     |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `MapboxMap`         | Rider home, driver home, live ride, admin surge map | `/maps/config`                                                  |
| `LocationSearchBox` | Rider home, saved places, confirm ride              | `/maps/autocomplete`, `/maps/reverse-geocode`                   |
| `RoutePolyline`     | Confirm ride, live ride, driver navigation          | `/maps/route-preview`, `/rides/:ride_id/route`                  |
| `FareBreakdownCard` | Estimate, receipt, driver summary                   | `/rides/estimate`, `/rides/:ride_id`, `/rides/:ride_id/receipt` |
| `DriverMarker`      | Rider map, live ride                                | `/maps/nearby-drivers`, `ride:live:update`                      |
| `SurgeOverlay`      | Rider map, driver map, admin map                    | `/maps/surge-zones`, `surge:update`                             |
| `RideStatusBadge`   | Ride detail, live ride, driver trip                 | `/rides/:ride_id`, `ride:status:update`                         |
| `RatingStars`       | Rate driver, driver ratings                         | `/rides/:ride_id/rating`, `/drivers/me/ratings`                 |

---

# 10. Recommended React Route Table

## 10.1 Public/Auth Routes

```text
/splash
/auth/login
/auth/register/rider
/auth/register/driver
/auth/verify-otp
```

## 10.2 Rider Routes

```text
/rider/home
/rider/search-location
/rider/ride/schedule
/rider/ride/confirm
/rider/ride/:ride_id/searching
/rider/ride/:ride_id/live
/rider/ride/:ride_id/receipt
/rider/ride/:ride_id/rating
/rider/rides
/rider/rides/:ride_id
/rider/saved-places
/profile
```

## 10.3 Driver Routes

```text
/driver/home
/driver/onboarding
/driver/documents
/driver/vehicles
/driver/offers/:offer_id
/driver/ride/:ride_id/to-pickup
/driver/ride/:ride_id/arrived
/driver/ride/:ride_id/active
/driver/ride/:ride_id/summary
/driver/earnings
/driver/ratings
/driver/rides
/profile
```

## 10.4 Admin Routes

```text
/admin/dashboard
/admin/pricing-rules
/admin/driver-documents
/admin/surge-zones
/admin/ml
```

---

# 11. Screen-to-API Quick Matrix

## 11.1 P0 Screens

| Screen             | Required APIs                                                                                                                         | Required Socket Events                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Splash             | `GET /auth/me`                                                                                                                        | none                                                                                         |
| Login              | `POST /auth/login`                                                                                                                    | none                                                                                         |
| Register Rider     | `POST /auth/register/rider`                                                                                                           | none                                                                                         |
| Register Driver    | `POST /auth/register/driver`                                                                                                          | none                                                                                         |
| Rider Home         | `GET /maps/config`, `GET /maps/nearby-drivers`, `GET /maps/surge-zones`, `GET /riders/me/saved-places`                                | `nearby_drivers:update`, `surge:update`                                                      |
| Address Search     | `GET /maps/autocomplete`, `GET /maps/reverse-geocode`                                                                                 | none                                                                                         |
| Ride Confirm       | `POST /maps/route-preview`, `POST /rides/estimate`, `POST /rides`                                                                     | none                                                                                         |
| Searching Driver   | `GET /rides/:ride_id`, `POST /rides/:ride_id/cancel`                                                                                  | `ride:join`, `ride:status:update`, `ride:cancelled`                                          |
| Rider Live Ride    | `GET /rides/:ride_id`, `GET /rides/:ride_id/route`, `GET /rides/:ride_id/live`, `POST /rides/:ride_id/cancel`                         | `ride:join`, `ride:live:update`, `ride:route:update`, `ride:status:update`, `ride:cancelled` |
| Receipt            | `GET /rides/:ride_id/receipt`, `GET /rides/:ride_id`                                                                                  | none                                                                                         |
| Rate Driver        | `POST /rides/:ride_id/rating`                                                                                                         | none                                                                                         |
| Driver Home        | `GET /drivers/me`, `PATCH /drivers/me/availability`, `POST /drivers/me/location`, `GET /maps/surge-zones`                             | `driver:location:update`, `ride:offer`, `ride:offer:expired`, `surge:update`                 |
| Driver Onboarding  | `GET /drivers/me`, `GET /drivers/me/documents`, `POST /drivers/me/documents`, `GET /drivers/me/vehicles`, `POST /drivers/me/vehicles` | none                                                                                         |
| Incoming Offer     | `GET /drivers/me/ride-offers`, `POST /drivers/me/ride-offers/:offer_id/accept`, `POST /drivers/me/ride-offers/:offer_id/decline`      | `ride:offer`, `ride:offer:expired`                                                           |
| Driver To Pickup   | `GET /rides/:ride_id`, `GET /rides/:ride_id/route`, `POST /rides/:ride_id/arrive`, `POST /rides/:ride_id/tracking`                    | `ride:join`, `driver:location:update`, `ride:status:update`, `ride:route:update`             |
| Driver Arrived     | `GET /rides/:ride_id`, `POST /rides/:ride_id/start`                                                                                   | `ride:status:update`                                                                         |
| Driver Active Trip | `GET /rides/:ride_id`, `GET /rides/:ride_id/route`, `POST /rides/:ride_id/tracking`, `POST /rides/:ride_id/complete`                  | `ride:tracking:update`, `driver:location:update`, `ride:route:update`, `ride:status:update`  |
| Driver Summary     | `GET /rides/:ride_id`, `GET /rides/:ride_id/receipt`                                                                                  | none                                                                                         |

## 11.2 P1 Screens

| Screen                 | Required APIs                                                                             | Required Socket Events |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------- |
| OTP Verification       | `POST /auth/otp/send`, `POST /auth/otp/verify`, `GET /auth/me`                            | none                   |
| Profile                | `GET /auth/me`, `PATCH /users/me`, `POST /users/me/profile-photo`, `POST /auth/logout`    | none                   |
| Scheduled Ride Options | none directly; passes fields to `/rides/estimate` and `/rides`                            | none                   |
| Rider Ride History     | `GET /rides`                                                                              | none                   |
| Rider Ride Detail      | `GET /rides/:ride_id`, `GET /rides/:ride_id/route`, `GET /rides/:ride_id/receipt`         | none                   |
| Saved Places           | `GET/POST/PATCH/DELETE /riders/me/saved-places` plus map search APIs                      | none                   |
| Driver Documents       | `GET /drivers/me/documents`, `POST /drivers/me/documents`, `GET /drivers/me/vehicles`     | none                   |
| Driver Vehicles        | `GET/POST/PATCH /drivers/me/vehicles`, `POST /drivers/me/vehicles/:vehicle_id/set-active` | none                   |
| Driver Earnings        | `GET /drivers/me/earnings`                                                                | none                   |
| Driver Ratings         | `GET /drivers/me/ratings`                                                                 | none                   |
| Driver Ride History    | `GET /rides`                                                                              | none                   |

## 11.3 P2 Screens

| Screen          | Required APIs                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Admin Dashboard | `GET /auth/me`, `GET /admin/pricing-rules`, `GET /maps/surge-zones`                                    |
| Pricing Rules   | `GET /admin/pricing-rules`, `POST /admin/pricing-rules`, `PATCH /admin/pricing-rules/:pricing_rule_id` |
| Document Review | `PATCH /admin/driver-documents/:document_id/review`, `PATCH /admin/drivers/:driver_id/approval`        |
| Surge Zones     | `GET /maps/surge-zones`, `POST /admin/surge-zones`                                                     |
| ML Logs         | `GET /admin/ml-models`, `GET /admin/rides/:ride_id/fare-prediction-logs`, `GET /rides/:ride_id`        |

---

# 12. Mock Server Requirements for Frontend

The mock server must simulate these flows accurately.

## 12.1 Auth Flow

1. Login returns `access_token`, `user`, and role-specific profile.
2. Register rider returns rider role and rider profile.
3. Register driver returns driver role and driver profile.
4. `GET /auth/me` must return the same logged-in user from mock storage.

## 12.2 Rider Ride Flow

Mock server should support this complete flow:

```text
POST /rides/estimate
POST /rides
GET /rides/:ride_id => status searching_driver
Socket ride:status:update => accepted
GET /rides/:ride_id/live
Socket ride:live:update repeated
Socket ride:status:update => arrived
Socket ride:status:update => started
Socket ride:status:update => completed
GET /rides/:ride_id/receipt
POST /rides/:ride_id/rating
```

## 12.3 Driver Ride Flow

Mock server should support:

```text
PATCH /drivers/me/availability
Socket ride:offer
POST /drivers/me/ride-offers/:offer_id/accept
POST /rides/:ride_id/arrive
POST /rides/:ride_id/start
POST /rides/:ride_id/tracking
POST /rides/:ride_id/complete
GET /drivers/me/earnings
```

## 12.4 Realtime Simulation

For frontend testing, mock Socket.IO should emit:

1. `ride:offer` to online driver.
2. `ride:status:update` to rider and driver.
3. `ride:live:update` every few seconds during active ride.
4. `nearby_drivers:update` on rider home.
5. `surge:update` on map screens.

---

# 13. Final Build Recommendation

## Phase 1 — Core Demo Build

Build these first:

1. Auth login/register
2. Rider home map
3. Address search
4. Ride estimate/confirm
5. Searching driver
6. Driver home
7. Incoming ride offer
8. Driver to pickup
9. Driver active trip
10. Rider live tracking
11. Ride receipt
12. Rating

## Phase 2 — Required Feature Completion

Then build:

1. Driver onboarding
2. Vehicle management
3. Document upload
4. Saved places
5. Scheduled/recurring ride inputs
6. Ride history
7. Earnings
8. Driver ratings

## Phase 3 — Lab Showcase Screens

Finally build:

1. Admin pricing rules
2. Admin surge zones / heatmap
3. ML logs screen
4. Driver document approval demo

---

# 14. Final Screen List

## P0 Must Build

```text
Splash / App Boot
Login
Register Rider
Register Driver
Rider Home Map
Address Search
Ride Estimate / Confirm Ride
Searching Driver
Rider Live Ride Tracking
Ride Receipt
Rate Driver
Driver Home / Online Map
Driver Onboarding
Incoming Ride Offer
Driver To Pickup Navigation
Driver Arrived / Waiting
Driver Active Trip Navigation
Driver Ride Summary
```

## P1 Should Build

```text
OTP Verification
Profile
Saved Places
Scheduled / Recurring Ride Options
Rider Ride History
Rider Ride Detail
Driver Documents
Driver Vehicles
Driver Earnings
Driver Ratings
Driver Ride History
```

## P2 Lab Showcase

```text
Admin Dashboard
Pricing Rules
Driver Document Review
Surge Zone / Heatmap Admin
ML Model / Prediction Logs
```
