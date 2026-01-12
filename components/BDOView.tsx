import React, { useState, useEffect, useRef } from 'react';
import { User, SalesOfficer, Incident, Message, DeploymentTask, EvidenceAsset, SalesLead } from '../types';
import { verifyBdoIdentity } from '../services/geminiService';
import { socketService } from '../services/socketService';
import { persistenceService } from '../services/persistenceService';
import { r2Service } from '../services/r2Service';
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
  // HOOKS MUST BE AT TOP LEVEL - DO NOT RETURN EARLY BEFORE HOOKS
  const [activeTab, setActiveTab] = useState<'home' | 'jobs' | 'selfie'>('home');
  // Use optional chaining default
  const [currentStatus, setCurrentStatus] = useState(officer?.status || 'Offline');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(officer?.avatar || null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isVerified, setIsVerified] = useState(!!officer?.avatar);
  const [notification, setNotification] = useState<{title: string, msg: string} | null>(null);

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

  // Simulate Push Notification on new Task
  useEffect(() => {
    if (officer?.tasks && officer.tasks.length > 0) {
        const latestTask = officer.tasks[officer.tasks.length - 1];
        const taskTime = new Date(latestTask.createdAt).getTime();
        if (taskTime > Date.now() - 10000) {
            setNotification({ title: 'New Deployment', msg: latestTask.title });
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }
  }, [officer?.tasks]); // Check safe access

  // Camera Management
  useEffect(() => {
    if (activeTab === 'selfie' && !isVerified) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab, isVerified]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }, 
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

    const updatedOfficer = { ...officer, status };
    if (isOnline) {
        socketService.sendTelemetry(updatedOfficer);
    } else {
        persistenceService.queueAction('UPDATE_STATUS', { id: officer.id, status });
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsCapturing(true);
    const context = canvasRef.current.getContext('2d');
    if (context) {
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context.drawImage(videoRef.current, 0, 0);
      const imageData = canvasRef.current.toDataURL('image/jpeg', 0.6);
      
      try {
          // 1. Verify with Gemini
          const verification = await verifyBdoIdentity(imageData);
          
          if (verification.verified) {
              setCapturedPhoto(imageData);
              setIsVerified(true);
              setNotification({ title: 'Identity Verified', msg: `Confidence: ${verification.confidence}%` });
              
              // 2. Upload to Cloudflare R2 in background
              const url = await r2Service.uploadEvidence(imageData, `auth_${officer.id}_${Date.now()}.jpg`);
              
              // 3. Update Profile
              socketService.sendTelemetry({ ...officer, avatar: url });
          } else {
              setNotification({ title: 'Verification Failed', msg: 'Please try again.' });
          }
      } catch (e) {
          console.error("Verification error", e);
          setNotification({ title: 'Error', msg: 'Service unavailable' });
      } finally {
          setIsCapturing(false);
          stopCamera();
      }
    }
  };

  // --- RENDER GUARD ---
  if (!officer) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 gap-4">
          <div className="w-10 h-10 border-4 border-[#003366] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading Profile...</p>
          <button onClick={onLogout} className="text-[9px] text-red-400 underline mt-4">Cancel</button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 font-sans">
       {/* HEADER */}
       <div className="bg-[#003366] text-white p-6 pt-8 rounded-b-[2rem] shadow-xl relative z-10">
          <div className="flex justify-between items-start mb-6">
             <div className="flex gap-4 items-center">
                <div className="w-14 h-14 bg-white/10 rounded-2xl overflow-hidden border-2 border-white/20">
                    {capturedPhoto ? (
                        <img src={capturedPhoto} className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl font-black">?</div>
                    )}
                </div>
                <div>
                    <h2 className="text-lg font-black uppercase tracking-tight leading-none mb-1">{officer.name}</h2>
                    <p className="text-[10px] text-blue-200 font-bold uppercase tracking-widest">{officer.role} • {officer.id}</p>
                </div>
             </div>
             <button onClick={onLogout} className="bg-white/10 p-2 rounded-xl hover:bg-red-500/20 hover:text-red-300 transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
             </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-2">
             <div className="bg-[#002855] p-3 rounded-xl border border-white/5">
                <p className="text-[8px] text-blue-300 font-black uppercase tracking-widest mb-1">Status</p>
                <div className="flex gap-2">
                    <button onClick={() => updateDuty('Active')} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase ${currentStatus === 'Active' ? 'bg-green-500 text-white' : 'bg-white/10 text-slate-400'}`}>Active</button>
                    <button onClick={() => updateDuty('Break')} className={`flex-1 py-1.5 rounded-lg text-[9px] font-black uppercase ${currentStatus === 'Break' ? 'bg-yellow-500 text-[#003366]' : 'bg-white/10 text-slate-400'}`}>Break</button>
                </div>
             </div>
             <div className="bg-[#002855] p-3 rounded-xl border border-white/5 flex flex-col justify-center">
                 <div className="flex justify-between items-end mb-1">
                    <span className="text-[8px] text-blue-300 font-black uppercase tracking-widest">Battery</span>
                    <span className="text-[10px] font-black text-white">{officer.battery}%</span>
                 </div>
                 <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-green-400" style={{ width: `${officer.battery}%` }}></div>
                 </div>
             </div>
          </div>
       </div>

       {/* NOTIFICATION TOAST */}
       {notification && (
           <div className="mx-6 -mt-4 bg-[#FFD100] text-[#003366] p-4 rounded-xl shadow-lg relative z-20 animate-in slide-in-from-top-4 flex items-center gap-3">
               <div className="w-2 h-2 bg-[#003366] rounded-full animate-ping"></div>
               <div>
                   <p className="text-[9px] font-black uppercase tracking-widest opacity-80">{notification.title}</p>
                   <p className="text-xs font-bold leading-tight">{notification.msg}</p>
               </div>
           </div>
       )}

       {/* CONTENT AREA */}
       <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
           {activeTab === 'home' && (
               <div className="space-y-6">
                   {/* STATS */}
                   <div className="grid grid-cols-2 gap-4">
                       <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                           <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-2">My Visits</p>
                           <p className="text-3xl font-black text-[#003366]">{officer.visitCount}</p>
                           <p className="text-[8px] text-green-500 font-bold uppercase mt-1">+2 from yesterday</p>
                       </div>
                       <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                           <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-2">Quota</p>
                           <div className="relative w-16 h-16 mx-auto">
                               <svg className="w-full h-full transform -rotate-90">
                                   <circle cx="32" cy="32" r="28" stroke="#f1f5f9" strokeWidth="6" fill="transparent" />
                                   <circle cx="32" cy="32" r="28" stroke="#3b82f6" strokeWidth="6" fill="transparent" strokeDasharray={`${(officer.quotaProgress / 100) * 175} 175`} />
                               </svg>
                               <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-blue-600">{officer.quotaProgress}%</span>
                           </div>
                       </div>
                   </div>

                   {/* AI ASSISTANT */}
                   <div className="bg-gradient-to-br from-blue-900 to-[#003366] p-6 rounded-[2rem] text-white shadow-lg relative overflow-hidden">
                       <div className="relative z-10">
                           <h3 className="text-sm font-black uppercase italic tracking-widest mb-1 text-[#FFD100]">Fleet AI Command</h3>
                           <p className="text-[10px] text-blue-200 mb-4 font-medium">Ready for tactical orders.</p>
                           <GeminiLiveVoice devices={[officer]} onSetGeofence={() => {}} />
                       </div>
                       <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-[#FFD100] rounded-full blur-3xl opacity-20"></div>
                   </div>

                   {/* RECENT LEADS */}
                   <div>
                       <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-2">Assigned Leads</h3>
                       <div className="space-y-3">
                           {officer.leads.slice(0, 3).map(lead => (
                               <div key={lead.id} className="bg-white p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                                   <div>
                                       <h4 className="text-xs font-black text-slate-800 uppercase">{lead.clientName}</h4>
                                       <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{lead.stage}</p>
                                   </div>
                                   <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                   </div>
                               </div>
                           ))}
                           {officer.leads.length === 0 && (
                               <div className="text-center py-8 text-slate-400 text-[10px] uppercase font-bold border-2 border-dashed border-slate-200 rounded-2xl">No active leads</div>
                           )}
                       </div>
                   </div>
               </div>
           )}

           {activeTab === 'jobs' && (
               <div className="space-y-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Task List</h3>
                    {officer.tasks.map(task => (
                        <div key={task.id} className="bg-white p-5 rounded-2xl border-l-4 border-blue-500 shadow-sm">
                            <h4 className="text-sm font-black text-slate-800 uppercase mb-1">{task.title}</h4>
                            <p className="text-[10px] text-slate-500 font-medium leading-relaxed mb-3">{task.description}</p>
                            <div className="flex justify-between items-center">
                                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded uppercase">{task.status}</span>
                                <span className="text-[9px] font-mono text-slate-300">{new Date(task.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                    {officer.tasks.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                             <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                             <p className="text-[10px] font-black uppercase tracking-widest">All caught up</p>
                        </div>
                    )}
               </div>
           )}

           {activeTab === 'selfie' && (
               <div className="h-full flex flex-col">
                   <div className="flex-1 bg-black rounded-[2rem] overflow-hidden relative border-4 border-white shadow-2xl mb-6">
                       {!isVerified ? (
                           <>
                             <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                             <canvas ref={canvasRef} className="hidden" />
                             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                 <div className="w-48 h-64 border-2 border-white/30 rounded-[3rem]"></div>
                             </div>
                             <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                                 <button 
                                    onClick={handleCapture}
                                    disabled={isCapturing}
                                    className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-transparent active:scale-90 transition-all"
                                 >
                                     <div className="w-12 h-12 bg-white rounded-full"></div>
                                 </button>
                             </div>
                           </>
                       ) : (
                           <div className="w-full h-full relative">
                               <img src={capturedPhoto!} className="w-full h-full object-cover" />
                               <div className="absolute inset-0 bg-green-500/20 flex flex-col items-center justify-center backdrop-blur-[2px]">
                                   <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center shadow-lg mb-4 animate-bounce">
                                       <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                   </div>
                                   <p className="text-white font-black uppercase tracking-widest text-lg shadow-black drop-shadow-lg">Verified</p>
                                   <button onClick={() => setIsVerified(false)} className="mt-6 bg-white/20 px-6 py-2 rounded-full text-xs font-bold text-white uppercase hover:bg-white/30 transition-all">Retake</button>
                               </div>
                           </div>
                       )}
                   </div>
                   <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                       {isVerified ? 'Identity Confirmed' : 'Align face within frame'}
                   </p>
               </div>
           )}
       </div>

       {/* BOTTOM NAV */}
       <div className="bg-white p-2 border-t border-slate-100 flex justify-around pb-6 pt-3">
           <NavButton active={activeTab === 'home'} onClick={() => setActiveTab('home')} icon="home" label="HQ" />
           <NavButton active={activeTab === 'jobs'} onClick={() => setActiveTab('jobs')} icon="briefcase" label="Jobs" />
           <NavButton active={activeTab === 'selfie'} onClick={() => setActiveTab('selfie')} icon="camera" label="Verify" />
       </div>
    </div>
  );
};

const NavButton = ({ active, onClick, icon, label }: any) => (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 p-2 w-16 transition-all ${active ? 'text-[#003366]' : 'text-slate-300'}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${active ? 'bg-[#003366] text-[#FFD100] shadow-lg translate-y-[-5px]' : ''}`}>
             {icon === 'home' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>}
             {icon === 'briefcase' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
             {icon === 'camera' && <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
        </div>
        <span className="text-[9px] font-black uppercase tracking-widest">{label}</span>
    </button>
);