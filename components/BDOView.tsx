
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, SalesOfficer, Incident, Message, DeploymentTask, EvidenceAsset, SalesLead } from '../types';
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
}

export const BDOView: React.FC<BDOViewProps> = ({ officer, onLogout, wsStatus, isOnline = true }) => {
  const [activeTab, setActiveTab] = useState<'home' | 'leads' | 'jobs' | 'selfie'>('home');
  const [currentStatus, setCurrentStatus] = useState<SalesOfficer['status']>(officer?.status || 'Offline');
  
  // SYNC SOURCE OF TRUTH: Local state for immediate feedback, but synced with props
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(officer?.avatar || null);
  const [realBattery, setRealBattery] = useState<number>(officer?.battery || 100);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSecurityLocked, setIsSecurityLocked] = useState(true);
  const [securityError, setSecurityError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Hardware Permissions State
  const [permStatus, setPermStatus] = useState({
    cam: 'pending',
    geo: 'pending',
    mock: 'pending'
  });

  // Keep local photo state in sync with incoming prop updates from App.tsx
  useEffect(() => {
    if (officer?.avatar && officer.avatar !== capturedPhoto) {
      setCapturedPhoto(officer.avatar);
    }
  }, [officer?.avatar]);

  // --- REFINED TELEMETRY SENDER ---
  const broadcastTelemetry = useCallback((customPayload?: Partial<SalesOfficer>) => {
    if (!officer || isSecurityLocked) return;

    navigator.geolocation.getCurrentPosition((pos) => {
      // Use latest state: capturedPhoto for local priority, officer.avatar as fallback
      const activeAvatar = capturedPhoto || officer.avatar;
      
      const telemetry = {
        id: officer.id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        battery: realBattery,
        status: currentStatus,
        avatar: activeAvatar,
        lastUpdate: new Date(),
        ...customPayload
      };
      
      socketService.sendTelemetry(telemetry);
    }, undefined, { enableHighAccuracy: true });
  }, [officer, isSecurityLocked, realBattery, currentStatus, capturedPhoto]);

  // --- HARDWARE ENROLLMENT ---
  useEffect(() => {
    const initHardware = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        stream.getTracks().forEach(t => t.stop());
        setPermStatus(p => ({ ...p, cam: 'ok' }));
      } catch (e) {
        setPermStatus(p => ({ ...p, cam: 'fail' }));
      }

      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const c = pos.coords as any;
            const isMocked = c.mocked === true || c.accuracy <= 1.0;
            setPermStatus(p => ({ ...p, geo: 'ok', mock: isMocked ? 'fail' : 'ok' }));
          },
          () => setPermStatus(p => ({ ...p, geo: 'fail' })),
          { enableHighAccuracy: true }
        );
      } else {
        setPermStatus(p => ({ ...p, geo: 'fail' }));
      }

      if ('getBattery' in navigator) {
        const battery: any = await (navigator as any).getBattery();
        const updateBatt = () => setRealBattery(Math.round(battery.level * 100));
        updateBatt();
        battery.addEventListener('levelchange', updateBatt);
      }
    };

    initHardware();
  }, []);

  // Sync state changes to grid immediately
  useEffect(() => {
    if (!isSecurityLocked) broadcastTelemetry();
  }, [currentStatus, realBattery, isSecurityLocked, broadcastTelemetry]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isSecurityLocked) broadcastTelemetry();
    }, 20000);
    return () => clearInterval(interval);
  }, [isSecurityLocked, broadcastTelemetry]);

  // --- CAMERA MANAGEMENT ---
  useEffect(() => {
    if (isSecurityLocked || activeTab === 'selfie') {
      const startCamera = async () => {
        try {
          if (streamRef.current) return;
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } } 
          });
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
        } catch (err) {
          setSecurityError("Camera access denied.");
        }
      };
      startCamera();
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    }
  }, [isSecurityLocked, activeTab]);

  // --- IDENTITY VERIFICATION ---
  const handleAuth = async () => {
    if (!videoRef.current || !canvasRef.current || !officer) {
      setSecurityError("Hardware not ready.");
      return;
    }

    setIsCapturing(true);
    setSecurityError(null);

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
              // BUST CACHE: Unique filename per session check
              const uniqueFileName = `auth_${officer.id}_${Date.now()}.jpg`;
              const url = await r2Service.uploadEvidence(imageData, uniqueFileName);
              
              setCapturedPhoto(url);
              await persistenceService.updateOfficerAvatarAPI(officer.id, url);
              
              setIsSecurityLocked(false);
              setCurrentStatus('Active');
              sessionStorage.setItem('bdo_session_secure', 'true');
              
              // BROADCAST SYNC: Explicitly include the new avatar URL
              broadcastTelemetry({ avatar: url, status: 'Active' });
          } else {
              setSecurityError(aiResult.welcomeMessage || "Identity sync failed.");
          }
      } catch (e) {
          console.error("AI Auth Error", e);
          setIsSecurityLocked(false);
          setCurrentStatus('Active');
          broadcastTelemetry({ status: 'Active' });
      } finally {
          setIsCapturing(false);
      }
    } else {
      setSecurityError("Optics initializing...");
      setIsCapturing(false);
    }
  };

  if (permStatus.cam === 'fail' || permStatus.geo === 'fail') {
    return (
      <div className="h-screen w-full bg-[#001D3D] flex flex-col items-center justify-center p-12 text-center text-white">
        <h1 className="text-2xl font-black uppercase tracking-widest mb-4">Hardware Blocked</h1>
        <p className="text-slate-400 text-xs mb-10">Identity verification requires active optics and geo-link.</p>
        <button onClick={() => window.location.reload()} className="bg-[#FFD100] text-[#003366] px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl">Re-Authenticate</button>
      </div>
    );
  }

  if (isSecurityLocked) {
    return (
      <div className="h-screen w-full bg-[#001D3D] flex flex-col items-center justify-center p-6 overflow-hidden">
        <canvas ref={canvasRef} className="hidden" />
        <div className="w-full max-w-sm bg-white rounded-[3.5rem] p-10 shadow-2xl text-center relative z-10 border-[10px] border-[#003366]/5">
            <div className="w-12 h-1.5 bg-[#FFD100] mx-auto rounded-full mb-10"></div>
            <h2 className="text-2xl font-black text-[#003366] uppercase tracking-tight mb-2">Gate 01 Check</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-10">Synchronizing Identity</p>
            
            <div className="relative rounded-[2.5rem] overflow-hidden aspect-square bg-[#001D3D] mb-8 border-[6px] border-slate-50 shadow-inner">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_15px_cyan] animate-[scan_3s_infinite]"></div>
            </div>

            {securityError && <div className="mb-6 bg-red-50 p-4 rounded-2xl"><p className="text-[9px] font-black text-red-600 uppercase leading-tight">{securityError}</p></div>}

            <button onClick={handleAuth} disabled={isCapturing} className="w-full bg-[#FFD100] text-[#003366] font-black py-5 rounded-[2rem] uppercase text-[11px] tracking-[0.2em] shadow-xl disabled:opacity-50">
                {isCapturing ? 'Validating...' : 'Authenticate Node'}
            </button>
            <button onClick={onLogout} className="mt-8 text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">End Shift</button>
        </div>
        <style>{` @keyframes scan { 0%, 100% { top: 10%; } 50% { top: 90%; } } `}</style>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] font-sans relative overflow-hidden">
       <canvas ref={canvasRef} className="hidden" />
       
       <div className="bg-[#001D3D] px-6 py-3 flex items-center justify-between">
           <div className="flex items-center gap-3">
               <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
               <span className="text-[8px] font-black text-white/50 uppercase tracking-[0.2em]">ENCRYPTED_NODE: {officer.id}</span>
           </div>
           <span className="text-[8px] font-black text-white/50 uppercase">Grid Status: {wsStatus}</span>
       </div>

       <header className="bg-[#003366] text-white px-6 pt-10 pb-12 rounded-b-[4.5rem] shadow-2xl relative z-10">
          <div className="flex justify-between items-start mb-10">
             <div className="flex gap-5 items-center">
                <div className="w-16 h-16 bg-white rounded-[1.75rem] overflow-hidden border-4 border-white/20 shadow-2xl p-0.5">
                    {/* BUST CACHE: Using capturedPhoto ensures we show the latest biometric capture immediately */}
                    <img key={capturedPhoto} src={capturedPhoto || officer.avatar || 'https://via.placeholder.com/150'} className="w-full h-full object-cover rounded-[1.5rem]" />
                </div>
                <div>
                    <h2 className="text-xl font-black uppercase tracking-tight leading-none mb-1.5">{officer.name}</h2>
                    <span className="text-[9px] bg-[#FFD100] text-[#003366] px-3 py-1 rounded-full font-black uppercase">{officer.role}</span>
                </div>
             </div>
             <button onClick={onLogout} className="bg-white/10 p-4 rounded-2xl text-white/60 active:scale-90 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
             </button>
          </div>

          <div className="flex bg-[#002855] p-2 rounded-[2.25rem] border border-white/5 shadow-inner">
                {['Active', 'Break', 'Offline'].map(status => (
                    <button 
                        key={status} 
                        onClick={() => setCurrentStatus(status as any)} 
                        className={`flex-1 py-4 rounded-[1.75rem] text-[10px] font-black uppercase tracking-widest transition-all ${currentStatus === status ? 'bg-[#FFD100] text-[#003366] shadow-xl scale-[1.02]' : 'text-slate-500'}`}
                    >
                        {status}
                    </button>
                ))}
          </div>
       </header>

       <main className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
           <div className="grid grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col items-center">
                   <p className="text-[9px] text-slate-400 font-black uppercase mb-3">Unit Load</p>
                   <p className="text-5xl font-black text-[#003366] tracking-tighter">{officer.visitCount}</p>
               </div>
               <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col items-center">
                   <p className="text-[9px] text-slate-400 font-black uppercase mb-3">Power Status</p>
                   <p className={`text-3xl font-black ${realBattery < 20 ? 'text-red-500 animate-pulse' : 'text-[#003366]'}`}>{realBattery}%</p>
               </div>
               <div className="col-span-2 bg-white p-8 rounded-[3.5rem] shadow-xl border border-slate-50 flex items-center justify-between relative overflow-hidden group">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFD100]/10 rounded-full -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-700"></div>
                   <div className="relative z-10">
                       <h4 className="text-[10px] font-black text-slate-400 uppercase mb-1">Pipeline Volume</h4>
                       <p className="text-3xl font-black text-[#003366]">₱{(officer.pipelineValue/1000000).toFixed(1)}M</p>
                   </div>
                   <GeminiLiveVoice />
               </div>
           </div>
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
        <div className={`w-12 h-12 rounded-[1.5rem] flex items-center justify-center transition-all duration-300 ${active ? 'bg-[#003366] text-[#FFD100] shadow-2xl -translate-y-2' : 'text-slate-200 hover:text-slate-400'}`}>
             {icon === 'home' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
             {icon === 'users' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
             {icon === 'briefcase' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
             {icon === 'camera' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
        </div>
        <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-colors ${active ? 'text-[#003366]' : 'text-slate-300'}`}>{label}</span>
    </button>
);
