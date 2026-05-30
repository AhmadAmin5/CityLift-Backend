export function getTimeFeatures(dateInput) {
    const date = dateInput ? new Date(dateInput) : new Date();

    const jsDay = date.getDay(); // Sunday = 0
    const mondayBasedDay = (jsDay + 6) % 7;

    return {
        hour: date.getHours(),
        day: mondayBasedDay,
        is_weekend: jsDay === 0 || jsDay === 6 ? 1 : 0,
        is_public_holiday: 0,
        is_ramadan: 0
    };
}
