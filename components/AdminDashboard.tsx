
import React, { useState, useEffect } from 'react';
import { User, SalesOfficer, Geofence, Message, SystemStats, DispatchRecommendation, Incident } from '../types';
import Sidebar from './Sidebar';
import MapComponent from './MapComponent';
import DispatchHub from './DispatchHub';
import AuditPanel from './AuditPanel';
import GeminiAssistant from './GeminiAssistant';
import ArchitectureGuide from './ArchitectureGuide';
import IncidentFeed from './IncidentFeed';
import { persistenceService } from '../services/persistenceService';
import { getDispatchRecommendations } from '../services/geminiService';

interface AdminDashboardProps {
  user: User;
  officers: SalesOfficer[];
  geofences: Geofence[];
  stats: SystemStats;
  messages: Message[];
  incidents: Incident[];
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
  officers, incidents, onLogout, onAddBDO, onDeleteBDO, onAssignTask, wsStatus, systemMode, onToggleSystemMode 
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'dispatch' | 'audit' | 'arch' | 'ops' | 'alerts'>('map');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  
  const [renderActive, setRenderActive] = useState(false);
  const [supabaseActive, setSupabaseActive] = useState(false);
  const [neonActive, setNeonActive] = useState(false);
  const [r2Active, setR2Active] = useState(false);

