# Uber Clone API Contract — Final Lab Version

## 1. Purpose

This document is the final frontend/backend API contract for the CS lab ride-hailing app.

It is designed so that:

1. The **backend team** can implement the APIs using **Node.js + Express + plain JavaScript**.
2. The **frontend team** can create a mock server and build the React + Capacitor app in parallel.
3. The mock server can later be replaced by the real backend without changing request/response shapes.
4. The APIs match the finalized database design using:
    - PostgreSQL for official transactional data.
    - MongoDB for live location, route, tracking, surge, and ML logs.
    - Neo4j for rider-driver-ride-area relationships.
    - ML for pre-ride and final fare prediction comparison.

This API contract intentionally keeps the project simple enough for fast delivery while covering the shortlisted features.

---

## 2. Global API Rules

### 2.1 Base URL

```text
/api/v1
```

Example:

```text
POST /api/v1/auth/login
```

---

### 2.2 Data Format

All normal API requests and responses use JSON.

```http
Content-Type: application/json
Accept: application/json
```

File upload APIs use multipart form data.

```http
Content-Type: multipart/form-data
```

---

### 2.3 JSON Naming Convention

All API JSON keys use **snake_case**.

Reason: database fields also use snake_case, which keeps the Node.js backend and frontend mock server simple.

Correct:

```json
{
    "ride_id": "uuid",
    "estimated_distance_km": 12.4
}
```

Incorrect:

```json
{
    "rideId": "uuid",
    "estimatedDistanceKm": 12.4
}
```

---

### 2.4 IDs

All database IDs are UUID strings unless otherwise stated.

```json
{
    "id": "2f4a7d4e-6f75-4e2b-a00e-30dc7d118abc"
}
```

MongoDB route IDs and surge zone IDs may be readable strings.

```json
{
    "route_id": "route_123",
    "surge_zone_id": "lahore_gulberg"
}
```

---

### 2.5 Date and Time Format

All timestamps are ISO 8601 UTC strings.

```json
{
    "created_at": "2026-05-23T10:30:00Z"
}
```

Frontend should send local times converted to UTC.

---

### 2.6 Location Format

All frontend/backend API payloads use this coordinate order:

```json
{
    "latitude": 31.5204,
    "longitude": 74.3587
}
```

MongoDB internally stores GeoJSON coordinates as:

```json
{
    "type": "Point",
    "coordinates": [74.3587, 31.5204]
}
```

The API must always expose `latitude` and `longitude`, not GeoJSON coordinate arrays, unless a route geometry is being returned.

---

### 2.7 Currency

Default currency is PKR.

```json
{
    "currency": "PKR"
}
```

---

### 2.8 Authentication

Protected APIs require a Bearer token.

```http
Authorization: Bearer <access_token>
```

The mock server may return fake JWT-like strings.

---

### 2.9 Standard Success Response Envelope

Every successful API response must follow this shape:

```json
{
    "success": true,
    "message": "Success message",
    "data": {},
    "meta": null
}
```

For list APIs:

```json
{
    "success": true,
    "message": "Rides fetched successfully",
    "data": [],
    "meta": {
        "page": 1,
        "limit": 20,
        "total": 100,
        "total_pages": 5
    }
}
```

---

### 2.10 Standard Error Response Envelope

Every failed API response must follow this shape:

```json
{
    "success": false,
    "message": "Validation failed",
    "error": {
        "code": "VALIDATION_ERROR",
        "details": [
            {
                "field": "email",
                "message": "Email is required"
            }
        ]
    },
    "data": null
}
```

---

### 2.11 Standard HTTP Status Codes

| Code | Meaning                                       |
| ---: | --------------------------------------------- |
|  200 | Success                                       |
|  201 | Created                                       |
|  400 | Validation or bad request                     |
|  401 | Missing/invalid token                         |
|  403 | Authenticated but not allowed                 |
|  404 | Resource not found                            |
|  409 | Conflict, duplicate, invalid state transition |
|  422 | Business rule failed                          |
|  500 | Server error                                  |

---

## 3. Shared Enums

### 3.1 User Roles

```text
rider
driver
admin
```

### 3.2 Vehicle Types

```text
car
bike
rickshaw
```

### 3.3 Driver Approval Status

```text
pending
approved
rejected
suspended
```

### 3.4 Document Types

```text
cnic
license
vehicle_registration
```

### 3.5 Document Status

```text
pending
approved
rejected
```

### 3.6 Saved Place Types

```text
home
work
favorite
```

### 3.7 Ride Types

```text
standard
scheduled
recurring
```

### 3.8 Ride Statuses

```text
requested
searching_driver
driver_assigned
accepted
arrived
started
completed
cancelled
```

### 3.9 Ride Offer Statuses

```text
sent
accepted
declined
expired
```

### 3.10 Stop Types

```text
pickup
intermediate
dropoff
```

### 3.11 Traffic Levels

```text
low
medium
heavy
unknown
```

### 3.12 Prediction Stages

```text
pre_ride
final_after_ride
```

---

## 4. Shared Object Shapes

These shapes must be reused consistently across API responses.

---

### 4.1 Location Object

```json
{
    "latitude": 31.5204,
    "longitude": 74.3587,
    "address": "Gulberg, Lahore",
    "provider": "mapbox",
    "provider_place_id": "mapbox.place.123"
}
```

Rules:

- `latitude` and `longitude` are required for ride creation.
- `address` may be null if user selects pin manually.
- `provider` should be `mapbox` for autocomplete/reverse geocode results.
- `provider_place_id` may be null for manually selected map pins.

---

### 4.2 User Object

```json
{
    "id": "user_uuid",
    "name": "Ali Khan",
    "email": "ali@example.com",
    "phone": "+923001234567",
    "role": "rider",
    "profile_photo_url": "https://example.com/uploads/profile.jpg",
    "email_verified_at": "2026-05-23T10:00:00Z",
    "phone_verified_at": "2026-05-23T10:01:00Z",
    "created_at": "2026-05-23T09:50:00Z",
    "updated_at": "2026-05-23T09:50:00Z"
}
```

---

### 4.3 Rider Object

```json
{
    "id": "rider_uuid",
    "user_id": "user_uuid",
    "average_rating": 5.0,
    "total_rides": 3,
    "user": {
        "id": "user_uuid",
        "name": "Ali Khan",
        "email": "ali@example.com",
        "phone": "+923001234567",
        "role": "rider",
        "profile_photo_url": null,
        "email_verified_at": "2026-05-23T10:00:00Z",
        "phone_verified_at": "2026-05-23T10:01:00Z",
        "created_at": "2026-05-23T09:50:00Z",
        "updated_at": "2026-05-23T09:50:00Z"
    }
}
```

---

### 4.4 Driver Object

```json
{
    "id": "driver_uuid",
    "user_id": "user_uuid",
    "average_rating": 4.8,
    "total_rides": 15,
    "is_available": true,
    "approval_status": "approved",
    "user": {
        "id": "user_uuid",
        "name": "Ahmed Raza",
        "email": "ahmed@example.com",
        "phone": "+923009876543",
        "role": "driver",
        "profile_photo_url": null,
        "email_verified_at": "2026-05-23T10:00:00Z",
        "phone_verified_at": "2026-05-23T10:01:00Z",
        "created_at": "2026-05-23T09:50:00Z",
        "updated_at": "2026-05-23T09:50:00Z"
    },
    "active_vehicle": null
}
```

---

### 4.5 Vehicle Object

```json
{
    "id": "vehicle_uuid",
    "driver_id": "driver_uuid",
    "make": "Toyota",
    "model": "Corolla",
    "year": 2020,
    "plate_number": "LEA-1234",
    "color": "White",
    "vehicle_type": "car",
    "is_active": true,
    "verification_status": "approved",
    "created_at": "2026-05-23T10:00:00Z",
    "updated_at": "2026-05-23T10:00:00Z"
}
```

---

### 4.6 Driver Document Object

```json
{
    "id": "document_uuid",
    "driver_id": "driver_uuid",
    "vehicle_id": null,
    "document_type": "cnic",
    "file_url": "https://example.com/uploads/cnic.jpg",
    "status": "pending",
    "rejection_reason": null,
    "uploaded_at": "2026-05-23T10:00:00Z",
    "verified_at": null
}
```

---

### 4.7 Saved Place Object

```json
{
    "id": "saved_place_uuid",
    "rider_id": "rider_uuid",
    "label": "Home",
    "place_type": "home",
    "latitude": 31.5204,
    "longitude": 74.3587,
    "address": "Gulberg, Lahore",
    "provider": "mapbox",
    "provider_place_id": "mapbox.place.123",
    "created_at": "2026-05-23T10:00:00Z",
    "updated_at": "2026-05-23T10:00:00Z"
}
```

---

### 4.8 Ride Stop Object

```json
{
    "id": "stop_uuid",
    "ride_id": "ride_uuid",
    "stop_order": 1,
    "stop_type": "pickup",
    "latitude": 31.5204,
    "longitude": 74.3587,
    "address": "Pickup address",
    "provider": "mapbox",
    "provider_place_id": "mapbox.place.pickup",
    "arrived_at": null,
    "departed_at": null,
    "created_at": "2026-05-23T10:00:00Z"
}
```

---

### 4.9 Fare Estimate Object

```json
{
    "currency": "PKR",
    "estimated_distance_km": 12.4,
    "estimated_duration_min": 33,
    "estimated_traffic_delay_min": 7,
    "base_fare": 100,
    "per_km_rate": 40,
    "per_min_rate": 8,
    "waiting_per_min_rate": 5,
    "traffic_delay_per_min_rate": 4,
    "minimum_fare": 250,
    "peak_multiplier": 1.0,
    "surge_multiplier": 1.2,
    "surge_zone_id": "lahore_gulberg",
    "pre_ride_formula_fare": 700,
    "pre_ride_ml_predicted_fare": 720,
    "estimated_min_fare": 630,
    "estimated_max_fare": 770,
    "model_used": "fare_prediction_linear_regression_v1"
}
```

---

### 4.10 Ride Fare Object

