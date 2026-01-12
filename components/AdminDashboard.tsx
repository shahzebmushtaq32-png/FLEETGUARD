
import React, { useState, useEffect, useMemo } from 'react';
import { User, SalesOfficer, Geofence, Message, SystemStats } from '../types';
import Sidebar from './Sidebar';
import MapComponent from './MapComponent';
import GeminiAssistant from './GeminiAssistant';
import AuditPanel from './AuditPanel'; 
import { r2Service } from '../services/r2Service';
import { historyService } from '../services/historyService';
import GeminiLiveVoice from './GeminiLiveVoice';

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

interface SystemNotification {
  id: string;
  type: 'battery' | 'offline' | 'review';
  title: string;
  message: string;
  time: Date;
  severity: 'critical' | 'warning' | 'info';
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  officers: initialOfficers, onLogout, onAddBDO, onDeleteBDO, onAssignTask, wsStatus 
}) => {
  const [officers, setOfficers] = useState<SalesOfficer[]>(initialOfficers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<'fleet' | 'admin' | 'alerts'>('fleet');
  const [subTab, setSubTab] = useState<'intel' | 'audit'>('intel');
  
  // Registration States
  const [newBdoName, setNewBdoName] = useState('');
  const [newBdoCode, setNewBdoCode] = useState('');
  const [newBdoPass, setNewBdoPass] = useState('');
  const [newBdoAvatar, setNewBdoAvatar] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const [taskTitle, setTaskTitle] = useState('');
  
  // Admin Geofencing (local state for now)
  const [adminGeofences, setAdminGeofences] = useState<Geofence[]>([]);

  // Sync props to local state
  useEffect(() => {
    setOfficers(prev => {
        // Merge updates while preserving history if we already fetched it
        return initialOfficers.map(fresh => {
            const existing = prev.find(p => p.id === fresh.id);
            if (existing && existing.history.length > 0) {
                return { ...fresh, history: existing.history };
            }
            return fresh;
        });
    });
  }, [initialOfficers]);

  // Fetch History on Selection
  useEffect(() => {
    const fetchHistory = async () => {
        if (selectedId) {
            const route = await historyService.getOfficerRoute(selectedId);
            if (route.length > 0) {
                setOfficers(prev => prev.map(o => 
                    o.id === selectedId ? { ...o, history: route } : o
                ));
            }
        }
    };
    fetchHistory();
  }, [selectedId]);

  // Notification System Logic
  const notifications: SystemNotification[] = useMemo(() => {
    const list: SystemNotification[] = [];
    
    officers.forEach(o => {
      // 1. Low Battery Alerts
      if (o.battery < 20) {
        list.push({
          id: `bat-${o.id}`,
          type: 'battery',
          title: 'Critical Battery',
          message: `${o.name} is at ${o.battery}% power`,
          time: o.lastUpdate,
          severity: 'critical'
        });
      }

      // 2. Offline Alerts
      if (o.status === 'Offline') {
         list.push({
          id: `off-${o.id}`,
          type: 'offline',
          title: 'Signal Lost',
          message: `${o.name} is currently offline`,
          time: o.lastUpdate,
          severity: 'warning'
        });
      }

      // 3. New Submission Reviews
      o.leads.forEach(l => {
        l.reports.forEach(r => {
          if (r.status === 'Submitted') {
            list.push({
              id: `rev-${r.id}`,
              type: 'review',
              title: 'Review Required',
              message: `Report pending for ${l.clientName} (${o.name})`,
              time: r.timestamp,
              severity: 'info'
            });
          }
        });
      });
    });
    
    // Sort by severity (critical first) then time (newest first)
    return list.sort((a, b) => {
        if (a.severity === 'critical' && b.severity !== 'critical') return -1;
        if (a.severity !== 'critical' && b.severity === 'critical') return 1;
        return b.time.getTime() - a.time.getTime();
    });
  }, [officers]);

  const handleRegister = () => {
    if (newBdoName && newBdoCode && newBdoPass) {
      onAddBDO(newBdoName, newBdoCode, newBdoPass, newBdoAvatar);
      // Reset form
      setNewBdoName('');
      setNewBdoCode('');
      setNewBdoPass('');
      setNewBdoAvatar('');
      alert(`Registered BDO: ${newBdoCode}`);
    } else {
      alert("Please fill in Code, Name, and Password.");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setIsUploading(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64 = reader.result as string;
            try {
              // Upload to R2 via signed URL
              const r2Url = await r2Service.uploadEvidence(base64, file.name);
              setNewBdoAvatar(r2Url);
            } catch (err) {
              console.error("R2 Upload Error", err);
              // Fallback for demo/offline
              setNewBdoAvatar(base64);
            } finally {
              setIsUploading(false);
            }
        };
        reader.readAsDataURL(file);
    }
  };

  const selectedOfficer = officers.find(o => o.id === selectedId);

  return (
    <div className="flex h-full w-full bg-[#f8fafc] font-sans">
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shadow-sm">
        <div className="p-8 bg-[#003366] text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mt-12"></div>
          <h2 className="text-2xl font-black uppercase italic leading-none mb-1">Central<br/>Admin</h2>
          <div className="mt-4 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${wsStatus === 'Broadcasting_Live' ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}`}></div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300 italic">Sync: {wsStatus}</p>
             </div>
             {/* Admin Voice Control */}
             <GeminiLiveVoice 
                devices={officers} 
                onSetGeofence={(fence) => setAdminGeofences(prev => [...prev, fence])} 
             />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <Sidebar devices={officers} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div className="p-6 border-t border-slate-100 grid grid-cols-2 gap-3">
           <button 
             onClick={() => setActivePanel('fleet')} 
             className={`py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${activePanel === 'fleet' ? 'bg-[#003366] text-[#FFD100] shadow-lg' : 'bg-slate-50 text-slate-400'}`}
           >
             Field Map
           </button>
           <button 
             onClick={() => setActivePanel('admin')} 
             className={`py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${activePanel === 'admin' ? 'bg-[#003366] text-[#FFD100] shadow-lg' : 'bg-slate-50 text-slate-400'}`}
           >
             Registry
           </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative">
        <header className="h-20 px-10 flex items-center justify-between bg-white border-b border-slate-100 z-10">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 bg-[#FFD100] rounded-xl flex items-center justify-center font-black text-[#003366] text-lg">B</div>
             <h1 className="font-black text-slate-800 uppercase tracking-tight text-base">Fleet Operations Hub</h1>
          </div>
          <button onClick={onLogout} className="text-[11px] font-black text-slate-400 uppercase tracking-widest hover:text-red-500 transition-colors">Sign Out</button>
        </header>

        <main className="flex-1 relative overflow-hidden">
          <MapComponent devices={officers} selectedId={selectedId} onSelect={setSelectedId} geofences={adminGeofences} />
          
          <div className="absolute top-8 right-8 w-[380px] bottom-8 pointer-events-none flex flex-col gap-6">
            
            {/* NOTIFICATION CENTER */}
            <div className="bg-white/95 backdrop-blur-xl p-6 rounded-[2.5rem] shadow-2xl pointer-events-auto border border-slate-200 max-h-[250px] flex flex-col overflow-hidden transition-all hover:scale-[1.02]">
               <div className="flex justify-between items-center mb-4 shrink-0">
                  <h3 className="text-[10px] font-black text-[#003366] uppercase tracking-[0.2em] italic">System Alerts</h3>
                  {notifications.length > 0 && (
                      <div className="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full animate-pulse shadow-md">
                        {notifications.length} Active
                      </div>
                  )}
               </div>
               <div className="space-y-2 overflow-y-auto custom-scrollbar pr-2 flex-1">
                  {notifications.length === 0 ? (
                    <div className="text-center py-6 border-2 border-dashed border-slate-100 rounded-xl">
                        <svg className="w-6 h-6 text-slate-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest italic">All Systems Nominal</p>
                    </div>
                  ) : (
                    notifications.map((notif) => (
                      <div key={notif.id} className={`p-3 rounded-xl border flex items-start gap-3 transition-all ${
                         notif.severity === 'critical' ? 'bg-red-50 border-red-100 hover:bg-red-100' :
                         notif.type === 'review' ? 'bg-blue-50 border-blue-100 hover:bg-blue-100' : 
                         'bg-slate-50 border-slate-100 hover:bg-slate-100'
                      }`}>
                         <div className={`mt-1 w-2 h-2 shrink-0 rounded-full ${
                            notif.severity === 'critical' ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 
                            notif.type === 'review' ? 'bg-blue-500' : 'bg-slate-400'
                         }`}></div>
                         <div>
                            <div className="flex justify-between w-full gap-2">
                                <h4 className={`text-[9px] font-black uppercase tracking-wide ${
                                notif.severity === 'critical' ? 'text-red-700' : 
                                notif.type === 'review' ? 'text-blue-700' : 'text-slate-600'
                                }`}>{notif.title}</h4>
                            </div>
                            <p className="text-[9px] text-slate-500 font-bold leading-tight my-0.5">{notif.message}</p>
                            <p className="text-[8px] text-slate-300 font-black uppercase tracking-widest">{notif.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                         </div>
                      </div>
                    ))
                  )}
               </div>
            </div>

            {/* BDO MANAGEMENT PANEL */}
            {activePanel === 'admin' && (
              <div className="bg-white/95 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-2xl pointer-events-auto flex-1 overflow-y-auto border border-slate-200 animate-in slide-in-from-right-8">
                <h3 className="text-xs font-black text-[#003366] uppercase mb-8 tracking-[0.3em] ml-1">BDO Registry</h3>
                
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8 space-y-4">
                   <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Register New Agent</h4>
                   <div className="space-y-3">
                      <div className="flex gap-4 items-center">
                        <div className="w-16 h-16 bg-slate-200 rounded-2xl flex-shrink-0 border-2 border-slate-300 overflow-hidden relative">
                           {isUploading ? (
                             <div className="w-full h-full flex items-center justify-center bg-slate-100">
                               <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                             </div>
                           ) : newBdoAvatar ? (
                             <img src={newBdoAvatar} className="w-full h-full object-cover" />
                           ) : (
                             <div className="flex items-center justify-center h-full text-slate-400">
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                             </div>
                           )}
                        </div>
                        <label className="flex-1 cursor-pointer">
                          <span className="text-[9px] font-black uppercase text-blue-600 block mb-1">Upload Photo (R2)</span>
                          <input 
                            type="file" 
                            accept="image/*"
                            onChange={handleImageUpload}
                            disabled={isUploading}
                            className="w-full text-[9px] text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[9px] file:font-black file:uppercase file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                            <input 
                              type="text" 
                              value={newBdoCode} 
                              onChange={(e) => setNewBdoCode(e.target.value)}
                              placeholder="BDO Code (ID)" 
                              className="w-full bg-white border border-slate-200 p-4 rounded-2xl text-[10px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                            />
                        </div>
                         <input 
                          type="password" 
                          value={newBdoPass} 
                          onChange={(e) => setNewBdoPass(e.target.value)}
                          placeholder="Password" 
                          className="w-full bg-white border border-slate-200 p-4 rounded-2xl text-[10px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                        />
                      </div>
                      <input 
                        type="text" 
                        value={newBdoName} 
                        onChange={(e) => setNewBdoName(e.target.value)}
                        placeholder="Full Name" 
                        className="w-full bg-white border border-slate-200 p-4 rounded-2xl text-[10px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                      />
                      <button 
                        onClick={handleRegister} 
                        disabled={isUploading}
                        className="w-full bg-blue-600 text-white font-black py-4 rounded-2xl text-[10px] uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Register Agent (Save to DB)
                      </button>
                   </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-4">Registered Agents</h4>
                  {officers.map(off => (
                    <div key={off.id} className="p-4 bg-white rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm hover:shadow-md transition-all">
                       <div className="flex items-center gap-4">
                          <div className="relative w-10 h-10 flex-shrink-0">
                            {off.avatar ? (
                                <img src={off.avatar} className="w-full h-full rounded-xl object-cover border border-slate-200" alt={off.name} />
                            ) : (
                                <div className="w-full h-full bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-300 border border-slate-200">?</div>
                            )}
                            <div className={`absolute -bottom-1 -right-1 w-3 h-3 border-2 border-white rounded-full ${off.status === 'Offline' ? 'bg-red-400' : 'bg-green-400'}`}></div>
                          </div>
                          <div>
                            <span className="block text-[10px] font-black text-slate-700 uppercase tracking-tight">{off.name}</span>
                            <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">ID: {off.id}</span>
                          </div>
                       </div>
                       <button onClick={() => onDeleteBDO(off.id)} className="text-[9px] font-black text-red-400 bg-red-50 px-3 py-1.5 rounded-lg uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* OFFICER INTEL & AUDIT PANEL */}
            {selectedOfficer && (
              <div className="bg-white/95 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-2xl pointer-events-auto border border-slate-200 animate-in slide-in-from-right-8 flex flex-col h-full max-h-[80vh]">
                 <div className="flex items-center gap-5 mb-6 shrink-0">
                    {selectedOfficer.avatar ? (
                      <img src={selectedOfficer.avatar} className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-500 shadow-xl" alt="Profile" />
                    ) : (
                      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-200 text-xl border-2 border-slate-100">?</div>
                    )}
                    <div>
                       <h4 className="text-base font-black text-[#003366] uppercase leading-none mb-1">{selectedOfficer.name}</h4>
                       <p className={`text-[10px] font-black uppercase tracking-[0.2em] italic ${selectedOfficer.status === 'On Duty' ? 'text-green-500' : 'text-slate-400'}`}>{selectedOfficer.status}</p>
                       <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">ID: {selectedOfficer.id}</p>
                    </div>
                 </div>

                 {/* Sub-Tabs */}
                 <div className="flex gap-2 mb-6 shrink-0 bg-slate-50 p-1 rounded-xl border border-slate-100">
                    <button 
                      onClick={() => setSubTab('intel')}
                      className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${subTab === 'intel' ? 'bg-white text-[#003366] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Operations
                    </button>
                    <button 
                      onClick={() => setSubTab('audit')}
                      className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${subTab === 'audit' ? 'bg-white text-[#003366] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      Evidence Audit
                    </button>
                 </div>

                 <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
                   {subTab === 'intel' ? (
                     <>
                        <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-6">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] block mb-4 ml-1">Deploy New Task</label>
                          <div className="flex gap-3">
                              <input 
                                type="text" 
                                value={taskTitle} 
                                onChange={(e) => setTaskTitle(e.target.value)}
                                placeholder="e.g. Visit SM Makati..." 
                                className="flex-1 bg-white border border-slate-200 p-3 rounded-xl text-[10px] font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                              />
                              <button 
                                onClick={() => {if(taskTitle) {onAssignTask(selectedOfficer.id, taskTitle); setTaskTitle('');}}} 
                                className="bg-[#003366] text-white px-5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                              >
                                Send
                              </button>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-6">
                            <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">AI Field Support</h4>
                            <GeminiAssistant devices={officers} />
                        </div>
                     </>
                   ) : (
                     <div className="space-y-4">
                       <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] ml-1 mb-2">R2 Asset Cloud</h4>
                       <AuditPanel 
                          evidence={selectedOfficer.evidence.map(e => ({...e, officerName: selectedOfficer.name}))} 
                       />
                     </div>
                   )}
                 </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
