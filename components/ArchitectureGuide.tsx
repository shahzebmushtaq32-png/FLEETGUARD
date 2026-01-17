
import React, { useState, useEffect } from 'react';
import { persistenceService } from '../services/persistenceService';

const ArchitectureGuide: React.FC = () => {
  const [neonStats, setNeonStats] = useState<any>(null);

  useEffect(() => {
    const fetchStats = async () => {
        const stats = await persistenceService.getNeonStats();
        setNeonStats(stats);
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-8 text-white font-sans animate-in fade-in slide-in-from-bottom-4">
      
      {/* Live Data Explorer Overlay */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
           <StatBox 
              label="Neon Nodes" 
              value={neonStats?.activeNodes || '--'} 
              unit="OFFICERS" 
              color="blue" 
           />
           <StatBox 
              label="Neon History" 
              value={neonStats?.telemetryPoints || '--'} 
              unit="POINTS" 
              color="cyan" 
           />
           <StatBox 
              label="Sync Cluster" 
              value="ACTIVE" 
              unit="SUPABASE" 
              color="emerald" 
           />
      </div>

      {/* Visual Map */}
      <div className="bg-[#1e293b] border border-white/10 rounded-[2.5rem] p-12 relative overflow-hidden">
         <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
         
         <div className="relative flex flex-col items-center gap-12">
            
            {/* Mobile Application layer */}
            <div className="flex flex-col items-center">
                <div className="bg-white/5 border border-white/20 rounded-2xl px-8 py-4 shadow-xl flex items-center gap-4 group hover:bg-white/10 transition-all cursor-help">
                    <div className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">BDO Mobile App (Native + Web)</span>
                </div>
                <div className="h-12 w-px bg-gradient-to-b from-amber-400 to-transparent"></div>
            </div>

            {/* Neon primary layer */}
            <div className="flex flex-col items-center relative">
                 <div className="bg-blue-500/10 border border-blue-500/40 rounded-3xl px-12 py-6 shadow-2xl backdrop-blur-md">
                     <div className="flex items-center gap-3 mb-2">
                        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-400">NEON DB (Primary Storage)</span>
                     </div>
                     <p className="text-[8px] text-slate-500 uppercase font-bold text-center">Serverless Postgres / History Layer</p>
                 </div>
                 
                 <div className="flex justify-between w-full max-w-[400px] mt-8">
                     <div className="flex flex-col items-center">
                         <div className="h-10 w-px bg-gradient-to-b from-blue-400 to-transparent"></div>
                         <NodeBox 
                            title="Neon_Node_A" 
                            infra="Oregon (AWS)" 
                            color="blue" 
                            desc="History Persistence" 
                         />
                     </div>
                     <div className="flex flex-col items-center">
                         <div className="h-10 w-px bg-gradient-to-b from-emerald-400 to-transparent"></div>
                         <NodeBox 
                            title="Supabase_Node" 
                            infra="Realtime Presence" 
                            color="emerald" 
                            desc="Session Sync" 
                         />
                     </div>
                 </div>
            </div>

            {/* Shared Services Layer */}
            <div className="bg-[#0f172a]/50 p-6 rounded-3xl border border-white/5 w-full text-center">
                 <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4 block">Unified Failover Bus</span>
                 <div className="flex justify-center gap-4">
                      <div className="px-4 py-2 bg-purple-500/10 rounded-xl text-purple-400 text-[8px] font-black uppercase border border-purple-500/20">Gemini AI Matcher</div>
                      <div className="px-4 py-2 bg-cyan-500/10 rounded-xl text-cyan-400 text-[8px] font-black uppercase border border-cyan-500/20">Cloudflare R2 Assets</div>
                 </div>
            </div>
         </div>
      </div>
    </div>
  );
};

const StatBox = ({ label, value, unit, color }: any) => (
    <div className={`bg-${color}-500/5 border border-${color}-500/10 rounded-2xl p-4 flex flex-col items-center text-center`}>
        <span className={`text-[8px] font-black uppercase text-${color}-400/60 tracking-widest mb-1`}>{label}</span>
        <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-white">{value}</span>
            <span className="text-[8px] font-mono text-slate-600">{unit}</span>
        </div>
    </div>
);

const NodeBox = ({ title, infra, color, desc }: any) => (
    <div className={`bg-${color}-500/5 border border-${color}-500/20 rounded-2xl p-4 w-44 text-center shadow-xl`}>
        <h4 className={`text-[9px] font-black uppercase text-${color}-400 mb-1`}>{title}</h4>
        <p className="text-[7px] font-mono text-slate-500 mb-3">{infra}</p>
        <p className="text-[8px] text-slate-400 uppercase font-bold leading-tight">{desc}</p>
    </div>
);

export default ArchitectureGuide;