```json
{
    "id": "fare_uuid",
    "ride_id": "ride_uuid",
    "pricing_rule_id": "pricing_rule_uuid",
    "currency": "PKR",
    "estimated_distance_km": 12.4,
    "estimated_duration_min": 33,
    "estimated_traffic_delay_min": 7,
    "pre_ride_ml_predicted_fare": 720,
    "pre_ride_formula_fare": 700,
    "estimated_min_fare": 630,
    "estimated_max_fare": 770,
    "actual_distance_km": null,
    "actual_duration_min": null,
    "actual_traffic_delay_min": null,
    "waiting_time_min": 0,
    "base_fare": 100,
    "per_km_rate": 40,
    "per_min_rate": 8,
    "waiting_per_min_rate": 5,
    "traffic_delay_per_min_rate": 4,
    "peak_multiplier": 1.0,
    "surge_multiplier": 1.2,
    "minimum_fare": 250,
    "final_ml_predicted_fare": null,
    "final_formula_fare": null,
    "cancellation_fee": 0,
    "final_fare": null,
    "fare_policy": "metered_after_ride",
    "model_used": "fare_prediction_linear_regression_v1",
    "created_at": "2026-05-23T10:00:00Z",
    "finalized_at": null
}
```

---

### 4.11 Ride Object

```json
{
    "id": "ride_uuid",
    "rider_id": "rider_uuid",
    "driver_id": null,
    "vehicle_id": null,
    "ride_type": "standard",
    "scheduled_pickup_at": null,
    "recurrence_rule": null,
    "pickup": {
        "latitude": 31.5204,
        "longitude": 74.3587,
        "address": "Pickup address",
        "provider": "mapbox",
        "provider_place_id": "mapbox.place.pickup"
    },
    "dropoff": {
        "latitude": 31.47,
        "longitude": 74.27,
        "address": "Dropoff address",
        "provider": "mapbox",
        "provider_place_id": "mapbox.place.dropoff"
    },
    "rider_note_to_driver": "Call me when arrived",
    "status": "requested",
    "selected_route_id": "route_123",
    "surge_zone_id": "lahore_gulberg",
    "cancelled_by_user_id": null,
    "cancellation_reason": null,
    "requested_at": "2026-05-23T10:00:00Z",
    "accepted_at": null,
    "arrived_at": null,
    "started_at": null,
    "completed_at": null,
    "cancelled_at": null,
    "created_at": "2026-05-23T10:00:00Z",
    "updated_at": "2026-05-23T10:00:00Z",
    "stops": [],
    "fare": null,
    "driver": null,
    "vehicle": null
}
```

---

### 4.12 Ride Offer Object

```json
{
    "id": "offer_uuid",
    "ride_id": "ride_uuid",
    "driver_id": "driver_uuid",
    "status": "sent",
    "distance_to_pickup_km": 1.4,
    "driver_rating_at_offer": 4.8,
    "decline_reason": null,
    "offered_at": "2026-05-23T10:05:00Z",
    "responded_at": null,
    "expires_at": "2026-05-23T10:06:00Z",
    "ride": {
        "id": "ride_uuid",
        "pickup": {
            "latitude": 31.5204,
            "longitude": 74.3587,
            "address": "Pickup address"
        },
        "dropoff": {
            "latitude": 31.47,
            "longitude": 74.27,
            "address": "Dropoff address"
        },
        "estimated_fare": {
            "currency": "PKR",
            "estimated_min_fare": 630,
            "estimated_max_fare": 770
        },
        "rider_note_to_driver": "Call me when arrived"
    }
}
```

---

### 4.13 Route Object

```json
{
    "route_id": "route_123",
    "ride_id": "ride_uuid",
    "route_type": "pickup_to_dropoff",
    "provider": "mapbox",
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
            "duration_seconds": 60,
            "start_location": {
                "latitude": 31.5204,
                "longitude": 74.3587
            },
            "end_location": {
                "latitude": 31.522,
                "longitude": 74.36
            }
        }
    ],
    "created_at": "2026-05-23T10:20:00Z"
}
```

---

### 4.14 Driver Location Object

```json
{
    "driver_id": "driver_uuid",
    "vehicle_id": "vehicle_uuid",
    "is_available": true,
    "average_rating": 4.8,
    "latitude": 31.5204,
    "longitude": 74.3587,
    "heading": 90,
    "speed_kmph": 35,
    "current_area": "Gulberg",
    "updated_at": "2026-05-23T10:30:00Z"
}
```

---

### 4.15 Ride Live State Object

```json
{
    "ride_id": "ride_uuid",
    "rider_id": "rider_uuid",
    "driver_id": "driver_uuid",
    "status": "started",
    "current_location": {
        "latitude": 31.5204,
        "longitude": 74.3587
    },
    "current_route_id": "route_123",
    "eta_min": 14,
    "distance_remaining_km": 6.3,
    "updated_at": "2026-05-23T10:40:00Z"
}
```

---

### 4.16 Surge Zone Object

```json
{
    "id": "lahore_gulberg",
    "city": "Lahore",
    "area_name": "Gulberg",
    "center": {
        "latitude": 31.5204,
        "longitude": 74.3587
    },
    "radius_km": 3,
    "demand_count": 25,
    "available_drivers": 8,
    "supply_demand_ratio": 3.13,
    "surge_multiplier": 1.5,
    "updated_at": "2026-05-23T10:00:00Z"
}
```

---

### 4.17 Rating Object

```json
{
    "id": "rating_uuid",
    "ride_id": "ride_uuid",
    "rider_id": "rider_uuid",
    "driver_id": "driver_uuid",
    "rating": 5,
    "comment": "Good driver",
    "created_at": "2026-05-23T13:00:00Z"
}
```

---

## 5. Authentication APIs

---

### 5.1 Register Rider

```http
POST /auth/register/rider
```

Public endpoint.

#### Request Body

```json
{
    "name": "Ali Khan",
    "email": "ali@example.com",
    "phone": "+923001234567",
    "password": "password123"
}
```

#### Response 201

```json
{
    "success": true,
    "message": "Rider registered successfully",
    "data": {
        "access_token": "mock_access_token",
        "user": {
            "id": "user_uuid",
            "name": "Ali Khan",
            "email": "ali@example.com",
            "phone": "+923001234567",
            "role": "rider",
            "profile_photo_url": null,
            "email_verified_at": null,
            "phone_verified_at": null,
            "created_at": "2026-05-23T09:50:00Z",
            "updated_at": "2026-05-23T09:50:00Z"
        },
        "rider": {
            "id": "rider_uuid",
            "user_id": "user_uuid",
            "average_rating": 5.0,
            "total_rides": 0
        }
    },
    "meta": null
}
```

---

### 5.2 Register Driver

```http
POST /auth/register/driver
```

Public endpoint.

#### Request Body

```json
{
    "name": "Ahmed Raza",
    "email": "ahmed@example.com",
    "phone": "+923009876543",
    "password": "password123"
}
```

#### Response 201

```json
{
    "success": true,
    "message": "Driver registered successfully",
    "data": {
        "access_token": "mock_access_token",
        "user": {
            "id": "user_uuid",
            "name": "Ahmed Raza",
            "email": "ahmed@example.com",
            "phone": "+923009876543",
            "role": "driver",
            "profile_photo_url": null,
            "email_verified_at": null,
            "phone_verified_at": null,
            "created_at": "2026-05-23T09:50:00Z",
            "updated_at": "2026-05-23T09:50:00Z"
        },
        "driver": {
            "id": "driver_uuid",
            "user_id": "user_uuid",
            "average_rating": 5.0,
            "total_rides": 0,
            "is_available": false,
            "approval_status": "pending"
        }
    },
    "meta": null
}
```

---

### 5.3 Login

```http
POST /auth/login
```

Public endpoint.

#### Request Body

```json
{
    "email_or_phone": "ali@example.com",
    "password": "password123"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Logged in successfully",
    "data": {
        "access_token": "mock_access_token",
        "user": {
            "id": "user_uuid",
            "name": "Ali Khan",
            "email": "ali@example.com",
            "phone": "+923001234567",
            "role": "rider",
            "profile_photo_url": null,
            "email_verified_at": "2026-05-23T10:00:00Z",
            "phone_verified_at": "2026-05-23T10:01:00Z",
            "created_at": "2026-05-23T09:50:00Z",
            "updated_at": "2026-05-23T09:50:00Z"
        },
        "rider": {
            "id": "rider_uuid",
            "user_id": "user_uuid",
            "average_rating": 5.0,
            "total_rides": 0
        },
        "driver": null
    },
    "meta": null
}
```

---

### 5.4 Get Current Auth User

```http
GET /auth/me
```

Protected endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Current user fetched successfully",
    "data": {
        "user": {
            "id": "user_uuid",
            "name": "Ali Khan",
            "email": "ali@example.com",
            "phone": "+923001234567",
            "role": "rider",
            "profile_photo_url": null,
            "email_verified_at": "2026-05-23T10:00:00Z",
            "phone_verified_at": "2026-05-23T10:01:00Z",
            "created_at": "2026-05-23T09:50:00Z",
            "updated_at": "2026-05-23T09:50:00Z"
        },
        "rider": {
            "id": "rider_uuid",
            "user_id": "user_uuid",
            "average_rating": 5.0,
            "total_rides": 0
        },
        "driver": null
    },
    "meta": null
}
```

---

### 5.5 Send Mock OTP

```http
POST /auth/otp/send
```

Protected endpoint.

#### Request Body

```json
{
    "channel": "phone"
}
```

Allowed `channel` values:

```text
phone
email
```

#### Response 200

```json
{
    "success": true,
    "message": "Mock OTP sent successfully",
    "data": {
        "channel": "phone",
        "destination": "+923001234567",
        "mock_otp": "123456",
        "expires_in_seconds": 300
    },
    "meta": null
}
```

Mock server and lab backend may always return/use `123456`.

---

### 5.6 Verify Mock OTP

```http
POST /auth/otp/verify
```

Protected endpoint.

#### Request Body

```json
{
    "channel": "phone",
    "otp": "123456"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "OTP verified successfully",
    "data": {
        "user": {
            "id": "user_uuid",
            "name": "Ali Khan",
            "email": "ali@example.com",
            "phone": "+923001234567",
            "role": "rider",
            "profile_photo_url": null,
            "email_verified_at": null,
            "phone_verified_at": "2026-05-23T10:01:00Z",
            "created_at": "2026-05-23T09:50:00Z",
            "updated_at": "2026-05-23T09:50:00Z"
        }
    },
    "meta": null
}
```

---

### 5.7 Logout

```http
POST /auth/logout
```

Protected endpoint.

For the lab project, this can simply return success and the frontend removes the stored token.

#### Response 200

```json
{
    "success": true,
    "message": "Logged out successfully",
    "data": null,
    "meta": null
}
```

---

## 6. User Profile APIs

---

### 6.1 Update Current User Profile

```http
PATCH /users/me
```

Protected endpoint.

#### Request Body

All fields are optional.

```json
{
    "name": "Ali Updated",
    "email": "ali.updated@example.com",
    "phone": "+923001111111"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Profile updated successfully",
    "data": {
        "user": {
            "id": "user_uuid",
            "name": "Ali Updated",
            "email": "ali.updated@example.com",
            "phone": "+923001111111",
            "role": "rider",
            "profile_photo_url": null,
            "email_verified_at": null,
            "phone_verified_at": null,
            "created_at": "2026-05-23T09:50:00Z",
            "updated_at": "2026-05-23T10:10:00Z"
        }
    },
    "meta": null
}
```

Rule:

- If email changes, set `email_verified_at = null`.
- If phone changes, set `phone_verified_at = null`.

---

### 6.2 Upload Profile Photo

```http
POST /users/me/profile-photo
```

Protected endpoint.

Content type:

```http
multipart/form-data
```

#### Form Data

| Field   | Type | Required |
| ------- | ---- | -------- |
| `photo` | file | yes      |

#### Response 200

```json
{
    "success": true,
    "message": "Profile photo uploaded successfully",
    "data": {
        "profile_photo_url": "https://example.com/uploads/profile.jpg",
        "user": {
            "id": "user_uuid",
            "name": "Ali Khan",
            "email": "ali@example.com",
            "phone": "+923001234567",
            "role": "rider",
            "profile_photo_url": "https://example.com/uploads/profile.jpg",
            "email_verified_at": "2026-05-23T10:00:00Z",
            "phone_verified_at": "2026-05-23T10:01:00Z",
            "created_at": "2026-05-23T09:50:00Z",
            "updated_at": "2026-05-23T10:10:00Z"
        }
    },
    "meta": null
}
```

---

## 7. Rider APIs

---

### 7.1 Get Current Rider Profile

```http
GET /riders/me
```

Protected rider endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Rider profile fetched successfully",
    "data": {
        "rider": {
            "id": "rider_uuid",
            "user_id": "user_uuid",
            "average_rating": 5.0,
            "total_rides": 3,
            "user": {
                "id": "user_uuid",
                "name": "Ali Khan",
                "email": "ali@example.com",
                "phone": "+923001234567",
                "role": "rider",
                "profile_photo_url": null,
                "email_verified_at": "2026-05-23T10:00:00Z",
                "phone_verified_at": "2026-05-23T10:01:00Z",
                "created_at": "2026-05-23T09:50:00Z",
                "updated_at": "2026-05-23T09:50:00Z"
            }
        }
    },
    "meta": null
}
```

