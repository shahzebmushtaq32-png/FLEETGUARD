
import React from 'react';
import { SalesLead, SalesOfficer, DispatchRecommendation } from '../types';

interface DispatchHubProps {
  leads: SalesLead[];
  officers: SalesOfficer[];
  recommendations: DispatchRecommendation[];
  isLoading: boolean;
  onExecute: (rec: DispatchRecommendation) => void;
}

const DispatchHub: React.FC<DispatchHubProps> = ({ leads, officers, recommendations, isLoading, onExecute }) => {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 py-20">
        <div className="relative w-12 h-12">
           <div className="absolute inset-0 border-4 border-[#FFD100] border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-[10px] font-black text-white uppercase tracking-[0.2em] animate-pulse">Finding Best Matches...</p>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-50">
        <p className="text-[10px] font-black text-white uppercase tracking-widest mb-2">No suggestions yet</p>
        <p className="text-[8px] text-blue-300 font-bold uppercase">Click "Run AI" to see matches</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
      {recommendations.map((rec) => {
        const lead = leads.find(l => l.id === rec.leadId);
        const officer = officers.find(o => o.id === rec.officerId);
        
        if (!lead || !officer) return null;

        return (
          <div key={`${rec.leadId}-${rec.officerId}`} className="bg-[#002855] border border-[#003D7C] rounded-2xl p-4 hover:border-[#FFD100]/50 transition-all">
            <div className="flex justify-between items-start mb-3">
              <div>
                 <div className="flex items-center gap-2 mb-1">
                    <span className="text-[8px] font-black text-[#FFD100] bg-[#FFD100]/10 px-1.5 py-0.5 rounded uppercase">{rec.matchScore}% Match</span>
                 </div>
                 <h4 className="text-xs font-black text-white uppercase">{lead.clientName}</h4>
              </div>
              <div className="text-right">
                 <p className="text-[8px] font-black text-slate-500 uppercase">Send To</p>
                 <p className="text-[10px] font-black text-blue-400 uppercase">{officer.name}</p>
              </div>
            </div>

            <div className="bg-[#001D3D] p-3 rounded-xl border border-[#003D7C] mb-3">
               <p className="text-[9px] text-blue-100/80 leading-relaxed italic">"{rec.reasoning}"</p>
            </div>

            <button 
              onClick={() => onExecute(rec)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 rounded-xl text-[9px] uppercase tracking-widest active:scale-95 transition-all"
            >
              Send Job to Agent
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default DispatchHub;
