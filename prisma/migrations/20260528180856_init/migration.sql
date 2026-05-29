CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('rider', 'driver', 'admin');

-- CreateEnum
CREATE TYPE "DriverApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'suspended');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('cnic', 'license', 'vehicle_registration');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('car', 'bike', 'rickshaw');

-- CreateEnum
CREATE TYPE "SavedPlaceType" AS ENUM ('home', 'work', 'favorite');

-- CreateEnum
CREATE TYPE "RideType" AS ENUM ('standard', 'scheduled', 'recurring');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('requested', 'searching_driver', 'driver_assigned', 'accepted', 'arrived', 'started', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "StopType" AS ENUM ('pickup', 'intermediate', 'dropoff');

-- CreateEnum
CREATE TYPE "RideOfferStatus" AS ENUM ('sent', 'accepted', 'declined', 'expired');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "profile_photo_url" TEXT,
    "email_verified_at" TIMESTAMPTZ,
    "phone_verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "average_rating" DECIMAL(3,2) NOT NULL DEFAULT 5.00,
    "total_rides" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "average_rating" DECIMAL(3,2) NOT NULL DEFAULT 5.00,
    "total_rides" INTEGER NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "approval_status" "DriverApprovalStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "make" VARCHAR(50) NOT NULL,
    "model" VARCHAR(50) NOT NULL,
    "year" INTEGER,
    "plate_number" VARCHAR(30) NOT NULL,
    "color" VARCHAR(30),
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'car',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "verification_status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "document_type" "DocumentType" NOT NULL,
    "file_url" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ,

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_places" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rider_id" UUID NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "place_type" "SavedPlaceType" NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "address" TEXT,
    "provider" VARCHAR(30),
    "provider_place_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rider_id" UUID NOT NULL,
    "driver_id" UUID,
    "vehicle_id" UUID,
    "ride_type" "RideType" NOT NULL DEFAULT 'standard',
    "scheduled_pickup_at" TIMESTAMPTZ,
    "recurrence_rule" TEXT,
    "pickup_latitude" DECIMAL(10,7) NOT NULL,
    "pickup_longitude" DECIMAL(10,7) NOT NULL,
    "pickup_address" TEXT,
    "pickup_provider_place_id" TEXT,
    "dropoff_latitude" DECIMAL(10,7) NOT NULL,
    "dropoff_longitude" DECIMAL(10,7) NOT NULL,
    "dropoff_address" TEXT,
    "dropoff_provider_place_id" TEXT,
    "rider_note_to_driver" TEXT,
    "status" "RideStatus" NOT NULL DEFAULT 'requested',
    "selected_route_id" VARCHAR(100),
    "surge_zone_id" VARCHAR(100),
    "cancelled_by_user_id" UUID,
    "cancellation_reason" TEXT,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ,
    "arrived_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_stops" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "stop_order" INTEGER NOT NULL,
    "stop_type" "StopType" NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "address" TEXT,
    "provider" VARCHAR(30),
    "provider_place_id" TEXT,
    "arrived_at" TIMESTAMPTZ,
    "departed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ride_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_offers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "status" "RideOfferStatus" NOT NULL DEFAULT 'sent',
    "distance_to_pickup_km" DECIMAL(8,2),
    "driver_rating_at_offer" DECIMAL(3,2),
    "decline_reason" TEXT,
    "offered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,

    CONSTRAINT "ride_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city" VARCHAR(100) NOT NULL DEFAULT 'default',
    "vehicle_type" "VehicleType" NOT NULL DEFAULT 'car',
    "base_fare" DECIMAL(10,2) NOT NULL,
    "per_km_rate" DECIMAL(10,2) NOT NULL,
    "per_min_rate" DECIMAL(10,2) NOT NULL,
    "waiting_per_min_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "traffic_delay_per_min_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minimum_fare" DECIMAL(10,2) NOT NULL,
    "peak_start_time" TIME(6),
    "peak_end_time" TIME(6),
    "peak_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_fares" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "pricing_rule_id" UUID,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'PKR',
    "estimated_distance_km" DECIMAL(8,2),
    "estimated_duration_min" INTEGER,
    "estimated_traffic_delay_min" INTEGER,
    "pre_ride_ml_predicted_fare" DECIMAL(10,2),
    "pre_ride_formula_fare" DECIMAL(10,2),
    "estimated_min_fare" DECIMAL(10,2),
    "estimated_max_fare" DECIMAL(10,2),
    "actual_distance_km" DECIMAL(8,2),
    "actual_duration_min" INTEGER,
    "actual_traffic_delay_min" INTEGER,
    "waiting_time_min" INTEGER NOT NULL DEFAULT 0,
    "base_fare" DECIMAL(10,2),
    "per_km_rate" DECIMAL(10,2),
    "per_min_rate" DECIMAL(10,2),
    "waiting_per_min_rate" DECIMAL(10,2),
    "traffic_delay_per_min_rate" DECIMAL(10,2),
    "peak_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    "surge_multiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    "minimum_fare" DECIMAL(10,2),
    "final_ml_predicted_fare" DECIMAL(10,2),
    "final_formula_fare" DECIMAL(10,2),
    "cancellation_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "final_fare" DECIMAL(10,2),
    "fare_policy" VARCHAR(30) NOT NULL DEFAULT 'metered_after_ride',
    "model_used" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMPTZ,

    CONSTRAINT "ride_fares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml_models" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "model_name" VARCHAR(100) NOT NULL,
    "model_type" VARCHAR(50) NOT NULL,
    "algorithm" VARCHAR(100),
    "version" VARCHAR(50),
    "metrics" JSONB,
    "artifact_path" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "rider_id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ride_id" UUID NOT NULL,
    "old_status" "RideStatus",
    "new_status" "RideStatus" NOT NULL,
    "changed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by_user_id" UUID,

    CONSTRAINT "ride_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "riders_user_id_key" ON "riders"("user_id");

-- CreateIndex
CREATE INDEX "idx_riders_user_id" ON "riders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_user_id_key" ON "drivers"("user_id");

-- CreateIndex
CREATE INDEX "idx_drivers_user_id" ON "drivers"("user_id");

-- CreateIndex
CREATE INDEX "idx_drivers_available" ON "drivers"("is_available");

-- CreateIndex
CREATE INDEX "idx_drivers_approval_status" ON "drivers"("approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");

-- CreateIndex
CREATE INDEX "idx_vehicles_driver_id" ON "vehicles"("driver_id");

-- CreateIndex
CREATE INDEX "idx_vehicles_plate_number" ON "vehicles"("plate_number");

-- CreateIndex
CREATE INDEX "idx_driver_documents_driver_id" ON "driver_documents"("driver_id");

-- CreateIndex
CREATE INDEX "idx_driver_documents_status" ON "driver_documents"("status");

-- CreateIndex
CREATE INDEX "idx_saved_places_rider_id" ON "saved_places"("rider_id");

-- CreateIndex
CREATE INDEX "idx_saved_places_type" ON "saved_places"("place_type");

-- CreateIndex
CREATE INDEX "idx_rides_rider_id" ON "rides"("rider_id");

-- CreateIndex
CREATE INDEX "idx_rides_driver_id" ON "rides"("driver_id");

-- CreateIndex
CREATE INDEX "idx_rides_status" ON "rides"("status");

-- CreateIndex
CREATE INDEX "idx_rides_ride_type" ON "rides"("ride_type");

-- CreateIndex
CREATE INDEX "idx_rides_scheduled_pickup_at" ON "rides"("scheduled_pickup_at");

-- CreateIndex
CREATE INDEX "idx_rides_requested_at" ON "rides"("requested_at");

-- CreateIndex
CREATE INDEX "idx_ride_stops_ride_id" ON "ride_stops"("ride_id");

-- CreateIndex
CREATE INDEX "idx_ride_stops_order" ON "ride_stops"("ride_id", "stop_order");

-- CreateIndex
CREATE UNIQUE INDEX "ride_stops_ride_id_stop_order_key" ON "ride_stops"("ride_id", "stop_order");

-- CreateIndex
CREATE INDEX "idx_ride_offers_ride_id" ON "ride_offers"("ride_id");

-- CreateIndex
CREATE INDEX "idx_ride_offers_driver_id" ON "ride_offers"("driver_id");

-- CreateIndex
CREATE INDEX "idx_ride_offers_status" ON "ride_offers"("status");

-- CreateIndex
CREATE INDEX "idx_pricing_rules_city_vehicle" ON "pricing_rules"("city", "vehicle_type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "ride_fares_ride_id_key" ON "ride_fares"("ride_id");

-- CreateIndex
CREATE INDEX "idx_ride_fares_ride_id" ON "ride_fares"("ride_id");

-- CreateIndex
CREATE INDEX "idx_ride_fares_pricing_rule_id" ON "ride_fares"("pricing_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_ride_id_key" ON "ratings"("ride_id");

-- CreateIndex
CREATE INDEX "idx_ratings_driver_id" ON "ratings"("driver_id");

-- CreateIndex
CREATE INDEX "idx_ratings_rider_id" ON "ratings"("rider_id");

-- CreateIndex
CREATE INDEX "idx_ride_status_history_ride_id" ON "ride_status_history"("ride_id");

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_stops" ADD CONSTRAINT "ride_stops_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_offers" ADD CONSTRAINT "ride_offers_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_fares" ADD CONSTRAINT "ride_fares_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_fares" ADD CONSTRAINT "ride_fares_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "pricing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rider_id_fkey" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_status_history" ADD CONSTRAINT "ride_status_history_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_status_history" ADD CONSTRAINT "ride_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


CREATE UNIQUE INDEX uq_active_vehicle_per_driver
ON vehicles(driver_id)
WHERE is_active = true;

CREATE UNIQUE INDEX uq_saved_place_home_work_per_rider
ON saved_places(rider_id, place_type)
WHERE place_type IN ('home', 'work');