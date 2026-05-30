import logger from "../utils/logger.js";
import { getIO } from "../socket/socket.js";

/**
 * Service to emit Socket.IO events from REST controllers or other services.
 */
class SocketService {
    /**
     * Get the realtime namespace
     */
    getNamespace() {
        const io = getIO();
        if (!io) {
            logger.warn("Socket.IO not initialized. Cannot emit event.");
            return null;
        }
        return io.of("/realtime");
    }

    /**
     * 18.6 Server Event: Nearby Drivers Update
     */
    emitNearbyDriversUpdate(riderId, center, drivers) {
        const nsp = this.getNamespace();
        if (!nsp) return;

        const payload = {
            center,
            drivers
        };
        nsp.to(`rider:${riderId}`).emit("nearby_drivers:update", payload);
    }

    /**
     * 18.7 Server Event: Ride Offer Created
     */
    emitRideOffer(driverId, offer) {
        const nsp = this.getNamespace();
        if (!nsp) return;

        const payload = { offer };
        nsp.to(`driver:${driverId}`).emit("ride:offer", payload);
    }

    /**
     * 18.8 Server Event: Ride Offer Expired
     */
    emitRideOfferExpired(driverId, offerId, rideId, expiredAt) {
        const nsp = this.getNamespace();
        if (!nsp) return;

        const payload = {
            offer_id: offerId,
            ride_id: rideId,
            status: "expired",
            expired_at: expiredAt
        };
        nsp.to(`driver:${driverId}`).emit("ride:offer:expired", payload);
    }

    /**
     * 18.9 Server Event: Ride Status Update
     */
    emitRideStatusUpdate(rideId, riderId, driverId, oldStatus, newStatus, changedByUserId) {
        const nsp = this.getNamespace();
        if (!nsp) return;

        const payload = {
            ride_id: rideId,
            old_status: oldStatus,
            new_status: newStatus,
            changed_at: new Date().toISOString(),
            changed_by_user_id: changedByUserId
        };

        if (riderId) nsp.to(`rider:${riderId}`).emit("ride:status:update", payload);
        if (driverId) nsp.to(`driver:${driverId}`).emit("ride:status:update", payload);
    }

    /**
     * 18.11 Server Event: Ride Live Update
     */
    emitRideLiveUpdate(rideId, liveState) {
        const nsp = this.getNamespace();
        if (!nsp) return;

        const payload = { live_state: liveState };
        nsp.to(`ride:${rideId}`).emit("ride:live:update", payload);
    }

    /**
     * 18.12 Server Event: Ride Route Update
     */
    emitRideRouteUpdate(rideId, reason, route) {
        const nsp = this.getNamespace();
        if (!nsp) return;

        const payload = {
            ride_id: rideId,
            reason,
            route
        };
        nsp.to(`ride:${rideId}`).emit("ride:route:update", payload);
    }

    /**
     * 18.13 Server Event: Ride Cancelled
     */
    emitRideCancelled(rideId, cancelledByUserId, reason, fee) {
        const nsp = this.getNamespace();
        if (!nsp) return;

        const payload = {
            ride_id: rideId,
            cancelled_by_user_id: cancelledByUserId,
            cancellation_reason: reason,
            cancellation_fee: fee,
            cancelled_at: new Date().toISOString()
        };
        nsp.to(`ride:${rideId}`).emit("ride:cancelled", payload);
    }

    /**
     * 18.14 Server Event: Surge Zone Update
     */
    emitSurgeUpdate(city, zones) {
        const nsp = this.getNamespace();
        if (!nsp) return;

        const payload = {
            city,
            zones
        };
        nsp.to(`city:${city}`).emit("surge:update", payload);
    }
}

export default new SocketService();
