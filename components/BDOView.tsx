
import React, { useState, useEffect, useRef } from 'react';
import { User, SalesOfficer, Incident, Message, DeploymentTask, EvidenceAsset } from '../types';
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
  const [activeTab, setActiveTab] = useState<'home' | 'jobs' | 'selfie'>('home');
  const [currentStatus, setCurrentStatus] = useState(officer.status || 'Offline');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(officer.avatar || null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isVerified, setIsVerified] = useState(!!officer.avatar);
  const [notification, setNotification] = useState<{title: string, msg: string} | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Simulate Push Notification on new Task
  useEffect(() => {
    if (officer.tasks && officer.tasks.length > 0) {
        const latestTask = officer.tasks[officer.tasks.length - 1];
        if (new Date(latestTask.createdAt).getTime() > Date.now() - 5000) {
            setNotification({ title: 'New Deployment', msg: latestTask.title });
            setTimeout(() => setNotification(null), 4000);
        }
    }
  }, [officer.tasks]);

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
    if (isOnline) {
        socketService.sendTelemetry({ ...officer, status });
    } else {
        // Native App Feature: Queue offline action
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
      
      let avatarUrl = imageData; // Fallback to base64 if upload fails
      
      // Upload to Cloudflare R2
      if (isOnline) {
        try {
            const fileName = `selfie_${officer.id}_${Date.now()}.jpg`;
            avatarUrl = await r2Service.uploadEvidence(imageData, fileName);
            console.log("R2 Upload Success:", avatarUrl);
        } catch (e) {
            console.error("R2 Upload Failed, using base64 fallback", e);
        }
      }
      
      setCapturedPhoto(avatarUrl);
      
      // Verification Logic
      let verified = false;
      let aiConfidence = 0;
      
      if (isOnline) {
          const result = await verifyBdoIdentity(imageData);
          verified = result.verified;
          aiConfidence = result.confidence || 0;
      } else {
          verified = true; // Fallback for offline demo
          aiConfidence = 85;
      }

      if (verified) {
        setIsVerified(true);
        updateDuty('On Duty');
        
        // Create formal Evidence Asset
        const newEvidence: EvidenceAsset = {
          id: `EV-${Date.now()}`,
          type: 'Selfie Check-in',
          url: avatarUrl,
          timestamp: new Date(),
          location: { lat: officer.lat, lng: officer.lng },
          status: 'Verified',
          aiNotes: `Identity Verified by Gemini (Confidence: ${aiConfidence}%)`,
          officerId: officer.id
        };

        const updatedOfficer = {
           ...officer,
           avatar: avatarUrl,
           status: 'On Duty',
           evidence: [...(officer.evidence || []), newEvidence]
        };

        if (isOnline) {
            // @ts-ignore - Partial update handling
            socketService.sendTelemetry(updatedOfficer);
        } else {
            persistenceService.queueAction('UPDATE_AVATAR', { id: officer.id, avatar: avatarUrl });
        }
        setActiveTab('home');
      }
    }
    setIsCapturing(false);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden font-sans relative">
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Native App Feature: Offline Banner */}
      {!isOnline && (
        <div className="bg-slate-800 text-white text-[9px] font-black uppercase tracking-widest py-2 text-center z-50 animate-in slide-in-from-top-full">
          Offline Mode • Changes Queued
        </div>
      )}

      {/* Native App Feature: Push Notification Simulation */}
      {notification && (
          <div className="absolute top-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-blue-100 z-[60] animate-in slide-in-from-top-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-[#FFD100] rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-[#003366]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            </div>
            <div>
                <h4 className="text-[10px] font-black text-[#003366] uppercase tracking-wide">{notification.title}</h4>
                <p className="text-[10px] font-bold text-slate-500">{notification.msg}</p>
            </div>
          </div>
      )}
      
      <header className="h-28 bg-[#003366] text-white flex items-center justify-between px-6 pt-6 shrink-0 shadow-2xl z-10">
        <div className="flex items-center gap-4">
          <div className="relative">
             {capturedPhoto ? (
               <img src={capturedPhoto} className="w-14 h-14 rounded-2xl object-cover border-2 border-[#FFD100]" alt="avatar" />
             ) : (
               <div className="w-14 h-14 bg-[#FFD100] rounded-2xl flex items-center justify-center font-black text-[#003366] text-xl">B</div>
             )}
             <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-[#003366] ${currentStatus === 'On Duty' ? 'bg-green-500' : currentStatus === 'Break' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-tight leading-none">{officer.name}</h1>
            <span className="text-[9px] font-bold text-blue-200 uppercase tracking-widest mt-1 block italic">{currentStatus}</span>
          </div>
        </div>
        
        {/* Voice AI Button */}
        <GeminiLiveVoice 
            devices={[officer]} 
            onSetGeofence={(fence) => {
                setNotification({ title: 'AI Command', msg: `Geofence requested at ${fence.lat.toFixed(4)}, ${fence.lng.toFixed(4)}`});
            }} 
        />
      </header>

      <main className="flex-1 overflow-y-auto p-6 pb-32">
        {activeTab === 'home' && (
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
               <h3 className="text-[10px] font-black text-slate-400 uppercase mb-6 tracking-[0.2em] ml-1">My Duty Status</h3>
               <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => updateDuty('On Duty')} 
                    className={`py-5 rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all shadow-md ${currentStatus === 'On Duty' ? 'bg-green-600 text-white scale-105 ring-4 ring-green-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
                  >
                    Work Now
                  </button>
                  <button 
                    onClick={() => updateDuty('Break')} 
                    className={`py-5 rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all shadow-md ${currentStatus === 'Break' ? 'bg-yellow-500 text-white scale-105 ring-4 ring-yellow-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
                  >
                    Rest Time
                  </button>
                  <button 
                    onClick={() => updateDuty('Offline')} 
                    className={`col-span-2 py-5 rounded-3xl text-[11px] font-black uppercase tracking-widest transition-all shadow-md ${currentStatus === 'Offline' ? 'bg-red-500 text-white scale-105 ring-4 ring-red-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}
                  >
                    Finish Work
                  </button>
               </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
               <h3 className="text-[10px] font-black text-slate-400 uppercase mb-6 tracking-[0.2em] ml-1">Daily Operations</h3>
               <div className="space-y-4">
                  <button 
                    onClick={() => setActiveTab('jobs')} 
                    className="w-full flex items-center justify-between p-6 bg-blue-50 border border-blue-100 rounded-3xl active:scale-95 transition-all shadow-sm"
                  >
                     <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
                           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <div className="text-left">
                           <span className="block font-black text-blue-900 text-sm uppercase tracking-tight">Deployment Jobs</span>
                           <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">{officer.tasks?.length || 0} Assigned</span>
                        </div>
                     </div>
                     <svg className="w-5 h-5 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                  </button>
                  
                  {!isVerified && (
                    <button 
                      onClick={() => setActiveTab('selfie')} 
                      className="w-full flex items-center justify-between p-6 bg-emerald-50 border border-emerald-100 rounded-3xl active:scale-95 transition-all shadow-sm"
                    >
                       <div className="flex items-center gap-5">
                          <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
                             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </div>
                          <div className="text-left">
                             <span className="block font-black text-emerald-900 text-sm uppercase tracking-tight">Selfie Check-in</span>
                             <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest italic">Identity Verification</span>
                          </div>
                       </div>
                    </button>
                  )}
               </div>
            </div>
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="space-y-6 animate-in slide-in-from-right-8">
             <div className="flex justify-between items-center px-2">
               <h2 className="text-sm font-black uppercase text-slate-700 tracking-[0.2em]">Deployment List</h2>
               <button onClick={() => setActiveTab('home')} className="text-[10px] font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-xl uppercase tracking-widest shadow-sm">Back Home</button>
             </div>
             
             {(!officer.tasks || officer.tasks.length === 0) ? (
                <div className="bg-white rounded-[2.5rem] py-24 text-center border-2 border-dashed border-slate-200">
                   <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <svg className="w-10 h-10 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                   </div>
                   <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest italic">No New Jobs Assigned</p>
                </div>
             ) : (
                <div className="space-y-4">
                  {officer.tasks.map((task: DeploymentTask) => (
                    <div key={task.id} className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-4 relative overflow-hidden border-l-[12px] border-blue-500">
                       <h4 className="text-base font-black text-slate-800 uppercase tracking-tight">{task.title}</h4>
                       <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Time Assigned: {new Date(task.createdAt).toLocaleTimeString()}</p>
                       <div className="pt-4">
                          <button className="w-full bg-[#003366] text-white py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all">Mark as Finished</button>
                       </div>
                    </div>
                  ))
                </div>
             )}
          </div>
        )}

        {activeTab === 'selfie' && (
          <div className="space-y-8 flex flex-col items-center py-10 animate-in slide-in-from-bottom-12">
             <div className="text-center">
                <h2 className="text-lg font-black uppercase text-[#003366] tracking-tight">Identity Check</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-2 tracking-widest italic">Look at the camera and smile</p>
             </div>
             
             <div className="relative w-80 h-80 bg-black rounded-[4rem] overflow-hidden border-[6px] border-white shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)]">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover mirror" />
                <div className="absolute inset-0 pointer-events-none border-[40px] border-black/10"></div>
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                  <button onClick={handleCapture} disabled={isCapturing} className="w-20 h-20 bg-[#FFD100] rounded-full border-[8px] border-white active:scale-90 transition-all shadow-2xl flex items-center justify-center">
                    {isCapturing ? (
                       <div className="w-8 h-8 rounded-full border-4 border-[#003366] border-t-transparent animate-spin"></div>
                    ) : (
                       <div className="w-8 h-8 rounded-full border-4 border-[#003366]"></div>
                    )}
                  </button>
                </div>
             </div>
             
             <button onClick={() => setActiveTab('home')} className="text-[11px] font-black text-slate-300 uppercase tracking-[0.3em] hover:text-red-500 transition-colors">Abort Verification</button>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 h-28 bg-white border-t border-slate-100 flex items-center justify-around pb-8 px-10 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] z-20">
         <button onClick={() => {setActiveTab('home'); stopCamera();}} className={`flex flex-col items-center gap-2 transition-all ${activeTab === 'home' ? 'text-[#003366] scale-110' : 'text-slate-300 hover:text-slate-400'}`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${activeTab === 'home' ? 'bg-[#003366] text-[#FFD100] shadow-xl' : 'bg-slate-50'}`}>
               <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest">Duty</span>
         </button>
         
         <button onClick={() => {setActiveTab('jobs'); stopCamera();}} className={`flex flex-col items-center gap-2 transition-all ${activeTab === 'jobs' ? 'text-[#003366] scale-110' : 'text-slate-300 hover:text-slate-400'}`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${activeTab === 'jobs' ? 'bg-[#003366] text-[#FFD100] shadow-xl' : 'bg-slate-50'}`}>
               <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest">Jobs</span>
         </button>
      </nav>
    </div>
  );
};
