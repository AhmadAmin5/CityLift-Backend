// ml/lib/features.js
// THE single source of truth for model input. Both the trainer and the
// (future) prediction service import from here so feature ORDER can never
// drift between training and inference — the #1 silent surge-prediction bug.
//
// CSV files store raw, human-readable columns (hour, day, month, ...).
// buildFeatureRow() converts a raw record into the exact model input vector,
// applying cyclical sin/cos encoding to periodic columns.

// City rides: instant booking, single pickup location, all 5 vehicles.
export const CITY_FEATURES = [
  'distance_km', 'travel_time_min', 'wait_time_min', 'traffic_ratio', 'avg_speed_kmh',
  'weather_code', 'rain_mm', 'visibility_m', 'wind_speed', 'feels_like_temp',
  'demand_ratio', 'zone_driver_count',
  'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
  'is_weekend', 'is_public_holiday', 'is_ramadan',
];

// Intercity rides: scheduled, weather at both ends, seasonality, seat-based,
// toll + dead-return cost asymmetry, cancellation risk. No per-minute concept.
export const INTERCITY_FEATURES = [
  'distance_km', 'travel_time_min', 'traffic_ratio', 'avg_speed_kmh',
  'weather_code', 'rain_mm', 'visibility_m', 'wind_speed', 'feels_like_temp',
  'dest_weather_code', 'dest_rain_mm',
  'demand_ratio', 'zone_driver_count',
  'booking_lead_time_hours', 'toll_cost', 'dead_return_factor',
  'seats_booked', 'seat_capacity',
  'hour_sin', 'hour_cos', 'day_sin', 'day_cos', 'month_sin', 'month_cos',
  'is_weekend', 'is_public_holiday', 'is_ramadan', 'cancellation_risk',
];

export const FEATURE_SETS = {
  city: CITY_FEATURES,
  intercity: INTERCITY_FEATURES,
};

// Convert a raw record (object: column -> number) into the model input vector,
// following featureNames order exactly. Cyclical columns are derived on the fly.
export function buildFeatureRow(rec, featureNames) {
  return featureNames.map((name) => {
    switch (name) {
      case 'hour_sin':  return Math.sin((2 * Math.PI * rec.hour) / 24);
      case 'hour_cos':  return Math.cos((2 * Math.PI * rec.hour) / 24);
      case 'day_sin':   return Math.sin((2 * Math.PI * rec.day) / 7);
      case 'day_cos':   return Math.cos((2 * Math.PI * rec.day) / 7);
      case 'month_sin': return Math.sin((2 * Math.PI * rec.month) / 12);
      case 'month_cos': return Math.cos((2 * Math.PI * rec.month) / 12);
      default:          return rec[name];
    }
  });
}
