import mongoose from "mongoose";

const driverLocationSchema = new mongoose.Schema(
    {
        driver_id: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        vehicle_id: {
            type: String,
            required: true
        },

        is_available: {
            type: Boolean,
            default: false,
            index: true
        },

        average_rating: {
            type: Number,
            default: 5.0
        },

        location: {
            type: {
                type: String,
                enum: ["Point"],
                required: true,
                default: "Point"
            },
            coordinates: {
                type: [Number],
                required: true
            }
        },

        heading: {
            type: Number,
            default: 0
        },

        speed_kmph: {
            type: Number,
            default: 0
        },

        current_area: {
            type: String,
            default: null
        },

        updated_at: {
            type: Date,
            default: Date.now
        }
    },
    {
        versionKey: false,
        collection: "driver_locations"
    }
);

driverLocationSchema.index({
    location: "2dsphere"
});

driverLocationSchema.index({
    is_available: 1,
    updated_at: -1
});

export default mongoose.model("DriverLocation", driverLocationSchema);
