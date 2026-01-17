
import React, { useState, useEffect } from 'react';
import { SalesOfficer, User, UserRole, Geofence, Message, SystemStats, SalesLead, DeploymentTask, Incident } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import { BDOView } from './components/BDOView';
import { persistenceService } from './services/persistenceService';
import { socketService } from './services/socketService';

// Removed static mock leads to ensure data integrity from DB
const INITIAL_OFFICER_TEMPLATE: SalesOfficer = { 
    id: 'unknown',
    name: 'Syncing...',
    lat: 14.5547, lng: 121.0244, 
    battery: 100, signalStrength: 100, networkType: '5G',
    status: 'Offline', lastUpdate: new Date(), 
    role: 'Senior BDO', 
    leads: [], 
    history: [], 
    pipelineValue: 0, 
    visitCount: 0, 
    quotaProgress: 0,
    qrOnboarded: 0,
    qrActivated: 0,
    qrVolume: 0,
    evidence: [],
    tasks: [],
    avatar: ''
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [officers, setOfficers] = useState<SalesOfficer[]>([]);
  const [wsStatus, setWsStatus] = useState<string>('Disconnected');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isLoading, setIsLoading] = useState(false);
  
  const [systemMode, setSystemMode] = useState<'DEV' | 'PROD'>(
    (localStorage.getItem('bdo_system_mode') as 'DEV' | 'PROD') || 'DEV'
  );
  const [isWithinShift, setIsWithinShift] = useState(true);

  useEffect(() => {
    const checkShift = () => {
        if (systemMode === 'DEV') {
          setIsWithinShift(true);
          return;
        }
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        const isWeekday = day >= 1 && day <= 5;
        const inTimeWindow = hour >= 11 && hour < 18;
        setIsWithinShift(isWeekday && inTimeWindow); 
    };

    checkShift();
    const interval = setInterval(checkShift, 10000);
    return () => clearInterval(interval);
  }, [systemMode]);

  useEffect(() => {
    if (user && isWithinShift) {
        setIsLoading(true);
        const loadOfficers = async () => {
            try {
                const data = await persistenceService.fetchOfficersAPI();
                if (Array.isArray(data)) {
                    setOfficers(data.map(o => ({
                        ...INITIAL_OFFICER_TEMPLATE, 
                        ...o,
                        lastUpdate: o.lastUpdate ? new Date(o.lastUpdate) : new Date()
                    })));
                }
            } catch (e) {
                console.error("[App] Unified Sync Error:", e);
            } finally {
                setIsLoading(false);
            }
        };
        loadOfficers();
    }
  }, [user, isWithinShift]); 

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (user && isWithinShift) {
      const role = user.role === 'Admin' ? 'dashboard' : 'iot';
      socketService.connect(role, (status) => setWsStatus(status));
      
      socketService.onDeviceUpdate((updates) => {
        setOfficers(prev => {
            const newOfficers = [...prev];
            updates.forEach(update => {
                const index = newOfficers.findIndex(o => o.id === update.id);
                if (index !== -1) {
                    newOfficers[index] = { 
                        ...newOfficers[index], 
                        ...update, 
                        lastUpdate: new Date() 
                    };
                } else if (update.id && update.name) {
                    newOfficers.push({ ...INITIAL_OFFICER_TEMPLATE, ...update as SalesOfficer });
                }
            });
            return newOfficers;
        });
      });
    }

    return () => {
      socketService.disconnect();
    }
  }, [user, isWithinShift]);

  const toggleSystemMode = () => {
    const newMode = systemMode === 'DEV' ? 'PROD' : 'DEV';
    setSystemMode(newMode);
    localStorage.setItem('bdo_system_mode', newMode);
  };

  const handleLogin = (username: string, role: UserRole, officerId?: string) => {
    setUser({
      id: role === 'Admin' ? 'ADM-ROOT' : (officerId || 'OFC-001'),
      username,
      role,
      assignedOfficerId: officerId
    });
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('bdo_auth_token');
    localStorage.removeItem('bdo_user_session');
    socketService.disconnect();
  };

  const stats: SystemStats = {
    totalPipeline: officers.reduce((acc, o) => acc + (o.pipelineValue || 0), 0),
    activeMeetings: officers.filter(o => o.status === 'Meeting').length,
    dailyVisits: officers.reduce((acc, o) => acc + (o.visitCount || 0), 0),
    teamPerformance: 85,
    onlineCount: officers.filter(o => o.status !== 'Offline').length,
    criticalBattery: officers.filter(o => o.battery < 20).length,
    saturationLevel: 45,
    totalQrVolume: officers.reduce((acc, o) => acc + (o.qrVolume || 0), 0),
    totalOnboarded: officers.reduce((acc, o) => acc + (o.qrOnboarded || 0), 0)
  };

  if (!isWithinShift) {
      return (
          <div className="h-screen w-full flex flex-col items-center justify-center bg-[#001D3D] text-white p-12 text-center">
              <div className="w-24 h-24 bg-amber-500 rounded-3xl flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(245,158,11,0.2)] border-4 border-amber-400/20">
                  <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h1 className="text-3xl font-black uppercase tracking-tighter mb-4">System on Standby</h1>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 max-w-sm">
                  <p className="text-slate-300 text-sm uppercase font-bold tracking-widest leading-relaxed mb-4">
                      Operational Hours:<br/>
                      <span className="text-amber-400">MON-FRI | 11:00 AM - 06:00 PM</span>
                  </p>
              </div>
          </div>
      );
  }

  if (!user) return <Login onLogin={handleLogin} />;

  const currentOfficer = officers.find(o => o.id === user.assignedOfficerId) || (user.role === 'BDO' ? officers.find(o => o.id === user.assignedOfficerId) : null);

  if (isLoading || (user.role === 'BDO' && !currentOfficer)) {
    return (
      <div className="h-screen w-full bg-[#001D3D] flex flex-col items-center justify-center p-12">
          <div className="w-16 h-16 border-4 border-[#FFD100] border-t-transparent rounded-full animate-spin mb-6"></div>
          <h2 className="text-white font-black uppercase tracking-widest text-xs animate-pulse">Establishing Node Uplink...</h2>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-50 overflow-hidden">
      {user.role === 'Admin' ? (
        <AdminDashboard 
          user={user} 
          officers={officers} 
          geofences={[]}
          stats={stats}
          messages={[]}
          onLogout={handleLogout}
          onAddBDO={(n, c, p, a) => persistenceService.addOfficerAPI({ id: c, name: n, password: p, avatar: a })}
          onDeleteBDO={(id) => persistenceService.deleteOfficerAPI(id)}
          onAssignTask={(id, title) => persistenceService.assignTaskAPI(id, { id: Date.now().toString(), title, status: 'Pending', createdAt: new Date() })}
          onSendMessage={() => {}}
          wsStatus={wsStatus}
          systemMode={systemMode}
          onToggleSystemMode={toggleSystemMode}
        />
      ) : (
        currentOfficer && (
          <BDOView 
            user={user} 
            officer={currentOfficer}
            messages={[]}
            onLogout={handleLogout}
            onSendMessage={() => {}}
            onReportIncident={() => {}}
            wsStatus={wsStatus}
            isOnline={isOnline}
          />
        )
      )}
    </div>
  );
};

export default App;
