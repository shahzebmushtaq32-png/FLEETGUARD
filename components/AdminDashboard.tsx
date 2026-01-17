
import React, { useState, useEffect } from 'react';
import { User, SalesOfficer, Geofence, Message, SystemStats, DispatchRecommendation } from '../types';
import Sidebar from './Sidebar';
import MapComponent from './MapComponent';
import DispatchHub from './DispatchHub';
import AuditPanel from './AuditPanel';
import ReportReview from './ReportReview';
import GeminiAssistant from './GeminiAssistant';
import ArchitectureGuide from './ArchitectureGuide';
import { persistenceService } from '../services/persistenceService';
import { getDispatchRecommendations } from '../services/geminiService';

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
  systemMode: 'DEV' | 'PROD';
  onToggleSystemMode: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  officers, onLogout, onAddBDO, onDeleteBDO, onAssignTask, wsStatus, systemMode, onToggleSystemMode 
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'dispatch' | 'audit' | 'reports' | 'ops'>('map');
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Infrastructure Health State
  const [node01Active, setNode01Active] = useState(false);
  const [node02Active, setNode02Active] = useState(false);

  // AI State
  const [recommendations, setRecommendations] = useState<DispatchRecommendation[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const checkHealth = async () => {
        const n1 = await persistenceService.checkNode01();
        const n2 = await persistenceService.checkNode02();
        setNode01Active(n1);
        setNode02Active(n2);
    };
    checkHealth();
    const healthTimer = setInterval(checkHealth, 15000);
    return () => { clearInterval(timer); clearInterval(healthTimer); };
  }, []);

  const runAiDispatch = async () => {
    setIsAiLoading(true);
    try {
        const allLeads = officers.flatMap(o => o.leads);
        const recs = await getDispatchRecommendations(officers, allLeads);
        setRecommendations(recs);
    } catch (e) { console.error(e); } finally { setIsAiLoading(false); }
  };

  const selectedOfficer = officers.find(o => o.id === selectedId);
  const allEvidence = officers.flatMap(o => (o.evidence || []).map(e => ({ ...e, officerName: o.name })));

  return (
    <div className="flex flex-col h-screen w-full bg-[#0f172a] text-white font-sans overflow-hidden">
      
      {/* --- TOP HEADER BAR --- */}
      <header className="h-20 bg-[#1e293b] border-b border-white/5 flex items-center justify-between px-6 z-20 shadow-2xl shrink-0">
        <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#FFD100] flex items-center justify-center text-[#003366] font-black text-xl shadow-[0_0_20px_rgba(255,209,0,0.2)]">B</div>
                <div>
                    <h1 className="text-sm font-black tracking-[0.2em] uppercase text-white">BDO Fleet<span className="text-[#FFD100]">Guard</span></h1>
                    <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">Control Center V3.2</p>
                </div>
            </div>
            
            <div className="hidden lg:flex gap-6 items-center">
                 <HealthOrb label="NODE_01" active={node01Active} color="cyan" />
                 <HealthOrb label="NODE_02" active={node02Active} color="emerald" />
                 <HealthOrb label="WS_LIVE" active={wsStatus === 'Broadcasting_Live'} color="purple" />
            </div>
        </div>

        <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
                <p className="text-xl font-mono font-bold text-white leading-none">
                    {currentTime.toLocaleTimeString([], { hour12: true })}
                </p>
                <div className="flex items-center justify-end gap-2 mt-1.5">
                    <span className={`text-[8px] border px-2 py-0.5 rounded font-black uppercase tracking-tighter ${systemMode === 'DEV' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-amber-500/10 text-amber-500 border-amber-500/30'}`}>
                      {systemMode === 'DEV' ? 'Development (24/7)' : 'Production (Shift)'}
                    </span>
                </div>
            </div>
            
            <button onClick={onLogout} className="bg-red-500/10 hover:bg-red-500/30 text-red-400 border border-red-500/50 p-2.5 rounded-xl transition-all shadow-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <nav className="w-20 bg-[#1e293b] border-r border-white/5 flex flex-col items-center py-6 gap-6 z-30 shadow-2xl">
            <NavIcon active={activeTab === 'map'} onClick={() => setActiveTab('map')} icon="map" label="Map" />
            <NavIcon active={activeTab === 'dispatch'} onClick={() => setActiveTab('dispatch')} icon="cpu" label="AI Hub" />
            <NavIcon active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon="shield" label="Audit" />
            <NavIcon active={activeTab === 'ops'} onClick={() => setActiveTab('ops')} icon="settings" label="Ops" />
        </nav>

        <div className={`w-80 bg-[#0f172a] border-r border-white/5 flex flex-col z-10 shadow-2xl transition-all ${activeTab !== 'map' ? 'hidden xl:flex' : 'flex'}`}>
            <Sidebar devices={officers} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <main className="flex-1 relative bg-[#020617] overflow-hidden">
            {activeTab === 'map' && (
                <MapComponent devices={officers} selectedId={selectedId} onSelect={setSelectedId} />
            )}

            {activeTab === 'dispatch' && (
                <div className="p-8 h-full flex flex-col bg-[#0f172a]/50 backdrop-blur-lg">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">AI Dispatch Hub</h2>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">Model: Gemini-3-Pro-Preview</p>
                        </div>
                        <button onClick={runAiDispatch} disabled={isAiLoading} className="bg-[#FFD100] text-[#003366] px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">
                            {isAiLoading ? 'Analyzing Fleet...' : 'Run Optimization'}
                        </button>
                    </div>
                    <DispatchHub leads={officers.flatMap(o => o.leads)} officers={officers} recommendations={recommendations} isLoading={isAiLoading} onExecute={(rec) => onAssignTask(rec.officerId, `AI RECOMMENDED: Visit ${rec.leadId}`)} />
                </div>
            )}

            {activeTab === 'audit' && (
                <div className="p-8 h-full flex flex-col bg-[#0f172a]/50 backdrop-blur-lg overflow-y-auto custom-scrollbar">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-8">Asset Evidence Audit</h2>
                    <AuditPanel evidence={allEvidence as any} />
                </div>
            )}

            {activeTab === 'ops' && (
                <div className="p-8 h-full flex flex-col bg-[#0f172a]/50 backdrop-blur-lg overflow-y-auto custom-scrollbar">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-8">Operations Control</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-[#1e293b]/50 border border-white/10 rounded-3xl p-8">
                            <h3 className="text-[11px] font-black uppercase text-cyan-400 mb-6">System Configuration</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between p-4 bg-black/20 rounded-2xl border border-white/5">
                                    <div>
                                        <p className="text-[10px] font-black text-white uppercase">Operational Hours</p>
                                        <p className="text-[8px] text-slate-500 uppercase tracking-widest">Toggle Shift Restriction</p>
                                    </div>
                                    <button onClick={onToggleSystemMode} className={`w-14 h-8 rounded-full relative transition-all ${systemMode === 'PROD' ? 'bg-amber-600' : 'bg-slate-700'}`}>
                                        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg transition-all ${systemMode === 'PROD' ? 'left-7' : 'left-1'}`}></div>
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="bg-[#1e293b]/50 border border-white/10 rounded-3xl p-8">
                             <ArchitectureGuide />
                        </div>
                    </div>
                </div>
            )}

            <GeminiAssistant officers={officers} />
        </main>
      </div>
    </div>
  );
};

const HealthOrb = ({ label, active, color }: any) => (
    <div className="flex flex-col">
        <span className="text-[7px] text-slate-500 uppercase font-black tracking-widest mb-1 opacity-70">{label}</span>
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-black/20 border border-white/5">
            <div className={`w-1.5 h-1.5 rounded-full ${active ? `bg-${color}-400 animate-pulse` : 'bg-red-500'}`}></div>
            <span className={`text-[9px] font-mono ${active ? `text-${color}-400` : 'text-red-500'}`}>{active ? 'STABLE' : 'IDLE'}</span>
        </div>
    </div>
);

const NavIcon = ({ active, onClick, icon, label }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 group transition-all duration-300`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${active ? 'bg-[#FFD100] text-[#003366]' : 'text-slate-500 hover:bg-white/5'}`}>
            {icon === 'map' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>}
            {icon === 'cpu' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>}
            {icon === 'shield' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
            {icon === 'settings' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        </div>
        <span className={`text-[8px] font-black uppercase tracking-widest ${active ? 'text-[#FFD100]' : 'text-slate-600'}`}>{label}</span>
    </button>
);

export default AdminDashboard;
