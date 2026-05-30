import logger from "../utils/logger.js";

const getMapboxToken = () => {
    return process.env.MAPBOX_ACCESS_TOKEN || null;
};

/**
 * Reverse geocode coordinates to an address using Mapbox Geocoding API
 */
const reverseGeocode = async (latitude, longitude) => {
    const token = getMapboxToken();
    if (!token) {
        logger.warn("Mapbox Access Token not found. Skipping live reverse-geocode.");
        return null;
    }

    try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${token}&limit=1`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Mapbox API error: ${response.status} ${response.statusText}`);
        }

        const body = await response.json();
        if (!body.features || body.features.length === 0) return null;

        const feature = body.features[0];
        return {
            provider: "mapbox",
            provider_place_id: feature.id,
            name: feature.text || feature.place_name?.split(",")[0] || "Selected Location",
            address:
                feature.place_name ||
                `Lat: ${Number(latitude).toFixed(6)}, Lng: ${Number(longitude).toFixed(6)}`,

            // Important:
            // Keep the exact pin coordinates from the user's click.
            latitude: Number(latitude),
            longitude: Number(longitude),

            reverse_geocoded_latitude: feature.geometry?.coordinates?.[1] ?? null,
            reverse_geocoded_longitude: feature.geometry?.coordinates?.[0] ?? null,
            place_type: feature.place_type || [],
            is_manual_pin: true
        };
    } catch (error) {
        logger.error(`Error in Mapbox reverseGeocode: ${error.message}`);
        return null;
    }
};

export { reverseGeocode };
