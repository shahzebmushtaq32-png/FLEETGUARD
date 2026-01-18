
import { supabase } from './supabaseClient';
import { SalesOfficer, Message, Incident } from "../types";

export type ConnectionStatus = 'Disconnected' | 'Connecting' | 'Broadcasting_Live' | 'Error' | 'Local_Mode';

class SocketService {
  private channel: any = null;
  private status: ConnectionStatus = 'Disconnected';
  private onMessageCallback: ((data: Partial<SalesOfficer>[]) => void) | null = null;
  private onChatCallback: ((msg: Message) => void) | null = null;
  private onIncidentCallback: ((inc: Incident) => void) | null = null;
  private onStatusChangeCallback: ((s: ConnectionStatus) => void) | null = null;
  private heartbeatInterval: any = null;

  async connect(role: 'dashboard' | 'iot', onStatusChange: (s: ConnectionStatus) => void) {
    this.onStatusChangeCallback = onStatusChange;
    this.updateStatus('Connecting');

    if (!supabase) {
        console.warn("Supabase not configured. Realtime features disabled.");
        this.updateStatus('Local_Mode');
        return;
    }

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
                    this.updateStatus('Disconnected');
                    this.stopHeartbeat();
                } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
                    this.updateStatus('Error');
                    this.stopHeartbeat();
                }
            });
    } catch (e) {
        console.error("Socket Connect Error", e);
        this.updateStatus('Error');
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // Heartbeat every 20 seconds to keep background channel open
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
      this.updateStatus('Disconnected');
    }
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
    if (!this.channel) return;
    try {
        await this.channel.send({ type: 'broadcast', event: 'telemetry', payload: officer });
    } catch (e) {
        console.error("Telemetry Broadcast Failed", e);
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
