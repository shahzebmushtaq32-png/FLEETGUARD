
import React, { useState, useEffect, useCallback } from 'react';
import { SalesOfficer, User, UserRole, SystemStats, Incident } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import { BDOView } from './components/BDOView';
import { persistenceService } from './services/persistenceService';
import { socketService } from './services/socketService';

const INITIAL_OFFICER_TEMPLATE: SalesOfficer = { 
    id: 'unknown', name: 'Syncing...', lat: 14.5547, lng: 121.0244, 
    battery: 100, signalStrength: 100, networkType: '5G', status: 'Offline', 
    lastUpdate: new Date(), role: 'Senior BDO', leads: [], history: [], 
    pipelineValue: 0, visitCount: 0, quotaProgress: 0, qrOnboarded: 0, 
    qrActivated: 0, qrVolume: 0, evidence: [], tasks: [], avatar: ''
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [officers, setOfficers] = useState<SalesOfficer[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [wsStatus, setWsStatus] = useState<string>('Disconnected');
  const [isLoading, setIsLoading] = useState(false);
  const [systemMode, setSystemMode] = useState<'DEV' | 'PROD'>((localStorage.getItem('bdo_system_mode') as 'DEV' | 'PROD') || 'DEV');

  const loadData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await persistenceService.fetchOfficersAPI();
      setOfficers(data.map(o => ({ ...INITIAL_OFFICER_TEMPLATE, ...o, lastUpdate: new Date(o.lastUpdate) })));
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadData();
      socketService.connect(user.role === 'Admin' ? 'dashboard' : 'iot', setWsStatus);
      
      socketService.onDeviceUpdate((updates) => {
        setOfficers(prev => {
          const next = [...prev];
          updates.forEach(u => {
            const idx = next.findIndex(o => o.id === u.id);
            if (idx !== -1) next[idx] = { ...next[idx], ...u, lastUpdate: new Date() };
            else if (u.id && u.name) next.push({ ...INITIAL_OFFICER_TEMPLATE, ...u as SalesOfficer });
          });
          return next;
        });
      });

      socketService.onIncident((inc) => {
        // PROTECTIVE: Ensure incoming time is always a Date object
        const formattedInc = { 
          ...inc, 
          time: inc.time instanceof Date ? inc.time : new Date(inc.time) 
        };
        setIncidents(prev => [formattedInc, ...prev].slice(0, 50));
      });
    }
    return () => socketService.disconnect();
  }, [user, loadData]);

  const handleLogin = (username: string, role: UserRole, officerId?: string) => {
    setUser({ id: officerId || 'ADM-ROOT', username, role, assignedOfficerId: officerId });
  };

  const handleLogout = () => {
    setUser(null);
    socketService.disconnect();
    localStorage.clear();
  };

  const stats: SystemStats = {
    totalPipeline: officers.reduce((a, o) => a + (o.pipelineValue || 0), 0),
    activeMeetings: officers.filter(o => o.status === 'Meeting').length,
    dailyVisits: officers.reduce((a, o) => a + (o.visitCount || 0), 0),
    teamPerformance: 85,
    onlineCount: officers.filter(o => o.status !== 'Offline').length,
    criticalBattery: officers.filter(o => o.battery < 20).length,
    saturationLevel: 45,
    totalQrVolume: officers.reduce((a, o) => a + (o.qrVolume || 0), 0),
    totalOnboarded: officers.reduce((a, o) => a + (o.qrOnboarded || 0), 0)
  };

  if (!user) return <Login onLogin={handleLogin} />;

  const currentOfficer = officers.find(o => o.id === user.assignedOfficerId);

  if (isLoading && officers.length === 0) {
    return (
      <div className="h-screen w-full bg-[#001D3D] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-50 overflow-hidden">
      {user.role === 'Admin' ? (
        <AdminDashboard 
          user={user} officers={officers} geofences={[]} stats={stats} 
          messages={[]} incidents={incidents} onLogout={handleLogout}
          onAddBDO={(n, c, p, a) => persistenceService.addOfficerAPI({ id: c, name: n, password: p, avatar: a }).then(loadData)}
          onDeleteBDO={(id) => persistenceService.deleteOfficerAPI(id).then(loadData)}
          onAssignTask={() => {}} onSendMessage={() => {}} wsStatus={wsStatus} systemMode={systemMode}
          onToggleSystemMode={() => {
            const next = systemMode === 'DEV' ? 'PROD' : 'DEV';
            setSystemMode(next);
            localStorage.setItem('bdo_system_mode', next);
          }}
        />
      ) : (
        currentOfficer && <BDOView user={user} officer={currentOfficer} messages={[]} onLogout={handleLogout} onSendMessage={() => {}} onReportIncident={() => {}} wsStatus={wsStatus} isOnline={true} systemMode={systemMode} />
      )}
    </div>
  );
};

export default App;
