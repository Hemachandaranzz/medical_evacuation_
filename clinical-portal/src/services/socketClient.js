import { io } from 'socket.io-client';

const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/api\/?$/, '');

class SocketClient {
    constructor() {
        this.socket = null;
        this.clinicId = null;
    }

    connect(clinicId = null) {
        if (this.socket) return this.socket;

        this.clinicId = clinicId;
        this.socket = io(SOCKET_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling']
        });

        this.socket.on('connect', () => {
            console.log('🟢 Socket connected:', this.socket.id);
            // Join clinic-specific room if clinic ID is provided
            if (this.clinicId) {
                this.socket.emit('join:clinic', this.clinicId);
            }
        });

        this.socket.on('connect_error', (err) => {
            console.error('🔴 Socket connection error:', err);
        });

        return this.socket;
    }

    joinClinic(clinicId) {
        this.clinicId = clinicId;
        if (this.socket && this.socket.connected) {
            this.socket.emit('join:clinic', clinicId);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    on(event, callback) {
        if (!this.socket) this.connect();
        this.socket.on(event, callback);
        return () => this.socket.off(event, callback);
    }
}

export const socket = new SocketClient();
