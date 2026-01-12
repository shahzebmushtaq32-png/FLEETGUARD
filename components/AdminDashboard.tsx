import React, { useState, useEffect } from 'react';
import { User, SalesOfficer, Geofence, Message, SystemStats } from '../types';
import Sidebar from './Sidebar';
import MapComponent from './MapComponent';
import { r2Service } from '../services/r2Service';
import { historyService } from '../services/historyService';
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

interface LogEntry {
    id: number;
    time: string;
    type: 'INFO' | 'ALERT' | 'CONNECT' | 'GPS';
    msg: string;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  officers: initialOfficers, onLogout, onAddBDO, onDeleteBDO, onAssignTask, wsStatus 
}) => {
  const [officers, setOfficers] = useState<SalesOfficer[]>(initialOfficers);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Modal State for Provisioning
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [newBdoName, setNewBdoName] = useState('');
  const [newBdoCode, setNewBdoCode] = useState('');
  const [newBdoPass, setNewBdoPass] = useState('');
  const [newBdoAvatar, setNewBdoAvatar] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Modal State for Tasks
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTarget, setTaskTarget] = useState('');

  // Operational Logs
  const [showLogs, setShowLogs] = useState(false);
  const [systemLogs, setSystemLogs] = useState<LogEntry[]>([]);

  // Add a log entry helper
  const addLog = (type: 'INFO' | 'ALERT' | 'CONNECT' | 'GPS', msg: string) => {
      setSystemLogs(prev => [
          { id: Date.now(), time: new Date().toLocaleTimeString(), type, msg },
          ...prev
      ].slice(50)); // Keep last 50 logs
  };

  // Monitor WebSocket Status changes for logs
  useEffect(() => {
      addLog('CONNECT', `System Link Status: ${wsStatus}`);
  }, [wsStatus]);

  // Monitor Officer Updates for logs
  useEffect(() => {
    // Diff check to see if officers updated significantly (simple version)
    initialOfficers.forEach(newOff => {
        const oldOff = officers.find(o => o.id === newOff.id);
        if (oldOff) {
            if (oldOff.status !== newOff.status) {
                addLog('INFO', `Node ${newOff.id} changed status to ${newOff.status}`);
            }
            if (oldOff.lat !== newOff.lat || oldOff.lng !== newOff.lng) {
                // Only log GPS moves if selected or occasionally to avoid spam
                if (selectedId === newOff.id) {
                     addLog('GPS', `Node ${newOff.id} updated location`);
                }
            }
        } else {
             addLog('CONNECT', `New Node Detected: ${newOff.id}`);
        }
    });
    setOfficers(initialOfficers);
  }, [initialOfficers]);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch History
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

  const handleRegister = () => {
    if (newBdoName && newBdoCode && newBdoPass) {
      onAddBDO(newBdoName, newBdoCode, newBdoPass, newBdoAvatar);
      setNewBdoName(''); setNewBdoCode(''); setNewBdoPass(''); setNewBdoAvatar('');
      setShowProvisionModal(false);
      addLog('INFO', `Provisioned new node: ${newBdoCode}`);
    } else {
      alert("Missing fields.");
    }
  };

  const handleDeployTask = () => {
      if (taskTitle && taskTarget) {
          onAssignTask(taskTarget, taskTitle);
          setTaskTitle('');
          setTaskTarget('');
          setShowTaskModal(false);
          addLog('INFO', `Directive sent to Node ${taskTarget}: ${taskTitle}`);
      } else {
          alert("Please select a target node and enter a mission directive.");
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
              const r2Url = await r2Service.uploadEvidence(base64, file.name);
              setNewBdoAvatar(r2Url);
              addLog('INFO', 'Identity asset uploaded to R2');
            } catch (err) {
              setNewBdoAvatar(base64);
              addLog('ALERT', 'R2 Upload failed, using local cache');
            } finally {
              setIsUploading(false);
            }
        };
        reader.readAsDataURL(file);
    }
  };

  const selectedOfficer = officers.find(o => o.id === selectedId);
  const activeCount = officers.filter(o => o.status === 'Active' || o.status === 'On Duty').length;
  const breakCount = officers.filter(o => o.status === 'Break' || o.status === 'Meeting').length;
  const totalCount = officers.length;

  return (
    <div className="flex flex-col h-screen w-full bg-[#0f172a] text-white font-sans overflow-hidden">
      
      {/* --- TOP HEADER BAR --- */}
      <header className="h-16 bg-[#1e293b] border-b border-white/5 flex items-center justify-between px-6 z-20 shadow-xl">
        <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                </div>
                <div>
                    <h1 className="text-sm font-black tracking-[0.2em] uppercase text-white">BDO Fleet<span className="text-cyan-400">Guard</span></h1>
                    <div className="flex items-center gap-1.5 mt-0.5 group relative cursor-help">
                        <div className={`w-1.5 h-1.5 rounded-full ${wsStatus === 'Broadcasting_Live' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500 animate-pulse'}`}></div>
                        <span className={`text-[9px] font-mono uppercase ${wsStatus === 'Broadcasting_Live' ? 'text-slate-400' : 'text-red-400 font-bold'}`}>
                            {wsStatus === 'Broadcasting_Live' ? 'SYS_ONLINE' : wsStatus?.toUpperCase() || 'OFFLINE'}
                        </span>
                        
                        {/* Status Tooltip */}
                        <div className="absolute left-0 top-full mt-2 hidden group-hover:block bg-black/90 p-2 rounded border border-white/10 whitespace-nowrap z-50">
                            <p className="text-[8px] text-slate-400 uppercase">Target Server:</p>
                            <p className="text-[9px] text-cyan-400 font-mono">{socketService.getWsUrl()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ACTION BUTTONS (New) */}
            <div className="hidden md:flex items-center gap-3">
                <button 
                    onClick={() => setShowProvisionModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all group"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                    <span className="text-[10px] font-black uppercase tracking-widest">Provision Node</span>
                </button>
                <button 
                    onClick={() => setShowTaskModal(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all group"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                    <span className="text-[10px] font-black uppercase tracking-widest">Deploy Task</span>
                </button>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
                <p className="text-lg font-mono font-bold text-white leading-none">
                    {currentTime.toLocaleTimeString([], { hour12: true })}
                </p>
                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-widest mt-1">
                    {currentTime.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
            </div>

            <div className="h-8 w-px bg-white/10 mx-2"></div>

            <button 
                onClick={() => setShowLogs(!showLogs)}
                className={`flex items-center gap-2 border px-4 py-2 rounded-lg transition-all ${showLogs ? 'bg-cyan-600 text-white border-cyan-500' : 'bg-slate-800 text-slate-400 border-white/10'}`}
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            </button>
            
            <button 
                onClick={onLogout}
                className="bg-red-500/10 hover:bg-red-500/30 text-red-400 border border-red-500/50 p-2 rounded-lg transition-all"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
        </div>
      </header>

      {/* --- MAIN CONTENT LAYOUT --- */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* LEFT SIDEBAR (Grid Personnel) */}
        <div className="w-80 bg-[#0f172a] border-r border-white/5 flex flex-col z-10 shadow-2xl">
            <Sidebar devices={officers} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        {/* MAP AREA */}
        <div className="flex-1 relative bg-[#020617]">
            <MapComponent devices={officers} selectedId={selectedId} onSelect={setSelectedId} />
            
            {/* GRID OVERLAY */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]" 
                 style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
            </div>

            {/* FLOATING LOGS PANEL */}
            {showLogs && (
                <div className="absolute top-6 right-6 w-80 max-h-[400px] flex flex-col bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-[500] animate-in slide-in-from-right-8">
                     <div className="p-3 border-b border-white/10 flex justify-between items-center">
                         <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-300">Operational Logs</h3>
                         <button onClick={() => setSystemLogs([])} className="text-[9px] text-cyan-500 hover:text-white uppercase">Clear</button>
                     </div>
                     <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                         {systemLogs.length === 0 && <p className="text-[9px] text-slate-600 text-center py-4">No events logged</p>}
                         {systemLogs.map(log => (
                             <div key={log.id} className="flex gap-2 p-2 hover:bg-white/5 rounded transition-colors">
                                 <span className="text-[9px] font-mono text-slate-500">{log.time}</span>
                                 <div className="flex-1">
                                     <span className={`text-[8px] font-bold px-1 rounded mr-2 ${
                                         log.type === 'ALERT' ? 'bg-red-500 text-white' :
                                         log.type === 'CONNECT' ? 'bg-emerald-500 text-white' :
                                         log.type === 'GPS' ? 'bg-blue-500 text-white' :
                                         'bg-slate-700 text-slate-300'
                                     }`}>{log.type}</span>
                                     <span className="text-[10px] text-slate-300">{log.msg}</span>
                                 </div>
                             </div>
                         ))}
                     </div>
                </div>
            )}

            {/* BOTTOM FLOATING CONTROL BAR (Only when Node Selected) */}
            {selectedOfficer && (
                <div className="absolute bottom-6 left-6 right-6 md:left-auto md:right-6 md:w-[600px] z-[1000] animate-in slide-in-from-bottom-10 fade-in duration-300">
                    <div className="bg-[#1e293b]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-1 shadow-2xl flex items-stretch">
                        
                        {/* Selected Node Info */}
                        <div className="p-4 flex items-center gap-4 border-r border-white/10 min-w-[200px]">
                            <div className="relative">
                                <img src={selectedOfficer.avatar || "https://via.placeholder.com/40"} className="w-12 h-12 rounded-lg object-cover border border-white/10" />
                                <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-[#1e293b] ${selectedOfficer.status === 'Offline' ? 'bg-slate-500' : 'bg-emerald-500'}`}></div>
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-tight">{selectedOfficer.name}</h3>
                                <p className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">NODE: {selectedOfficer.id}</p>
                            </div>
                        </div>

                        {/* Telemetry Bits */}
                        <div className="flex-1 flex flex-col justify-center px-6 gap-1">
                             <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                                <span>Signal</span>
                                <span className="text-emerald-400">{selectedOfficer.signalStrength}dB</span>
                            </div>
                             <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                                <span>Battery</span>
                                <span className={selectedOfficer.battery < 20 ? 'text-red-500' : 'text-cyan-400'}>{selectedOfficer.battery}%</span>
                            </div>
                            <div className="flex justify-between text-[9px] font-mono text-slate-400 uppercase">
                                <span>Coordinates</span>
                                <span className="text-slate-200">{Number(selectedOfficer.lat).toFixed(4)}, {Number(selectedOfficer.lng).toFixed(4)}</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 p-2">
                             <button onClick={() => addLog('ALERT', `Ping sent to ${selectedOfficer.id}`)} className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 px-4 py-2 rounded-lg flex items-center gap-2 transition-all">
                                <span className="text-[9px] font-black uppercase tracking-widest hidden sm:block">Ping</span>
                             </button>
                             <button onClick={() => onDeleteBDO(selectedOfficer.id)} className="bg-slate-700/50 hover:bg-red-600 text-white w-10 h-full rounded-lg flex items-center justify-center transition-all">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                             </button>
                             <button onClick={() => setSelectedId(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 w-8 h-full rounded-lg flex items-center justify-center transition-all ml-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                             </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* PROVISIONING MODAL */}
      {showProvisionModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1e293b] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6">
                <h3 className="text-lg font-black text-white uppercase tracking-wider mb-6 flex items-center gap-2">
                    <span className="w-2 h-6 bg-cyan-500 rounded-sm"></span>
                    Provision New Node
                </h3>
                
                <div className="space-y-4">
                    <div className="flex gap-4 items-center mb-4">
                        <div className="w-20 h-20 bg-[#0f172a] rounded-xl border border-white/10 flex items-center justify-center overflow-hidden relative group">
                             {isUploading ? <div className="animate-spin w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full"></div> : 
                              newBdoAvatar ? <img src={newBdoAvatar} className="w-full h-full object-cover" /> :
                              <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                             }
                        </div>
                        <label className="flex-1 cursor-pointer bg-[#0f172a] hover:bg-[#0f172a]/80 border border-white/10 p-3 rounded-xl text-center transition-all">
                             <span className="text-[10px] font-black uppercase text-cyan-400 tracking-widest block">Upload Identity</span>
                             <span className="text-[8px] text-slate-500 block mt-1">Supports JPG/PNG via R2</span>
                             <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                    </div>

                    <input value={newBdoCode} onChange={e => setNewBdoCode(e.target.value)} placeholder="NODE ID (e.g. N-99)" className="w-full bg-[#0f172a] border border-white/10 p-3 rounded-xl text-sm font-mono text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none uppercase" />
                    <input value={newBdoPass} onChange={e => setNewBdoPass(e.target.value)} placeholder="ACCESS KEY" type="password" className="w-full bg-[#0f172a] border border-white/10 p-3 rounded-xl text-sm font-mono text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none" />
                    <input value={newBdoName} onChange={e => setNewBdoName(e.target.value)} placeholder="OPERATOR NAME" className="w-full bg-[#0f172a] border border-white/10 p-3 rounded-xl text-sm font-bold text-white placeholder:text-slate-600 focus:border-cyan-500/50 outline-none uppercase" />
                    
                    <div className="grid grid-cols-2 gap-3 pt-4">
                        <button onClick={() => setShowProvisionModal(false)} className="py-3 rounded-xl border border-white/10 text-slate-400 text-xs font-black uppercase tracking-widest hover:bg-white/5">Cancel</button>
                        <button onClick={handleRegister} disabled={isUploading} className="py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-cyan-900/20">Initialize</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* TASK DEPLOYMENT MODAL */}
      {showTaskModal && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#1e293b] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6">
                <h3 className="text-lg font-black text-white uppercase tracking-wider mb-6 flex items-center gap-2">
                    <span className="w-2 h-6 bg-emerald-500 rounded-sm"></span>
                    Deploy Directive
                </h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Target Node</label>
                        <div className="relative">
                            <select 
                                value={taskTarget} 
                                onChange={(e) => setTaskTarget(e.target.value)}
                                className="w-full bg-[#0f172a] border border-white/10 p-3 rounded-xl text-sm font-mono text-white outline-none appearance-none focus:border-emerald-500/50"
                            >
                                <option value="">Select Field Agent...</option>
                                {officers.map(off => (
                                    <option key={off.id} value={off.id}>{off.name} ({off.id}) - {off.status}</option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>
                    </div>

                    <div>
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Mission Objective</label>
                         <textarea 
                            value={taskTitle}
                            onChange={(e) => setTaskTitle(e.target.value)}
                            placeholder="Enter detailed instructions for the field agent..."
                            className="w-full h-32 bg-[#0f172a] border border-white/10 p-3 rounded-xl text-sm font-medium text-white placeholder:text-slate-600 focus:border-emerald-500/50 outline-none resize-none"
                         />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 pt-4">
                        <button onClick={() => setShowTaskModal(false)} className="py-3 rounded-xl border border-white/10 text-slate-400 text-xs font-black uppercase tracking-widest hover:bg-white/5">Abort</button>
                        <button onClick={handleDeployTask} className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-900/20">Transmit</button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default AdminDashboard;