
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

  async connect(role: 'dashboard' | 'iot', onStatusChange: (s: ConnectionStatus) => void) {
    this.onStatusChangeCallback = onStatusChange;
    this.updateStatus('Connecting');

    if (!supabase) {
        console.warn("Supabase not configured. Realtime features disabled.");
        this.updateStatus('Local_Mode');
        return;
    }

    try {
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
            .subscribe((status: any) => {
                if (status === 'SUBSCRIBED') {
                    this.updateStatus('Broadcasting_Live');
                } else if (status === 'CLOSED') {
                    this.updateStatus('Disconnected');
                } else {
                    this.updateStatus('Error');
                }
            });
    } catch (e) {
        console.error("Socket Connect Error", e);
        this.updateStatus('Error');
    }
  }

  public disconnect() {
    if (this.channel && supabase) {
      supabase.removeChannel(this.channel);
      this.channel = null;
      this.updateStatus('Disconnected');
    }
  }

  private updateStatus(newStatus: ConnectionStatus) {
    this.status = newStatus;
    if (this.onStatusChangeCallback) {
        // Debounce or ensure state consistency
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
    if (!this.channel || this.status !== 'Broadcasting_Live') return;
    await this.channel.send({ type: 'broadcast', event: 'telemetry', payload: officer });
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
