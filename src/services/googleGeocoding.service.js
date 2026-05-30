import logger from "../utils/logger.js";

const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const getGoogleMapsApiKey = () => {
    return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || null;
};

const reverseGeocodeWithGoogle = async (latitude, longitude) => {
    const apiKey = getGoogleMapsApiKey();

    if (!apiKey) {
        logger.warn("Google Maps API key not found. Skipping reverse geocode.");
        return null;
    }

    const lat = Number(latitude);
    const lon = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }

    try {
        const params = new URLSearchParams({
            latlng: `${lat},${lon}`,
            key: apiKey,
            language: "en",
            region: "pk"
        });

        const url = `${GOOGLE_GEOCODING_URL}?${params.toString()}`;

        const response = await fetch(url);
        const body = await response.json();

        if (!response.ok || body.status !== "OK") {
            logger.error(`Google reverse geocode error: ${response.status} ${JSON.stringify(body)}`);
            return null;
        }

        const result = body.results?.[0];

        if (!result) {
            return null;
        }

        const name =
            result.address_components?.[0]?.long_name ||
            result.formatted_address?.split(",")[0] ||
            "Selected Location";

        return {
            provider: "google",
            provider_place_id: result.place_id || null,
            place_id: result.place_id || null,
            name,
            address: result.formatted_address || `Lat: ${lat.toFixed(6)}, Lng: ${lon.toFixed(6)}`,

            // Critical:
            // For manual pin selection, always keep the clicked pin coordinates.
            latitude: lat,
            longitude: lon,

            reverse_geocoded_latitude: result.geometry?.location?.lat ?? null,
            reverse_geocoded_longitude: result.geometry?.location?.lng ?? null,
            place_type: result.types || [],
            is_manual_pin: true
        };
    } catch (error) {
        logger.error(`Error in Google reverse geocode: ${error.message}`);
        return null;
    }
};

export { reverseGeocodeWithGoogle };
