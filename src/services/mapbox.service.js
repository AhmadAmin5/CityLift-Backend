import logger from "../utils/logger.js";

const getMapboxToken = () => {
    return process.env.MAPBOX_ACCESS_TOKEN || null;
};

/**
 * Autocomplete address queries using Mapbox Geocoding API
 */
const LAHORE_CENTER = { lng: 74.3587, lat: 31.5204 };

// Approx Lahore bounding box: minLon,minLat,maxLon,maxLat
// You can tighten/expand this depending on your service area.
const LAHORE_BBOX = "73.85,31.15,74.65,31.75";

const geocodeAutocomplete = async (query, latitude, longitude, limit = 10) => {
    const token = getMapboxToken();

    if (!token) {
        logger.warn("Mapbox Access Token not found. Skipping live autocomplete.");
        return [];
    }

    const trimmedQuery = query?.trim();

    if (!trimmedQuery || trimmedQuery.length < 2) {
        return [];
    }

    try {
        const params = new URLSearchParams({
            access_token: token,
            limit: String(Math.min(limit, 10)), // Mapbox max is 10
            country: "PK",
            bbox: LAHORE_BBOX,
            proximity:
                latitude !== undefined && longitude !== undefined
                    ? `${longitude},${latitude}`
                    : `${LAHORE_CENTER.lng},${LAHORE_CENTER.lat}`,
            autocomplete: "true",
            fuzzyMatch: "true",
            language: "en,ur"
        });

        // Adding Lahore/Pakistan to the query often improves local relevance.
        const searchText = `${trimmedQuery} Lahore Pakistan`;

        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            searchText
        )}.json?${params.toString()}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Mapbox API error: ${response.status} ${response.statusText}`);
        }

        const body = await response.json();

        if (!Array.isArray(body.features)) return [];

        return body.features
            .filter((feature) => {
                const [lng, lat] = feature.geometry?.coordinates || [];

                // Extra defensive filter in case Mapbox returns anything outside bbox.
                return (
                    lng >= 73.85 &&
                    lng <= 74.65 &&
                    lat >= 31.15 &&
                    lat <= 31.75
                );
            })
            .map((feature) => ({
                provider: "mapbox",
                provider_place_id: feature.id,
                name: feature.text || feature.place_name?.split(",")[0] || "",
                address: feature.place_name || "",
                latitude: feature.geometry.coordinates[1],
                longitude: feature.geometry.coordinates[0],
                place_type: feature.place_type || []
            }));
    } catch (error) {
        logger.error(`Error in Mapbox geocodeAutocomplete: ${error.message}`);
        return [];
    }
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

/**
 * Fetch route preview between origin, intermediate stops, and destination
 */
const getRouteDirections = async (origin, destination, stops = [], vehicleType = "car") => {
    const token = getMapboxToken();
    if (!token) {
        logger.warn("Mapbox Access Token not found. Skipping live routing directions.");
        return null;
    }

    try {
        // Map vehicle type to mapbox profile
        let profile = "mapbox/driving-traffic";
        if (vehicleType === "bike") {
            profile = "mapbox/cycling";
        }

        // Build coordinate list
        const waypoints = [origin, ...stops, destination];
        const coordsString = waypoints.map((wp) => `${wp.longitude},${wp.latitude}`).join(";");

        const url = `https://api.mapbox.com/directions/v5/${profile}/${coordsString}?access_token=${token}&geometries=polyline&overview=full&steps=true`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Mapbox Directions API error: ${response.status} ${response.statusText}`);
        }

        const body = await response.json();
        if (!body.routes || body.routes.length === 0) return null;

        const route = body.routes[0];

        // Map steps if present
        const steps = [];
        if (route.legs) {
            route.legs.forEach((leg) => {
                if (leg.steps) {
                    leg.steps.forEach((step) => {
                        steps.push({
                            instruction: step.maneuver?.instruction || "",
                            distance_meters: Math.round(step.distance || 0),
                            duration_seconds: Math.round(step.duration || 0),
                            start_location: {
                                latitude: step.maneuver?.location?.[1] || 0,
                                longitude: step.maneuver?.location?.[0] || 0
                            },
                            end_location: {
                                // Fallback to start location of the step since Mapbox steps don't explicitly list end location
                                latitude: step.maneuver?.location?.[1] || 0,
                                longitude: step.maneuver?.location?.[0] || 0
                            }
                        });
                    });
                }
            });

            // Adjust end_location for steps (set to next step's start_location)
            for (let i = 0; i < steps.length - 1; i++) {
                steps[i].end_location = { ...steps[i + 1].start_location };
            }
            if (steps.length > 0) {
                steps[steps.length - 1].end_location = {
                    latitude: destination.latitude,
                    longitude: destination.longitude
                };
            }
        }

        const distance_km = Number((route.distance / 1000).toFixed(2));
        const traffic_duration_min = Math.round(route.duration / 60);
        const normal_duration_min = route.duration_typical
            ? Math.round(route.duration_typical / 60)
            : Math.round(route.duration / 60);
        const traffic_delay_min = Math.max(0, traffic_duration_min - normal_duration_min);

        return {
            route_id: `preview_route_${Date.now()}`,
            ride_id: null,
            route_type: "pickup_to_dropoff",
            provider: "mapbox",
            selected: true,
            distance_km,
            normal_duration_min,
            traffic_duration_min,
            traffic_delay_min,
            polyline: route.geometry,
            steps
        };
    } catch (error) {
        logger.error(`Error in Mapbox getRouteDirections: ${error.message}`);
        return null;
    }
};

export { reverseGeocode, getRouteDirections };