---

## 8. Saved Places APIs

---

### 8.1 List Saved Places

```http
GET /riders/me/saved-places
```

Protected rider endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Saved places fetched successfully",
    "data": [
        {
            "id": "saved_place_uuid",
            "rider_id": "rider_uuid",
            "label": "Home",
            "place_type": "home",
            "latitude": 31.5204,
            "longitude": 74.3587,
            "address": "Gulberg, Lahore",
            "provider": "mapbox",
            "provider_place_id": "mapbox.place.123",
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:00:00Z"
        }
    ],
    "meta": null
}
```

---

### 8.2 Create Saved Place

```http
POST /riders/me/saved-places
```

Protected rider endpoint.

#### Request Body

```json
{
    "label": "Home",
    "place_type": "home",
    "latitude": 31.5204,
    "longitude": 74.3587,
    "address": "Gulberg, Lahore",
    "provider": "mapbox",
    "provider_place_id": "mapbox.place.123"
}
```

#### Response 201

```json
{
    "success": true,
    "message": "Saved place created successfully",
    "data": {
        "saved_place": {
            "id": "saved_place_uuid",
            "rider_id": "rider_uuid",
            "label": "Home",
            "place_type": "home",
            "latitude": 31.5204,
            "longitude": 74.3587,
            "address": "Gulberg, Lahore",
            "provider": "mapbox",
            "provider_place_id": "mapbox.place.123",
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:00:00Z"
        }
    },
    "meta": null
}
```

Rules:

- One `home` per rider.
- One `work` per rider.
- Multiple `favorite` records are allowed.

---

### 8.3 Update Saved Place

```http
PATCH /riders/me/saved-places/:saved_place_id
```

Protected rider endpoint.

#### Request Body

All fields are optional.

```json
{
    "label": "New Home",
    "latitude": 31.5301,
    "longitude": 74.3611,
    "address": "Updated address",
    "provider": "mapbox",
    "provider_place_id": "mapbox.place.updated"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Saved place updated successfully",
    "data": {
        "saved_place": {
            "id": "saved_place_uuid",
            "rider_id": "rider_uuid",
            "label": "New Home",
            "place_type": "home",
            "latitude": 31.5301,
            "longitude": 74.3611,
            "address": "Updated address",
            "provider": "mapbox",
            "provider_place_id": "mapbox.place.updated",
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:20:00Z"
        }
    },
    "meta": null
}
```

---

### 8.4 Delete Saved Place

```http
DELETE /riders/me/saved-places/:saved_place_id
```

Protected rider endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Saved place deleted successfully",
    "data": null,
    "meta": null
}
```

---

## 9. Driver APIs

---

### 9.1 Get Current Driver Profile

```http
GET /drivers/me
```

Protected driver endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Driver profile fetched successfully",
    "data": {
        "driver": {
            "id": "driver_uuid",
            "user_id": "user_uuid",
            "average_rating": 4.8,
            "total_rides": 15,
            "is_available": true,
            "approval_status": "approved",
            "user": {
                "id": "user_uuid",
                "name": "Ahmed Raza",
                "email": "ahmed@example.com",
                "phone": "+923009876543",
                "role": "driver",
                "profile_photo_url": null,
                "email_verified_at": "2026-05-23T10:00:00Z",
                "phone_verified_at": "2026-05-23T10:01:00Z",
                "created_at": "2026-05-23T09:50:00Z",
                "updated_at": "2026-05-23T09:50:00Z"
            },
            "active_vehicle": {
                "id": "vehicle_uuid",
                "driver_id": "driver_uuid",
                "make": "Toyota",
                "model": "Corolla",
                "year": 2020,
                "plate_number": "LEA-1234",
                "color": "White",
                "vehicle_type": "car",
                "is_active": true,
                "verification_status": "approved",
                "created_at": "2026-05-23T10:00:00Z",
                "updated_at": "2026-05-23T10:00:00Z"
            }
        }
    },
    "meta": null
}
```

---

### 9.2 Update Driver Availability

```http
PATCH /drivers/me/availability
```

Protected driver endpoint.

#### Request Body

```json
{
    "is_available": true,
    "latitude": 31.5204,
    "longitude": 74.3587,
    "heading": 90,
    "speed_kmph": 0,
    "current_area": "Gulberg"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Driver availability updated successfully",
    "data": {
        "driver": {
            "id": "driver_uuid",
            "is_available": true,
            "approval_status": "approved"
        },
        "location": {
            "driver_id": "driver_uuid",
            "vehicle_id": "vehicle_uuid",
            "is_available": true,
            "average_rating": 4.8,
            "latitude": 31.5204,
            "longitude": 74.3587,
            "heading": 90,
            "speed_kmph": 0,
            "current_area": "Gulberg",
            "updated_at": "2026-05-23T10:30:00Z"
        }
    },
    "meta": null
}
```

Rules:

- Driver can become available only if `approval_status = approved`.
- Driver must have one active approved vehicle.
- Backend updates PostgreSQL `drivers.is_available` and MongoDB `driver_locations`.

---

### 9.3 Update Driver Location

```http
POST /drivers/me/location
```

Protected driver endpoint.

Used for periodic GPS updates when driver is online.

#### Request Body

```json
{
    "latitude": 31.5204,
    "longitude": 74.3587,
    "heading": 90,
    "speed_kmph": 35,
    "current_area": "Gulberg"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Driver location updated successfully",
    "data": {
        "location": {
            "driver_id": "driver_uuid",
            "vehicle_id": "vehicle_uuid",
            "is_available": true,
            "average_rating": 4.8,
            "latitude": 31.5204,
            "longitude": 74.3587,
            "heading": 90,
            "speed_kmph": 35,
            "current_area": "Gulberg",
            "updated_at": "2026-05-23T10:30:00Z"
        }
    },
    "meta": null
}
```

This endpoint should also update the Neo4j `CURRENTLY_IN` relationship when `current_area` changes.

---

## 10. Driver Document APIs

---

### 10.1 List Driver Documents

```http
GET /drivers/me/documents
```

Protected driver endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Driver documents fetched successfully",
    "data": [
        {
            "id": "document_uuid",
            "driver_id": "driver_uuid",
            "vehicle_id": null,
            "document_type": "cnic",
            "file_url": "https://example.com/uploads/cnic.jpg",
            "status": "pending",
            "rejection_reason": null,
            "uploaded_at": "2026-05-23T10:00:00Z",
            "verified_at": null
        }
    ],
    "meta": null
}
```

---

### 10.2 Upload Driver Document

```http
POST /drivers/me/documents
```

Protected driver endpoint.

Content type:

```http
multipart/form-data
```

#### Form Data

| Field           | Type   | Required | Notes                                     |
| --------------- | ------ | -------: | ----------------------------------------- |
| `document_type` | string |      yes | `cnic`, `license`, `vehicle_registration` |
| `vehicle_id`    | string |       no | Required for `vehicle_registration`       |
| `file`          | file   |      yes | Image or PDF                              |

#### Response 201

```json
{
    "success": true,
    "message": "Driver document uploaded successfully",
    "data": {
        "document": {
            "id": "document_uuid",
            "driver_id": "driver_uuid",
            "vehicle_id": null,
            "document_type": "cnic",
            "file_url": "https://example.com/uploads/cnic.jpg",
            "status": "pending",
            "rejection_reason": null,
            "uploaded_at": "2026-05-23T10:00:00Z",
            "verified_at": null
        }
    },
    "meta": null
}
```

---

## 11. Vehicle APIs

---

### 11.1 List My Vehicles

```http
GET /drivers/me/vehicles
```

