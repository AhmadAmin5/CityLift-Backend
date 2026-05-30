export function mapApiVehicleToMlVehicle(vehicleType) {
    if (vehicleType === "bike") return "bike";
    if (vehicleType === "rickshaw") return "rickshaw";
    if (vehicleType === "car") return "economy";

    return "economy";
}

export function resolveMlScope() {
    return "city";
}
