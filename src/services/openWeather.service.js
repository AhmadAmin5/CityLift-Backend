import logger from "../utils/logger.js";

export function mapOpenWeatherToWeatherCode(weatherMain, weatherDescription) {
    const main = String(weatherMain || "").toLowerCase();
    const description = String(weatherDescription || "").toLowerCase();
    const text = `${main} ${description}`;

    if (text.includes("thunderstorm") || text.includes("storm")) return 5;
    if (text.includes("fog") || text.includes("mist") || text.includes("haze") || text.includes("smoke"))
        return 6;
    if (text.includes("dust") || text.includes("sand")) return 7;
    if (text.includes("heavy rain") || text.includes("extreme rain")) return 4;
    if (text.includes("moderate rain")) return 3;
    if (text.includes("rain") || text.includes("drizzle")) return 2;
    if (text.includes("cloud")) return 1;

    return 0;
}

export function getDefaultWeather() {
    return {
        weather_code: 0,
        rain_mm: 0,
        visibility_m: 10000,
        wind_speed: 5,
        feels_like_temp: 30
    };
}

export async function getCurrentWeather(pickup) {
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
        logger.warn("OPENWEATHER_API_KEY is missing. Using default weather.");
        return getDefaultWeather();
    }

    if (!pickup || !Number.isFinite(Number(pickup.latitude)) || !Number.isFinite(Number(pickup.longitude))) {
        logger.warn("Invalid coordinates provided to OpenWeather. Using default weather.");
        return getDefaultWeather();
    }

    const lat = pickup.latitude;
    const lon = pickup.longitude;
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`OpenWeather HTTP error: ${response.status}`);
        }

        const data = await response.json();
        const weatherObj = data.weather?.[0] || {};
        const weatherMain = weatherObj.main || "";
        const weatherDesc = weatherObj.description || "";

        const weather_code = mapOpenWeatherToWeatherCode(weatherMain, weatherDesc);
        const rain_mm = data.rain ? data.rain["1h"] || data.rain["3h"] || 0 : 0;
        const visibility_m = data.visibility || 10000;
        const wind_speed = Number(data.wind?.speed || 0) * 3.6;
        const feels_like_temp = data.main?.feels_like !== undefined ? data.main.feels_like : 30;

        return {
            weather_code,
            rain_mm,
            visibility_m,
            wind_speed,
            feels_like_temp
        };
    } catch (error) {
        logger.error(`Error fetching current weather: ${error.message}. Using fallback weather.`);
        return getDefaultWeather();
    }
}
