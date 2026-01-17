
import React from 'react';
import { EvidenceAsset } from '../types';

interface AuditPanelProps {
  evidence: (EvidenceAsset & { officerName?: string })[];
}

const AuditPanel: React.FC<AuditPanelProps> = ({ evidence }) => {
  if (evidence.length === 0) {
    return (
      <div className="py-32 text-center text-slate-400">
         <p className="text-[10px] font-black uppercase tracking-widest">No assets submitted for audit.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
      {evidence.sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime()).map((asset) => (
        <div key={asset.id} className="bg-[#1e293b] border border-white/5 rounded-3xl p-5 shadow-2xl hover:border-cyan-500/30 transition-all group overflow-hidden relative">
          <div className="flex justify-between items-start mb-4">
            <div>
               <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em] mb-1">Asset ID: {asset.id.slice(-6)}</h4>
               <p className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest">{asset.officerName || 'Field Agent'}</p>
            </div>
            <div className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
              asset.status === 'Verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
              asset.status === 'Flagged' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
              'bg-slate-500/10 text-slate-400 border-slate-500/20'
            }`}>
              {asset.status}
            </div>
          </div>
          
          <div className="aspect-[4/3] bg-black rounded-2xl mb-4 flex items-center justify-center border border-white/5 overflow-hidden relative">
             {asset.url ? (
                 <img src={asset.url} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" />
             ) : (
                 <div className="flex flex-col items-center gap-3 text-slate-700">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    <span className="text-[9px] font-bold uppercase">Image Loading...</span>
                 </div>
             )}
             
             {/* Tactical Overlay */}
             <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_4px,3px_100%]"></div>
             <div className="absolute top-2 left-2 bg-red-600 w-2 h-2 rounded-full animate-pulse z-20 shadow-[0_0_8px_rgba(220,38,38,0.8)]"></div>
          </div>

          <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 uppercase tracking-widest border-t border-white/5 pt-3">
            <div className="flex items-center gap-2">
                <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span>{asset.location ? `${asset.location.lat.toFixed(4)}, ${asset.location.lng.toFixed(4)}` : 'LOC_UNAVAILABLE'}</span>
            </div>
            <span>{new Date(asset.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AuditPanel;