Protected driver endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Vehicles fetched successfully",
    "data": [
        {
            "id": "vehicle_uuid",
            "driver_id": "driver_uuid",
            "make": "Toyota",
            "model": "Corolla",
            "year": 2020,
            "plate_number": "LEA-1234",
            "color": "White",
            "vehicle_type": "car",
            "is_active": true,
            "verification_status": "approved",
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:00:00Z"
        }
    ],
    "meta": null
}
```

---

### 11.2 Create Vehicle

```http
POST /drivers/me/vehicles
```

Protected driver endpoint.

#### Request Body

```json
{
    "make": "Toyota",
    "model": "Corolla",
    "year": 2020,
    "plate_number": "LEA-1234",
    "color": "White",
    "vehicle_type": "car"
}
```

#### Response 201

```json
{
    "success": true,
    "message": "Vehicle created successfully",
    "data": {
        "vehicle": {
            "id": "vehicle_uuid",
            "driver_id": "driver_uuid",
            "make": "Toyota",
            "model": "Corolla",
            "year": 2020,
            "plate_number": "LEA-1234",
            "color": "White",
            "vehicle_type": "car",
            "is_active": false,
            "verification_status": "pending",
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:00:00Z"
        }
    },
    "meta": null
}
```

---

### 11.3 Update Vehicle

```http
PATCH /drivers/me/vehicles/:vehicle_id
```

Protected driver endpoint.

#### Request Body

All fields are optional.

```json
{
    "make": "Honda",
    "model": "Civic",
    "year": 2021,
    "plate_number": "LEB-5678",
    "color": "Black",
    "vehicle_type": "car"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Vehicle updated successfully",
    "data": {
        "vehicle": {
            "id": "vehicle_uuid",
            "driver_id": "driver_uuid",
            "make": "Honda",
            "model": "Civic",
            "year": 2021,
            "plate_number": "LEB-5678",
            "color": "Black",
            "vehicle_type": "car",
            "is_active": false,
            "verification_status": "pending",
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:20:00Z"
        }
    },
    "meta": null
}
```

---

### 11.4 Set Active Vehicle

```http
POST /drivers/me/vehicles/:vehicle_id/set-active
```

Protected driver endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Active vehicle updated successfully",
    "data": {
        "vehicle": {
            "id": "vehicle_uuid",
            "driver_id": "driver_uuid",
            "make": "Toyota",
            "model": "Corolla",
            "year": 2020,
            "plate_number": "LEA-1234",
            "color": "White",
            "vehicle_type": "car",
            "is_active": true,
            "verification_status": "approved",
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:20:00Z"
        }
    },
    "meta": null
}
```

Rule:

- Only one active vehicle per driver.
- For the mock server, allow setting active even if `verification_status = pending` if needed for faster demo.
- For the real backend, prefer requiring `verification_status = approved`.

---

## 12. Map and Location APIs

These APIs wrap Mapbox so the frontend can use one backend contract. For quick frontend development, the mock server can return static Lahore-based results.

---

### 12.1 Get Mapbox Config

```http
GET /maps/config
```

Protected endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Map config fetched successfully",
    "data": {
        "provider": "mapbox",
        "public_token": "mapbox_public_token_here",
        "default_center": {
            "latitude": 31.5204,
            "longitude": 74.3587
        },
        "default_zoom": 12
    },
    "meta": null
}
```

---

### 12.2 Address Autocomplete

```http
GET /maps/autocomplete?query=gulberg&latitude=31.5204&longitude=74.3587&limit=5
```

Protected endpoint.

#### Query Parameters

| Name        | Type   | Required | Notes                        |
| ----------- | ------ | -------: | ---------------------------- |
| `query`     | string |      yes | User typed search text       |
| `latitude`  | number |       no | Optional proximity latitude  |
| `longitude` | number |       no | Optional proximity longitude |
| `limit`     | number |       no | Default 5                    |

#### Response 200

```json
{
    "success": true,
    "message": "Autocomplete results fetched successfully",
    "data": [
        {
            "provider": "mapbox",
            "provider_place_id": "mapbox.place.gulberg",
            "name": "Gulberg",
            "address": "Gulberg, Lahore, Pakistan",
            "latitude": 31.5204,
            "longitude": 74.3587
        }
    ],
    "meta": null
}
```

---

### 12.3 Reverse Geocode

```http
GET /maps/reverse-geocode?latitude=31.5204&longitude=74.3587
```

Protected endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Address fetched successfully",
    "data": {
        "provider": "mapbox",
        "provider_place_id": "mapbox.place.reverse.123",
        "name": "Gulberg",
        "address": "Gulberg, Lahore, Pakistan",
        "latitude": 31.5204,
        "longitude": 74.3587
    },
    "meta": null
}
```

---

### 12.4 Get Route Preview

```http
POST /maps/route-preview
```

Protected endpoint.

Used when frontend wants only route geometry without creating a ride estimate.

#### Request Body

```json
{
    "origin": {
        "latitude": 31.5204,
        "longitude": 74.3587
    },
    "destination": {
        "latitude": 31.47,
        "longitude": 74.27
    },
    "stops": [
        {
            "latitude": 31.5,
            "longitude": 74.33
        }
    ],
    "vehicle_type": "car"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Route preview fetched successfully",
    "data": {
        "route": {
            "route_id": "preview_route_123",
            "ride_id": null,
            "route_type": "pickup_to_dropoff",
            "provider": "mapbox",
            "selected": true,
            "distance_km": 12.4,
            "normal_duration_min": 26,
            "traffic_duration_min": 33,
            "traffic_delay_min": 7,
            "polyline": "encoded_polyline_here",
            "steps": []
        }
    },
    "meta": null
}
```

---

### 12.5 Nearby Drivers

```http
GET /maps/nearby-drivers?latitude=31.5204&longitude=74.3587&radius_km=3
```

Protected rider endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Nearby drivers fetched successfully",
    "data": [
        {
            "driver_id": "driver_uuid",
            "vehicle_id": "vehicle_uuid",
            "is_available": true,
            "average_rating": 4.8,
            "latitude": 31.521,
            "longitude": 74.359,
            "heading": 90,
            "speed_kmph": 20,
            "current_area": "Gulberg",
            "distance_km": 0.4,
            "updated_at": "2026-05-23T10:30:00Z"
        }
    ],
    "meta": null
}
```

---

### 12.6 Surge Zones / Demand Heatmap

```http
GET /maps/surge-zones?city=Lahore
```

Protected endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Surge zones fetched successfully",
    "data": [
        {
            "id": "lahore_gulberg",
            "city": "Lahore",
            "area_name": "Gulberg",
            "center": {
                "latitude": 31.5204,
                "longitude": 74.3587
            },
            "radius_km": 3,
            "demand_count": 25,
            "available_drivers": 8,
            "supply_demand_ratio": 3.13,
            "surge_multiplier": 1.5,
            "updated_at": "2026-05-23T10:00:00Z"
        }
    ],
    "meta": null
}
```

---

## 13. Ride APIs

---

### 13.1 Estimate Ride Fare

```http
POST /rides/estimate
```

Protected rider endpoint.

This endpoint does not create a ride. It calculates route, ETA, surge, peak multiplier, formula fare, and ML predicted fare.

#### Request Body

```json
{
    "ride_type": "standard",
    "scheduled_pickup_at": null,
    "recurrence_rule": null,
    "vehicle_type": "car",
    "pickup": {
        "latitude": 31.5204,
        "longitude": 74.3587,
        "address": "Pickup address",
        "provider": "mapbox",
        "provider_place_id": "mapbox.place.pickup"
    },
    "dropoff": {
        "latitude": 31.47,
        "longitude": 74.27,
        "address": "Dropoff address",
        "provider": "mapbox",
        "provider_place_id": "mapbox.place.dropoff"
    },
    "stops": [
        {
            "stop_order": 2,
            "latitude": 31.5,
            "longitude": 74.33,
            "address": "Intermediate stop",
            "provider": "mapbox",
            "provider_place_id": "mapbox.place.stop1"
        }
    ]
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Ride fare estimated successfully",
    "data": {
        "fare_estimate": {
            "currency": "PKR",
            "estimated_distance_km": 12.4,
            "estimated_duration_min": 33,
            "estimated_traffic_delay_min": 7,
            "base_fare": 100,
            "per_km_rate": 40,
            "per_min_rate": 8,
            "waiting_per_min_rate": 5,
            "traffic_delay_per_min_rate": 4,
            "minimum_fare": 250,
            "peak_multiplier": 1.0,
            "surge_multiplier": 1.2,
            "surge_zone_id": "lahore_gulberg",
            "pre_ride_formula_fare": 700,
            "pre_ride_ml_predicted_fare": 720,
            "estimated_min_fare": 630,
            "estimated_max_fare": 770,
            "model_used": "fare_prediction_linear_regression_v1"
        },
        "route": {
            "route_id": "preview_route_123",
            "ride_id": null,
            "route_type": "pickup_to_dropoff",
            "provider": "mapbox",
            "selected": true,
            "distance_km": 12.4,
            "normal_duration_min": 26,
            "traffic_duration_min": 33,
            "traffic_delay_min": 7,
            "polyline": "encoded_polyline_here",
            "steps": []
        },
        "nearby_drivers_count": 4
    },
    "meta": null
}
```

Backend rule:

- Real backend may recompute this estimate during ride creation.
- Frontend must not assume estimate values are final until ride is created.

---

### 13.2 Create Ride Request

```http
POST /rides
```

Protected rider endpoint.

Creates the official ride in PostgreSQL, stores route in MongoDB, creates Neo4j rider/ride/area relationships, and starts driver matching.

#### Request Body

```json
{
    "ride_type": "standard",
    "scheduled_pickup_at": null,
    "recurrence_rule": null,
    "vehicle_type": "car",
    "pickup": {
        "latitude": 31.5204,
        "longitude": 74.3587,
        "address": "Pickup address",
        "provider": "mapbox",
        "provider_place_id": "mapbox.place.pickup"
    },
    "dropoff": {
        "latitude": 31.47,
        "longitude": 74.27,
        "address": "Dropoff address",
        "provider": "mapbox",
        "provider_place_id": "mapbox.place.dropoff"
    },
    "stops": [
        {
            "stop_order": 2,
            "latitude": 31.5,
            "longitude": 74.33,
            "address": "Intermediate stop",
            "provider": "mapbox",
            "provider_place_id": "mapbox.place.stop1"
        }
    ],
    "rider_note_to_driver": "Call me when arrived"
}
```

#### Response 201

