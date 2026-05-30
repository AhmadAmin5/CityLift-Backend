import { prisma } from "../db/postgres.js";
import DriverLocation from "../models/driverLocation.model.js";
import SurgeZone from "../models/surgeZone.model.js";

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function getDefaultDemandSupply() {
    return {
        surge_zone_id: null,
        demand_count: 1,
        available_drivers: 1,
        demand_ratio: 1,
        zone_driver_count: 1,
        nearby_drivers_count: 0
    };
}

export async function getDemandSupplyForPickup(pickup) {
    if (!pickup || !Number.isFinite(Number(pickup.latitude)) || !Number.isFinite(Number(pickup.longitude))) {
        return getDefaultDemandSupply();
    }

    // 1. Resolve pickup zone from surge zones.
    const zones = await SurgeZone.find({}).lean();
    let resolvedZone = null;
    let minDistance = Infinity;

    for (const zone of zones) {
        if (
            !zone.center ||
            !Number.isFinite(zone.center.latitude) ||
            !Number.isFinite(zone.center.longitude)
        ) {
            continue;
        }
        const dist = haversineDistanceKm(
            Number(pickup.latitude),
            Number(pickup.longitude),
            Number(zone.center.latitude),
            Number(zone.center.longitude)
        );
        if (dist <= Number(zone.radius_km || 0) && dist < minDistance) {
            minDistance = dist;
            resolvedZone = zone;
        }
    }

    // 2. Count available drivers near pickup from live driver location data.
    let available_drivers = 0;
    try {
        available_drivers = await DriverLocation.countDocuments({
            is_available: true,
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [Number(pickup.longitude), Number(pickup.latitude)]
                    },
                    $maxDistance: 3000 // 3km
                }
            }
        });
    } catch (err) {
        available_drivers = 0;
    }

    if (!resolvedZone) {
        return {
            surge_zone_id: null,
            demand_count: 1,
            available_drivers: Math.max(available_drivers, 1),
            demand_ratio: 1,
            zone_driver_count: Math.max(available_drivers, 1),
            nearby_drivers_count: available_drivers
        };
    }

    // 3. Count active ride requests in the same zone.
    let demand_count = 0;
    try {
        demand_count = await prisma.ride.count({
            where: {
                surgeZoneId: resolvedZone.zone_id,
                status: {
                    in: ["requested", "searching_driver", "driver_assigned", "accepted", "arrived", "started"]
                }
            }
        });
    } catch (err) {
        demand_count = 0;
    }

    // 4. Calculate
    const demand_ratio = demand_count / Math.max(available_drivers, 1);
    const zone_driver_count = available_drivers;
    const nearby_drivers_count = available_drivers;

    return {
        surge_zone_id: resolvedZone.zone_id,
        demand_count,
        available_drivers,
        demand_ratio,
        zone_driver_count,
        nearby_drivers_count
    };
}
