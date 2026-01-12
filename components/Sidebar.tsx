import React from 'react';
import { SalesOfficer } from '../types';

interface SidebarProps {
  devices: SalesOfficer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ devices, selectedId, onSelect }) => {
  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-100 bg-[#003366] text-white">
        <h2 className="text-lg font-black tracking-tight mb-1 uppercase italic">IoT Node Cluster</h2>
        <p className="text-[10px] text-blue-300 uppercase font-bold tracking-widest italic">Broadcast v4 Live</p>
      </div>
      
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50">
        <div className="p-3">
          {devices.map(off => {
            if (!off) return null; // Safety Guard
            return (
            <button
              key={off.id}
              onClick={() => onSelect(off.id)}
              className={`w-full text-left p-4 rounded-3xl mb-2 transition-all group relative overflow-hidden ${
                selectedId === off.id 
                  ? 'bg-white shadow-xl border border-blue-100' 
                  : 'hover:bg-slate-100 border border-transparent'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex gap-2 items-center">
                    <span className={`text-[8px] px-2 py-0.5 rounded-lg font-black uppercase tracking-tighter ${
                    off.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'
                    }`}>
                    {off.status}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                </div>
              </div>

              <div className="flex items-center gap-4 mb-3">
                {off.avatar ? (
                  <img src={off.avatar} className="w-10 h-10 rounded-xl object-cover border-2 border-blue-500 shadow-md" alt="avatar" />
                ) : (
                  <div className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                )}
                <h3 className={`font-black text-sm uppercase tracking-tight ${selectedId === off.id ? 'text-blue-600' : 'text-slate-800'}`}>
                  {off.name}
                </h3>
              </div>
              
              <div className="mt-3 flex items-center justify-between">
                 <div className="flex items-center gap-1.5">
                    <div className="w-4 h-2 rounded-sm border border-slate-300 relative">
                        <div className={`h-full ${off.battery < 20 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${off.battery}%` }}></div>
                        <div className="absolute -right-1 top-0.5 w-0.5 h-1 bg-slate-300"></div>
                    </div>
                    <span className="text-[9px] font-black text-slate-500">{off.battery}%</span>
                 </div>
                 <span className="text-[9px] text-slate-400 font-mono font-bold">
                  {off.lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </button>
            );
          })}
        </div>
      </div>

      <div className="p-6 bg-white border-t border-slate-100">
        <div className="text-[9px] uppercase tracking-widest text-slate-400 font-black mb-1">Telemetry Status</div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[9px] font-black text-emerald-600 uppercase">Live Socket Stream</span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;