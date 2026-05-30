import logger from "../utils/logger.js";

const GOOGLE_PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const GOOGLE_PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";

const LAHORE_CENTER = {
    latitude: 31.5204,
    longitude: 74.3587
};

// Approx Lahore service rectangle.
// Google uses low/high latitude/longitude points.
const LAHORE_RECTANGLE = {
    low: {
        latitude: 31.15,
        longitude: 73.85
    },
    high: {
        latitude: 31.75,
        longitude: 74.65
    }
};

const getGooglePlacesApiKey = () => {
    return process.env.GOOGLE_PLACES_API_KEY || null;
};

const normalizeLimit = (limit) => {
    const parsed = Number(limit);
    if (!Number.isFinite(parsed)) return 5;
    return Math.min(Math.max(parsed, 1), 10);
};

const isValidCoordinate = (value) => {
    return value !== undefined && value !== null && Number.isFinite(Number(value));
};

const getLocationBias = (latitude, longitude) => {
    if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) {
        return {
            circle: {
                center: LAHORE_CENTER,
                radius: 15000
            }
        };
    }

    return {
        circle: {
            center: {
                latitude: Number(latitude),
                longitude: Number(longitude)
            },
            radius: 10000
        }
    };
};

const PLACE_TYPE_PRESETS = {
    // Use this for courier/postal searches like "express", "tcs", "dhl", "post office".
    // Google allows up to 5 includedPrimaryTypes.
    courier: ["courier_service", "shipping_service", "post_office"],

    // Use this if you specifically want broader area/neighborhood style suggestions.
    regions: ["(regions)"],

    // Default should stay unrestricted for best Lahore pickup/dropoff search coverage.
    all: []
};

const buildInput = (query) => {
    const trimmed = query.trim();

    // Adding Lahore helps local relevance for short/branded queries like "express".
    const lower = trimmed.toLowerCase();
    if (lower.includes("lahore") || lower.includes("pakistan")) {
        return trimmed;
    }

    return `${trimmed} Lahore`;
};

const googlePlacesAutocomplete = async ({
    query,
    latitude,
    longitude,
    limit = 5,
    sessionToken,
    typePreset = "all"
}) => {
    const apiKey = getGooglePlacesApiKey();

    if (!apiKey) {
        logger.warn("Google Places API key not found. Skipping live autocomplete.");
        return [];
    }

    const trimmedQuery = query?.trim();

    if (!trimmedQuery || trimmedQuery.length < 2) {
        return [];
    }

    const selectedTypes = PLACE_TYPE_PRESETS[typePreset] || PLACE_TYPE_PRESETS.all;

    const requestBody = {
        input: buildInput(trimmedQuery),
        includedRegionCodes: ["pk"],
        regionCode: "pk",
        languageCode: "en",

        // Hard restrict results to Lahore rectangle.
        // Do not send locationBias together with this.
        locationRestriction: {
            rectangle: LAHORE_RECTANGLE
        },

        includeQueryPredictions: false,
        includePureServiceAreaBusinesses: false
    };

    if (sessionToken) {
        requestBody.sessionToken = sessionToken;
    }

    if (selectedTypes.length > 0) {
        requestBody.includedPrimaryTypes = selectedTypes;
    }

    try {
        const response = await fetch(GOOGLE_PLACES_AUTOCOMPLETE_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey
            },
            body: JSON.stringify(requestBody)
        });

        const body = await response.json();

        if (!response.ok) {
            logger.error(`Google Places Autocomplete error: ${response.status} ${JSON.stringify(body)}`);
            return [];
        }

        const suggestions = Array.isArray(body.suggestions) ? body.suggestions : [];

        return suggestions
            .filter((suggestion) => suggestion.placePrediction)
            .slice(0, normalizeLimit(limit))
            .map((suggestion) => {
                const prediction = suggestion.placePrediction;

                return {
                    provider: "google",
                    provider_place_id: prediction.placeId,
                    place_id: prediction.placeId,
                    name: prediction.structuredFormat?.mainText?.text || prediction.text?.text || "",
                    address: prediction.structuredFormat?.secondaryText?.text || prediction.text?.text || "",
                    full_address: prediction.text?.text || "",
                    latitude: null,
                    longitude: null,
                    place_type: prediction.types || [],
                    primary_type: prediction.primaryType || null,
                    requires_details: true
                };
            });
    } catch (error) {
        logger.error(`Error in googlePlacesAutocomplete: ${error.message}`);
        return [];
    }
};

const getGooglePlaceDetails = async (placeId, sessionToken) => {
    const apiKey = getGooglePlacesApiKey();

    if (!apiKey) {
        logger.warn("Google Places API key not found. Skipping place details.");
        return null;
    }

    if (!placeId) {
        return null;
    }

    try {
        const params = new URLSearchParams();

        if (sessionToken) {
            params.set("sessionToken", sessionToken);
        }

        const url = `${GOOGLE_PLACES_DETAILS_URL}/${encodeURIComponent(placeId)}${
            params.toString() ? `?${params.toString()}` : ""
        }`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": [
                    "id",
                    "displayName",
                    "formattedAddress",
                    "location",
                    "types",
                    "primaryType",
                    "businessStatus"
                ].join(",")
            }
        });

        const place = await response.json();

        if (!response.ok) {
            logger.error(`Google Place Details error: ${response.status} ${JSON.stringify(place)}`);
            return null;
        }

        return {
            provider: "google",
            provider_place_id: place.id,
            place_id: place.id,
            name: place.displayName?.text || "",
            address: place.formattedAddress || "",
            latitude: place.location?.latitude ?? null,
            longitude: place.location?.longitude ?? null,
            place_type: place.types || [],
            primary_type: place.primaryType || null,
            business_status: place.businessStatus || null
        };
    } catch (error) {
        logger.error(`Error in getGooglePlaceDetails: ${error.message}`);
        return null;
    }
};

export { googlePlacesAutocomplete, getGooglePlaceDetails };
