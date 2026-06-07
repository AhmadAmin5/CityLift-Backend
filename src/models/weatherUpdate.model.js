import mongoose from "mongoose";

const weatherUpdateSchema = new mongoose.Schema(
    {
        ride_id: {
            type: String,
            required: true,
            index: true
        },
        latitude: {
            type: Number,
            required: true
        },
        longitude: {
            type: Number,
            required: true
        },
        weather_code: {
            type: Number,
            required: true
        },
        rain_mm: {
            type: Number,
            default: 0
        },
        visibility_m: {
            type: Number,
            default: 10000
        },
        wind_speed: {
            type: Number,
            default: 5
        },
        feels_like_temp: {
            type: Number,
            default: 30
        },
        timestamp: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    {
        versionKey: false,
        collection: "weather_updates"
    }
);

export default mongoose.model("WeatherUpdate", weatherUpdateSchema);
