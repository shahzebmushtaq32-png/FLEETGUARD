
import React, { useState, useEffect } from 'react';
import { SalesOfficer, User, UserRole, Geofence, Message, SystemStats, SalesLead, DeploymentTask, Incident } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import { BDOView } from './components/BDOView';
import { persistenceService } from './services/persistenceService';
import { socketService } from './services/socketService';

const MOCK_OFFICER_LEADS: SalesLead[] = [
  { id: 'LD-1', clientName: 'SM Hypermarket Makati', value: 5000000, stage: 'Closing', probability: 0.9, qrStatus: 'Active', currentMonthVolume: 2450000, lastTxDate: new Date(), reports: [] },
  { id: 'LD-2', clientName: 'Mercury Drug Ayala', value: 2000000, stage: 'Meeting', probability: 0.7, qrStatus: 'Onboarded_Inactive', currentMonthVolume: 0, lastTxDate: undefined, reports: [] },
  { id: 'LD-3', clientName: 'Puregold Qi Central', value: 1500000, stage: 'Proposal', probability: 0.5, qrStatus: 'Prospect', currentMonthVolume: 0, lastTxDate: undefined, reports: [] },
];

const INITIAL_OFFICER_TEMPLATE: SalesOfficer = { 
    id: 'n1',
    name: 'James Wilson',
    password: '12345', 
    lat: 14.5547, lng: 121.0244, 
    battery: 85, signalStrength: 92, networkType: '5G',
    status: 'Active', lastUpdate: new Date(), 
    role: 'Senior BDO', 
    leads: MOCK_OFFICER_LEADS, 
    history: [], 
    pipelineValue: 4500000, 
    visitCount: 12, 
    quotaProgress: 78,
    qrOnboarded: 45,
    qrActivated: 38,
    qrVolume: 12500000,
    evidence: [],
    tasks: [],
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?ixlib=rb-1.2.1&auto=format&fit=crop&w=150&q=80'
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [officers, setOfficers] = useState<SalesOfficer[]>([]);
  const [wsStatus, setWsStatus] = useState<string>('Disconnected');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isWithinShift, setIsWithinShift] = useState(true);

  // --- UPDATED TRIAL PROTECTION: Mon-Fri, 11:00 AM to 6:00 PM ---
  useEffect(() => {
    const checkShift = () => {
        const now = new Date();
        const hour = now.getHours();
        const day = now.getDay();
        
        // Monday (1) to Friday (5)
        const isWeekday = day >= 1 && day <= 5;
        // 11:00 AM (11) to 6:00 PM (18)
        const inTimeWindow = hour >= 11 && hour < 18;
        
        setIsWithinShift(isWeekday && inTimeWindow);
    };

    checkShift();
    const interval = setInterval(checkShift, 30000); // Check every 30 seconds for precision
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (user && isWithinShift) {
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
    localStorage.removeItem('bdo_user_session');
    socketService.disconnect();
  };

  const handleAddBDO = async (name: string, code: string, password: string, avatar: string) => {
    const newBdo: SalesOfficer = {
      ...INITIAL_OFFICER_TEMPLATE,
      id: code,
      name,
      password,
      status: 'Offline',
      avatar: avatar || undefined
    };
    setOfficers(prev => [...prev, newBdo]);
    await persistenceService.addOfficerAPI(newBdo);
  };

  const handleDeleteBDO = async (id: string) => {
    setOfficers(prev => prev.filter(o => o.id !== id));
    await persistenceService.deleteOfficerAPI(id);
  };

  const handleAssignTask = async (officerId: string, taskTitle: string) => {
      const newTask: DeploymentTask = {
          id: `TASK-${Date.now()}`,
          title: taskTitle,
          description: 'Priority directive from HQ',
          status: 'Pending',
          createdAt: new Date()
      };
      
      setOfficers(prev => prev.map(o => {
          if (o.id === officerId) {
              return { ...o, tasks: [newTask, ...o.tasks] };
          }
          return o;
      }));

      await persistenceService.assignTaskAPI(officerId, newTask);
      
      socketService.sendChat({
          id: Date.now().toString(),
          text: `New Directive: ${taskTitle}`,
          senderId: 'ADM-ROOT',
          senderName: 'HQ',
          isFromAdmin: true,
          isDirective: true,
          timestamp: new Date(),
          isEncrypted: false
      });
  };

  const stats: SystemStats = {
    totalPipeline: officers.reduce((acc, o) => acc + o.pipelineValue, 0),
    activeMeetings: officers.filter(o => o.status === 'Meeting').length,
    dailyVisits: officers.reduce((acc, o) => acc + o.visitCount, 0),
    teamPerformance: 85,
    onlineCount: officers.filter(o => o.status !== 'Offline').length,
    criticalBattery: officers.filter(o => o.battery < 20).length,
    saturationLevel: 45,
    totalQrVolume: officers.reduce((acc, o) => acc + o.qrVolume, 0),
    totalOnboarded: officers.reduce((acc, o) => acc + o.qrOnboarded, 0)
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
                  <p className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                      The cluster is currently hibernating to preserve free trial credits. Weekends are inactive.
                  </p>
              </div>
              <div className="mt-12 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-slate-700"></div>
                  <span className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">Load Balancer: Idle</span>
              </div>
          </div>
      );
  }

  if (!user) return <Login onLogin={handleLogin} />;

  const currentOfficer = officers.find(o => o.id === user.assignedOfficerId) || officers[0];

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
          onAddBDO={handleAddBDO}
          onDeleteBDO={handleDeleteBDO}
          onAssignTask={handleAssignTask}
          onSendMessage={() => {}}
          wsStatus={wsStatus}
        />
      ) : (
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
      )}
    </div>
  );
};

export default App;
