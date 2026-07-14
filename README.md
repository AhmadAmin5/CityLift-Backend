# CityLift Backend

A scalable Node.js + Express backend powering **CityLift**, a ride-hailing platform that connects riders and drivers through real-time ride booking, navigation, fare estimation, and trip management.

Unlike traditional CRUD applications, CityLift is built using a **polyglot persistence architecture**, leveraging **PostgreSQL**, **MongoDB**, and **Neo4j** to store and process different types of data based on their strengths, and a custom-trained AI model for fair fare calculation. The backend also integrates mapping, routing, weather, pricing, and real-time communication services to provide a complete ride-booking experience.


> You may also want to check the **[CityLift Frontend](https://github.com/AhmadAmin5/CityLift-Ride-Frontend.git)** repository for the client application.

---

# Overview

CityLift Backend exposes a versioned REST API that manages riders, drivers, vehicles, rides, maps, AI-assisted demand prediction, dynamic pricing, authentication, and administrative operations.

The system supports the complete ride lifecycle—from rider registration and fare estimation to driver assignment, live tracking, trip completion, ratings, and analytics. It also includes real-time communication through WebSockets and integrates multiple external APIs for mapping and location services.

---

# Tech Stack

### Backend

- Node.js
- Express.js

### Databases

- PostgreSQL
- MongoDB
- Neo4j

### Authentication

- JWT
- bcrypt

### Real-Time Communication

- Socket.IO

### Maps & Location Services

- Google Maps APIs
- Mapbox
- Google Geocoding API
- Google Places API
- Google Routes API

### External Services

- OpenWeather API

### File Uploads

- Multer

### Utilities

- dotenv
- cors
- cookie-parser

---

# Polyglot Database Architecture

CityLift uses multiple databases, each responsible for a different type of workload.

- **PostgreSQL** stores structured transactional data such as users, riders, drivers, vehicles, rides, payments, and other relational entities.
- **MongoDB** stores flexible and rapidly changing data including live driver locations, surge zones, weather updates, and operational data.
- **Neo4j** models graph relationships to support location-based analytics, nearby driver discovery, and graph-oriented operations.

This architecture allows each database to be used where it performs best while keeping the overall system scalable and efficient.

---

# Getting Started

## Prerequisites

Before running the project, ensure you have:

- Node.js
- PostgreSQL
- MongoDB
- Neo4j Database
- Google Maps API Keys
- Mapbox API Token

---

## Clone Repository

```bash
git clone https://github.com/AhmadAmin5/CityLift-Ride-Backend.git

cd CityLift-Ride-Backend
```

---

## Install Dependencies

```bash
npm install
```

---

## Configure Environment Variables

Create a `.env` file in the project root using the provided `.env.sample` as reference.

Configure:

- PostgreSQL connection
- MongoDB connection
- Neo4j connection
- JWT secrets
- Google Maps credentials
- Mapbox token
- Weather API key
- Socket configuration
- Other application settings

---

## Start Development Server

```bash
npm run dev
```

For production:

```bash
npm start
```

---

# Main Features

## Authentication

- JWT-based authentication
- Secure login and registration
- Password hashing with bcrypt
- Protected API endpoints
- Role-based authorization

---

## Rider Management

- Rider registration
- Rider profile management
- Saved locations
- Ride history
- Ratings and reviews

---

## Driver Management

- Driver registration
- Driver profile management
- Driver verification workflow
- Vehicle registration
- Driver document management
- Driver availability status
- Online/Offline controls

---

## Vehicle Management

- Vehicle registration
- Vehicle information updates
- Vehicle verification
- Driver-vehicle association

---

## Ride Booking

- Ride fare estimation
- Pickup and destination selection
- Ride request creation
- Nearby driver matching
- Driver offer handling
- Ride acceptance and rejection
- Ride cancellation
- Ride completion

---

## Live Ride Tracking

- Real-time driver location updates
- Live ride status updates
- Rider-driver synchronization
- WebSocket-based communication
- Continuous trip monitoring

---

## Maps & Navigation

- Address geocoding
- Reverse geocoding
- Route generation
- Distance calculation
- Estimated travel time
- Place search
- Route preview

---

## Smart Pricing

- Distance-based fare calculation
- Dynamic pricing
- Surge pricing support
- Demand and supply adjustments
- Weather-aware pricing
- Final fare calculation

---

## Ratings & Reviews

- Rider ratings
- Driver ratings
- Trip feedback
- Ride receipts

---

## Administrative Features

- User management
- Driver verification
- Ride monitoring
- Pricing management
- Surge zone management
- Graph analytics
- Platform statistics

---

## Graph Analytics

Using Neo4j, the backend supports graph-based operations including:

- Driver area relationships
- Geographic analytics
- Location graph queries
- Driver distribution analysis

---

## Real-Time Features

- Socket.IO integration
- Driver connection management
- Live location streaming
- Ride event broadcasting
- Instant rider-driver updates

---

# Project Structure

```text
src/
├── config/          # Shared configuration
├── controllers/     # Route controllers
├── db/              # PostgreSQL, MongoDB and Neo4j connections
├── middlewares/     # Authentication and upload middleware
├── models/          # MongoDB models
├── routes/          # API routes
├── services/        # Business logic and external integrations
│   ├── neo4j/
│   ├── pricing
│   ├── maps
│   ├── weather
│   └── ride estimation
├── socket/          # Socket.IO handlers
├── utils/           # Utility functions
├── app.js
└── index.js
```

---

# API Base URL

```text
/api/v1
```

---

# Route Overview

### Authentication

- Authentication
- Login
- Registration
- Session management

### Users

- User profile
- Account management

### Riders

- Rider profiles
- Saved places
- Ride history
- Ratings

### Drivers

- Driver registration
- Driver verification
- Vehicles
- Documents
- Availability
- Live locations

### Rides

- Fare estimation
- Ride requests
- Ride lifecycle
- Ride tracking
- Ride completion

### Maps

- Places search
- Geocoding
- Route generation
- Navigation support

### Admin

- User administration
- Driver administration
- Pricing controls
- Analytics
- Platform management

---

# Important Notes

- Uses a **polyglot database architecture** combining PostgreSQL, MongoDB, and Neo4j.
- Real-time communication is powered by **Socket.IO**.
- Integrates multiple mapping providers for routing and geolocation.
- Supports dynamic fare calculation using multiple pricing factors.
- Driver locations are updated continuously during active sessions.
- Ride events are synchronized between riders and drivers in real time.
- Built using a modular service-oriented architecture for easier maintenance and scalability.

---

# Why This Project Is Useful

CityLift Backend demonstrates the implementation of a modern ride-hailing platform using industry-relevant technologies and architectural patterns.

It showcases:

- Polyglot persistence
- Real-time communication
- RESTful API design
- Graph databases
- Geospatial services
- Dynamic pricing strategies
- Modular backend architecture
- Third-party API integration
- Ride lifecycle management
- Scalable service organization

The project serves as a strong backend foundation for ride-sharing, transportation, logistics, and other location-based applications.