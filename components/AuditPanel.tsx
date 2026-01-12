
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
    <div className="space-y-4">
      {evidence.sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime()).map((asset) => (
        <div key={asset.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-3">
            <div>
               <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-tighter">Asset: {asset.id}</h4>
               <p className="text-[9px] text-blue-600 font-bold uppercase">{asset.officerName || 'Fleet Node'}</p>
            </div>
            <div className={`px-2 py-1 rounded text-[8px] font-black uppercase ${
              asset.status === 'Verified' ? 'bg-green-100 text-green-700' :
              asset.status === 'Flagged' ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-500'
            }`}>
              {asset.status}
            </div>
          </div>
          
          <div className="aspect-video bg-slate-50 rounded-xl mb-3 flex items-center justify-center border border-slate-100 overflow-hidden relative">
             <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
             <svg className="w-8 h-8 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
             <span className="absolute bottom-2 left-3 text-[8px] text-white font-black uppercase tracking-widest">{asset.type} Asset</span>
          </div>

          {asset.aiNotes && (
            <div className="bg-slate-900 text-green-400 p-3 rounded-xl font-mono text-[9px] leading-tight mb-2">
              <span className="text-[#FFD100] block mb-1 uppercase font-black tracking-widest opacity-50">AI Audit Insight</span>
              {asset.aiNotes}
            </div>
          )}

          <div className="flex justify-between items-center text-[8px] text-slate-400 font-bold uppercase tracking-widest">
            <span>Lat: {asset.location.lat.toFixed(4)}</span>
            <span>{asset.timestamp.toLocaleTimeString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AuditPanel;