```json
{
    "success": true,
    "message": "Ride requested successfully",
    "data": {
        "ride": {
            "id": "ride_uuid",
            "rider_id": "rider_uuid",
            "driver_id": null,
            "vehicle_id": null,
            "ride_type": "standard",
            "scheduled_pickup_at": null,
            "recurrence_rule": null,
            "pickup": {
                "latitude": 31.5204,
                "longitude": 74.3587,
                "address": "Pickup address",
                "provider": "mapbox",
                "provider_place_id": "mapbox.place.pickup"
            },
            "dropoff": {
                "latitude": 31.47,
                "longitude": 74.27,
                "address": "Dropoff address",
                "provider": "mapbox",
                "provider_place_id": "mapbox.place.dropoff"
            },
            "rider_note_to_driver": "Call me when arrived",
            "status": "searching_driver",
            "selected_route_id": "route_123",
            "surge_zone_id": "lahore_gulberg",
            "cancelled_by_user_id": null,
            "cancellation_reason": null,
            "requested_at": "2026-05-23T10:00:00Z",
            "accepted_at": null,
            "arrived_at": null,
            "started_at": null,
            "completed_at": null,
            "cancelled_at": null,
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:00:00Z",
            "stops": [
                {
                    "id": "stop_pickup_uuid",
                    "ride_id": "ride_uuid",
                    "stop_order": 1,
                    "stop_type": "pickup",
                    "latitude": 31.5204,
                    "longitude": 74.3587,
                    "address": "Pickup address",
                    "provider": "mapbox",
                    "provider_place_id": "mapbox.place.pickup",
                    "arrived_at": null,
                    "departed_at": null,
                    "created_at": "2026-05-23T10:00:00Z"
                },
                {
                    "id": "stop_dropoff_uuid",
                    "ride_id": "ride_uuid",
                    "stop_order": 3,
                    "stop_type": "dropoff",
                    "latitude": 31.47,
                    "longitude": 74.27,
                    "address": "Dropoff address",
                    "provider": "mapbox",
                    "provider_place_id": "mapbox.place.dropoff",
                    "arrived_at": null,
                    "departed_at": null,
                    "created_at": "2026-05-23T10:00:00Z"
                }
            ],
            "fare": {
                "id": "fare_uuid",
                "ride_id": "ride_uuid",
                "currency": "PKR",
                "estimated_distance_km": 12.4,
                "estimated_duration_min": 33,
                "estimated_traffic_delay_min": 7,
                "pre_ride_ml_predicted_fare": 720,
                "pre_ride_formula_fare": 700,
                "estimated_min_fare": 630,
                "estimated_max_fare": 770,
                "peak_multiplier": 1.0,
                "surge_multiplier": 1.2,
                "cancellation_fee": 0,
                "final_fare": null,
                "model_used": "fare_prediction_linear_regression_v1"
            },
            "driver": null,
            "vehicle": null
        },
        "route": {
            "route_id": "route_123",
            "ride_id": "ride_uuid",
            "route_type": "pickup_to_dropoff",
            "provider": "mapbox",
            "selected": true,
            "distance_km": 12.4,
            "normal_duration_min": 26,
            "traffic_duration_min": 33,
            "traffic_delay_min": 7,
            "polyline": "encoded_polyline_here",
            "steps": []
        },
        "matching": {
            "status": "searching_driver",
            "offers_sent": 1
        }
    },
    "meta": null
}
```

---

### 13.3 List My Rides

```http
GET /rides?status=completed&page=1&limit=20
```

Protected endpoint.

Returns rides for the current user. If current user is a rider, return rider rides. If current user is a driver, return driver rides.

#### Query Parameters

| Name        | Type   | Required | Notes                          |
| ----------- | ------ | -------: | ------------------------------ |
| `status`    | string |       no | Filter by ride status          |
| `ride_type` | string |       no | standard, scheduled, recurring |
| `page`      | number |       no | Default 1                      |
| `limit`     | number |       no | Default 20                     |

#### Response 200

```json
{
    "success": true,
    "message": "Rides fetched successfully",
    "data": [
        {
            "id": "ride_uuid",
            "rider_id": "rider_uuid",
            "driver_id": "driver_uuid",
            "vehicle_id": "vehicle_uuid",
            "ride_type": "standard",
            "scheduled_pickup_at": null,
            "recurrence_rule": null,
            "pickup": {
                "latitude": 31.5204,
                "longitude": 74.3587,
                "address": "Pickup address"
            },
            "dropoff": {
                "latitude": 31.47,
                "longitude": 74.27,
                "address": "Dropoff address"
            },
            "rider_note_to_driver": "Call me when arrived",
            "status": "completed",
            "selected_route_id": "route_123",
            "surge_zone_id": "lahore_gulberg",
            "requested_at": "2026-05-23T10:00:00Z",
            "completed_at": "2026-05-23T10:40:00Z",
            "fare": {
                "currency": "PKR",
                "final_fare": 868,
                "estimated_min_fare": 630,
                "estimated_max_fare": 770
            },
            "driver": {
                "id": "driver_uuid",
                "name": "Ahmed Raza",
                "average_rating": 4.8,
                "profile_photo_url": null
            },
            "vehicle": {
                "id": "vehicle_uuid",
                "make": "Toyota",
                "model": "Corolla",
                "plate_number": "LEA-1234",
                "color": "White",
                "vehicle_type": "car"
            }
        }
    ],
    "meta": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "total_pages": 1
    }
}
```

---

### 13.4 Get Ride Details

```http
GET /rides/:ride_id
```

Protected endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Ride fetched successfully",
    "data": {
        "ride": {
            "id": "ride_uuid",
            "rider_id": "rider_uuid",
            "driver_id": "driver_uuid",
            "vehicle_id": "vehicle_uuid",
            "ride_type": "standard",
            "scheduled_pickup_at": null,
            "recurrence_rule": null,
            "pickup": {
                "latitude": 31.5204,
                "longitude": 74.3587,
                "address": "Pickup address",
                "provider": "mapbox",
                "provider_place_id": "mapbox.place.pickup"
            },
            "dropoff": {
                "latitude": 31.47,
                "longitude": 74.27,
                "address": "Dropoff address",
                "provider": "mapbox",
                "provider_place_id": "mapbox.place.dropoff"
            },
            "rider_note_to_driver": "Call me when arrived",
            "status": "accepted",
            "selected_route_id": "route_123",
            "surge_zone_id": "lahore_gulberg",
            "cancelled_by_user_id": null,
            "cancellation_reason": null,
            "requested_at": "2026-05-23T10:00:00Z",
            "accepted_at": "2026-05-23T10:05:00Z",
            "arrived_at": null,
            "started_at": null,
            "completed_at": null,
            "cancelled_at": null,
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:05:00Z",
            "stops": [],
            "fare": {
                "id": "fare_uuid",
                "ride_id": "ride_uuid",
                "currency": "PKR",
                "estimated_distance_km": 12.4,
                "estimated_duration_min": 33,
                "estimated_traffic_delay_min": 7,
                "pre_ride_ml_predicted_fare": 720,
                "pre_ride_formula_fare": 700,
                "estimated_min_fare": 630,
                "estimated_max_fare": 770,
                "actual_distance_km": null,
                "actual_duration_min": null,
                "actual_traffic_delay_min": null,
                "waiting_time_min": 0,
                "peak_multiplier": 1.0,
                "surge_multiplier": 1.2,
                "cancellation_fee": 0,
                "final_fare": null,
                "model_used": "fare_prediction_linear_regression_v1"
            },
            "driver": {
                "id": "driver_uuid",
                "name": "Ahmed Raza",
                "phone": "+923009876543",
                "average_rating": 4.8,
                "profile_photo_url": null
            },
            "vehicle": {
                "id": "vehicle_uuid",
                "make": "Toyota",
                "model": "Corolla",
                "plate_number": "LEA-1234",
                "color": "White",
                "vehicle_type": "car"
            }
        }
    },
    "meta": null
}
```

---

### 13.5 Get Ride Route

```http
GET /rides/:ride_id/route?route_type=pickup_to_dropoff
```

Protected endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Ride route fetched successfully",
    "data": {
        "route": {
            "route_id": "route_123",
            "ride_id": "ride_uuid",
            "route_type": "pickup_to_dropoff",
            "provider": "mapbox",
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
                    "duration_seconds": 60,
                    "start_location": {
                        "latitude": 31.5204,
                        "longitude": 74.3587
                    },
                    "end_location": {
                        "latitude": 31.522,
                        "longitude": 74.36
                    }
                }
            ],
            "created_at": "2026-05-23T10:20:00Z"
        }
    },
    "meta": null
}
```

---

### 13.6 Get Ride Live State

```http
GET /rides/:ride_id/live
```

Protected endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Ride live state fetched successfully",
    "data": {
        "live_state": {
            "ride_id": "ride_uuid",
            "rider_id": "rider_uuid",
            "driver_id": "driver_uuid",
            "status": "started",
            "current_location": {
                "latitude": 31.5204,
                "longitude": 74.3587
            },
            "current_route_id": "route_123",
            "eta_min": 14,
            "distance_remaining_km": 6.3,
            "updated_at": "2026-05-23T10:40:00Z"
        }
    },
    "meta": null
}
```

---

### 13.7 Cancel Ride

```http
POST /rides/:ride_id/cancel
```

Protected endpoint.

Allowed for rider or assigned driver depending on ride state.

#### Request Body

```json
{
    "reason": "I no longer need the ride"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Ride cancelled successfully",
    "data": {
        "ride": {
            "id": "ride_uuid",
            "status": "cancelled",
            "cancelled_by_user_id": "user_uuid",
            "cancellation_reason": "I no longer need the ride",
            "cancelled_at": "2026-05-23T10:08:00Z"
        },
        "cancellation": {
            "currency": "PKR",
            "cancellation_fee": 100,
            "fee_charged": true,
            "rule": "rider_cancelled_after_driver_accept"
        }
    },
    "meta": null
}
```

Cancellation fee rule for lab:

| Situation                           |     Fee |
| ----------------------------------- | ------: |
| Rider cancels before driver accepts |       0 |
| Rider cancels after driver accepts  | 100 PKR |
| Driver cancels                      |       0 |

---

### 13.8 Driver Marks Arrived

```http
POST /rides/:ride_id/arrive
```

Protected driver endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Driver marked as arrived",
    "data": {
        "ride": {
            "id": "ride_uuid",
            "status": "arrived",
            "arrived_at": "2026-05-23T10:15:00Z"
        }
    },
    "meta": null
}
```

Allowed transition:

```text
accepted -> arrived
```

---

### 13.9 Driver Starts Ride

```http
POST /rides/:ride_id/start
```

