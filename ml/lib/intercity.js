// ml/lib/intercity.js
// Shared long-haul ride sampler for the 3 intercity models. Intercity surge is
// driven by factors city rides don't have: weather at BOTH route ends, booking
// lead time, dead-return cost, tolls, seat occupancy, monthly seasonality, and
// cancellation risk. Each intercity config supplies vehicle-specific knobs `p`.
import { rand, randInt, round, sampleWeather, sampleTime, sampleSupplyDemand } from './sampling.js';

// p: { minDist, maxDist, tollBase, tollPerKm, seatCapacity,
//      demandW, occupancyW, maxSurge }
export function sampleIntercityRide(p) {
  // ─── Long-haul trip on highways ───
  const distance_km = round(rand(p.minDist, p.maxDist));
  const baseSpeed = rand(60, 100);
  const traffic_ratio = round(rand(1.0, 1.5)); // highways vary less than city
  const travel_time_min = round(((distance_km / baseSpeed) * 60) * traffic_ratio);
  const avg_speed_kmh = round(distance_km / (travel_time_min / 60));

  // Weather sampled independently at origin and destination.
  const origin = sampleWeather();
  const dest = sampleWeather();
  const time = sampleTime('intercity');
  let { demand_ratio, zone_driver_count } = sampleSupplyDemand();

  // Scheduled booking: 1 hour to ~7 days ahead.
  const booking_lead_time_hours = round(rand(1, 168));
  const toll_cost = round(p.tollBase + distance_km * p.tollPerKm);
  const dead_return_factor = round(rand(1.0, 1.6), 2); // 1.0 = return fare found
  const seat_capacity = p.seatCapacity;
  const seats_booked = randInt(1, seat_capacity);
  const occupancy = seats_booked / seat_capacity;
  // Cancellation risk rises with how far ahead the booking is.
  const cancellation_risk = round(
    Math.min(0.6, (booking_lead_time_hours / 168) * 0.5 + rand(0, 0.1)), 3
  );

  let surge = 1.0;

  // Demand
  surge *= 1 + Math.pow(Math.max(demand_ratio - 1, 0), 1.1) * p.demandW;

  // Weather at both ends — severe weather raises surge (route risk, slower turns).
  const wsev = (w) => (w === 5 ? 0.18 : w === 4 ? 0.10 : w === 6 ? 0.08 : w === 3 ? 0.05 : 0);
  surge += wsev(origin.weather_code) + wsev(dest.weather_code) * 0.8;

  // Seasonality — summer travel + festive/holiday months see higher demand.
  const m = time.month; // 0=Jan
  if (m === 5 || m === 6 || m === 11)      surge += 0.12; // Jun/Jul summer, Dec break
  else if (m === 3 || m === 4)             surge += 0.08; // festive window

  // Booking lead time — planned-ahead is cheaper, last-minute is pricier.
  if (booking_lead_time_hours > 72)      surge -= 0.08;
  else if (booking_lead_time_hours < 6)  surge += 0.12;

  // Dead-return cost asymmetry feeds straight into price.
  surge += (dead_return_factor - 1) * 0.5;

  // Seat-based: empty seats raise the per-seat surge.
  surge += (1 - occupancy) * p.occupancyW;

  // Travel-demand calendar
  if (time.is_weekend)         surge += 0.06;
  if (time.is_public_holiday)  surge += 0.15;

  // Low driver supply on the route
  if (zone_driver_count < 8) surge += 0.15;

  // Price in cancellation risk
  surge += cancellation_risk * 0.10;

  surge += rand(-0.04, 0.04);
  surge = round(Math.max(0.85, Math.min(surge, p.maxSurge)), 3);

  return {
    distance_km, travel_time_min, traffic_ratio, avg_speed_kmh,
    weather_code: origin.weather_code, rain_mm: origin.rain_mm,
    visibility_m: origin.visibility_m, wind_speed: origin.wind_speed,
    feels_like_temp: origin.feels_like_temp,
    dest_weather_code: dest.weather_code, dest_rain_mm: dest.rain_mm,
    demand_ratio: round(demand_ratio), zone_driver_count,
    booking_lead_time_hours, toll_cost, dead_return_factor,
    seats_booked, seat_capacity,
    hour: time.hour, day: time.day, month: time.month,
    is_weekend: time.is_weekend, is_public_holiday: time.is_public_holiday,
    is_ramadan: time.is_ramadan, cancellation_risk,
    surge_multiplier: surge,
  };
}
