
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, SalesOfficer, Incident, Message } from '../types';
import { socketService } from '../services/socketService';
import { r2Service } from '../services/r2Service';
import { verifyBdoIdentity } from '../services/geminiService';
import { persistenceService } from '../services/persistenceService';
import GeminiLiveVoice from './GeminiLiveVoice';

interface BDOViewProps {
  user: User;
  officer: SalesOfficer;
  messages: Message[];
  onLogout: () => void;
  onSendMessage: (txt: string) => void;
  onReportIncident: (inc: Omit<Incident, 'id'>) => void;
  wsStatus?: string;
  isOnline?: boolean;
  systemMode: 'DEV' | 'PROD';
}

export const BDOView: React.FC<BDOViewProps> = ({ officer, onLogout, wsStatus, isOnline = true, systemMode }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'leads' | 'jobs' | 'selfie'>('home');
  const [currentStatus, setCurrentStatus] = useState<SalesOfficer['status']>(officer?.status || 'Active');
  
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(officer?.avatar || null);
  const [realBattery, setRealBattery] = useState<number>(officer?.battery || 100);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isWakeLocked, setIsWakeLocked] = useState(false);
  
  const [securityError, setSecurityError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const gpsRetryCount = useRef(0);

  const [permStatus, setPermStatus] = useState({
    cam: 'pending',
    geo: 'pending'
  });

  // Shift Enforcement Logic (11 AM - 6 PM)
  const [isOutOfShift, setIsOutOfShift] = useState(false);
  
  useEffect(() => {
    const checkShift = () => {
      const hour = new Date().getHours();
      const outside = hour < 11 || hour >= 18;
      setIsOutOfShift(systemMode === 'PROD' && outside);
    };
    checkShift();
    const interval = setInterval(checkShift, 60000);
    return () => clearInterval(interval);
  }, [systemMode]);

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        setIsWakeLocked(true);
      } catch (err) {
        // Silent fail for environment restrictions
        setIsWakeLocked(false);
      }
    }
  };

  const stopCamera = useCallback(() => {
    console.log("[Optics] Releasing hardware resources...");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.load(); 
    }
    setPermStatus(p => ({ ...p, cam: 'pending' }));
  }, []);

  const reportGpsBreach = useCallback((errorType: string) => {
    if (!officer) return;
    const breach: Incident = {
      id: `GPS_${officer.id}_${Date.now()}`,
      title: "GPS UPLINK BREACH",
      desc: `Agent ${officer.name} (${officer.id}) location services are ${errorType}. Forced standby applied.`,
      time: new Date(),
      severity: 'critical'
    };
    socketService.sendIncident(breach);
  }, [officer]);

  const broadcastTelemetry = useCallback((customPayload?: Partial<SalesOfficer>) => {
    if (!officer) return;
    const activeAvatar = customPayload?.avatar || capturedPhoto || officer.avatar;
    const telemetry: Partial<SalesOfficer> = {
      id: officer.id,
      lat: customPayload?.lat || officer.lat,
      lng: customPayload?.lng || officer.lng,
      battery: realBattery,
      status: currentStatus,
      avatar: activeAvatar,
      lastUpdate: new Date(),
      telemetrySource: 'ANDROID_BG',
      ...customPayload
    };
    socketService.sendTelemetry(telemetry);
  }, [officer, realBattery, currentStatus, capturedPhoto]);

  // GPS Mandatory Check
  useEffect(() => {
    if (permStatus.geo === 'fail' && currentStatus !== 'Offline') {
      setCurrentStatus('Offline');
      broadcastTelemetry({ status: 'Offline' });
    }
  }, [permStatus.geo, currentStatus, broadcastTelemetry]);

  // CAMERA LIFECYCLE - Strict Isolation
  const startCamera = async () => {
    try {
      if (streamRef.current) return;
      console.log("[Optics] Starting Biometric Lens...");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Re-trigger play to handle browser pauses
        videoRef.current.play().catch(() => {});
      }
      setPermStatus(p => ({ ...p, cam: 'ok' }));
      setSecurityError(null);
    } catch (err) {
      console.error("[Optics] Hardware Error:", err);
      setPermStatus(p => ({ ...p, cam: 'fail' }));
      setSecurityError("Camera access failed. Check browser permissions.");
    }
  };

  useEffect(() => {
    if (activeTab === 'selfie') {
      startCamera();
    } else {
      stopCamera();
    }
    // Cleanup on tab switch only
  }, [activeTab, stopCamera]);

  const initGps = useCallback(() => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    
    console.log("[GPS] Handshaking... Attempt:", gpsRetryCount.current);
    
    if ("geolocation" in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          gpsRetryCount.current = 0; 
          setPermStatus(p => ({ ...p, geo: 'ok' }));
          broadcastTelemetry({ lat: latitude, lng: longitude });
        },
        (err) => {
          console.error("[GPS] Fail code:", err.code);
          
          // Silently retry twice for timeouts (Code 3)
          if (err.code === 3 && gpsRetryCount.current < 2) {
             gpsRetryCount.current++;
             setTimeout(initGps, 3000);
             return;
          }

          setPermStatus(p => ({ ...p, geo: 'fail' }));
          if (err.code === 1) {
            setSecurityError("Location access denied by browser.");
          }
        },
        { 
          enableHighAccuracy: true, 
          timeout: 10000, 
          maximumAge: 5000 
        }
      );
    } else {
      setPermStatus(p => ({ ...p, geo: 'fail' }));
    }
  }, [broadcastTelemetry]);

  // GLOBAL HARDWARE INIT
  useEffect(() => {
    // Delay GPS to allow browser/frame stabilization
    const timer = setTimeout(initGps, 1500);
    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBatt = () => setRealBattery(Math.round(battery.level * 100));
        updateBatt();
        battery.addEventListener('levelchange', updateBatt);
      });
    }

    return () => {
        clearTimeout(timer);
        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        document.removeEventListener('visibilitychange', handleVisibility);
        // Note: stopCamera() removed from global cleanup to fix the camera termination bug
    };
  }, [initGps]);

  useEffect(() => {
    broadcastTelemetry();
  }, [currentStatus, realBattery, broadcastTelemetry]);

  const handleSelfieCapture = async () => {
    if (!videoRef.current || !canvasRef.current || !officer) return;
    setIsCapturing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    if (context && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      try {
          const aiResult = await verifyBdoIdentity(imageData);
          if (aiResult.verified) {
              const url = await r2Service.uploadEvidence(imageData, `audit_${officer.id}_${Date.now()}.jpg`);
              setCapturedPhoto(url);
              await persistenceService.updateOfficerAvatarAPI(officer.id, url);
              broadcastTelemetry({ avatar: url });
              
              stopCamera();
              setTimeout(() => setActiveTab('home'), 1000);
          } else {
              setSecurityError(aiResult.welcomeMessage || "Verification failed.");
          }
      } catch (e) {
          setSecurityError("Verification Uplink Error.");
      } finally {
          setIsCapturing(false);
      }
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] font-sans relative overflow-hidden">
       <canvas ref={canvasRef} className="hidden" />
       
       {isOutOfShift && (
         <div className="fixed inset-0 z-[200] bg-[#001D3D] flex flex-col items-center justify-center p-12 text-center">
            <h2 className="text-xl font-black text-white uppercase tracking-widest mb-2 text-[#FFD100]">Shift Standby</h2>
            <p className="text-[9px] text-white/50 font-bold uppercase tracking-[0.2em] mb-10 leading-relaxed">Uplink Restricted (11:00 AM - 06:00 PM)</p>
            <button onClick={onLogout} className="text-[10px] font-black text-white/30 uppercase tracking-widest hover:text-white border-b border-white/10 pb-1">Terminate Session</button>
         </div>
       )}

       <div className="bg-[#001D3D] px-6 py-2 flex items-center justify-between border-b border-white/5">
           <div className="flex items-center gap-3">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
               <span className="text-[7px] font-black text-white/40 uppercase tracking-[0.2em]">CORE_LINK_STABLE</span>
           </div>
           <div className="flex items-center gap-3">
               <div className={`flex items-center gap-1 text-[7px] font-black uppercase px-2 py-0.5 rounded-full ${isWakeLocked ? 'bg-cyan-500/10 text-cyan-400' : 'bg-red-500/10 text-red-400'}`}>
                   {isWakeLocked ? 'WAKELOCK:ON' : 'WAKELOCK:OFF'}
               </div>
               <div className={`flex items-center gap-1 text-[7px] font-black px-2 py-0.5 rounded-full ${permStatus.cam === 'ok' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-white/5'}`}>
                   CAM:{permStatus.cam === 'ok' ? 'ACTIVE' : 'STANDBY'}
               </div>
           </div>
       </div>

       <div className="bg-[#001D3D] px-6 py-1.5 flex items-center justify-between">
           <div className="flex items-center gap-3">
               <span className="text-[8px] font-black text-white/50 uppercase tracking-[0.2em]">NODE: {officer.id}</span>
               {permStatus.geo === 'fail' && (
                   <button onClick={() => { gpsRetryCount.current = 0; initGps(); }} className="flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded animate-pulse group">
                        <svg className="w-3 h-3 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"></path></svg>
                        <span className="text-[8px] font-black text-red-500 uppercase">GPS_FAIL (RETRY)</span>
                   </button>
               )}
               {permStatus.geo === 'pending' && (
                   <span className="text-[8px] font-black text-cyan-500/50 uppercase animate-pulse">GPS_SYNC...</span>
               )}
           </div>
           <span className="text-[8px] font-black text-white/50 uppercase tracking-widest">UPLINK: {wsStatus}</span>
       </div>

       <header className="bg-[#003366] text-white px-6 pt-10 pb-12 rounded-b-[4.5rem] shadow-2xl relative z-10">
          <div className="flex justify-between items-start mb-10">
             <div className="flex gap-5 items-center">
                <div className="w-16 h-16 bg-white rounded-[1.75rem] overflow-hidden border-4 border-white/20">
                    <img key={capturedPhoto} src={capturedPhoto || officer.avatar || 'https://via.placeholder.com/150'} className="w-full h-full object-cover" />
                </div>
                <div>
                    <h2 className="text-xl font-black uppercase tracking-tight mb-1.5">{officer.name}</h2>
                    <span className="text-[9px] bg-[#FFD100] text-[#003366] px-3 py-1 rounded-full font-black uppercase">{officer.role}</span>
                </div>
             </div>
             <button onClick={onLogout} className="bg-white/10 p-4 rounded-2xl active:scale-95 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
             </button>
          </div>
          
          <div className="flex bg-[#002855] p-2 rounded-[2.25rem] border border-white/5 shadow-inner">
                {['Active', 'Break', 'Offline'].map(status => (
                    <button 
                        key={status} 
                        disabled={permStatus.geo === 'fail' && status !== 'Offline'}
                        onClick={() => setCurrentStatus(status as any)} 
                        className={`flex-1 py-4 rounded-[1.75rem] text-[10px] font-black uppercase transition-all ${currentStatus === status ? 'bg-[#FFD100] text-[#003366] shadow-lg scale-105' : 'text-slate-500'} disabled:opacity-20`}
                    >
                        {status}
                    </button>
                ))}
          </div>
       </header>

       <main className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
           {activeTab === 'home' && (
               <div className="grid grid-cols-2 gap-5 animate-in fade-in duration-500">
                   <div className="bg-white p-8 rounded-[3rem] shadow-sm flex flex-col items-center">
                       <p className="text-[9px] text-slate-400 font-black uppercase mb-3">Unit Load</p>
                       <p className="text-5xl font-black text-[#003366]">{officer.visitCount || 0}</p>
                   </div>
                   <div className="bg-white p-8 rounded-[3rem] shadow-sm flex flex-col items-center">
                       <p className="text-[9px] text-slate-400 font-black uppercase mb-3">Power Status</p>
                       <p className={`text-3xl font-black ${realBattery < 20 ? 'text-red-500 animate-pulse' : 'text-[#003366]'}`}>{realBattery}%</p>
                   </div>
                   
                   <div className="col-span-2 bg-white p-6 rounded-[3rem] shadow-sm flex items-center justify-between">
                       <div className="flex flex-col gap-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase">Hardware Health</span>
                          <button onClick={() => initGps()} className="text-[10px] font-black text-[#003366] uppercase underline decoration-[#FFD100]">Re-Sync GPS Hardware</button>
                       </div>
                       <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${permStatus.geo === 'ok' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                          <span className="text-[9px] font-bold text-[#003366]">{permStatus.geo === 'ok' ? 'GPS_CONNECTED' : 'GPS_UNSTABLE'}</span>
                       </div>
                   </div>

                   <div className="col-span-2 bg-white p-8 rounded-[3.5rem] shadow-xl flex items-center justify-between relative overflow-hidden">
                       <div className="relative z-10">
                           <h4 className="text-[10px] font-black text-slate-400 uppercase mb-1">Pipeline Volume</h4>
                           <p className="text-3xl font-black text-[#003366]">₱{((officer.pipelineValue || 0)/1000000).toFixed(1)}M</p>
                       </div>
                       <GeminiLiveVoice />
                   </div>
               </div>
           )}

           {activeTab === 'selfie' && (
               <div className="bg-white rounded-[3.5rem] p-10 shadow-2xl text-center animate-in zoom-in duration-300">
                    <h2 className="text-2xl font-black text-[#003366] uppercase mb-2">Biometric Audit</h2>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-8">Hardware initialization active</p>
                    <div className="relative rounded-[2.5rem] overflow-hidden aspect-square bg-[#001D3D] mb-8 border-4 border-slate-50 shadow-inner">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                        {isCapturing && (
                            <div className="absolute inset-0 bg-[#001D3D]/60 backdrop-blur-sm flex items-center justify-center">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-10 h-10 border-4 border-[#FFD100] border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-[9px] text-white font-black uppercase tracking-widest">Analyzing...</span>
                                </div>
                            </div>
                        )}
                        {permStatus.cam === 'fail' && (
                             <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-8">
                                <svg className="w-12 h-12 mb-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                <span className="text-[10px] uppercase font-black text-center">Optics Blocked.<br/>Check Browser Settings.</span>
                                <button onClick={startCamera} className="mt-6 text-[10px] font-black text-[#FFD100] uppercase underline">Try Re-Initializing</button>
                             </div>
                        )}
                    </div>
                    {securityError && <p className="text-[9px] font-black text-red-500 uppercase mb-4 bg-red-50 py-3 rounded-xl border border-red-100">{securityError}</p>}
                    <button 
                        onClick={handleSelfieCapture} 
                        disabled={isCapturing || permStatus.cam !== 'ok'} 
                        className="w-full bg-[#FFD100] text-[#003366] font-black py-5 rounded-[2rem] uppercase text-[11px] shadow-xl active:scale-95 transition-all disabled:opacity-50"
                    >
                        {isCapturing ? 'Processing...' : 'Perform Audit'}
                    </button>
               </div>
           )}
       </main>

       <nav className="bg-white px-8 pb-12 pt-6 border-t border-slate-100 flex justify-between rounded-t-[4.5rem] shadow-2xl relative z-20">
           <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon="home" label="HUD" />
           <NavButton active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} icon="users" label="Grid" />
           <NavButton active={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')} icon="briefcase" label="Jobs" />
           <NavButton active={activeTab === 'selfie'} onClick={() => setActiveTab('selfie')} icon="camera" label="Audit" />
       </nav>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: any) => (
    <button onClick={onClick} className="flex flex-col items-center gap-2 p-1 w-16 group active:scale-95 transition-transform">
        <div className={`w-12 h-12 rounded-[1.5rem] flex items-center justify-center transition-all duration-300 ${active ? 'bg-[#003366] text-[#FFD100] shadow-2xl scale-110' : 'text-slate-200'}`}>
             {icon === 'home' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
             {icon === 'users' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
             {icon === 'briefcase' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
             {icon === 'camera' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
        </div>
        <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-colors ${active ? 'text-[#003366]' : 'text-slate-300'}`}>{label}</span>
    </button>
);