  const [recommendations, setRecommendations] = useState<DispatchRecommendation[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const checkHealth = async () => {
        const render = await persistenceService.checkNode01();
        const sup = await persistenceService.checkNode02();
        const neon = await persistenceService.getNeonStats();
        const r2 = await persistenceService.checkR2Health();
        
        setRenderActive(render);
        setSupabaseActive(sup);
        setNeonActive(!!neon);
        setR2Active(!!r2);
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

  const handleManualCleanup = async () => {
    if (!confirm("Are you sure? This will permanently delete all telemetry and history older than 30 days.")) return;
    setIsCleaning(true);
    const success = await persistenceService.triggerCleanupAPI();
    alert(success ? "30-day cleanup completed successfully." : "Cleanup failed. Check backend connectivity.");
    setIsCleaning(false);
  };

  const allEvidence = officers.flatMap(o => (o.evidence || []).map(e => ({ ...e, officerName: o.name })));

  return (
    <div className="flex flex-col h-screen w-full bg-[#0f172a] text-white font-sans overflow-hidden">
      
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-[#1e293b] border border-white/10 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black uppercase tracking-tight">Deploy New Node</h3>
                 <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-white">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
              </div>
              <AddBDOForm 
                onAdd={(n, c, p, a) => {
                  onAddBDO(n, c, p, a);
                  setShowAddModal(false);
                }} 
              />
           </div>
        </div>
      )}

      <header className="h-24 bg-[#1e293b] border-b border-white/5 flex items-center justify-between px-6 z-20 shadow-2xl shrink-0">
        <div className="flex items-center gap-8">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#FFD100] flex items-center justify-center text-[#003366] font-black text-xl">B</div>
                <div className="hidden sm:block">
                    <h1 className="text-sm font-black tracking-[0.2em] uppercase text-white leading-tight">BDO Fleet<span className="text-[#FFD100]">Guard</span></h1>
                    <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">SECURE GRID CONTROL</p>
                </div>
            </div>
            
            <div className="hidden lg:flex gap-4 items-center border-l border-white/5 pl-8">
                 <HealthOrb label="RENDER_API" active={renderActive} color="purple" />
                 <HealthOrb label="NEON_DB" active={neonActive} color="blue" />
                 <HealthOrb label="SUPABASE" active={supabaseActive} color="emerald" />
                 <HealthOrb label="CLOUDFLARE_R2" active={r2Active} color="cyan" />
                 <div className="h-8 w-px bg-white/5 mx-2"></div>
                 <HealthOrb label="WS_UPLINK" active={wsStatus === 'Broadcasting_Live'} color="amber" />
            </div>
        </div>

        <div className="flex items-center gap-6">
            <button 
              onClick={() => setShowAddModal(true)}
              className="hidden md:flex items-center gap-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
              Add Node
            </button>

            <div className="text-right hidden sm:block">
                <p className="text-xl font-mono font-bold text-white leading-none">
                    {currentTime.toLocaleTimeString([], { hour12: true })}
                </p>
                <div className="flex items-center justify-end gap-2 mt-1.5">
                    <span className={`text-[8px] border px-2 py-0.5 rounded font-black uppercase tracking-tighter ${systemMode === 'DEV' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-amber-500/10 text-amber-500 border-amber-500/30'}`}>
                      {systemMode === 'DEV' ? 'DEV_24_7' : 'SHIFT_ENFORCED'}
                    </span>
                </div>
            </div>
            
            <button onClick={onLogout} className="bg-red-500/10 hover:bg-red-500/30 text-red-400 border border-red-500/50 p-2.5 rounded-xl transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <nav className="w-20 bg-[#1e293b] border-r border-white/5 flex flex-col items-center py-6 gap-6 z-30 shadow-2xl">
            <NavIcon active={activeTab === 'map'} onClick={() => setActiveTab('map')} icon="map" label="Map" />
            <NavIcon active={activeTab === 'alerts'} onClick={() => setActiveTab('alerts')} icon="bell" label="Alerts" count={incidents.filter(i => i.severity === 'critical').length} />
            <NavIcon active={activeTab === 'dispatch'} onClick={() => setActiveTab('dispatch')} icon="cpu" label="AI Hub" />
            <NavIcon active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon="shield" label="Audit" />
            <NavIcon active={activeTab === 'arch'} onClick={() => setActiveTab('arch')} icon="arch" label="Arch" />
            <NavIcon active={activeTab === 'ops'} onClick={() => setActiveTab('ops')} icon="settings" label="Ops" />
        </nav>

        <div className={`w-80 bg-[#0f172a] border-r border-white/5 flex flex-col z-10 shadow-2xl transition-all ${activeTab !== 'map' ? 'hidden xl:flex' : 'flex'}`}>
            <Sidebar devices={officers} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <main className="flex-1 relative bg-[#020617] overflow-hidden">
            {activeTab === 'map' && (
                <MapComponent devices={officers} selectedId={selectedId} onSelect={setSelectedId} />
            )}

            {activeTab === 'alerts' && (
                <div className="p-8 h-full flex flex-col overflow-y-auto custom-scrollbar">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-8">Grid Alerts</h2>
                    <IncidentFeed incidents={incidents} />
                </div>
            )}

            {activeTab === 'dispatch' && (
                <div className="p-8 h-full flex flex-col bg-[#0f172a]/50 backdrop-blur-lg">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">AI Fleet Matcher</h2>
                            <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-1">PROXIMITY + REVENUE SCORING</p>
                        </div>
                        <button onClick={runAiDispatch} disabled={isAiLoading} className="bg-[#FFD100] text-[#003366] px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg">
                            {isAiLoading ? 'Analyzing...' : 'Execute Match'}
                        </button>
                    </div>
                    <DispatchHub leads={officers.flatMap(o => o.leads)} officers={officers} recommendations={recommendations} isLoading={isAiLoading} onExecute={(rec) => onAssignTask(rec.officerId, `AI TASK: ${rec.reasoning}`)} />
                </div>
            )}

            {activeTab === 'audit' && (
                <div className="p-8 h-full flex flex-col overflow-y-auto custom-scrollbar">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-8">Asset Evidence Locker</h2>
                    <AuditPanel evidence={allEvidence as any} />
                </div>
            )}

            {activeTab === 'arch' && (
                <div className="p-8 h-full flex flex-col overflow-y-auto custom-scrollbar">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-8">Architecture Visualization</h2>
                    <ArchitectureGuide />
                </div>
            )}

            {activeTab === 'ops' && (
                <div className="p-8 h-full flex flex-col bg-[#0f172a]/50 backdrop-blur-lg overflow-y-auto custom-scrollbar">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-8">Grid Operations</h2>
                    <div className="max-w-xl space-y-6">
                        <div className="bg-[#1e293b] border border-white/10 rounded-3xl p-8">
                            <h3 className="text-[11px] font-black uppercase text-cyan-400 mb-6">Environment Control</h3>
                            <div className="flex items-center justify-between p-5 bg-black/20 rounded-2xl border border-white/5">
                                <div>
                                    <p className="text-[10px] font-black text-white uppercase mb-1">Shift Enforcement</p>
                                    <p className="text-[8px] text-slate-500 uppercase tracking-widest leading-relaxed">
                                      Toggle standby logic. PROD mode shuts down access outside 11AM-6PM.
                                    </p>
                                </div>
                                <button onClick={onToggleSystemMode} className={`w-14 h-8 rounded-full relative transition-all ${systemMode === 'PROD' ? 'bg-amber-600' : 'bg-slate-700'}`}>
                                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-lg transition-all ${systemMode === 'PROD' ? 'left-7' : 'left-1'}`}></div>
                                </button>
                            </div>
                        </div>

                        <div className="bg-[#1e293b] border border-white/10 rounded-3xl p-8">
                            <h3 className="text-[11px] font-black uppercase text-purple-400 mb-6">System Maintenance</h3>
                            <div className="p-5 bg-black/20 rounded-2xl border border-white/5">
                                <div className="mb-4">
                                    <p className="text-[10px] font-black text-white uppercase mb-1">Free Tier Optimization</p>
                                    <p className="text-[8px] text-slate-500 uppercase tracking-widest leading-relaxed">
                                      Manually trigger the 30-day data scavenger to purge old telemetry and free up database rows.
                                    </p>
                                </div>
                                <button 
                                  onClick={handleManualCleanup} 
                                  disabled={isCleaning}
                                  className="w-full py-3 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-purple-500/20 disabled:opacity-50"
                                >
                                  {isCleaning ? "Running Scavenger..." : "Purge Legacy Data (>30 Days)"}
                                </button>
                            </div>
                        </div>

                        <div className="bg-[#1e293b] border border-white/10 rounded-3xl p-8">
                            <h3 className="text-[11px] font-black uppercase text-red-400 mb-6">Danger Zone</h3>
                            <div className="space-y-4">
                               {officers.map(o => (
                                   <div key={o.id} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                                       <span className="text-[9px] font-mono font-bold text-slate-400 uppercase">{o.id} - {o.name}</span>
                                       <button onClick={() => onDeleteBDO(o.id)} className="text-[8px] font-black text-red-500 uppercase hover:underline">Decommission</button>
                                   </div>
                               ))}
                            </div>
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

const AddBDOForm = ({ onAdd }: { onAdd: (n: string, c: string, p: string, a: string) => void }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [pass, setPass] = useState('123');
    const [avatar, setAvatar] = useState('https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop');

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Agent Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Maria Clara" className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Node Identifier (ID)</label>
                <input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. BDO-999" className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-emerald-400 focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-500 ml-1">Access Credential</label>
                <input value={pass} onChange={e => setPass(e.target.value)} type="password" placeholder="••••" className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
            </div>
            <button 
                onClick={() => onAdd(name, code, pass, avatar)}
                disabled={!name || !code}
                className="w-full bg-emerald-500 text-[#003366] font-black py-4 rounded-2xl text-[11px] uppercase tracking-widest shadow-lg shadow-emerald-500/10 active:scale-95 transition-all mt-6 disabled:opacity-50"
            >
                Authorize Deployment
            </button>
        </div>
    );
};

const HealthOrb = ({ label, active, color }: { label: string, active: boolean, color: string }) => (
    <div className="flex flex-col min-w-[80px]">
        <span className="text-[7px] text-slate-500 uppercase font-black tracking-widest mb-1 opacity-70 whitespace-nowrap">{label}</span>
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-black/20 border border-white/5 transition-all">
            <div className={`w-2 h-2 rounded-full ${active ? `bg-${color}-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]` : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}></div>
            <span className={`text-[9px] font-black font-mono ${active ? `text-${color}-400` : 'text-red-500'}`}>{active ? 'ACTIVE' : 'OFFLINE'}</span>
        </div>
    </div>
);

const NavIcon = ({ active, onClick, icon, label, count }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 group transition-all duration-300 relative`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${active ? 'bg-[#FFD100] text-[#003366]' : 'text-slate-500 hover:bg-white/5'}`}>
            {icon === 'map' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>}
            {icon === 'bell' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>}
            {icon === 'cpu' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2-2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>}
            {icon === 'shield' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
            {icon === 'arch' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>}
            {icon === 'settings' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        </div>
        {count > 0 && (
            <div className="absolute top-1 right-2 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#1e293b]">
                {count}
            </div>
        )}
        <span className={`text-[8px] font-black uppercase tracking-widest ${active ? 'text-[#FFD100]' : 'text-slate-600'}`}>{label}</span>
    </button>
);

export default AdminDashboard;
