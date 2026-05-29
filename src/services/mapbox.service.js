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
            name: feature.text || feature.place_name?.split(",")[0] || "",
            address: feature.place_name || "",
            latitude: feature.geometry.coordinates[1],
            longitude: feature.geometry.coordinates[0]
        };
    } catch (error) {
        logger.error(`Error in Mapbox reverseGeocode: ${error.message}`);
        return null;
    }
};

export { reverseGeocode };
