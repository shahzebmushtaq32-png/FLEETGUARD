import React, { useState } from 'react';
import { SalesOfficer } from '../types';

interface SidebarProps {
  devices: SalesOfficer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ devices, selectedId, onSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = devices.filter(d => 
    d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    d.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#0f172a]">
      {/* Search Area */}
      <div className="p-4 border-b border-white/5">
        <div className="relative">
            <input 
                type="text" 
                placeholder="Search Field Nodes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#1e293b] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-xs font-bold text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all uppercase tracking-wide"
            />
            <svg className="w-4 h-4 text-slate-600 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4">
         <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Grid Personnel</h3>
         <span className="text-[9px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/20">{filtered.length} NODES</span>
      </div>
      
      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4 space-y-2">
          {filtered.map(off => {
             const isSelected = selectedId === off.id;
             const statusColor = off.status === 'Active' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 
                                 off.status === 'Break' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 
                                 'text-slate-400 bg-slate-400/10 border-slate-400/20';

             return (
                 <button 
                    key={off.id}
                    onClick={() => onSelect(off.id)}
                    className={`w-full group relative overflow-hidden rounded-xl border transition-all duration-200 text-left p-3 ${
                        isSelected 
                        ? 'bg-[#1e293b] border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.1)]' 
                        : 'bg-[#1e293b]/50 border-white/5 hover:bg-[#1e293b] hover:border-white/10'
                    }`}
                 >
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500"></div>}
                    
                    <div className="flex items-center gap-3 mb-3">
                        {/* Avatar */}
                        <div className="relative">
                             <img src={off.avatar || 'https://via.placeholder.com/40'} className={`w-10 h-10 rounded-lg object-cover grayscale group-hover:grayscale-0 transition-all ${isSelected ? 'grayscale-0' : ''}`} />
                             <div className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border border-[#1e293b] ${off.status === 'Offline' ? 'bg-slate-600' : 'bg-emerald-500'}`}></div>
                        </div>

                        {/* Name & ID */}
                        <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-black text-white uppercase tracking-tight truncate">{off.name}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                                <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                <span className="text-[9px] font-mono text-slate-500 uppercase">{off.id}</span>
                            </div>
                        </div>

                        {/* Status Badge */}
                        <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusColor}`}>
                            {off.status === 'On Duty' ? 'DUTY' : off.status}
                        </span>
                    </div>

                    {/* Footer Metrics */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <div className="flex items-center gap-3">
                             {/* Signal */}
                             <div className="flex items-center gap-1">
                                <div className="flex gap-0.5 items-end h-2">
                                    <div className="w-0.5 bg-cyan-500 h-1"></div>
                                    <div className="w-0.5 bg-cyan-500 h-1.5"></div>
                                    <div className="w-0.5 bg-cyan-500 h-2"></div>
                                    <div className="w-0.5 bg-slate-600 h-2"></div>
                                </div>
                                <span className="text-[8px] font-mono text-cyan-400">4G</span>
                             </div>

                             {/* Battery */}
                             <span className={`text-[8px] font-mono font-bold ${off.battery < 20 ? 'text-red-500' : 'text-slate-400'}`}>
                                {off.battery}%
                             </span>
                        </div>
                        <span className="text-[8px] font-mono text-slate-600">
                             {/* Mock time diff */}
                             1H+
                        </span>
                    </div>
                 </button>
             );
          })}
      </div>
    </div>
  );
};

export default Sidebar;