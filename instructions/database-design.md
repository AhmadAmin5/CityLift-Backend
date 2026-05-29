# Uber Clone Database Design

## 1. Project Context

This document describes the database design for a simplified Uber-like ride-hailing application built as a lab project.

The system uses three databases:

1. **PostgreSQL** for official transactional records.
2. **MongoDB** for live map, route, tracking, and traffic-related data.
3. **Neo4j** for relationship-based data such as riders, drivers, rides, and areas.

The application focuses mainly on:

- rider and driver registration
- vehicle management
- requesting a ride
- finding nearby drivers
- map-based route calculation
- traffic-aware ETA
- pre-ride fare estimation
- final fare calculation after ride completion
- ride tracking
- ratings
- simple graph relationships

This version is intentionally simplified for a lab project. The goal is to show a realistic architecture without making the system too complex to implement.

---

## 2. Important Fare Policy Change

The fare is **not fixed at the start of the ride**.

Instead, the rider sees a **pre-ride estimated fare** before confirming the ride. Once the rider accepts the estimate, the ride starts. At the end of the ride, the system calculates the **final fare** using actual ride data.

### Fare Policy

```text
Pre-ride fare = estimated fare shown to rider before ride starts
Final fare = actual fare calculated after ride completion
```

The final fare may be higher or lower than the estimated fare depending on:

- actual distance travelled
- actual ride duration
- actual traffic delay
- waiting time
- route changes
- surge multiplier
- minimum fare rule

### ML Role in Fare Calculation

Machine learning is used for prediction and comparison, not as the only billing authority.

The recommended approach is:

```text
ML predicts fare.
Formula calculates the final charged fare.
```

This makes the project easier to explain because the final fare can be broken down clearly.

Example:

```text
Pre-ride ML predicted fare: PKR 720
Pre-ride formula estimate: PKR 700
Estimated range shown to rider: PKR 630 - PKR 770

Final actual distance: 9 km
Final actual duration: 28 minutes
Final fare charged: PKR 868
```

---

## 3. Database Responsibility Split

| Database   | Main Responsibility    | Data Stored                                                             |
| ---------- | ---------------------- | ----------------------------------------------------------------------- |
| PostgreSQL | Source of truth        | users, drivers, vehicles, rides, fares, ratings, final fare             |
| MongoDB    | Live and flexible data | GPS tracking, routes, traffic snapshots, live ETA, fare prediction logs |
| Neo4j      | Relationship data      | rider-driver-ride-area graph relationships                              |

### Why This Split?

PostgreSQL is used for data that must be correct, consistent, and transactional.

MongoDB is used for data that changes frequently or has flexible structure, especially map and live tracking data.

Neo4j is used to show relationships between riders, drivers, rides, and areas without complicating the relational database.

---

## 4. High-Level System Flow

```text
1. Rider selects pickup and dropoff on map.
2. Backend calls routing/traffic API.
3. Backend receives estimated distance, duration, traffic duration, and route polyline.
4. Fare service calculates pre-ride formula estimate.
5. ML model predicts pre-ride fare.
6. App shows estimated fare range to rider.
7. Rider accepts the estimate.
8. Ride is created in PostgreSQL.
9. Route and map data are stored in MongoDB.
10. Nearby driver is found using MongoDB location data.
11. Driver accepts ride.
12. Ride starts.
13. Driver GPS updates are stored in MongoDB.
14. Traffic and ETA updates are recorded during the ride.
15. Ride completes.
16. Backend summarizes actual distance, actual time, traffic delay, and waiting time.
17. Final fare is calculated using actual ride data.
18. PostgreSQL stores final fare.
19. Rider rates driver.
20. Neo4j stores rider-driver-ride-area relationships.
```

---

## 5. PostgreSQL Design

PostgreSQL stores the official application data. It is the source of truth for users, rides, fares, vehicles, and ratings.

### 5.1 PostgreSQL Tables Overview

| Table               | Purpose                                               |
| ------------------- | ----------------------------------------------------- |
| users               | Common account table for riders and drivers           |
| riders              | Rider-specific profile                                |
| drivers             | Driver-specific profile                               |
| vehicles            | Driver vehicle information                            |
| rides               | Main ride record                                      |
| ride_stops          | Pickup, dropoff, and optional intermediate stops      |
| ride_fares          | Pre-ride estimate and final fare data                 |
| pricing_rules       | Base fare, per km rate, per minute rate, minimum fare |
| ml_models           | ML model version metadata                             |
| ratings             | Rider rating for driver                               |
| ride_status_history | Audit trail of ride status changes                    |

