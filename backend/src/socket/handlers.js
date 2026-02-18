/**
 * Socket.io Event Handlers
 * Handles real-time WebSocket connections
 */

export function setupSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log(`🔌 Client connected: ${socket.id}`);

        // Join rooms based on user role/clinic
        socket.on('join:clinic', (clinicId) => {
            socket.join(`clinic:${clinicId}`);
            console.log(`Socket ${socket.id} joined clinic:${clinicId}`);
        });

        socket.on('join:hospital', (hospitalId) => {
            socket.join(`hospital:${hospitalId}`);
            console.log(`Socket ${socket.id} joined hospital:${hospitalId}`);
        });

        socket.on('join:admin', () => {
            socket.join('admin');
            console.log(`Socket ${socket.id} joined admin room`);
        });

        // Location Feature: Join a booking-specific room for live driver tracking
        socket.on('join_booking_room', ({ bookingId }) => {
            if (bookingId) {
                socket.join(`booking:${bookingId}`);
                console.log(`🗺️ Socket ${socket.id} joined booking:${bookingId}`);
            }
        });

        socket.on('leave_booking_room', ({ bookingId }) => {
            if (bookingId) {
                socket.leave(`booking:${bookingId}`);
                console.log(`🗺️ Socket ${socket.id} left booking:${bookingId}`);
            }
        });

        // Location Feature: Admin live map room (sees all driver pings)
        socket.on('join_admin_live_map', () => {
            socket.join('admin:live_map');
            console.log(`🗺️ Socket ${socket.id} joined admin:live_map`);
        });

        socket.on('leave_admin_live_map', () => {
            socket.leave('admin:live_map');
            console.log(`🗺️ Socket ${socket.id} left admin:live_map`);
        });

        // Handle disconnect
        socket.on('disconnect', (reason) => {
            console.log(`🔌 Client disconnected: ${socket.id} (${reason})`);
        });
    });

    // Return helper to emit to specific rooms
    return {
        toClinic: (clinicId, event, data) => {
            io.to(`clinic:${clinicId}`).emit(event, data);
        },
        toAdmin: (event, data) => {
            io.to('admin').emit(event, data);
        },
        toAll: (event, data) => {
            io.emit(event, data);
        }
    };
}
