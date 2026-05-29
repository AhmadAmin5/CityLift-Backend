import mongoose from "mongoose";

const surgeZoneSchema = new mongoose.Schema(
    {
        zone_id: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        city: {
            type: String,
            required: true,
            index: true
        },
        area_name: {
            type: String,
            required: true
        },
        center: {
            latitude: {
                type: Number,
                required: true
            },
            longitude: {
                type: Number,
                required: true
            }
        },
        radius_km: {
            type: Number,
            required: true
        },
        demand_count: {
            type: Number,
            default: 0
        },
        available_drivers: {
            type: Number,
            default: 0
        },
        supply_demand_ratio: {
            type: Number,
            default: 1.0
        },
        surge_multiplier: {
            type: Number,
            default: 1.0
        },
        updated_at: {
            type: Date,
            default: Date.now
        }
    },
    {
        versionKey: false,
        collection: "surge_zones"
    }
);

export default mongoose.model("SurgeZone", surgeZoneSchema);
