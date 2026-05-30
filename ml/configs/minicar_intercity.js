// ml/configs/minicar_intercity.js
// Mini car, intercity (scheduled, seat-based). 4-seat car on long routes.
import { sampleIntercityRide } from "../lib/intercity.js";

export default {
    name: "minicar_intercity",
    scope: "intercity",
    featureSet: "intercity",
    vehicle: "minicar",
    fare: { base_fare: 1500, per_km: 32, min_fare: 1800, max_surge: 2.0 },

    sampleRide() {
        return sampleIntercityRide({
            minDist: 50,
            maxDist: 450,
            tollBase: 50,
            tollPerKm: 2.5,
            seatCapacity: 4,
            demandW: 0.08,
            occupancyW: 0.15,
            maxSurge: this.fare.max_surge
        });
    }
};