Protected driver endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Ride started successfully",
    "data": {
        "ride": {
            "id": "ride_uuid",
            "status": "started",
            "started_at": "2026-05-23T10:18:00Z"
        },
        "live_state": {
            "ride_id": "ride_uuid",
            "rider_id": "rider_uuid",
            "driver_id": "driver_uuid",
            "status": "started",
            "current_location": {
                "latitude": 31.5204,
                "longitude": 74.3587
            },
            "current_route_id": "route_123",
            "eta_min": 22,
            "distance_remaining_km": 12.4,
            "updated_at": "2026-05-23T10:18:00Z"
        }
    },
    "meta": null
}
```

Allowed transition:

```text
arrived -> started
```

For faster demo, backend may also allow:

```text
accepted -> started
```

---

### 13.10 Submit Ride Tracking Point

```http
POST /rides/:ride_id/tracking
```

Protected driver endpoint.

Used by the driver app during an active ride. This endpoint can be called by REST or replaced with Socket.IO `ride:tracking:update`.

#### Request Body

```json
{
    "latitude": 31.5204,
    "longitude": 74.3587,
    "speed_kmph": 34,
    "heading": 88,
    "traffic_level": "medium",
    "eta_min": 14,
    "distance_remaining_km": 6.3
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Ride tracking updated successfully",
    "data": {
        "tracking_point": {
            "ride_id": "ride_uuid",
            "driver_id": "driver_uuid",
            "latitude": 31.5204,
            "longitude": 74.3587,
            "speed_kmph": 34,
            "heading": 88,
            "traffic_level": "medium",
            "timestamp": "2026-05-23T10:35:00Z"
        },
        "live_state": {
            "ride_id": "ride_uuid",
            "rider_id": "rider_uuid",
            "driver_id": "driver_uuid",
            "status": "started",
            "current_location": {
                "latitude": 31.5204,
                "longitude": 74.3587
            },
            "current_route_id": "route_123",
            "eta_min": 14,
            "distance_remaining_km": 6.3,
            "updated_at": "2026-05-23T10:35:00Z"
        }
    },
    "meta": null
}
```

---

### 13.11 Get Ride Tracking History

```http
GET /rides/:ride_id/tracking
```

Protected endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Ride tracking history fetched successfully",
    "data": [
        {
            "ride_id": "ride_uuid",
            "driver_id": "driver_uuid",
            "latitude": 31.5204,
            "longitude": 74.3587,
            "speed_kmph": 34,
            "heading": 88,
            "traffic_level": "medium",
            "timestamp": "2026-05-23T10:35:00Z"
        }
    ],
    "meta": null
}
```

---

### 13.12 Complete Ride

```http
POST /rides/:ride_id/complete
```

Protected driver endpoint.

Completes the ride, summarizes MongoDB tracking, calculates final fare, updates PostgreSQL, logs final ML prediction, updates Neo4j, and makes driver available again.

#### Request Body

For real backend, these can be calculated from MongoDB tracking. For the mock server, send values explicitly.

```json
{
    "actual_distance_km": 9.0,
    "actual_duration_min": 28,
    "actual_traffic_delay_min": 6,
    "waiting_time_min": 3,
    "route_changed": false
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Ride completed successfully",
    "data": {
        "ride": {
            "id": "ride_uuid",
            "status": "completed",
            "completed_at": "2026-05-23T10:50:00Z"
        },
        "summary": {
            "ride_id": "ride_uuid",
            "actual_distance_km": 9.0,
            "actual_duration_min": 28,
            "actual_traffic_delay_min": 6,
            "waiting_time_min": 3,
            "route_changed": false,
            "completed_at": "2026-05-23T10:50:00Z"
        },
        "fare": {
            "currency": "PKR",
            "actual_distance_km": 9.0,
            "actual_duration_min": 28,
            "actual_traffic_delay_min": 6,
            "waiting_time_min": 3,
            "final_formula_fare": 868,
            "final_ml_predicted_fare": 850,
            "final_fare": 868,
            "model_used": "fare_prediction_linear_regression_v1",
            "finalized_at": "2026-05-23T10:50:00Z"
        }
    },
    "meta": null
}
```

Allowed transition:

```text
started -> completed
```

For faster demo, backend may also allow:

```text
accepted -> completed
arrived -> completed
```

---

### 13.13 Submit Rating for Ride

```http
POST /rides/:ride_id/rating
```

Protected rider endpoint.

#### Request Body

```json
{
    "rating": 5,
    "comment": "Good driver"
}
```

#### Response 201

```json
{
    "success": true,
    "message": "Rating submitted successfully",
    "data": {
        "rating": {
            "id": "rating_uuid",
            "ride_id": "ride_uuid",
            "rider_id": "rider_uuid",
            "driver_id": "driver_uuid",
            "rating": 5,
            "comment": "Good driver",
            "created_at": "2026-05-23T13:00:00Z"
        },
        "driver_average_rating": 4.85
    },
    "meta": null
}
```

Rules:

- Ride must be `completed`.
- Only one rating per ride.
- Only rider-to-driver rating is required.

---

### 13.14 Get Ride Receipt

```http
GET /rides/:ride_id/receipt
```

Protected endpoint.

Receipt is generated from `rides`, `ride_fares`, users, driver, vehicle, and stops. No separate receipt table is required.

#### Response 200

```json
{
    "success": true,
    "message": "Receipt generated successfully",
    "data": {
        "receipt": {
            "receipt_number": "RCPT-20260523-0001",
            "ride_id": "ride_uuid",
            "currency": "PKR",
            "rider": {
                "name": "Ali Khan",
                "phone": "+923001234567"
            },
            "driver": {
                "name": "Ahmed Raza",
                "phone": "+923009876543"
            },
            "vehicle": {
                "make": "Toyota",
                "model": "Corolla",
                "plate_number": "LEA-1234",
                "color": "White"
            },
            "pickup": {
                "address": "Pickup address",
                "latitude": 31.5204,
                "longitude": 74.3587
            },
            "dropoff": {
                "address": "Dropoff address",
                "latitude": 31.47,
                "longitude": 74.27
            },
            "fare_breakdown": {
                "base_fare": 100,
                "distance_fare": 360,
                "duration_fare": 224,
                "waiting_fare": 15,
                "traffic_delay_fare": 24,
                "peak_multiplier": 1.0,
                "surge_multiplier": 1.2,
                "minimum_fare": 250,
                "final_fare": 868
            },
            "actual_distance_km": 9.0,
            "actual_duration_min": 28,
            "completed_at": "2026-05-23T10:50:00Z",
            "delivery_status": "mock_sent",
            "delivery_channels": ["email", "sms"]
        }
    },
    "meta": null
}
```

---

## 14. Driver Ride Offer APIs

---

### 14.1 List My Ride Offers

```http
GET /drivers/me/ride-offers?status=sent
```

Protected driver endpoint.

#### Query Parameters

| Name     | Type   | Required | Notes                             |
| -------- | ------ | -------: | --------------------------------- |
| `status` | string |       no | sent, accepted, declined, expired |

#### Response 200

```json
{
    "success": true,
    "message": "Ride offers fetched successfully",
    "data": [
        {
            "id": "offer_uuid",
            "ride_id": "ride_uuid",
            "driver_id": "driver_uuid",
            "status": "sent",
            "distance_to_pickup_km": 1.4,
            "driver_rating_at_offer": 4.8,
            "decline_reason": null,
            "offered_at": "2026-05-23T10:05:00Z",
            "responded_at": null,
            "expires_at": "2026-05-23T10:06:00Z",
            "ride": {
                "id": "ride_uuid",
                "pickup": {
                    "latitude": 31.5204,
                    "longitude": 74.3587,
                    "address": "Pickup address"
                },
                "dropoff": {
                    "latitude": 31.47,
                    "longitude": 74.27,
                    "address": "Dropoff address"
                },
                "estimated_fare": {
                    "currency": "PKR",
                    "estimated_min_fare": 630,
                    "estimated_max_fare": 770
                },
                "rider_note_to_driver": "Call me when arrived"
            }
        }
    ],
    "meta": null
}
```

---

### 14.2 Accept Ride Offer

```http
POST /drivers/me/ride-offers/:offer_id/accept
```

Protected driver endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Ride offer accepted successfully",
    "data": {
        "offer": {
            "id": "offer_uuid",
            "ride_id": "ride_uuid",
            "driver_id": "driver_uuid",
            "status": "accepted",
            "responded_at": "2026-05-23T10:05:30Z"
        },
        "ride": {
            "id": "ride_uuid",
            "rider_id": "rider_uuid",
            "driver_id": "driver_uuid",
            "vehicle_id": "vehicle_uuid",
            "status": "accepted",
            "accepted_at": "2026-05-23T10:05:30Z",
            "pickup": {
                "latitude": 31.5204,
                "longitude": 74.3587,
                "address": "Pickup address"
            },
            "dropoff": {
                "latitude": 31.47,
                "longitude": 74.27,
                "address": "Dropoff address"
            }
        },
        "driver_to_pickup_route": {
            "route_id": "route_driver_to_pickup_123",
            "ride_id": "ride_uuid",
            "route_type": "driver_to_pickup",
            "provider": "mapbox",
            "selected": true,
            "distance_km": 1.4,
            "normal_duration_min": 5,
            "traffic_duration_min": 7,
            "traffic_delay_min": 2,
            "polyline": "encoded_polyline_here",
            "steps": []
        }
    },
    "meta": null
}
```

Rules:

- Offer must be `sent`.
- Driver must be available.
- Backend sets driver availability false.
- Backend updates PostgreSQL, MongoDB, and Neo4j.

---

### 14.3 Decline Ride Offer

```http
POST /drivers/me/ride-offers/:offer_id/decline
```

Protected driver endpoint.

#### Request Body

```json
{
    "decline_reason": "Too far"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Ride offer declined successfully",
    "data": {
        "offer": {
            "id": "offer_uuid",
            "ride_id": "ride_uuid",
            "driver_id": "driver_uuid",
            "status": "declined",
            "decline_reason": "Too far",
            "responded_at": "2026-05-23T10:05:30Z"
        }
    },
    "meta": null
}
```

Backend should continue searching for another driver.

---

## 15. Driver Earnings and Ratings APIs

---

### 15.1 Get Driver Earnings Dashboard

```http
GET /drivers/me/earnings?period=daily&from=2026-05-01&to=2026-05-31
```

Protected driver endpoint.

#### Query Parameters

| Name     | Type   | Required | Notes                                         |
| -------- | ------ | -------: | --------------------------------------------- |
| `period` | string |       no | `daily`, `weekly`, `monthly`; default `daily` |
| `from`   | date   |       no | YYYY-MM-DD                                    |
| `to`     | date   |       no | YYYY-MM-DD                                    |

#### Response 200

```json
{
    "success": true,
    "message": "Earnings fetched successfully",
    "data": {
        "period": "daily",
        "currency": "PKR",
        "summary": {
            "total_rides": 12,
            "gross_earnings": 12000,
            "estimated_driver_earning": 9600,
            "estimated_platform_commission": 2400
        },
        "items": [
            {
                "period_start": "2026-05-23",
                "period_end": "2026-05-23",
                "completed_rides": 3,
                "gross_earnings": 3000,
                "estimated_driver_earning": 2400,
                "estimated_platform_commission": 600
            }
        ]
    },
    "meta": null
}
```

Rules:

- No separate earnings table is required.
- Backend calculates this from completed rides and final fares.
- Lab formula: `driver_earning = final_fare * 0.80`, `platform_commission = final_fare * 0.20`.

---

### 15.2 Get Driver Ratings

```http
GET /drivers/me/ratings?page=1&limit=20
```

Protected driver endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Driver ratings fetched successfully",
    "data": [
        {
            "id": "rating_uuid",
            "ride_id": "ride_uuid",
            "rider_id": "rider_uuid",
            "driver_id": "driver_uuid",
            "rating": 5,
            "comment": "Good driver",
            "created_at": "2026-05-23T13:00:00Z",
            "rider": {
                "name": "Ali Khan",
                "profile_photo_url": null
            }
        }
    ],
    "meta": {
        "page": 1,
        "limit": 20,
        "total": 1,
        "total_pages": 1
    }
}
```