---

## 5.2 `users`

Stores common user account information.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('rider', 'driver', 'admin')),
    profile_photo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Notes

- Every rider and driver starts as a user.
- The `role` column tells whether the user is a rider, driver, or admin.
- Passwords should never be stored directly; only password hashes should be stored.

---

## 5.3 `riders`

Stores rider-specific profile data.

```sql
CREATE TABLE riders (
    id UUID PRIMARY KEY,
    user_id UUID UNIQUE REFERENCES users(id),
    average_rating NUMERIC(3,2) DEFAULT 5.00,
    total_rides INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Notes

- `average_rating` can be used later if driver-to-rider ratings are added.
- `total_rides` is updated after completed rides.

---

## 5.4 `drivers`

Stores driver profile and availability.

```sql
CREATE TABLE drivers (
    id UUID PRIMARY KEY,
    user_id UUID UNIQUE REFERENCES users(id),
    average_rating NUMERIC(3,2) DEFAULT 5.00,
    total_rides INT DEFAULT 0,
    is_available BOOLEAN DEFAULT false,
    approval_status VARCHAR(20) DEFAULT 'pending'
        CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Notes

- `is_available` is used for matching.
- For the lab project, document verification can be simplified or skipped.
- If driver documents are needed, store file URLs in a separate table later.

---

## 5.5 `vehicles`

Stores vehicle details for drivers.

```sql
CREATE TABLE vehicles (
    id UUID PRIMARY KEY,
    driver_id UUID REFERENCES drivers(id),
    make VARCHAR(50),
    model VARCHAR(50),
    year INT,
    plate_number VARCHAR(30) UNIQUE,
    color VARCHAR(30),
    vehicle_type VARCHAR(30) DEFAULT 'car',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Notes

- One driver can have one or more vehicles.
- For the lab project, one active vehicle per driver is enough.

---

## 5.6 `rides`

Stores the official ride record.

```sql
CREATE TABLE rides (
    id UUID PRIMARY KEY,
    rider_id UUID REFERENCES riders(id),
    driver_id UUID REFERENCES drivers(id),
    vehicle_id UUID REFERENCES vehicles(id),

    pickup_latitude DECIMAL(10,7) NOT NULL,
    pickup_longitude DECIMAL(10,7) NOT NULL,
    pickup_address TEXT,

    dropoff_latitude DECIMAL(10,7) NOT NULL,
    dropoff_longitude DECIMAL(10,7) NOT NULL,
    dropoff_address TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'requested'
        CHECK (status IN (
            'requested',
            'driver_assigned',
            'accepted',
            'arrived',
            'started',
            'completed',
            'cancelled'
        )),

    selected_route_id VARCHAR(100),

    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    cancelled_at TIMESTAMP
);
```

### Notes

- The ride starts with status `requested`.
- When a driver accepts, the status becomes `accepted`.
- When the driver starts the ride, the status becomes `started`.
- When the ride ends, the status becomes `completed`.
- `selected_route_id` points to route details stored in MongoDB.

---

## 5.7 `ride_stops`

Stores pickup, dropoff, and optional intermediate stops.

For the lab project, intermediate stops are optional. However, keeping this table makes the design flexible.

```sql
CREATE TABLE ride_stops (
    id UUID PRIMARY KEY,
    ride_id UUID REFERENCES rides(id),
    stop_order INT NOT NULL,
    stop_type VARCHAR(20) NOT NULL CHECK (stop_type IN ('pickup', 'intermediate', 'dropoff')),
    latitude DECIMAL(10,7) NOT NULL,
    longitude DECIMAL(10,7) NOT NULL,
    address TEXT,
    arrived_at TIMESTAMP,
    departed_at TIMESTAMP
);
```

### Notes

- For a normal ride, there will be two rows: pickup and dropoff.
- For a multi-stop ride, intermediate stops can be added.

---

## 5.8 `pricing_rules`

Stores configurable fare rules.

```sql
CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY,
    city VARCHAR(100) DEFAULT 'default',
    vehicle_type VARCHAR(30) DEFAULT 'car',

    base_fare NUMERIC(10,2) NOT NULL,
    per_km_rate NUMERIC(10,2) NOT NULL,
    per_min_rate NUMERIC(10,2) NOT NULL,
    waiting_per_min_rate NUMERIC(10,2) DEFAULT 0,
    traffic_delay_per_min_rate NUMERIC(10,2) DEFAULT 0,
    minimum_fare NUMERIC(10,2) NOT NULL,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Example Data

```sql
INSERT INTO pricing_rules (
    id,
    city,
    vehicle_type,
    base_fare,
    per_km_rate,
    per_min_rate,
    waiting_per_min_rate,
    traffic_delay_per_min_rate,
    minimum_fare
) VALUES (
    gen_random_uuid(),
    'Lahore',
    'car',
    100,
    40,
    8,
    5,
    4,
    250
);
```

---

## 5.9 `ride_fares`

This is one of the most important tables in the system.

It stores:

- pre-ride estimated values
- ML-predicted fare
- formula-based estimated fare
- estimated fare range
- actual completed ride values
- final formula fare
- final ML predicted fare
- final charged fare

```sql
CREATE TABLE ride_fares (
    id UUID PRIMARY KEY,
    ride_id UUID UNIQUE REFERENCES rides(id),

    -- Pre-ride estimated values from routing API
    estimated_distance_km NUMERIC(8,2),
    estimated_duration_min INT,
    estimated_traffic_delay_min INT,

    -- Pre-ride fare prediction
    pre_ride_ml_predicted_fare NUMERIC(10,2),
    pre_ride_formula_fare NUMERIC(10,2),
    estimated_min_fare NUMERIC(10,2),
    estimated_max_fare NUMERIC(10,2),

    -- Actual completed ride values
    actual_distance_km NUMERIC(8,2),
    actual_duration_min INT,
    actual_traffic_delay_min INT,
    waiting_time_min INT DEFAULT 0,

    -- Pricing values copied from pricing_rules at ride time
    base_fare NUMERIC(10,2),
    per_km_rate NUMERIC(10,2),
    per_min_rate NUMERIC(10,2),
    waiting_per_min_rate NUMERIC(10,2),
    traffic_delay_per_min_rate NUMERIC(10,2),
    surge_multiplier NUMERIC(4,2) DEFAULT 1.00,
    minimum_fare NUMERIC(10,2),

    -- Final fare values
    final_ml_predicted_fare NUMERIC(10,2),
    final_formula_fare NUMERIC(10,2),
    final_fare NUMERIC(10,2),

    fare_policy VARCHAR(30) DEFAULT 'metered_after_ride',
    model_used VARCHAR(100),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finalized_at TIMESTAMP
);
```

### Why Pricing Values Are Copied

The pricing rates are copied into `ride_fares` when the ride is created.

This is important because pricing rules may change later. The old ride should still keep the fare rules that were active at the time of booking.

---

## 5.10 Fare Calculation Logic

### Pre-Ride Formula Estimate

```text
pre_ride_formula_fare =
max(
    minimum_fare,
    (
        base_fare
        + estimated_distance_km * per_km_rate
        + estimated_duration_min * per_min_rate
        + estimated_traffic_delay_min * traffic_delay_per_min_rate
    ) * surge_multiplier
)
```

### Estimated Fare Range

For the lab project, use a simple 10 percent range.

```text
estimated_min_fare = pre_ride_formula_fare * 0.90
estimated_max_fare = pre_ride_formula_fare * 1.10
```

This is shown to the rider before confirmation.

Example:

```text
Pre-ride formula fare: PKR 700
Estimated min fare: PKR 630
Estimated max fare: PKR 770
```

### Final Fare Formula

At the end of the ride:

```text
final_formula_fare =
max(
    minimum_fare,
    (
        base_fare
        + actual_distance_km * per_km_rate
        + actual_duration_min * per_min_rate
        + waiting_time_min * waiting_per_min_rate
        + actual_traffic_delay_min * traffic_delay_per_min_rate
    ) * surge_multiplier
)
```

The final charged fare is:

```text
final_fare = final_formula_fare
```

### ML Final Fare

The ML model can also predict a final fare using actual ride data:

```text
final_ml_predicted_fare = ML_MODEL.predict(
    actual_distance_km,
    actual_duration_min,
    actual_traffic_delay_min,
    waiting_time_min,
    surge_multiplier,
    hour_of_day,
    vehicle_type
)
```

But for the lab project, the charged fare should still be the formula-based final fare.

```text
ML fare = prediction and comparison
Formula fare = actual charged fare
```

---

## 5.11 `ml_models`

Stores metadata about ML models used for fare prediction.

```sql
CREATE TABLE ml_models (
    id UUID PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    model_type VARCHAR(50) NOT NULL,
    algorithm VARCHAR(100),
    version VARCHAR(50),
    metrics JSONB,
    artifact_path TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Example

```text
model_name: fare_prediction_linear_regression
model_type: fare_prediction
algorithm: Linear Regression
version: v1
metrics: {"mae": 42.5, "rmse": 60.2}
```

---

## 5.12 `ratings`

Stores rider rating for driver after ride completion.

```sql
CREATE TABLE ratings (
    id UUID PRIMARY KEY,
    ride_id UUID UNIQUE REFERENCES rides(id),
    rider_id UUID REFERENCES riders(id),
    driver_id UUID REFERENCES drivers(id),
    rating INT CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Notes

- For the lab project, only rider rates driver.
- Driver average rating can be updated after a new rating is inserted.

---

## 5.13 `ride_status_history`

Stores ride status changes for debugging and audit purposes.

```sql
CREATE TABLE ride_status_history (
    id UUID PRIMARY KEY,
    ride_id UUID REFERENCES rides(id),
    old_status VARCHAR(30),
    new_status VARCHAR(30),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by_user_id UUID REFERENCES users(id)
);
```

---

## 5.14 PostgreSQL Indexes

```sql
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_rides_rider_id ON rides(rider_id);
CREATE INDEX idx_rides_driver_id ON rides(driver_id);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_ride_fares_ride_id ON ride_fares(ride_id);
CREATE INDEX idx_ratings_driver_id ON ratings(driver_id);
```

---

## 6. MongoDB Design

MongoDB stores live and flexible data. It is especially important for map navigation, route data, live tracking, and traffic-related data.

PostgreSQL should not store every GPS point because that data can become large quickly. MongoDB is better for this kind of high-frequency data.

---

## 6.1 MongoDB Collections Overview

| Collection           | Purpose                                                      |
| -------------------- | ------------------------------------------------------------ |
| driver_locations     | Latest location of available drivers                         |
| ride_routes          | Route geometry, route steps, polyline, ETA, traffic duration |
| ride_tracking        | Live GPS points during the ride                              |
| ride_live_state      | Current state of active ride                                 |
| traffic_snapshots    | Traffic observations collected during ride                   |
| fare_prediction_logs | ML input/output logs                                         |
| ride_summaries       | End-of-ride summary used for final fare                      |

---

## 6.2 `driver_locations`

Stores the latest location of each driver.

```json
{
    "driver_id": "driver_uuid",
    "vehicle_id": "vehicle_uuid",
    "is_available": true,
    "location": {
        "type": "Point",
        "coordinates": [74.3587, 31.5204]
    },
    "heading": 90,
    "speed_kmph": 35,
    "updated_at": "2026-05-21T10:30:00Z"
}
```

### Indexes

```javascript
db.driver_locations.createIndex({ location: "2dsphere" });
db.driver_locations.createIndex({ is_available: 1, updated_at: -1 });
```

### Used For

- finding nearby drivers
- showing nearby drivers on rider map
- updating driver availability

---

## 6.3 `ride_routes`

Stores route data returned by a third-party map API such as TomTom, Mapbox, or Google Routes.

```json
{
    "_id": "route_123",
    "ride_id": "ride_uuid",
    "route_type": "pickup_to_dropoff",
    "provider": "tomtom",
    "selected": true,
    "distance_km": 12.4,
    "normal_duration_min": 26,
    "traffic_duration_min": 33,
    "traffic_delay_min": 7,
    "polyline": "encoded_polyline_here",
    "steps": [
        {
            "instruction": "Turn left onto Main Boulevard",
            "distance_meters": 400,
            "duration_seconds": 60
        }
    ],
    "created_at": "2026-05-21T10:20:00Z"
}
```

### Route Types

```text
driver_to_pickup
pickup_to_dropoff
rerouted
changed_destination
```

### Used For

- route display on map
- driver navigation
- ETA calculation
- fare estimation
- traffic delay calculation

---

## 6.4 `ride_tracking`

Stores GPS points during the ride.

```json
{
    "ride_id": "ride_uuid",
    "driver_id": "driver_uuid",
    "location": {
        "type": "Point",
        "coordinates": [74.3587, 31.5204]
    },
    "speed_kmph": 34,
    "heading": 88,
    "traffic_level": "medium",
    "timestamp": "2026-05-21T10:35:00Z"
}
```

### Indexes

```javascript
db.ride_tracking.createIndex({ ride_id: 1, timestamp: 1 });
db.ride_tracking.createIndex({ location: "2dsphere" });
```

### Used For

- live tracking
- route replay
- actual distance calculation
- actual duration calculation
- traffic observation
- final fare calculation

---

## 6.5 `ride_live_state`

Stores the current state of an active ride.

```json
{
    "_id": "ride_uuid",
    "ride_id": "ride_uuid",
    "driver_id": "driver_uuid",
    "rider_id": "rider_uuid",
    "status": "started",
    "current_location": {
        "type": "Point",
        "coordinates": [74.3587, 31.5204]
    },
    "current_route_id": "route_123",
    "eta_min": 14,
    "distance_remaining_km": 6.3,
    "updated_at": "2026-05-21T10:40:00Z"
}
```

### Used For

- rider live map
- driver current navigation state
- current ETA display
- live ride progress

---

## 6.6 `traffic_snapshots`

Stores traffic conditions observed during the ride.

```json
{
    "ride_id": "ride_uuid",
    "route_id": "route_123",
    "traffic_level": "heavy",
    "normal_duration_min": 20,
    "traffic_duration_min": 28,
    "traffic_delay_min": 8,
    "source": "tomtom",
    "recorded_at": "2026-05-21T10:45:00Z"
}
```

### Used For

- actual traffic delay calculation
- fare prediction
- final fare summary
- ML training data

---

## 6.7 `fare_prediction_logs`

Stores ML prediction input and output.

```json
{
    "ride_id": "ride_uuid",
    "prediction_stage": "pre_ride",
    "model": "LinearRegression_v1",
    "features": {
        "distance_km": 12.4,
        "duration_min": 33,
        "traffic_delay_min": 7,
        "surge_multiplier": 1.2,
        "hour_of_day": 18,
        "is_peak_hour": true
    },
    "predicted_fare": 720,
    "created_at": "2026-05-21T10:21:00Z"
}
```

### Prediction Stages

```text
pre_ride
mid_ride
final_after_ride
```

### Used For

- ML debugging
- model comparison
- project report graphs
- calculating prediction error

---

## 6.8 `ride_summaries`

Stores summarized actual ride data after completion.

```json
{
    "ride_id": "ride_uuid",
    "actual_distance_km": 9.0,
    "actual_duration_min": 28,
    "actual_traffic_delay_min": 6,
    "waiting_time_min": 3,
    "route_changed": false,
    "completed_at": "2026-05-21T12:55:00Z"
}
```

### Used For

- final fare calculation
- copying final actual values into PostgreSQL `ride_fares`
- ML training data
- admin/debug view

---

## 7. Neo4j Design

Neo4j stores relationships between riders, drivers, rides, and areas.

For the lab project, Neo4j should remain simple. It should not store live GPS points or full route geometry.

---

## 7.1 Neo4j Nodes

### Rider Node

```cypher
(:Rider {
  id: "rider_uuid",
  name: "Ali",
  average_rating: 5.0
})
```

### Driver Node

```cypher
(:Driver {
  id: "driver_uuid",
  name: "Ahmed",
  average_rating: 4.8,
  is_available: true
})
```

### Ride Node

```cypher
(:Ride {
  id: "ride_uuid",
  status: "completed",
  final_fare: 868
})
```

### Area Node

```cypher
(:Area {
  name: "Gulberg",
  city: "Lahore"
})
```

---

## 7.2 Neo4j Relationships

```cypher
(:Rider)-[:REQUESTED]->(:Ride)
```

Shows which rider requested a ride.

```cypher
(:Driver)-[:ACCEPTED]->(:Ride)
```

Shows which driver accepted the ride.

```cypher
(:Driver)-[:COMPLETED]->(:Ride)
```

Shows which driver completed the ride.

```cypher
(:Ride)-[:STARTED_IN]->(:Area)
```

Shows pickup area.

```cypher
(:Ride)-[:ENDED_IN]->(:Area)
```

Shows dropoff area.

```cypher
(:Rider)-[:RATED {stars: 5}]->(:Driver)
```

Stores rider rating for driver.

```cypher
(:Driver)-[:CURRENTLY_IN]->(:Area)
```

Shows driver's current operating area.

---

## 7.3 Neo4j Example Queries

### Find rides completed by a driver

```cypher
MATCH (d:Driver {id: $driverId})-[:COMPLETED]->(r:Ride)
RETURN r
```

### Find drivers operating in an area

```cypher
MATCH (d:Driver)-[:CURRENTLY_IN]->(a:Area {name: $areaName})
RETURN d
ORDER BY d.average_rating DESC
```

### Find rider-driver history

```cypher
MATCH (rider:Rider {id: $riderId})-[:REQUESTED]->(ride:Ride)<-[:COMPLETED]-(driver:Driver)
RETURN ride, driver
```

### Find top-rated drivers

```cypher
MATCH (d:Driver)
RETURN d.id, d.name, d.average_rating
ORDER BY d.average_rating DESC
LIMIT 10
```

---

## 8. Route and Navigation Flow

The map and route system is a major part of the application.

Use a third-party map API for:

- route calculation
- route polyline
- estimated duration
- traffic-aware duration
- navigation steps
- ETA

Recommended APIs:

- TomTom Routing API
- Mapbox Directions API
- Google Routes API

For the lab project, TomTom or Mapbox is recommended because they are easier to integrate for demos.

---

## 8.1 Pre-Ride Route Flow

```text
1. Rider chooses pickup and dropoff.
2. Backend sends pickup and dropoff to map API.
3. Map API returns routes.
4. Backend selects the fastest traffic-aware route.
5. Backend stores selected route in MongoDB `ride_routes`.
6. Backend calculates estimated fare.
7. Rider sees estimated fare range.
```

---

## 8.2 Driver-to-Pickup Route Flow

```text
1. Driver accepts ride.
2. Backend takes driver current location from MongoDB.
3. Backend calls route API from driver location to pickup.
4. Route is stored in MongoDB with route_type = driver_to_pickup.
5. Driver app displays route.
6. Rider app displays driver ETA.
```

---

## 8.3 Ride Route Flow

```text
1. Driver reaches pickup.
2. Driver starts ride.
3. Backend activates pickup_to_dropoff route.
4. Driver follows route.
5. Driver GPS points are stored in MongoDB.
6. Rider sees driver marker moving on map.
7. ETA updates are shown during ride.
```

---

## 8.4 Rerouting Flow

Rerouting is needed when:

- driver goes far away from current route
- rider changes destination
- traffic route changes significantly

For the lab project, only implement simple rerouting:

```text
If driver is more than 100 meters away from route, call routing API again.
```

Flow:

```text
1. Driver location update arrives.
2. Backend checks distance from route.
3. If off-route, backend calls route API again.
4. New route is stored in MongoDB.
5. Driver app receives new route.
```

---

## 9. Fare Calculation Flow in Detail

---

## 9.1 Pre-Ride Fare Estimation

Input data:

```text
estimated_distance_km
estimated_duration_min
estimated_traffic_delay_min
surge_multiplier
vehicle_type
hour_of_day
is_peak_hour
```

The system calculates:

```text
pre_ride_formula_fare
pre_ride_ml_predicted_fare
estimated_min_fare
estimated_max_fare
```

The rider sees:

```text
Estimated fare: PKR 630 - PKR 770
```

The rider accepts this estimate.

---

## 9.2 During Ride Data Collection

During ride, the system collects:

```text
GPS points
speed
route progress
traffic snapshots
waiting time
ETA changes
route deviation
```

This data is stored in MongoDB.

---

## 9.3 End-of-Ride Summary

At the end of the ride, MongoDB data is summarized into:

```text
actual_distance_km
actual_duration_min
actual_traffic_delay_min
waiting_time_min
route_changed
```

This summary is saved in MongoDB `ride_summaries` and copied into PostgreSQL `ride_fares`.

---

## 9.4 Final Fare Calculation

The final charged fare is calculated using actual ride values.

```text
final_fare = max(
    minimum_fare,
    (
        base_fare
        + actual_distance_km * per_km_rate
        + actual_duration_min * per_min_rate
        + waiting_time_min * waiting_per_min_rate
        + actual_traffic_delay_min * traffic_delay_per_min_rate
    ) * surge_multiplier
)
```

---

## 9.5 ML Prediction Error

For the project report, you can compare ML predicted fare with actual final fare.

```text
prediction_error = final_fare - pre_ride_ml_predicted_fare
```

Example:

```text
Final fare: PKR 868
Pre-ride ML predicted fare: PKR 720
Prediction error: PKR 148
```

This is useful for evaluating the ML model.

---

## 10. Driver Matching Flow

For the lab project, use MongoDB geospatial search.

```text
1. Rider confirms ride.
2. Backend searches MongoDB `driver_locations`.
3. Find available drivers within 3 km of pickup.
4. Sort by distance and rating.
5. Send ride request to nearest driver.
6. Driver accepts or declines.
7. If accepted, update PostgreSQL ride record.
8. Set driver availability to false in MongoDB.
9. Store relationship in Neo4j.
```

Example MongoDB query:

```javascript
db.driver_locations.find({
    is_available: true,
    location: {
        $near: {
            $geometry: {
                type: "Point",
                coordinates: [pickupLng, pickupLat]
            },
            $maxDistance: 3000
        }
    }
});
```

---

## 11. Data Synchronization Between Databases

Because the system uses three databases, the application backend should control synchronization.

### When Ride Is Created

PostgreSQL:

```text
Create ride
Create ride_fares row
```

MongoDB:

```text
Store selected route
Store ride_live_state
```

Neo4j:

```text
Create Rider-Ride relationship
Create Ride-Area relationships
```

---

### When Driver Accepts

PostgreSQL:

```text
Update ride.driver_id
Update ride.status = accepted
```

MongoDB:

```text
Set driver is_available = false
Create driver_to_pickup route
```

Neo4j:

```text
Create Driver-ACCEPTED-Ride relationship
```

---

### During Ride

PostgreSQL:

```text
Only store important status changes
```

MongoDB:

```text
Store GPS points
Update live state
Store traffic snapshots
Store ETA updates
```

Neo4j:

```text
No frequent updates required
```

---

### When Ride Completes

PostgreSQL:

```text
Update ride.status = completed
Update actual fare values
Save final fare
```

MongoDB:

```text
Save ride summary
Keep tracking history
```

Neo4j:

```text
Create Driver-COMPLETED-Ride relationship
```

---

## 12. Recommended Lab Implementation Order

Build the project in this order:

```text
1. PostgreSQL users, riders, drivers, vehicles
2. MongoDB driver location updates
3. Ride request creation
4. Route API integration
5. Pre-ride fare estimate
6. Driver matching using MongoDB geospatial query
7. Driver accepts ride
8. Live ride tracking with MongoDB
9. Final ride summary
10. Final fare calculation
11. Ratings
12. Neo4j relationships
13. ML fare prediction
```

This order keeps the project manageable.

---

## 13. Final Architecture Summary

### PostgreSQL Stores

```text
users
riders
drivers
vehicles
rides
ride_stops
pricing_rules
ride_fares
ml_models
ratings
ride_status_history
```

### MongoDB Stores

```text
driver_locations
ride_routes
ride_tracking
ride_live_state
traffic_snapshots
fare_prediction_logs
ride_summaries
```

### Neo4j Stores

```text
Rider nodes
Driver nodes
Ride nodes
Area nodes
REQUESTED relationships
ACCEPTED relationships
COMPLETED relationships
STARTED_IN relationships
ENDED_IN relationships
RATED relationships
CURRENTLY_IN relationships
```

---

## 14. Final Design Decision

For this lab project, the best fare design is:

```text
Show estimated fare range before ride.
Rider accepts the estimate.
Collect actual route, time, traffic, and waiting data during ride.
Calculate final fare after ride completion using a transparent formula.
Use ML to predict fare and compare with actual final fare.
```

This approach is simple enough to implement and realistic enough to explain in a project presentation.
