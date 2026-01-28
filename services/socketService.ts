import { supabase } from './supabaseClient';
import { SalesOfficer, Message, Incident } from "../types";

export type ConnectionStatus = 'Disconnected' | 'Connecting' | 'Broadcasting_Live' | 'Error' | 'Local_Mode';

// Hardcoded production backend for stability in Native/Hybrid environments
const BACKEND_WS_URL = 'wss://fleetguard-hrwf.onrender.com';

class SocketService {
  private channel: any = null;
  private nativeWs: WebSocket | null = null; // Direct connection to Backend Node
  private status: ConnectionStatus = 'Disconnected';
  private onMessageCallback: ((data: Partial<SalesOfficer>[]) => void) | null = null;
  private onChatCallback: ((msg: Message) => void) | null = null;
  private onIncidentCallback: ((inc: Incident) => void) | null = null;
  private onStatusChangeCallback: ((s: ConnectionStatus) => void) | null = null;
  private heartbeatInterval: any = null;

  async connect(role: 'dashboard' | 'iot', onStatusChange: (s: ConnectionStatus) => void) {
    this.onStatusChangeCallback = onStatusChange;
    this.updateStatus('Connecting');

    // 1. Initialize Supabase Connection (Broadcast Layer)
    if (supabase) {
        this.connectSupabase(role);
    } else {
        console.warn("Supabase not configured. Running in Reduced Capability Mode.");
        this.updateStatus('Local_Mode');
    }

    // 2. Initialize Native WebSocket (Persistence Layer)
    // Only IoT devices (Officers) need to write to the DB via WS
    // We connect even if Supabase connects, to ensure DB persistence
    if (role === 'iot') {
        this.connectNativeWs();
    }
  }

  private connectNativeWs() {
      try {
          // Use the explicit production backend URL.
          // This fixes the "URL 'ws://' is invalid" error when running in file:// or native wrappers
          // where window.location.host is empty or points to a frontend-only server (Vercel/Vite).
          const wsUrl = BACKEND_WS_URL;
          
          console.log("[Socket] Connecting to Persistence Node:", wsUrl);
          this.nativeWs = new WebSocket(wsUrl);

          this.nativeWs.onopen = () => {
              console.log("[Socket] Persistence Node Connected");
              // If Supabase is down or connecting, this keeps us 'Live'
              if (this.status !== 'Broadcasting_Live') this.updateStatus('Broadcasting_Live');
          };

          this.nativeWs.onerror = (e) => {
              console.warn("[Socket] Persistence Node Error. Retrying...", e);
          };
          
          this.nativeWs.onclose = () => {
              console.log("[Socket] Persistence Node Closed. Reconnecting in 5s...");
              setTimeout(() => this.connectNativeWs(), 5000);
          };

      } catch (e) {
          console.error("[Socket] Native WS Setup Failed", e);
      }
  }

  private connectSupabase(role: string) {
    try {
        if (this.channel) supabase.removeChannel(this.channel);

        this.channel = supabase.channel('fleet-tracker', {
            config: {
                broadcast: { self: true },
                presence: { key: role }
            }
        });

        this.channel
            .on('broadcast', { event: 'telemetry' }, (payload: any) => {
                if (this.onMessageCallback) this.onMessageCallback([payload.payload]);
            })
            .on('broadcast', { event: 'chat' }, (payload: any) => {
                if (this.onChatCallback) this.onChatCallback(payload.payload as Message);
            })
            .on('broadcast', { event: 'incident' }, (payload: any) => {
                if (this.onIncidentCallback) this.onIncidentCallback(payload.payload as Incident);
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'officers' }, (payload: any) => {
                if (payload.new && this.onMessageCallback) {
                    this.onMessageCallback([payload.new as Partial<SalesOfficer>]);
                }
            })
            .subscribe((status: string) => {
                if (status === 'SUBSCRIBED') {
                    this.updateStatus('Broadcasting_Live');
                    this.startHeartbeat();
                } else if (status === 'CLOSED') {
                    // Don't fully disconnect if Native WS is active
                    if (!this.nativeWs || this.nativeWs.readyState !== WebSocket.OPEN) {
                         this.updateStatus('Disconnected');
                    }
                    this.stopHeartbeat();
                } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
                    // Fallback: If Supabase fails, rely on Native WS if active
                    if (!this.nativeWs || this.nativeWs.readyState !== WebSocket.OPEN) {
                         this.updateStatus('Error');
                    }
                    this.stopHeartbeat();
                }
            });
    } catch (e) {
        console.error("Supabase Connect Error", e);
        this.updateStatus('Error');
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
        if (this.channel) {
            this.channel.send({ type: 'broadcast', event: 'ping', payload: { time: Date.now() } });
        }
    }, 20000);
  }

  private stopHeartbeat() {
      if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
      }
  }

  public disconnect() {
    this.stopHeartbeat();
    if (this.channel && supabase) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.nativeWs) {
        this.nativeWs.close();
        this.nativeWs = null;
    }
    this.updateStatus('Disconnected');
  }

  private updateStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(newStatus);
    }
  }

  onDeviceUpdate(callback: (officers: Partial<SalesOfficer>[]) => void) {
    this.onMessageCallback = callback;
  }
  
  onChat(callback: (msg: Message) => void) {
      this.onChatCallback = callback;
  }

  onIncident(callback: (inc: Incident) => void) {
      this.onIncidentCallback = callback;
  }

  async sendTelemetry(officer: Partial<SalesOfficer>) {
    // 1. Send to Supabase (Broadcast to Admin UI)
    // This allows peers (Admins) to see updates instantly without DB polling
    if (this.channel) {
        this.channel.send({ type: 'broadcast', event: 'telemetry', payload: officer }).catch(console.warn);
    }

    // 2. Send to Native Backend (Persist to Database)
    // This ensures data is saved to PostgreSQL for history and reporting
    if (this.nativeWs && this.nativeWs.readyState === WebSocket.OPEN) {
        this.nativeWs.send(JSON.stringify(officer));
    }
  }

  async sendChat(message: Message) {
    if (!this.channel) return;
    await this.channel.send({ type: 'broadcast', event: 'chat', payload: message });
  }

  async sendIncident(incident: Incident) {
      if (!this.channel) return;
      await this.channel.send({ type: 'broadcast', event: 'incident', payload: incident });
  }
}

export const socketService = new SocketService();