---

## 16. Pricing and Admin APIs

Admin APIs are useful for demo setup and for showing configurable pricing/peak-hour rules.

---

### 16.1 List Pricing Rules

```http
GET /admin/pricing-rules
```

Protected admin endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Pricing rules fetched successfully",
    "data": [
        {
            "id": "pricing_rule_uuid",
            "city": "Lahore",
            "vehicle_type": "car",
            "base_fare": 100,
            "per_km_rate": 40,
            "per_min_rate": 8,
            "waiting_per_min_rate": 5,
            "traffic_delay_per_min_rate": 4,
            "minimum_fare": 250,
            "peak_start_time": "17:00:00",
            "peak_end_time": "21:00:00",
            "peak_multiplier": 1.2,
            "is_active": true,
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:00:00Z"
        }
    ],
    "meta": null
}
```

---

### 16.2 Create Pricing Rule

```http
POST /admin/pricing-rules
```

Protected admin endpoint.

#### Request Body

```json
{
    "city": "Lahore",
    "vehicle_type": "car",
    "base_fare": 100,
    "per_km_rate": 40,
    "per_min_rate": 8,
    "waiting_per_min_rate": 5,
    "traffic_delay_per_min_rate": 4,
    "minimum_fare": 250,
    "peak_start_time": "17:00:00",
    "peak_end_time": "21:00:00",
    "peak_multiplier": 1.2,
    "is_active": true
}
```

#### Response 201

```json
{
    "success": true,
    "message": "Pricing rule created successfully",
    "data": {
        "pricing_rule": {
            "id": "pricing_rule_uuid",
            "city": "Lahore",
            "vehicle_type": "car",
            "base_fare": 100,
            "per_km_rate": 40,
            "per_min_rate": 8,
            "waiting_per_min_rate": 5,
            "traffic_delay_per_min_rate": 4,
            "minimum_fare": 250,
            "peak_start_time": "17:00:00",
            "peak_end_time": "21:00:00",
            "peak_multiplier": 1.2,
            "is_active": true,
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:00:00Z"
        }
    },
    "meta": null
}
```

---

### 16.3 Update Pricing Rule

```http
PATCH /admin/pricing-rules/:pricing_rule_id
```

Protected admin endpoint.

#### Request Body

All fields are optional.

```json
{
    "base_fare": 120,
    "per_km_rate": 45,
    "is_active": true
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Pricing rule updated successfully",
    "data": {
        "pricing_rule": {
            "id": "pricing_rule_uuid",
            "city": "Lahore",
            "vehicle_type": "car",
            "base_fare": 120,
            "per_km_rate": 45,
            "per_min_rate": 8,
            "waiting_per_min_rate": 5,
            "traffic_delay_per_min_rate": 4,
            "minimum_fare": 250,
            "peak_start_time": "17:00:00",
            "peak_end_time": "21:00:00",
            "peak_multiplier": 1.2,
            "is_active": true,
            "created_at": "2026-05-23T10:00:00Z",
            "updated_at": "2026-05-23T10:15:00Z"
        }
    },
    "meta": null
}
```

---

### 16.4 Approve or Reject Driver Document

```http
PATCH /admin/driver-documents/:document_id/review
```

Protected admin endpoint.

#### Request Body

```json
{
    "status": "approved",
    "rejection_reason": null
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Driver document reviewed successfully",
    "data": {
        "document": {
            "id": "document_uuid",
            "driver_id": "driver_uuid",
            "vehicle_id": null,
            "document_type": "cnic",
            "file_url": "https://example.com/uploads/cnic.jpg",
            "status": "approved",
            "rejection_reason": null,
            "uploaded_at": "2026-05-23T10:00:00Z",
            "verified_at": "2026-05-23T10:30:00Z"
        }
    },
    "meta": null
}
```

---

### 16.5 Update Driver Approval Status

```http
PATCH /admin/drivers/:driver_id/approval
```

Protected admin endpoint.

#### Request Body

```json
{
    "approval_status": "approved"
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Driver approval status updated successfully",
    "data": {
        "driver": {
            "id": "driver_uuid",
            "approval_status": "approved"
        }
    },
    "meta": null
}
```

---

### 16.6 Upsert Surge Zone

```http
POST /admin/surge-zones
```

Protected admin endpoint.

Useful for demo setup. Real system may calculate these automatically.

#### Request Body

```json
{
    "id": "lahore_gulberg",
    "city": "Lahore",
    "area_name": "Gulberg",
    "center": {
        "latitude": 31.5204,
        "longitude": 74.3587
    },
    "radius_km": 3,
    "demand_count": 25,
    "available_drivers": 8,
    "surge_multiplier": 1.5
}
```

#### Response 200

```json
{
    "success": true,
    "message": "Surge zone saved successfully",
    "data": {
        "surge_zone": {
            "id": "lahore_gulberg",
            "city": "Lahore",
            "area_name": "Gulberg",
            "center": {
                "latitude": 31.5204,
                "longitude": 74.3587
            },
            "radius_km": 3,
            "demand_count": 25,
            "available_drivers": 8,
            "supply_demand_ratio": 3.13,
            "surge_multiplier": 1.5,
            "updated_at": "2026-05-23T10:00:00Z"
        }
    },
    "meta": null
}
```

---

## 17. ML APIs

ML can be implemented as an internal service or simple JavaScript/Python call. These endpoints are optional for frontend but useful for demo/admin screens.

---

### 17.1 List ML Models

```http
GET /admin/ml-models
```

Protected admin endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "ML models fetched successfully",
    "data": [
        {
            "id": "model_uuid",
            "model_name": "fare_prediction_linear_regression",
            "model_type": "fare_prediction",
            "algorithm": "Linear Regression",
            "version": "v1",
            "metrics": {
                "mae": 42.5,
                "rmse": 60.2
            },
            "artifact_path": "models/fare_prediction_v1.pkl",
            "is_active": true,
            "created_at": "2026-05-23T10:00:00Z"
        }
    ],
    "meta": null
}
```

---

### 17.2 Get Fare Prediction Logs for Ride

```http
GET /admin/rides/:ride_id/fare-prediction-logs
```

Protected admin endpoint.

#### Response 200

```json
{
    "success": true,
    "message": "Fare prediction logs fetched successfully",
    "data": [
        {
            "ride_id": "ride_uuid",
            "prediction_stage": "pre_ride",
            "model_name": "fare_prediction_linear_regression",
            "model_version": "v1",
            "features": {
                "distance_km": 12.4,
                "duration_min": 33,
                "traffic_delay_min": 7,
                "waiting_time_min": 0,
                "surge_multiplier": 1.2,
                "peak_multiplier": 1.0,
                "hour_of_day": 18,
                "vehicle_type": "car"
            },
            "predicted_fare": 720,
            "actual_final_fare": null,
            "prediction_error": null,
            "created_at": "2026-05-23T10:21:00Z"
        }
    ],
    "meta": null
}
```

---

## 18. Realtime Socket.IO Contract

The React + Capacitor app should use Socket.IO for real-time ride matching and tracking.

REST endpoints still exist so the mock server and backend can be tested without sockets. For the final app, use both:

- REST for creating/updating official records.
- Socket.IO for live updates.

---

### 18.1 Socket Base URL

```text
/realtime
```

Client connects with token:

```js
const socket = io(`${API_BASE_URL}/realtime`, {
    auth: {
        token: accessToken
    }
});
```

---

### 18.2 Socket Rooms

Backend internally joins users to rooms.

| Room                 | Purpose                                     |
| -------------------- | ------------------------------------------- |
| `user:{user_id}`     | Direct messages to a user                   |
| `rider:{rider_id}`   | Rider-specific events                       |
| `driver:{driver_id}` | Driver-specific events and offers           |
| `ride:{ride_id}`     | Live ride updates for both rider and driver |
| `city:{city}`        | Surge/heatmap broadcasts                    |

Frontend does not need to know room names except for `ride:join`.

---

### 18.3 Client Event: Join Ride Room

```text
ride:join
```

#### Payload

```json
{
    "ride_id": "ride_uuid"
}
```

#### Server Ack

```json
{
    "success": true,
    "message": "Joined ride room",
    "data": {
        "ride_id": "ride_uuid"
    }
}
```

---

### 18.4 Client Event: Leave Ride Room

```text
ride:leave
```

#### Payload

```json
{
    "ride_id": "ride_uuid"
}
```

---

### 18.5 Client Event: Driver Location Update

```text
driver:location:update
```

Driver emits when online.

#### Payload

```json
{
    "latitude": 31.5204,
    "longitude": 74.3587,
    "heading": 90,
    "speed_kmph": 35,
    "current_area": "Gulberg"
}
```

#### Server Broadcasts

- `nearby_drivers:update` to relevant riders.
- `driver:location:updated` ack to the driver.

---

### 18.6 Server Event: Nearby Drivers Update

```text
nearby_drivers:update
```

#### Payload

```json
{
    "center": {
        "latitude": 31.5204,
        "longitude": 74.3587
    },
    "drivers": [
        {
            "driver_id": "driver_uuid",
            "vehicle_id": "vehicle_uuid",
            "is_available": true,
            "average_rating": 4.8,
            "latitude": 31.521,
            "longitude": 74.359,
            "heading": 90,
            "speed_kmph": 20,
            "current_area": "Gulberg",
            "distance_km": 0.4,
            "updated_at": "2026-05-23T10:30:00Z"
        }
    ]
}
```

---

### 18.7 Server Event: Ride Offer Created

```text
ride:offer
```

Sent to the selected driver.

#### Payload

