import { SalesOfficer } from "../types";

/**
 * ARCHITECTURE STEP 1: Persistent WebSocket Handshake
 * Server: Render Realtime Server (Node.js, Express)
 */

const FALLBACK_URL = "wss://fleetguard-hrwf.onrender.com";
const FALLBACK_API_KEY = "BDO_SECURE_NODE_99122";

// Accessing polyfilled process.env from vite.config.ts
const WS_API_KEY = (typeof process !== 'undefined' && process.env && process.env.WS_API_KEY) 
  ? process.env.WS_API_KEY 
  : FALLBACK_API_KEY;

export type ConnectionStatus = 'Disconnected' | 'Connecting' | 'Authenticating' | 'Broadcasting_Live' | 'Error';

class SocketService {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'Disconnected';
  private onMessageCallback: ((data: Partial<SalesOfficer>[]) => void) | null = null;
  private onRosterUpdateCallback: ((data: Partial<SalesOfficer>) => void) | null = null;
  private onStatusChangeCallback: ((s: ConnectionStatus) => void) | null = null;
  private reconnectAttempts = 0;
  private currentRole: 'dashboard' | 'iot' = 'iot';

  private getWsUrl(): string {
    const saved = localStorage.getItem('bdo_fleet_ws_url');
    if (saved) return saved.startsWith('ws') ? saved : `wss://${saved}`;
    
    // Check environment variable
    let envUrl = '';
    if (typeof process !== 'undefined' && process.env && process.env.VITE_RENDER_WS_URL) {
      envUrl = process.env.VITE_RENDER_WS_URL;
    }

    if (envUrl) {
      return envUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    }

    return FALLBACK_URL;
  }

  async connect(role: 'dashboard' | 'iot', onStatusChange: (s: ConnectionStatus) => void) {
    this.currentRole = role;
    this.onStatusChangeCallback = onStatusChange;
    this.updateStatus('Connecting');

    const url = this.getWsUrl();
    console.log(`[Step 1] Attempting authenticated connection to: ${url} as ${role}`);

    try {
      this.socket = new WebSocket(`${url}?key=${WS_API_KEY}&type=${role}`);

      this.socket.onopen = () => {
        this.updateStatus('Authenticating');
        setTimeout(() => {
          if (this.socket?.readyState === WebSocket.OPEN) {
            this.updateStatus('Broadcasting_Live');
            this.reconnectAttempts = 0;
          }
        }, 800);
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ROSTER_UPDATE' && this.onRosterUpdateCallback) {
             this.onRosterUpdateCallback(data.payload);
             return; 
          }
          if (Array.isArray(data) && this.onMessageCallback) {
              this.onMessageCallback(data);
          }
        } catch (e) {
          console.error("Failed to parse WebSocket message", e);
        }
      };

      this.socket.onerror = () => {
        this.updateStatus('Error');
      };

      this.socket.onclose = (event) => {
        if (this.status !== 'Error') {
          this.updateStatus('Disconnected');
        }
        this.attemptReconnect();
      };
    } catch (err) {
      this.updateStatus('Error');
    }
  }

  public disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < 5) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      setTimeout(() => {
        if (this.onStatusChangeCallback) this.connect(this.currentRole, this.onStatusChangeCallback);
      }, delay);
    }
  }

  private updateStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    if (this.onStatusChangeCallback) this.onStatusChangeCallback(newStatus);
  }

  onDeviceUpdate(callback: (officers: Partial<SalesOfficer>[]) => void) {
    this.onMessageCallback = callback;
  }

  onRosterUpdate(callback: (officer: Partial<SalesOfficer>) => void) {
    this.onRosterUpdateCallback = callback;
  }

  sendTelemetry(officer: Partial<SalesOfficer>) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'TELEMETRY',
        payload: officer,
        timestamp: new Date().toISOString()
      }));
    }
  }

  getStatus() {
    return this.status;
  }
}

export const socketService = new SocketService();