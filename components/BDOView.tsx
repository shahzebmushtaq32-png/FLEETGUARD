
import React, { useState, useEffect, useRef } from 'react';
import { User, SalesOfficer, Incident, Message, DeploymentTask, EvidenceAsset, SalesLead } from '../types';
import { socketService } from '../services/socketService';
import { r2Service } from '../services/r2Service';
import { verifyBdoIdentity } from '../services/geminiService';
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
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(officer?.avatar || null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSecurityLocked, setIsSecurityLocked] = useState(true);
  const [securityError, setSecurityError] = useState<string | null>(null);
  
  // Strict Hardware States
  const [permStatus, setPermStatus] = useState({
    cam: 'pending',
    geo: 'pending',
    mock: 'pending'
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // --- HARDWARE ENROLLMENT & ANTI-MOCK ---
  useEffect(() => {
    const initHardware = async () => {
      // 1. Camera Permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        stream.getTracks().forEach(t => t.stop());
        setPermStatus(p => ({ ...p, cam: 'ok' }));
      } catch (e) {
        setPermStatus(p => ({ ...p, cam: 'fail' }));
      }

      // 2. Geolocation & Mock Check
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const c = pos.coords as any;
            // Fake GPS Heuristics: Accuracy 0/1m or mocked flag
            const isMocked = c.mocked === true || c.accuracy <= 1.0;
            setPermStatus(p => ({ 
              ...p, 
              geo: 'ok', 
              mock: isMocked ? 'fail' : 'ok' 
            }));
          },
          () => setPermStatus(p => ({ ...p, geo: 'fail' })),
          { enableHighAccuracy: true }
        );
      } else {
        setPermStatus(p => ({ ...p, geo: 'fail' }));
      }
    };

    initHardware();
  }, []);

  // --- CAMERA MANAGEMENT ---
  useEffect(() => {
    if (isSecurityLocked || activeTab === 'selfie') startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [isSecurityLocked, activeTab]);

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

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  // --- IDENTITY VERIFICATION ---
  const handleAuth = async () => {
    if (!videoRef.current || !canvasRef.current || !officer) return;
    setIsCapturing(true);
    setSecurityError(null);

    const context = canvasRef.current.getContext('2d');
    if (context) {
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.8);
      
      try {
          const aiResult = await verifyBdoIdentity(imageData);
          if (aiResult.verified) {
              const url = await r2Service.uploadEvidence(imageData, `auth_${officer.id}.jpg`);
              setCapturedPhoto(url);
              setIsSecurityLocked(false);
              setCurrentStatus('Active');
              sessionStorage.setItem('bdo_session_secure', 'true');
          } else {
              setSecurityError(aiResult.welcomeMessage || "Verification failed: Professional uniform required.");
          }
      } catch (e) {
          setSecurityError("AI verification link timed out.");
      } finally {
          setIsCapturing(false);
      }
    }
  };

  // --- TELEMETRY BROADCAST ---
  useEffect(() => {
    if (!officer || isSecurityLocked || permStatus.geo !== 'ok' || permStatus.mock !== 'ok') return;

    const interval = setInterval(() => {
      navigator.geolocation.getCurrentPosition((pos) => {
        socketService.sendTelemetry({
          id: officer.id,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          battery: officer.battery || 100,
          status: currentStatus,
          lastUpdate: new Date()
        });
      }, undefined, { enableHighAccuracy: true });
    }, 10000);

    return () => clearInterval(interval);
  }, [isSecurityLocked, currentStatus, officer?.id, permStatus]);

  // --- BLOCKED SCREENS ---
  if (permStatus.cam === 'fail' || permStatus.geo === 'fail') {
    return (
      <div className="h-screen w-full bg-[#001D3D] flex flex-col items-center justify-center p-12 text-center text-white">
        <div className="w-24 h-24 bg-red-500/20 rounded-[2rem] flex items-center justify-center mb-8 border border-red-500/30">
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <h1 className="text-2xl font-black uppercase tracking-widest mb-4">Hardware Blocked</h1>
        <p className="text-slate-400 text-xs uppercase tracking-[0.2em] leading-relaxed mb-10">BDO Mobile Grid requires active Camera and Geolocation to function. Please enable them in your device settings.</p>
        <button onClick={() => window.location.reload()} className="bg-[#FFD100] text-[#003366] px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-2xl">Re-Enroll Device</button>
      </div>
    );
  }

  if (permStatus.mock === 'fail') {
    return (
      <div className="h-screen w-full bg-[#7f1d1d] flex flex-col items-center justify-center p-12 text-center text-white">
        <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-8 border border-white/20 animate-pulse">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" /></svg>
        </div>
        <h1 className="text-2xl font-black uppercase tracking-widest mb-4">Fake GPS Detected</h1>
        <p className="text-white/70 text-xs uppercase tracking-[0.2em] leading-relaxed">Identity theft and location spoofing are prohibited. Turn off Mock Location apps to resume duty.</p>
      </div>
    );
  }

  // --- SECURITY AUTH SCREEN ---
  if (isSecurityLocked) {
    return (
      <div className="h-screen w-full bg-[#001D3D] flex flex-col items-center justify-center p-6 overflow-hidden">
        <div className="w-full max-w-sm bg-white rounded-[3.5rem] p-10 shadow-2xl text-center relative z-10 border-[10px] border-[#003366]/5">
            <div className="w-12 h-1.5 bg-[#FFD100] mx-auto rounded-full mb-10"></div>
            <h2 className="text-2xl font-black text-[#003366] uppercase tracking-tight mb-2">Gate 01 Check</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-10">Biometric Identity Sync</p>
            
            <div className="relative rounded-[2.5rem] overflow-hidden aspect-square bg-[#001D3D] mb-8 border-[6px] border-slate-50 shadow-inner">
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                <div className="absolute inset-0 border-[2px] border-dashed border-cyan-400/30 rounded-[2rem] m-6"></div>
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_15px_cyan] animate-[scan_3s_infinite]"></div>
            </div>

            {securityError && (
              <div className="mb-6 bg-red-50 p-4 rounded-2xl border border-red-100">
                  <p className="text-[9px] font-black text-red-600 uppercase leading-relaxed">{securityError}</p>
              </div>
            )}

            <button 
                onClick={handleAuth} 
                disabled={isCapturing} 
                className="w-full bg-[#FFD100] text-[#003366] font-black py-5 rounded-[2rem] uppercase text-[11px] tracking-[0.2em] shadow-xl active:scale-95 transition-all disabled:opacity-50"
            >
                {isCapturing ? 'Verifying...' : 'Authenticate Node'}
            </button>
            <button onClick={onLogout} className="mt-8 text-[9px] font-black text-slate-300 uppercase tracking-[0.3em] hover:text-red-500 transition-colors">Terminate Link</button>
        </div>
        <style>{` @keyframes scan { 0%, 100% { top: 10%; } 50% { top: 90%; } } `}</style>
      </div>
    );
  }

  if (!officer) return null;

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] font-sans relative overflow-hidden">
       {/* SECURE HUD HEADER */}
       <div className="bg-[#001D3D] px-6 py-3 flex items-center justify-between border-b border-white/5">
           <div className="flex items-center gap-3">
               <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]"></div>
               <span className="text-[8px] font-black text-white/50 uppercase tracking-[0.2em]">ENCRYPTED_UPLINK: {officer.id}</span>
           </div>
           <div className="flex gap-1.5">
                {[1,2,3].map(i => <div key={i} className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-cyan-400/60' : 'bg-red-400/60'}`}></div>)}
           </div>
       </div>

       <header className="bg-[#003366] text-white px-6 pt-10 pb-12 rounded-b-[4.5rem] shadow-2xl relative z-10">
          <div className="flex justify-between items-start mb-10">
             <div className="flex gap-5 items-center">
                <div className="w-16 h-16 bg-white rounded-[1.75rem] overflow-hidden border-4 border-white/20 shadow-2xl p-0.5">
                    <img src={capturedPhoto || 'https://via.placeholder.com/150'} className="w-full h-full object-cover rounded-[1.5rem]" />
                </div>
                <div>
                    <h2 className="text-xl font-black uppercase tracking-tight leading-none mb-1.5">{officer.name}</h2>
                    <span className="text-[9px] bg-[#FFD100] text-[#003366] px-3 py-1 rounded-full font-black uppercase tracking-widest">{officer.role}</span>
                </div>
             </div>
             <button onClick={onLogout} className="bg-white/10 p-4 rounded-2xl text-white/60 transition-all active:scale-90">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
             </button>
          </div>

          <div className="flex bg-[#002855] p-2 rounded-[2.25rem] border border-white/5 shadow-inner">
                {['Active', 'Break'].map(status => (
                    <button 
                        key={status} 
                        onClick={() => setCurrentStatus(status as any)} 
                        className={`flex-1 py-4 rounded-[1.75rem] text-[10px] font-black uppercase tracking-widest transition-all ${currentStatus === status ? 'bg-[#FFD100] text-[#003366] shadow-xl' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {status}
                    </button>
                ))}
          </div>
       </header>

       <main className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
           {activeTab === 'home' && (
               <div className="grid grid-cols-2 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                   <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center">
                       <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-3">Daily Grid</p>
                       <p className="text-5xl font-black text-[#003366] tracking-tighter">{officer.visitCount}</p>
                   </div>
                   <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col items-center justify-center">
                       <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-3">Eff %</p>
                       <p className="text-2xl font-black text-[#003366]">{officer.quotaProgress}%</p>
                   </div>
                   <div className="col-span-2 bg-white p-8 rounded-[3.5rem] shadow-xl border border-slate-50 flex items-center justify-between relative overflow-hidden group">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFD100]/10 rounded-full -mr-16 -mt-16 group-hover:scale-125 transition-transform duration-700"></div>
                       <div className="relative z-10">
                           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pipeline Vol</h4>
                           <p className="text-3xl font-black text-[#003366]">₱{(officer.pipelineValue/1000000).toFixed(1)}M</p>
                       </div>
                       <GeminiLiveVoice />
                   </div>
               </div>
           )}

           {activeTab === 'leads' && (
               <div className="space-y-4">
                   {officer.leads.map(lead => (
                       <div key={lead.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm flex items-center justify-between hover:border-[#FFD100]/40 transition-colors">
                           <div>
                               <h4 className="text-sm font-black text-[#003366] uppercase tracking-tight mb-1">{lead.clientName}</h4>
                               <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{lead.stage} • ₱{(lead.value/1000).toFixed(0)}K</span>
                           </div>
                           <button onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.clientName)}`, '_blank')} className="w-12 h-12 rounded-2xl bg-slate-50 text-[#003366] flex items-center justify-center active:scale-90 transition-all">
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                           </button>
                       </div>
                   ))}
               </div>
           )}

           {activeTab === 'selfie' && (
                <div className="h-full flex flex-col">
                    <div className="flex-1 bg-black rounded-[3.5rem] overflow-hidden relative border-4 border-white shadow-2xl">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                        <div className="absolute bottom-12 left-0 right-0 flex justify-center">
                            <button onClick={async () => {
                                setIsCapturing(true);
                                const context = canvasRef.current?.getContext('2d');
                                if (context && videoRef.current) {
                                    canvasRef.current!.width = videoRef.current.videoWidth;
                                    canvasRef.current!.height = videoRef.current.videoHeight;
                                    context.drawImage(videoRef.current, 0, 0);
                                    const img = canvasRef.current!.toDataURL('image/jpeg', 0.6);
                                    await r2Service.uploadEvidence(img, `audit_${Date.now()}.jpg`);
                                    alert("Grid Audit Uploaded.");
                                    setActiveTab('home');
                                }
                                setIsCapturing(false);
                            }} disabled={isCapturing} className="w-20 h-20 rounded-full border-[6px] border-white flex items-center justify-center bg-white/20 active:scale-90 transition-transform">
                                <div className="w-14 h-14 bg-white rounded-full shadow-lg"></div>
                            </button>
                        </div>
                    </div>
                </div>
           )}
       </main>

       <nav className="bg-white px-8 pb-12 pt-6 border-t border-slate-100 flex justify-between rounded-t-[4.5rem] shadow-[0_-20px_60px_rgba(0,0,0,0.05)] relative z-20">
           <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon="home" label="HUD" />
           <NavButton active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} icon="users" label="Grid" />
           <NavButton active={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')} icon="briefcase" label="Jobs" />
           <NavButton active={activeTab === 'selfie'} onClick={() => setActiveTab('selfie')} icon="camera" label="Audit" />
       </nav>

       <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: any) => (
    <button onClick={onClick} className="flex flex-col items-center gap-2 p-1 w-16 group transition-all">
        <div className={`w-12 h-12 rounded-[1.5rem] flex items-center justify-center transition-all duration-300 ${active ? 'bg-[#003366] text-[#FFD100] shadow-2xl -translate-y-2' : 'text-slate-200 hover:text-slate-400'}`}>
             {icon === 'home' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
             {icon === 'users' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
             {icon === 'briefcase' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
             {icon === 'camera' && <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} /></svg>}
        </div>
        <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-colors ${active ? 'text-[#003366]' : 'text-slate-300'}`}>{label}</span>
    </button>
);
