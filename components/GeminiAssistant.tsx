
import React, { useState } from 'react';
import { getSalesPerformanceSummary, getOptimizedVisitRoute } from '../services/geminiService';
import { SalesOfficer } from '../types';

interface GeminiAssistantProps {
  devices: SalesOfficer[];
}

const GeminiAssistant: React.FC<GeminiAssistantProps> = ({ devices }) => {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<string | null>(null);

  const handleAction = async (action: 'summary' | 'route') => {
    setLoading(true);
    setMode(action === 'summary' ? 'Team Report' : 'Route Planner');
    const data = action === 'summary' ? await getSalesPerformanceSummary(devices) : await getOptimizedVisitRoute('Manila');
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {!result && !loading ? (
        <div className="grid grid-cols-1 gap-2">
          <ActionButton onClick={() => handleAction('summary')} title="How is the team doing?" sub="AI Performance Check" color="bg-blue-600" />
          <ActionButton onClick={() => handleAction('route')} title="Plan best route" sub="AI Route Optimizer" color="bg-[#FFD100]" iconColor="text-[#003366]" />
        </div>
      ) : (
        <div className="bg-[#002855] border border-[#FFD100]/20 rounded-2xl p-5 animate-in slide-in-from-bottom-4 shadow-xl">
          {loading ? (
             <div className="flex flex-col items-center justify-center py-10 gap-4">
              <div className="w-8 h-8 border-4 border-[#FFD100] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[10px] text-[#FFD100] font-black uppercase animate-pulse">Asking AI...</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#003D7C]">
                <h4 className="text-[10px] font-black uppercase text-[#FFD100] tracking-widest">{mode}</h4>
                <button onClick={() => setResult(null)} className="text-[10px] bg-[#001D3D] px-3 py-1 rounded-full text-slate-400 font-bold uppercase">Back</button>
              </div>
              <div className="text-xs text-slate-200 leading-relaxed max-h-[350px] overflow-y-auto pr-2 custom-scrollbar space-y-3">
                {result?.text?.split('\n').map((line: string, i: number) => <p key={i}>{line}</p>)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const ActionButton = ({ onClick, title, sub, color, iconColor = 'text-white' }: any) => (
  <button onClick={onClick} className="flex items-center gap-3 bg-[#002855] border border-[#003D7C] p-4 rounded-xl hover:bg-[#003366] transition-all group">
    <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform`}>
      <svg className={`w-6 h-6 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
    </div>
    <div className="text-left">
      <span className="block font-black text-white text-sm tracking-tight">{title}</span>
      <span className="text-[9px] text-slate-400 font-bold uppercase">{sub}</span>
    </div>
  </button>
);

export default GeminiAssistant;