```json
{
    "offer": {
        "id": "offer_uuid",
        "ride_id": "ride_uuid",
        "driver_id": "driver_uuid",
        "status": "sent",
        "distance_to_pickup_km": 1.4,
        "driver_rating_at_offer": 4.8,
        "offered_at": "2026-05-23T10:05:00Z",
        "expires_at": "2026-05-23T10:06:00Z",
        "ride": {
            "id": "ride_uuid",
            "pickup": {
                "latitude": 31.5204,
                "longitude": 74.3587,
                "address": "Pickup address"
            },
            "dropoff": {
                "latitude": 31.47,
                "longitude": 74.27,
                "address": "Dropoff address"
            },
            "estimated_fare": {
                "currency": "PKR",
                "estimated_min_fare": 630,
                "estimated_max_fare": 770
            },
            "rider_note_to_driver": "Call me when arrived"
        }
    }
}
```

---

### 18.8 Server Event: Ride Offer Expired

```text
ride:offer:expired
```

#### Payload

```json
{
    "offer_id": "offer_uuid",
    "ride_id": "ride_uuid",
    "status": "expired",
    "expired_at": "2026-05-23T10:06:00Z"
}
```

---

### 18.9 Server Event: Ride Status Update

```text
ride:status:update
```

Sent to rider and driver when official ride status changes.

#### Payload

```json
{
    "ride_id": "ride_uuid",
    "old_status": "accepted",
    "new_status": "arrived",
    "changed_at": "2026-05-23T10:15:00Z",
    "changed_by_user_id": "user_uuid"
}
```

---

### 18.10 Client Event: Ride Tracking Update

```text
ride:tracking:update
```

Driver emits during active ride.

#### Payload

```json
{
    "ride_id": "ride_uuid",
    "latitude": 31.5204,
    "longitude": 74.3587,
    "speed_kmph": 34,
    "heading": 88,
    "traffic_level": "medium",
    "eta_min": 14,
    "distance_remaining_km": 6.3
}
```

---

### 18.11 Server Event: Ride Live Update

```text
ride:live:update
```

Sent to the ride room.

#### Payload

```json
{
    "live_state": {
        "ride_id": "ride_uuid",
        "rider_id": "rider_uuid",
        "driver_id": "driver_uuid",
        "status": "started",
        "current_location": {
            "latitude": 31.5204,
            "longitude": 74.3587
        },
        "current_route_id": "route_123",
        "eta_min": 14,
        "distance_remaining_km": 6.3,
        "updated_at": "2026-05-23T10:40:00Z"
    }
}
```

---

### 18.12 Server Event: Ride Route Update

```text
ride:route:update
```

Sent when rerouting happens.

#### Payload

```json
{
    "ride_id": "ride_uuid",
    "reason": "rerouted",
    "route": {
        "route_id": "route_rerouted_456",
        "ride_id": "ride_uuid",
        "route_type": "rerouted",
        "provider": "mapbox",
        "selected": true,
        "distance_km": 8.2,
        "normal_duration_min": 18,
        "traffic_duration_min": 24,
        "traffic_delay_min": 6,
        "polyline": "encoded_polyline_here",
        "steps": []
    }
}
```

---

### 18.13 Server Event: Ride Cancelled

```text
ride:cancelled
```

#### Payload

```json
{
    "ride_id": "ride_uuid",
    "cancelled_by_user_id": "user_uuid",
    "cancellation_reason": "I no longer need the ride",
    "cancellation_fee": 100,
    "cancelled_at": "2026-05-23T10:08:00Z"
}
```

---

### 18.14 Server Event: Surge Zone Update

```text
surge:update
```

#### Payload

```json
{
    "city": "Lahore",
    "zones": [
        {
            "id": "lahore_gulberg",
            "city": "Lahore",
            "area_name": "Gulberg",
            "center": {
                "latitude": 31.5204,
                "longitude": 74.3587
            },
            "radius_km": 3,
            "demand_count": 25,
            "available_drivers": 8,
            "supply_demand_ratio": 3.13,
            "surge_multiplier": 1.5,
            "updated_at": "2026-05-23T10:00:00Z"
        }
    ]
}
```

---

## 19. Status Transition Rules

### 19.1 Normal Ride Flow

```text
requested
-> searching_driver
-> accepted
-> arrived
-> started
-> completed
```

### 19.2 Cancellation Flow

Ride may become `cancelled` from:

```text
requested
searching_driver
accepted
arrived
```

For the lab project, cancellation after `started` should be blocked.

### 19.3 Driver Offer Flow

```text
sent -> accepted
sent -> declined
sent -> expired
```

Only one offer for a ride can be accepted.

---

## 20. Role Permissions Summary

| API Area                    | Rider | Driver | Admin |
| --------------------------- | ----: | -----: | ----: |
| Register/login              |   yes |    yes |   yes |
| Saved places                |   yes |     no |    no |
| Ride estimate/create        |   yes |     no |    no |
| View own rides              |   yes |    yes |    no |
| Cancel own/assigned ride    |   yes |    yes |    no |
| Accept/decline ride offer   |    no |    yes |    no |
| Update driver location      |    no |    yes |    no |
| Mark arrived/start/complete |    no |    yes |    no |
| Submit rating               |   yes |     no |    no |
| Driver documents/vehicles   |    no |    yes |    no |
| Earnings dashboard          |    no |    yes |    no |
| Pricing rules               |    no |     no |   yes |
| Approve documents/drivers   |    no |     no |   yes |
| ML logs/models              |    no |     no |   yes |

---

## 21. Mock Server Requirements

The frontend mock server must follow the same response shapes as this contract.

Recommended mock behavior:

1. Always return `success`, `message`, `data`, and `meta`.
2. Use fixed UUID-looking strings for seeded users/rides/drivers.
3. Use Lahore coordinates for Mapbox/map mocks.
4. Use `123456` as the mock OTP.
5. Simulate driver matching by creating a `ride_offer` after ride creation.
6. Simulate driver acceptance either manually through driver UI or with a mock button.
7. Simulate live tracking by moving the driver marker along a static route polyline.
8. Generate final fare from the formula in the database design.
9. Generate receipt from the completed ride data.
10. Keep all response keys in snake_case.

---

## 22. Recommended Seed Data for Mock Server

### 22.1 Rider Login

```json
{
    "email_or_phone": "rider@test.com",
    "password": "password123"
}
```

### 22.2 Driver Login

```json
{
    "email_or_phone": "driver@test.com",
    "password": "password123"
}
```

### 22.3 Admin Login

```json
{
    "email_or_phone": "admin@test.com",
    "password": "password123"
}
```

### 22.4 Default Map Center

```json
{
    "latitude": 31.5204,
    "longitude": 74.3587,
    "city": "Lahore"
}
```

### 22.5 Default Pricing Rule

```json
{
    "city": "Lahore",
    "vehicle_type": "car",
    "base_fare": 100,
    "per_km_rate": 40,
    "per_min_rate": 8,
    "waiting_per_min_rate": 5,
    "traffic_delay_per_min_rate": 4,
    "minimum_fare": 250,
    "peak_start_time": "17:00:00",
    "peak_end_time": "21:00:00",
    "peak_multiplier": 1.2,
    "is_active": true
}
```

---

## 23. Backend Implementation Notes

### 23.1 Express Routing Suggestion

Recommended route groups:

```text
routes/auth.routes.js
routes/users.routes.js
routes/riders.routes.js
routes/drivers.routes.js
routes/vehicles.routes.js
routes/maps.routes.js
routes/rides.routes.js
routes/admin.routes.js
```

### 23.2 Service Layer Suggestion

Recommended services:

```text
services/auth.service.js
services/mapbox.service.js
services/fare.service.js
services/ml.service.js
services/ride.service.js
services/matching.service.js
services/tracking.service.js
services/neo4j-sync.service.js
```

### 23.3 Important Rule

Do not let frontend calculate official fare.

Frontend may display estimated fare from `/rides/estimate`, but official fare values must be generated by backend and stored in PostgreSQL `ride_fares`.

---

## 24. Final Endpoint Checklist

### Auth

```text
POST   /auth/register/rider
POST   /auth/register/driver
POST   /auth/login
GET    /auth/me
POST   /auth/otp/send
POST   /auth/otp/verify
POST   /auth/logout
```

### Users

```text
PATCH  /users/me
POST   /users/me/profile-photo
```

### Rider

```text
GET    /riders/me
GET    /riders/me/saved-places
POST   /riders/me/saved-places
PATCH  /riders/me/saved-places/:saved_place_id
DELETE /riders/me/saved-places/:saved_place_id
```

### Driver

```text
GET    /drivers/me
PATCH  /drivers/me/availability
POST   /drivers/me/location
GET    /drivers/me/documents
POST   /drivers/me/documents
GET    /drivers/me/vehicles
POST   /drivers/me/vehicles
PATCH  /drivers/me/vehicles/:vehicle_id
POST   /drivers/me/vehicles/:vehicle_id/set-active
GET    /drivers/me/ride-offers
POST   /drivers/me/ride-offers/:offer_id/accept
POST   /drivers/me/ride-offers/:offer_id/decline
GET    /drivers/me/earnings
GET    /drivers/me/ratings
```

### Maps

```text
GET    /maps/config
GET    /maps/autocomplete
GET    /maps/reverse-geocode
POST   /maps/route-preview
GET    /maps/nearby-drivers
GET    /maps/surge-zones
```

### Rides

```text
POST   /rides/estimate
POST   /rides
GET    /rides
GET    /rides/:ride_id
GET    /rides/:ride_id/route
GET    /rides/:ride_id/live
POST   /rides/:ride_id/cancel
POST   /rides/:ride_id/arrive
POST   /rides/:ride_id/start
POST   /rides/:ride_id/tracking
GET    /rides/:ride_id/tracking
POST   /rides/:ride_id/complete
POST   /rides/:ride_id/rating
GET    /rides/:ride_id/receipt
```

### Admin

```text
GET    /admin/pricing-rules
POST   /admin/pricing-rules
PATCH  /admin/pricing-rules/:pricing_rule_id
PATCH  /admin/driver-documents/:document_id/review
PATCH  /admin/drivers/:driver_id/approval
POST   /admin/surge-zones
GET    /admin/ml-models
GET    /admin/rides/:ride_id/fare-prediction-logs
```

### Socket.IO Events

```text
Client emits:
ride:join
ride:leave
driver:location:update
ride:tracking:update

Server emits:
nearby_drivers:update
ride:offer
ride:offer:expired
ride:status:update
ride:live:update
ride:route:update
ride:cancelled
surge:update
```

---

## 25. Final Contract Statement

This API contract is the implementation reference for both backend and frontend. The backend and mock server must return the same JSON shapes. The frontend should only depend on the response keys and endpoint behavior defined here. Any later backend changes must remain backward compatible with this contract unless the contract is updated deliberately.
