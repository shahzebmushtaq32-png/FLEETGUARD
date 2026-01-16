
import React, { useState, useEffect } from 'react';
import { User, SalesOfficer, Geofence, Message, SystemStats } from '../types';
import Sidebar from './Sidebar';
import MapComponent from './MapComponent';
import { persistenceService } from '../services/persistenceService';
import { socketService } from '../services/socketService';

interface AdminDashboardProps {
  user: User;
  officers: SalesOfficer[];
  geofences: Geofence[];
  stats: SystemStats;
  messages: Message[];
  onLogout: () => void;
  onAddBDO: (name: string, code: string, pass: string, avatar: string) => void;
  onDeleteBDO: (id: string) => void;
  onAssignTask: (id: string, title: string) => void;
  onSendMessage: (txt: string, isDirective?: boolean) => void;
  wsStatus?: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  officers, onLogout, onAddBDO, onDeleteBDO, onAssignTask, wsStatus 
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Infra Health State
  const [node01Active, setNode01Active] = useState(false);
  const [node02Active, setNode02Active] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    // Check Infrastructure Health every 15 seconds
    const checkHealth = async () => {
        const n1 = await persistenceService.checkNode01();
        const n2 = await persistenceService.checkNode02();
        setNode01Active(n1);
        setNode02Active(n2);
    };
    checkHealth();
    const healthTimer = setInterval(checkHealth, 15000);

    return () => {
        clearInterval(timer);
        clearInterval(healthTimer);
    };
  }, []);

  const selectedOfficer = officers.find(o => o.id === selectedId);

  return (
    <div className="flex flex-col h-screen w-full bg-[#0f172a] text-white font-sans overflow-hidden">
      
      {/* --- TOP HEADER BAR --- */}
      <header className="h-20 bg-[#1e293b] border-b border-white/5 flex items-center justify-between px-6 z-20 shadow-2xl">
        <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#FFD100] flex items-center justify-center text-[#003366] font-black text-xl shadow-[0_0_20px_rgba(255,209,0,0.2)]">
                    B
                </div>
                <div>
                    <h1 className="text-sm font-black tracking-[0.2em] uppercase text-white">BDO Fleet<span className="text-[#FFD100]">Guard</span></h1>
                    <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">Control Center V3.1</p>
                </div>
            </div>

            <div className="h-10 w-px bg-white/10 mx-2"></div>

            {/* --- SYSTEM INFRASTRUCTURE MONITOR --- */}
            <div className="flex gap-6 items-center">
                 {/* Node 01: Render/Neon */}
                 <div className="flex flex-col">
                    <span className="text-[7px] text-slate-500 uppercase font-black tracking-widest mb-1 opacity-70">API_NODE_01 (Render)</span>
                    <div className="flex items-center gap-2 px-2 py-1 rounded bg-black/20 border border-white/5">
                        <div className={`w-1.5 h-1.5 rounded-full ${node01Active ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'bg-red-500'}`}></div>
                        <span className={`text-[9px] font-mono ${node01Active ? 'text-cyan-400' : 'text-red-500'}`}>
                            {node01Active ? 'NEON_CONNECTED' : 'NODE_DOWN'}
                        </span>
                    </div>
                 </div>

                 {/* Node 02: Supabase */}
                 <div className="flex flex-col">
                    <span className="text-[7px] text-slate-500 uppercase font-black tracking-widest mb-1 opacity-70">DB_NODE_02 (Cloud)</span>
                    <div className="flex items-center gap-2 px-2 py-1 rounded bg-black/20 border border-white/5">
                        <div className={`w-1.5 h-1.5 rounded-full ${node02Active ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-600'}`}></div>
                        <span className={`text-[9px] font-mono ${node02Active ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {node02Active ? 'SUPA_SYNCHRONIZED' : 'DB_IDLE'}
                        </span>
                    </div>
                 </div>

                 {/* Realtime Socket */}
                 <div className="flex flex-col">
                    <span className="text-[7px] text-slate-500 uppercase font-black tracking-widest mb-1 opacity-70">REALTIME_UPLINK</span>
                    <div className="flex items-center gap-2 px-2 py-1 rounded bg-black/20 border border-white/5">
                        <div className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'Broadcasting_Live' ? 'bg-purple-400 animate-ping' : 'bg-amber-500'}`}></div>
                        <span className={`text-[9px] font-mono ${wsStatus === 'Broadcasting_Live' ? 'text-purple-400' : 'text-amber-500'}`}>
                            {wsStatus === 'Broadcasting_Live' ? 'WS_BROADCASTING' : 'SOCKET_HANDSHAKE'}
                        </span>
                    </div>
                 </div>
            </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
                <p className="text-xl font-mono font-bold text-white leading-none">
                    {currentTime.toLocaleTimeString([], { hour12: true })}
                </p>
                <div className="flex items-center justify-end gap-2 mt-1.5">
                    <span className="text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded font-black tracking-tighter uppercase">Shift Active</span>
                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">11:00 - 18:00</span>
                </div>
            </div>
            
            <button 
                onClick={onLogout}
                className="bg-red-500/10 hover:bg-red-500/30 text-red-400 border border-red-500/50 p-2.5 rounded-xl transition-all shadow-lg"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <div className="w-80 bg-[#0f172a] border-r border-white/5 flex flex-col z-10 shadow-2xl">
            <Sidebar devices={officers} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div className="flex-1 relative bg-[#020617]">
            <MapComponent devices={officers} selectedId={selectedId} onSelect={setSelectedId} />
            
            {/* Legend / Status Overlay */}
            <div className="absolute top-6 left-6 z-[400] bg-[#1e293b]/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 shadow-2xl">
                 <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-3">Live Fleet Status</h4>
                 <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                        <span className="text-[9px] font-bold uppercase text-slate-300">Active / On Duty</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                        <span className="text-[9px] font-bold uppercase text-slate-300">Meeting / Engagement</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        <span className="text-[9px] font-bold uppercase text-slate-300">Break / Idle</span>
                    </div>
                 </div>
            </div>
            
            {selectedOfficer && (
                <div className="absolute bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-[600px] z-[1000] animate-in slide-in-from-bottom-10 fade-in duration-300">
                    <div className="bg-[#1e293b]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-1 shadow-2xl flex items-stretch">
                        <div className="p-4 flex items-center gap-4 border-r border-white/10 min-w-[200px]">
                            <img src={selectedOfficer.avatar || "https://via.placeholder.com/40"} className="w-12 h-12 rounded-lg object-cover border border-white/10" />
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-tight">{selectedOfficer.name}</h3>
                                <p className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">Source: {selectedOfficer.telemetrySource}</p>
                            </div>
                        </div>
                        <div className="flex-1 flex flex-col justify-center px-6 gap-1">
                             <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                                <span>Signal Assurance</span>
                                <span className="text-emerald-400">100% (High Density)</span>
                             </div>
                             <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                                <span>Power Grid</span>
                                <span className={selectedOfficer.battery < 20 ? 'text-red-500' : 'text-cyan-400'}>{selectedOfficer.battery}%</span>
                             </div>
                        </div>
                        <div className="flex items-center gap-2 p-2">
                             <button onClick={() => setSelectedId(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 w-8 h-full rounded-lg flex items-center justify-center transition-all ml-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                             </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
