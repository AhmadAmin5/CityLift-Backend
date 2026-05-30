// ml/configs/parcel_intercity.js
// Parcel freight, intercity. No passenger seats — capacity 1 (always "full"),
// so the seat-occupancy term neutralizes. Demand is steady (goods ship in any
// weather); surge driven by distance, dead-return, tolls, and supply.
import { sampleIntercityRide } from "../lib/intercity.js";

export default {
    name: "parcel_intercity",
    scope: "intercity",
    featureSet: "intercity",
    vehicle: "parcel",
    fare: { base_fare: 1200, per_km: 28, min_fare: 1500, max_surge: 2.0 },

    sampleRide() {
        return sampleIntercityRide({
            minDist: 50,
            maxDist: 500,
            tollBase: 60,
            tollPerKm: 2.5,
            seatCapacity: 1, // freight: no passenger seats
            demandW: 0.06,
            occupancyW: 0, // weather/seat-insensitive demand
            maxSurge: this.fare.max_surge
        });
    }
};
