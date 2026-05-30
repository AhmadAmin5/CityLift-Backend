// ml/configs/economy_intercity.js
// Economy car, intercity. Premium tier: longer routes, higher tolls, a touch
// more demand elasticity than mini car.
import { sampleIntercityRide } from "../lib/intercity.js";

export default {
    name: "economy_intercity",
    scope: "intercity",
    featureSet: "intercity",
    vehicle: "economy",
    fare: { base_fare: 2000, per_km: 42, min_fare: 2500, max_surge: 2.0 },

    sampleRide() {
        return sampleIntercityRide({
            minDist: 50,
            maxDist: 500,
            tollBase: 80,
            tollPerKm: 3.0,
            seatCapacity: 4,
            demandW: 0.1,
            occupancyW: 0.18,
            maxSurge: this.fare.max_surge
        });
    }
};
