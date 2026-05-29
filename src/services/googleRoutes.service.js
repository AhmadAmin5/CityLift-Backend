import logger from "../utils/logger.js";

const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

const getGoogleMapsApiKey = () => {
    return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || null;
};

const parseGoogleDurationToSeconds = (duration) => {
    if (!duration || typeof duration !== "string") return 0;

    // Google returns duration strings like "123s"
    const seconds = Number(duration.replace("s", ""));
    return Number.isFinite(seconds) ? seconds : 0;
};

const secondsToMinutes = (seconds) => {
    return Math.max(1, Math.round(seconds / 60));
};

const getGoogleTravelMode = (vehicleType = "car") => {
    const normalized = String(vehicleType).toLowerCase();

    // Use TWO_WHEELER for motorbike/bike delivery/rider use cases.
    // Do NOT use this for bicycles.
    if (
        normalized === "bike" ||
        normalized === "motorbike" ||
        normalized === "motorcycle" ||
        normalized === "two_wheeler" ||
        normalized === "two-wheeler"
    ) {
        return "TWO_WHEELER";
    }

    return "DRIVE";
};

const toGoogleWaypoint = (location) => ({
    location: {
        latLng: {
            latitude: Number(location.latitude),
            longitude: Number(location.longitude)
        }
    }
});

const isValidCoordinate = (location) => {
    return (
        location &&
        Number.isFinite(Number(location.latitude)) &&
        Number.isFinite(Number(location.longitude)) &&
        Number(location.latitude) >= -90 &&
        Number(location.latitude) <= 90 &&
        Number(location.longitude) >= -180 &&
        Number(location.longitude) <= 180
    );
};

const mapGoogleSteps = (route) => {
    const steps = [];

    if (!Array.isArray(route.legs)) {
        return steps;
    }

    for (const leg of route.legs) {
        if (!Array.isArray(leg.steps)) continue;

        for (const step of leg.steps) {
            const startLatLng = step.startLocation?.latLng;
            const endLatLng = step.endLocation?.latLng;

            steps.push({
                instruction: step.navigationInstruction?.instructions || "",
                distance_meters: Math.round(step.distanceMeters || 0),
                duration_seconds: parseGoogleDurationToSeconds(step.staticDuration || step.duration),
                start_location: {
                    latitude: startLatLng?.latitude || 0,
                    longitude: startLatLng?.longitude || 0
                },
                end_location: {
                    latitude: endLatLng?.latitude || 0,
                    longitude: endLatLng?.longitude || 0
                }
            });
        }
    }

    return steps;
};

const getGoogleRouteDirections = async (
    origin,
    destination,
    stops = [],
    vehicleType = "car"
) => {
    const apiKey = getGoogleMapsApiKey();

    if (!apiKey) {
        logger.warn("Google Maps API key not found. Skipping live Google routing.");
        return null;
    }

    if (!isValidCoordinate(origin) || !isValidCoordinate(destination)) {
        logger.warn("Invalid origin or destination coordinates for Google routing.");
        return null;
    }

    const validStops = Array.isArray(stops)
        ? stops.filter(isValidCoordinate)
        : [];

    try {
        const travelMode = getGoogleTravelMode(vehicleType);

        const requestBody = {
            origin: toGoogleWaypoint(origin),
            destination: toGoogleWaypoint(destination),
            intermediates: validStops.map(toGoogleWaypoint),
            travelMode,
            routingPreference: "TRAFFIC_AWARE_OPTIMAL",
            computeAlternativeRoutes: false,
            polylineQuality: "HIGH_QUALITY",
            polylineEncoding: "ENCODED_POLYLINE",
            languageCode: "en",
            units: "METRIC"
        };

        const response = await fetch(GOOGLE_ROUTES_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": [
                    "routes.distanceMeters",
                    "routes.duration",
                    "routes.staticDuration",
                    "routes.polyline.encodedPolyline",
                    "routes.legs.steps.distanceMeters",
                    "routes.legs.steps.staticDuration",
                    "routes.legs.steps.navigationInstruction.instructions",
                    "routes.legs.steps.startLocation",
                    "routes.legs.steps.endLocation"
                ].join(",")
            },
            body: JSON.stringify(requestBody)
        });

        const body = await response.json();

        if (!response.ok) {
            logger.error(`Google Routes API error: ${response.status} ${JSON.stringify(body)}`);
            return null;
        }

        if (!Array.isArray(body.routes) || body.routes.length === 0) {
            return null;
        }

        const route = body.routes[0];

        const distanceMeters = route.distanceMeters || 0;
        const trafficDurationSeconds = parseGoogleDurationToSeconds(route.duration);
        const normalDurationSeconds = parseGoogleDurationToSeconds(
            route.staticDuration || route.duration
        );

        const trafficDurationMin = secondsToMinutes(trafficDurationSeconds);
        const normalDurationMin = secondsToMinutes(normalDurationSeconds);
        const trafficDelayMin = Math.max(0, trafficDurationMin - normalDurationMin);

        return {
            route_id: `preview_route_${Date.now()}`,
            ride_id: null,
            route_type: "pickup_to_dropoff",
            provider: "google",
            selected: true,
            distance_km: Number((distanceMeters / 1000).toFixed(2)),
            normal_duration_min: normalDurationMin,
            traffic_duration_min: trafficDurationMin,
            traffic_delay_min: trafficDelayMin,

            // Google encoded polyline. This can still be decoded and drawn on Mapbox GL.
            polyline: route.polyline?.encodedPolyline || "",

            steps: mapGoogleSteps(route)
        };
    } catch (error) {
        logger.error(`Error in Google getRouteDirections: ${error.message}`);
        return null;
    }
};

export { getGoogleRouteDirections };