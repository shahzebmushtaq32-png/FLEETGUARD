
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
  const [notification, setNotification] = useState<{title: string, msg: string} | null>(null);
  
  // Shift Timer State (8 Hours in seconds)
  const [shiftTimeRemaining, setShiftTimeRemaining] = useState(8 * 60 * 60);

  // PROTOCOL DELTA: Security State
  const [isSecurityLocked, setIsSecurityLocked] = useState(false);
  const securityTimerRef = useRef<any>(null);
  const [securityCountdown, setSecurityCountdown] = useState(120); 

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Sync state with prop if it changes
  useEffect(() => {
    if (officer) {
        setCurrentStatus(officer.status);
        if (officer.avatar) setCapturedPhoto(officer.avatar);
    }
  }, [officer]);

  // --- SHIFT TIMER ---
  useEffect(() => {
    const timer = setInterval(() => {
        setShiftTimeRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // --- PROTOCOL DELTA: ONE-TIME SECURITY TIMER ---
  useEffect(() => {
    const hasPassedProtocol = sessionStorage.getItem('bdo_protocol_delta_passed');
    
    if (!hasPassedProtocol) {
        securityTimerRef.current = setInterval(() => {
            setSecurityCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(securityTimerRef.current);
                    setIsSecurityLocked(true);
                    startCamera(); 
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }

    return () => {
        if (securityTimerRef.current) clearInterval(securityTimerRef.current);
    };
  }, []);

  // --- REALTIME TELEMETRY (GPS + BATTERY) ---
  useEffect(() => {
    if (!officer) return;

    let watchId: number;
    let batteryLevel = officer.battery || 100;

    const initBattery = async () => {
        const nav = navigator as NavigatorWithBattery;
        if (nav.getBattery) {
            try {
                const battery = await nav.getBattery();
                batteryLevel = Math.round(battery.level * 100);
                battery.addEventListener('levelchange', () => {
                    batteryLevel = Math.round(battery.level * 100);
                });
            } catch (e) {
                console.warn("Battery API not supported");
            }
        }
    };
    initBattery();

    const success = (pos: GeolocationPosition) => {
        if (pos.coords.accuracy > 100) return; // Ignore poor signal
        
        const payload = {
            id: officer.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            battery: batteryLevel, 
            status: currentStatus,
            lastUpdate: new Date(),
            accuracy: pos.coords.accuracy,
            telemetrySource: 'WEB' as const
        };
        socketService.sendTelemetry(payload);
    };

    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(success, (e) => console.error(e), {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 5000 
        });
    }

    return () => {
        if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [officer?.id, currentStatus]);

  useEffect(() => {
    if ((activeTab === 'selfie' && !isVerified) || isSecurityLocked) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab, isVerified, isSecurityLocked]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 720 } }, 
        audio: false 
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Camera error", err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const updateDuty = (status: any) => {
    setCurrentStatus(status);
    if (!officer) return;
    socketService.sendTelemetry({ ...officer, status, telemetrySource: 'WEB' as const });
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
          setCapturedPhoto(imageData);
          setIsVerified(true);
          const filename = isSecurityCheck ? `protocol_delta_${officer.id}_${Date.now()}.jpg` : `auth_${officer.id}_${Date.now()}.jpg`;
          const url = await r2Service.uploadEvidence(imageData, filename);
          socketService.sendTelemetry({ ...officer, avatar: url, telemetrySource: 'WEB' as const });
          
          if (isSecurityCheck) {
              setNotification({ title: 'Protocol Delta', msg: `Security Check Passed` });
              sessionStorage.setItem('bdo_protocol_delta_passed', 'true');
              setIsSecurityLocked(false);
          } else {
              setNotification({ title: 'Photo Captured', msg: `Identity Documented` });
          }
      } catch (e) {
          console.error("Verification error", e);
      } finally {
          setIsCapturing(false);
          if (!isSecurityCheck) stopCamera(); 
      }
    }
  };

  const handlePanic = () => {
      if (confirm("REPORT EMERGENCY? This will alert HQ immediately.")) {
          onReportIncident({
              title: "OFFICER DISTRESS SIGNAL",
              desc: "Immediate assistance required at current coordinates.",
              severity: 'critical',
              time: new Date()
          });
          setNotification({ title: 'ALERT SENT', msg: 'HQ has been notified.' });
      }
  };

  if (!officer) return null;

  return (
    <div className="h-full flex flex-col bg-slate-50 font-sans relative overflow-hidden">
       
       {isSecurityLocked && (
           <div className="absolute inset-0 z-[100] bg-[#001D3D] flex flex-col items-center justify-center p-6 animate-in slide-in-from-bottom-full duration-500">
               <div className="w-full max-w-sm bg-white rounded-[2rem] p-6 shadow-2xl relative overflow-hidden border-4 border-[#FFD100]">
                    <div className="absolute top-0 left-0 right-0 h-2 bg-red-600"></div>
                    <h2 className="text-xl font-black text-[#003366] uppercase tracking-tight text-center mb-6">Protocol Delta</h2>
                    <div className="relative rounded-2xl overflow-hidden aspect-[3/4] bg-black mb-6 border-2 border-slate-200">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                        <canvas ref={canvasRef} className="hidden" />
                    </div>
                    <button 
                        onClick={() => handleCapture(true)}
                        disabled={isCapturing}
                        className="w-full bg-[#FFD100] text-[#003366] font-black py-4 rounded-xl uppercase text-xs tracking-widest shadow-lg active:scale-95 transition-all"
                    >
                        {isCapturing ? 'Verifying...' : 'Verify Identity'}
                    </button>
               </div>
           </div>
       )}

       {/* HEADER */}
       <div className="bg-[#003366] text-white px-6 pt-10 pb-6 rounded-b-[2rem] shadow-xl relative z-10">
          <div className="flex justify-between items-start mb-6">
             <div className="flex gap-4 items-center">
                <div className="w-14 h-14 bg-white rounded-2xl overflow-hidden border-2 border-white/20 shadow-lg relative">
                    <img src={capturedPhoto || 'https://via.placeholder.com/60'} className="w-full h-full object-cover" />
                </div>
                <div>
                    <h2 className="text-lg font-black uppercase tracking-tight leading-none mb-1">{officer.name}</h2>
                    <div className="flex items-center">
                         <span className="text-[9px] bg-[#FFD100] text-[#003366] px-1.5 py-0.5 rounded font-black uppercase tracking-wider">{officer.role}</span>
                         {/* TRIAL TAG */}
                         <span className="ml-2 text-[8px] text-amber-300 font-mono border border-amber-500/30 px-1 rounded uppercase">Trial</span>
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[9px] font-mono text-cyan-300">
                       <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                       <span>Shift Remaining: {formatTime(shiftTimeRemaining)}</span>
                    </div>
                </div>
             </div>
             
             {/* Report / Panic Button */}
             <button onClick={handlePanic} className="bg-red-500 p-2 rounded-xl shadow-lg hover:bg-red-600 animate-pulse">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
             </button>
          </div>

          <div className="flex bg-[#002855] p-1.5 rounded-xl border border-white/5">
                <button onClick={() => updateDuty('Active')} className={`flex-1 py-2.5 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center gap-2 ${currentStatus === 'Active' ? 'bg-[#FFD100] text-[#003366] shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${currentStatus === 'Active' ? 'bg-[#003366]' : 'bg-slate-500'}`}></div>
                    Active
                </button>
                <button onClick={() => updateDuty('Break')} className={`flex-1 py-2.5 rounded-lg text-[9px] font-black uppercase transition-all flex items-center justify-center gap-2 ${currentStatus === 'Break' ? 'bg-white text-[#003366] shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${currentStatus === 'Break' ? 'bg-[#003366]' : 'bg-slate-500'}`}></div>
                    Break
                </button>
          </div>
       </div>

       {notification && (
           <div className="mx-6 -mt-4 bg-[#FFD100] text-[#003366] p-4 rounded-xl shadow-lg relative z-20 animate-in slide-in-from-top-4 flex items-center gap-3">
               <div className="w-2 h-2 bg-[#003366] rounded-full animate-ping"></div>
               <div>
                   <p className="text-[9px] font-black uppercase tracking-widest opacity-80">{notification.title}</p>
                   <p className="text-xs font-bold leading-tight">{notification.msg}</p>
               </div>
           </div>
       )}

       <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50">
           {activeTab === 'home' && (
               <div className="space-y-6">
                   <div className="grid grid-cols-2 gap-4">
                       <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
                           <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-2">Visits</p>
                           <p className="text-4xl font-black text-[#003366] tracking-tighter">{officer.visitCount}</p>
                       </div>
                       <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-100">
                           <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-2">Quota</p>
                           <div className="relative w-16 h-16 mx-auto mt-1">
                               <svg className="w-full h-full transform -rotate-90">
                                   <circle cx="32" cy="32" r="28" stroke="#f1f5f9" strokeWidth="6" fill="transparent" />
                                   <circle cx="32" cy="32" r="28" stroke="#003366" strokeWidth="6" fill="transparent" strokeDasharray={`${(officer.quotaProgress / 100) * 175} 175`} strokeLinecap="round" />
                               </svg>
                               <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-[#003366]">{officer.quotaProgress}%</span>
                           </div>
                       </div>
                   </div>
               </div>
           )}

           {activeTab === 'leads' && (
               <div className="space-y-4">
                   <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2">Assigned Leads</h3>
                   {officer.leads.map(lead => (
                       <div key={lead.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-3">
                           <h4 className="text-sm font-black text-[#003366] uppercase">{lead.clientName}</h4>
                           <span className="px-2 py-1 rounded-lg text-[8px] font-black uppercase bg-slate-100 text-slate-600">{lead.stage}</span>
                       </div>
                   ))}
               </div>
           )}

           {activeTab === 'jobs' && (
               <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 px-2">Deployment Tasks</h3>
                    {officer.tasks && officer.tasks.length > 0 ? (
                        officer.tasks.map(task => (
                            <div key={task.id} className="bg-white p-5 rounded-2xl border-l-4 border-[#FFD100] shadow-sm">
                                <h4 className="text-xs font-black text-[#003366] uppercase mb-1">{task.title}</h4>
                                <p className="text-[10px] text-slate-500 mb-3">{task.description}</p>
                                <span className="text-[9px] font-black text-amber-500 uppercase bg-amber-50 px-2 py-1 rounded">{task.status}</span>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                             <p className="text-[10px] font-black uppercase tracking-widest">No active tasks</p>
                        </div>
                    )}
               </div>
           )}

           {activeTab === 'selfie' && (
               <div className="h-full flex flex-col">
                   <div className="flex-1 bg-black rounded-[2.5rem] overflow-hidden relative border-8 border-white shadow-2xl mb-6">
                       {!isVerified ? (
                           <>
                             <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                             <canvas ref={canvasRef} className="hidden" />
                             <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                                 <button onClick={() => handleCapture(false)} className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/20 active:scale-90 transition-all backdrop-blur-sm">
                                     <div className="w-16 h-16 bg-white rounded-full shadow-lg"></div>
                                 </button>
                             </div>
                           </>
                       ) : (
                           <div className="w-full h-full relative">
                               <img src={capturedPhoto!} className="w-full h-full object-cover" />
                               <div className="absolute inset-0 bg-[#003366]/40 flex flex-col items-center justify-center backdrop-blur-sm">
                                   <p className="text-white font-black uppercase tracking-[0.3em] text-xl shadow-black drop-shadow-md">Captured</p>
                                   <button onClick={() => setIsVerified(false)} className="mt-8 bg-white/20 px-8 py-3 rounded-full text-[10px] font-black text-white uppercase hover:bg-white/30 transition-all border border-white/30">Retake Photo</button>
                               </div>
                           </div>
                       )}
                   </div>
               </div>
           )}
       </div>

       <div className="bg-white px-4 pb-8 pt-4 border-t border-slate-100 flex justify-between rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] relative z-20">
           <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon="home" label="HQ" />
           <NavButton active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} icon="users" label="Leads" />
           <NavButton active={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')} icon="briefcase" label="Jobs" />
           <NavButton active={activeTab === 'selfie'} onClick={() => setActiveTab('selfie')} icon="camera" label="Capture" />
       </div>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-1.5 p-2 w-16 transition-all group`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${active ? 'bg-[#003366] text-[#FFD100] shadow-lg shadow-blue-900/20 translate-y-[-4px]' : 'text-slate-300 group-hover:bg-slate-50'}`}>
             {icon === 'home' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
             {icon === 'users' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
             {icon === 'briefcase' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
             {icon === 'camera' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        </div>
        <span className={`text-[8px] font-black uppercase tracking-widest transition-colors ${active ? 'text-[#003366]' : 'text-slate-300'}`}>{label}</span>
    </button>
);
