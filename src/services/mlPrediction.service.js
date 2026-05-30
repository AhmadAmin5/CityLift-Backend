import { predictSurge } from "../../ml/prediction/predictor.js";
import { mapApiVehicleToMlVehicle } from "../utils/vehicleMapper.js";

export async function predictRideSurge({ vehicleType, scope, rawInput }) {
    const mlVehicle = mapApiVehicleToMlVehicle(vehicleType);
    const modelUsed = `${mlVehicle}_${scope}`;

    try {
        const surgeMultiplier = await predictSurge(mlVehicle, scope, rawInput);

        return {
            surge_multiplier: surgeMultiplier,
            model_used: modelUsed,
            ml_available: true,
            ml_error: null
        };
    } catch (err) {
        console.error("[ML_SURGE_FALLBACK]", {
            model_used: modelUsed,
            error: err.message
        });

        return {
            surge_multiplier: 1.0,
            model_used: "formula_fallback",
            ml_available: false,
            ml_error: err.message
        };
    }
}
