
import React, { useState, useEffect, useRef } from 'react';
import { User, SalesOfficer, Incident, Message, DeploymentTask, EvidenceAsset, SalesLead } from '../types';
import { socketService } from '../services/socketService';
import { persistenceService } from '../services/persistenceService';
import { r2Service } from '../services/r2Service';

interface BDOViewProps {
  user: User;
  officer: SalesOfficer;
  messages: Message[];
  onLogout: () => void;
  onSendMessage: (txt: string) => void;
  onReportIncident: (inc: Omit<Incident, 'id'>) => void;
  wsStatus?: string;
  isOnline?: boolean;
}

// Extend Navigator for Battery API
interface BatteryManager {
    level: number;
    charging: boolean;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
}
type NavigatorWithBattery = Navigator & {
    getBattery?: () => Promise<BatteryManager>;
};

export const BDOView: React.FC<BDOViewProps> = ({ officer, onLogout, onReportIncident, wsStatus, isOnline = true }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'leads' | 'jobs' | 'selfie'>('home');
  const [currentStatus, setCurrentStatus] = useState(officer?.status || 'Offline');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(officer?.avatar || null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isVerified, setIsVerified] = useState(!!officer?.avatar);
  const [latency, setLatency] = useState(45); // Simulated latency
  
  // Shift Timer State (8 Hours in seconds)
  const [shiftTimeRemaining, setShiftTimeRemaining] = useState(8 * 60 * 60);

  // PROTOCOL DELTA: Security State
  const [isSecurityLocked, setIsSecurityLocked] = useState(false);
  const securityTimerRef = useRef<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
        setShiftTimeRemaining(prev => Math.max(0, prev - 1));
        setLatency(Math.floor(Math.random() * 30) + 30);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  useEffect(() => {
    const hasPassedProtocol = sessionStorage.getItem('bdo_protocol_delta_passed');
    if (!hasPassedProtocol) {
        setIsSecurityLocked(true);
    }
  }, []);

  useEffect(() => {
    if (!officer) return;
    let watchId: number;
    let batteryLevel = 100;

    const initBattery = async () => {
        const nav = navigator as NavigatorWithBattery;
        if (nav.getBattery) {
            try {
                const battery = await nav.getBattery();
                batteryLevel = Math.round(battery.level * 100);
            } catch (e) {}
        }
    };
    initBattery();

    const success = (pos: GeolocationPosition) => {
        socketService.sendTelemetry({
            id: officer.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            battery: batteryLevel, 
            status: currentStatus,
            lastUpdate: new Date(),
            telemetrySource: 'WEB' as const
        });
    };

    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(success, undefined, {
            enableHighAccuracy: true,
            maximumAge: 10000 
        });
    }
    return () => navigator.geolocation.clearWatch(watchId);
  }, [officer?.id, currentStatus]);

  useEffect(() => {
    if (activeTab === 'selfie' || isSecurityLocked) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [activeTab, isSecurityLocked]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) { console.error(err); }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  };

  const handleCapture = async (isSecurityCheck = false) => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsCapturing(true);
    const context = canvasRef.current.getContext('2d');
    if (context) {
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.6);
      
      try {
          const filename = isSecurityCheck ? `security_${officer.id}.jpg` : `avatar_${officer.id}.jpg`;
          const url = await r2Service.uploadEvidence(imageData, filename);
          setCapturedPhoto(url);
          if (isSecurityCheck) {
              setIsSecurityLocked(false);
              sessionStorage.setItem('bdo_protocol_delta_passed', 'true');
          }
          setIsVerified(true);
      } catch (e) {} finally {
          setIsCapturing(false);
          if (!isSecurityCheck) setActiveTab('home');
      }
    }
  };

  if (!officer) return null;

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] font-sans relative overflow-hidden">
       {/* Live Telemetry Bar */}
       <div className="bg-[#001D3D] px-6 py-2 flex items-center justify-between border-b border-white/5">
           <div className="flex items-center gap-2">
               <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
               <span className={`text-[7px] font-black uppercase tracking-widest ${isOnline ? 'text-emerald-400' : 'text-red-400'}`}>
                 {isOnline ? 'Live Uplink Active' : 'Uplink Failed'}
               </span>
           </div>
           <div className="flex gap-4">
                <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">Lat: {latency}ms</span>
                <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">WS: {wsStatus === 'Broadcasting_Live' ? 'LIVE' : 'SYNC'}</span>
           </div>
       </div>

       {isSecurityLocked && (
           <div className="absolute inset-0 z-[100] bg-[#001D3D] flex flex-col items-center justify-center p-6">
               <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden text-center">
                    <h2 className="text-xl font-black text-[#003366] uppercase tracking-tight mb-2">Protocol Delta</h2>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-6">Security Authorization Required</p>
                    
                    <div className="relative rounded-3xl overflow-hidden aspect-square bg-slate-900 mb-8 border-4 border-slate-50 shadow-inner group">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                        <canvas ref={canvasRef} className="hidden" />
                        
                        {/* Face Guide Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                             <div className="w-48 h-64 border-2 border-dashed border-cyan-400 rounded-[6rem] flex items-center justify-center">
                                 <div className="w-4 h-4 border-t-2 border-l-2 border-cyan-400 absolute top-12"></div>
                                 <div className="w-4 h-4 border-t-2 border-r-2 border-cyan-400 absolute top-12 right-12"></div>
                             </div>
                        </div>
                        <div className="absolute bottom-4 left-0 right-0 text-center">
                            <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest bg-black/40 px-2 py-1 rounded">Align face for scan</span>
                        </div>
                    </div>

                    <button 
                        onClick={() => handleCapture(true)}
                        disabled={isCapturing}
                        className="w-full bg-[#FFD100] text-[#003366] font-black py-5 rounded-2xl uppercase text-[11px] tracking-[0.2em] shadow-lg active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isCapturing ? 'Verifying Identity...' : 'Authorize Access'}
                    </button>
               </div>
           </div>
       )}

       <header className="bg-[#003366] text-white px-6 pt-8 pb-10 rounded-b-[3rem] shadow-2xl relative z-10">
          <div className="flex justify-between items-start mb-6">
             <div className="flex gap-4 items-center">
                <div className="w-16 h-16 bg-white rounded-2xl overflow-hidden border-4 border-white/20 shadow-2xl">
                    <img src={capturedPhoto || 'https://via.placeholder.com/60'} className="w-full h-full object-cover" />
                </div>
                <div>
                    <h2 className="text-xl font-black uppercase tracking-tight leading-none mb-1.5">{officer.name}</h2>
                    <div className="flex items-center gap-2">
                         <span className="text-[9px] bg-[#FFD100] text-[#003366] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{officer.role}</span>
                         <div className="flex items-center gap-1.5 text-[8px] font-mono text-cyan-300 bg-white/5 px-2 py-0.5 rounded-full">
                            <div className="w-1 h-1 bg-cyan-400 rounded-full animate-pulse"></div>
                            {formatTime(shiftTimeRemaining)}
                         </div>
                    </div>
                </div>
             </div>
             <button onClick={onLogout} className="bg-white/10 p-3 rounded-2xl hover:bg-white/20 transition-all text-white/60">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
             </button>
          </div>

          <div className="flex bg-[#002855] p-1.5 rounded-2xl border border-white/5 shadow-inner">
                {['Active', 'Break'].map(status => (
                    <button 
                        key={status}
                        onClick={() => setCurrentStatus(status as any)} 
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${currentStatus === status ? 'bg-[#FFD100] text-[#003366] shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <div className={`w-1.5 h-1.5 rounded-full ${currentStatus === status ? 'bg-[#003366]' : 'bg-slate-700'}`}></div>
                        {status}
                    </button>
                ))}
          </div>
       </header>

       <main className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
           {activeTab === 'home' && (
               <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-500">
                   <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
                       <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-3">Today's Visits</p>
                       <p className="text-5xl font-black text-[#003366] tracking-tighter">{officer.visitCount}</p>
                   </div>
                   <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col items-center">
                       <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-3">Quota Reach</p>
                       <div className="relative w-20 h-20">
                           <svg className="w-full h-full transform -rotate-90">
                               <circle cx="40" cy="40" r="34" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
                               <circle cx="40" cy="40" r="34" stroke="#003366" strokeWidth="8" fill="transparent" strokeDasharray={`${(officer.quotaProgress / 100) * 213} 213`} strokeLinecap="round" />
                           </svg>
                           <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-[#003366]">{officer.quotaProgress}%</span>
                       </div>
                   </div>
                   <div className="col-span-2 bg-[#FFD100] p-6 rounded-[2.5rem] shadow-lg shadow-orange-200/50 flex items-center justify-between">
                       <div>
                           <h4 className="text-[10px] font-black text-[#003366] uppercase tracking-widest mb-1">Pipeline Volume</h4>
                           <p className="text-2xl font-black text-[#003366]">₱{(officer.pipelineValue/1000000).toFixed(1)}M</p>
                       </div>
                       <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center text-[#003366]">
                           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       </div>
                   </div>
               </div>
           )}

           {activeTab === 'leads' && (
               <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
                   {officer.leads.map(lead => (
                       <div key={lead.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between group">
                           <div>
                               <h4 className="text-sm font-black text-[#003366] uppercase tracking-tight mb-1">{lead.clientName}</h4>
                               <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{lead.stage}</span>
                                    <span className="text-[8px] font-black text-cyan-600 uppercase tracking-widest">₱{(lead.value/1000).toFixed(0)}K</span>
                               </div>
                           </div>
                           <button className="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 hover:bg-[#FFD100] hover:text-[#003366] flex items-center justify-center transition-all">
                               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                           </button>
                       </div>
                   ))}
               </div>
           )}

           {activeTab === 'selfie' && (
                <div className="h-full flex flex-col animate-in zoom-in-95 duration-300 pb-20">
                    <div className="flex-1 bg-black rounded-[3rem] overflow-hidden relative border-8 border-white shadow-2xl">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="absolute inset-0 border-2 border-white/10 pointer-events-none"></div>
                        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                            <button 
                                onClick={() => handleCapture(false)}
                                disabled={isCapturing}
                                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:scale-90 transition-all backdrop-blur-md"
                            >
                                <div className="w-16 h-16 bg-white rounded-full shadow-2xl flex items-center justify-center">
                                    {isCapturing && <div className="w-8 h-8 border-4 border-[#003366] border-t-transparent rounded-full animate-spin"></div>}
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
           )}
       </main>

       <nav className="bg-white px-6 pb-10 pt-4 border-t border-slate-100 flex justify-between rounded-t-[3rem] shadow-[0_-15px_40px_rgba(0,0,0,0.08)] relative z-20">
           <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon="home" label="HUD" />
           <NavButton active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} icon="users" label="Leads" />
           <NavButton active={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')} icon="briefcase" label="Tasks" />
           <NavButton active={activeTab === 'selfie'} onClick={() => setActiveTab('selfie')} icon="camera" label="Audit" />
       </nav>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-2 p-2 w-16 transition-all group`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 ${active ? 'bg-[#003366] text-[#FFD100] shadow-xl translate-y-[-8px]' : 'text-slate-300 hover:text-slate-400'}`}>
             {icon === 'home' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
             {icon === 'users' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
             {icon === 'briefcase' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
             {icon === 'camera' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        </div>
        <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-colors ${active ? 'text-[#003366]' : 'text-slate-300'}`}>{label}</span>
    </button>
);
