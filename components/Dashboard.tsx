
import React from 'react';
import { SystemStats } from '../types';

interface DashboardProps {
  stats: SystemStats;
}

const Dashboard: React.FC<DashboardProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="bg-[#002855]/80 backdrop-blur-md p-3 rounded-2xl border border-[#003D7C] shadow-lg">
        <p className="text-[#89a1b6] text-[8px] uppercase font-bold tracking-widest mb-1">Fleet Online</p>
        <div className="flex items-end gap-1">
          <span className="text-2xl font-black text-white">{stats.onlineCount}</span>
          <span className="text-[10px] text-green-400 font-bold mb-1">LIVE</span>
        </div>
      </div>
      <div className="bg-[#002855]/80 backdrop-blur-md p-3 rounded-2xl border border-[#003D7C] shadow-lg">
        <p className="text-[#89a1b6] text-[8px] uppercase font-bold tracking-widest mb-1">Critical Nodes</p>
        <div className="flex items-end gap-1">
          <span className={`text-2xl font-black ${stats.criticalBattery > 0 ? 'text-red-500' : 'text-white'}`}>
            {stats.criticalBattery}
          </span>
          <span className="text-[10px] text-slate-400 font-bold mb-1">ALERTS</span>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
