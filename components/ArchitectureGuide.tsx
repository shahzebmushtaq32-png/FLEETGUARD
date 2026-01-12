
import React, { useState } from 'react';
import { socketService } from '../services/socketService';

const ArchitectureGuide: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'status' | 'url' | 'error'>('status');
  const [customUrl, setCustomUrl] = useState(localStorage.getItem('bdo_fleet_ws_url') || 'fleetguard-hrwf.onrender.com');

  const handleSaveUrl = () => {
    let cleaned = customUrl.trim()
      .replace(/^https?:\/\//, '')
      .replace(/^wss?:\/\//, '')
      .replace(/\/$/, '');
    
    localStorage.setItem('bdo_fleet_ws_url', `wss://${cleaned}`);
    socketService.disconnect();
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-5 text-white font-sans animate-in fade-in slide-in-from-bottom-4">
      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-slate-900 rounded-2xl border border-slate-800">
        <button onClick={() => setActiveTab('status')} className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'status' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>1. Status</button>
        <button onClick={() => setActiveTab('url')} className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'url' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>2. Sync</button>
        <button onClick={() => setActiveTab('error')} className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'error' ? 'bg-red-600 text-white' : 'text-slate-500'}`}>Help</button>
      </div>

      {activeTab === 'status' && (
        <div className="space-y-4 animate-in zoom-in-95">
           <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-[2rem]">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.4)]">
                  <svg className="w-6 h-6 text-[#003366]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
              </div>
              <h4 className="text-[12px] font-black uppercase text-emerald-400 mb-1 text-center">System Live</h4>
              <p className="text-[9px] text-slate-400 text-center uppercase tracking-widest font-bold">fleetguard-hrwf is active</p>
              
              <div className="mt-6 space-y-3">
                 <div className="flex justify-between items-center text-[9px]">
                    <span className="text-slate-500 font-bold uppercase">Render Status</span>
                    <span className="text-emerald-400 font-black">STABLE</span>
                 </div>
                 <div className="flex justify-between items-center text-[9px]">
                    <span className="text-slate-500 font-bold uppercase">Socket Port</span>
                    <span className="text-blue-400 font-black">10000</span>
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'url' && (
        <div className="space-y-4">
           <div className="bg-blue-500/10 border border-blue-500/30 p-5 rounded-3xl">
              <h4 className="text-[11px] font-black uppercase text-blue-400 mb-3">Target Endpoint</h4>
              <div className="relative mb-4">
                 <input 
                    type="text" 
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="w-full bg-black/40 border border-blue-500/20 rounded-xl px-4 py-3 text-[11px] font-mono text-blue-300 focus:outline-none focus:border-blue-500/50"
                 />
              </div>
              <button 
                 onClick={handleSaveUrl}
                 className="w-full bg-blue-600 text-white font-black py-3 rounded-xl text-[10px] uppercase tracking-widest shadow-lg"
              >
                 Force Sync URL
              </button>
           </div>
        </div>
      )}

      {activeTab === 'error' && (
        <div className="bg-slate-800/50 p-5 rounded-3xl border border-slate-700">
           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">No Data?</h4>
           <p className="text-[9px] text-slate-300 leading-relaxed">If markers aren't moving yet, verify your <code>NEON_DATABASE_URL</code> in Render dashboard matches the one from your Neon console.</p>
        </div>
      )}
    </div>
  );
};

export default ArchitectureGuide;
