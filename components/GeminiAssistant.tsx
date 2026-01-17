
import React, { useState } from 'react';
import { getSalesPerformanceSummary } from '../services/geminiService';
import { SalesOfficer } from '../types';

interface GeminiAssistantProps {
    officers: SalesOfficer[];
}

const GeminiAssistant: React.FC<GeminiAssistantProps> = ({ officers }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSummary = async () => {
    setIsLoading(true);
    try {
        const res = await getSalesPerformanceSummary(officers);
        setSummary(res.text);
    } catch (e) {
        setSummary("Failed to synthesize data. Check API Uplink.");
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="absolute bottom-6 right-6 z-[500] flex flex-col items-end">
        {isOpen && (
            <div className="w-80 bg-[#1e293b]/95 backdrop-blur-xl border border-cyan-500/30 rounded-[2rem] p-6 mb-4 shadow-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div>
                        <h4 className="text-[10px] font-black uppercase text-cyan-400 tracking-widest">Fleet Analyst AI</h4>
                        <p className="text-[8px] text-slate-500 font-bold uppercase">Realtime Business Logic</p>
                    </div>
                </div>

                <div className="bg-black/20 rounded-xl p-4 min-h-[150px] border border-white/5">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-24 gap-3">
                            <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-[9px] font-mono text-cyan-400/50 uppercase tracking-widest">Synthesizing...</span>
                        </div>
                    ) : summary ? (
                        <p className="text-[11px] text-slate-300 leading-relaxed font-medium italic">
                            {summary}
                        </p>
                    ) : (
                        <div className="text-center py-6">
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-4">No active analysis</p>
                            <button onClick={fetchSummary} className="text-[10px] text-cyan-400 font-black uppercase tracking-widest hover:text-cyan-300 transition-all underline decoration-cyan-500/30 underline-offset-4">Generate Insights</button>
                        </div>
                    )}
                </div>

                {summary && (
                    <button 
                        onClick={fetchSummary}
                        className="w-full mt-4 py-2 border border-cyan-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest text-cyan-400 hover:bg-cyan-500/10 transition-all"
                    >
                        Refresh Analysis
                    </button>
                )}
            </div>
        )}

        <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-90 ${isOpen ? 'bg-cyan-500 text-[#003366]' : 'bg-[#1e293b] text-cyan-400 border border-cyan-500/30'}`}
        >
            {isOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            ) : (
                <div className="relative">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-cyan-400 rounded-full animate-ping"></div>
                </div>
            )}
        </button>
    </div>
  );
};

export default GeminiAssistant;
