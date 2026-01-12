
import React, { useState, useEffect } from 'react';
import { SalesOfficer, User, UserRole, Geofence, Message, SystemStats, SalesLead, DeploymentTask } from './types';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import { BDOView } from './components/BDOView';
import { persistenceService } from './services/persistenceService';
import { socketService } from './services/socketService';

const MOCK_OFFICER_LEADS: SalesLead[] = [
  { id: 'LD-1', clientName: 'SM Hypermarket Makati', value: 5000000, stage: 'Closing', probability: 0.9, qrStatus: 'Active', currentMonthVolume: 2450000, lastTxDate: new Date(), reports: [] },
  { id: 'LD-2', clientName: 'Mercury Drug Ayala', value: 2000000, stage: 'Meeting', probability: 0.7, qrStatus: 'Onboarded_Inactive', currentMonthVolume: 0, lastTxDate: undefined, reports: [] },
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
  const [officers, setOfficers] = useState<SalesOfficer[]>([]); // Empty initial state, waiting for DB
  const [messages, setMessages] = useState<Message[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [wsStatus, setWsStatus] = useState<string>('Disconnected');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // 1. Initial Load: Fetch from DB
  useEffect(() => {
    const loadOfficers = async () => {
        const data = await persistenceService.fetchOfficersAPI();
        if (data && data.length > 0) {
            setOfficers(data);
        } else {
            // If DB is empty, use mock for demo
            setOfficers([INITIAL_OFFICER_TEMPLATE]);
        }
    };
    loadOfficers();
  }, []);

  // Native App Feature: Offline Detection & Sync
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      persistenceService.processSyncQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.onLine) {
        persistenceService.processSyncQueue();
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Native App Feature: Session Restore (JWT)
  useEffect(() => {
    const session = localStorage.getItem('bdo_user_session');
    const token = localStorage.getItem('bdo_auth_token');
    
    if (session && token) {
      try {
        const parsed = JSON.parse(session);
        if (parsed.expiresAt > Date.now()) {
            setUser({
                id: parsed.role === 'Admin' ? 'ADM-ROOT' : parsed.officerId,
                username: parsed.username,
                role: parsed.role,
                assignedOfficerId: parsed.officerId
            });
        } else {
            localStorage.removeItem('bdo_user_session');
            localStorage.removeItem('bdo_auth_token');
        }
      } catch (e) {
        console.error("Session restore failed", e);
      }
    }
  }, []);

  // Secure Connection Logic: Only connect when authenticated
  useEffect(() => {
    if (user) {
      const role = user.role === 'Admin' ? 'dashboard' : 'iot';
      socketService.connect(role, (status) => setWsStatus(status));
      
      socketService.onDeviceUpdate((updates) => {
        setOfficers(prev => prev.map(off => {
          const update = updates.find(u => u.id === off.id);
          if (update) return { ...off, ...update, lastUpdate: new Date() };
          return off;
        }));
      });

      // Handle Roster Updates (When new BDO is added by another admin)
      socketService.onRosterUpdate((newOfficer) => {
          // Check if already exists
          setOfficers(prev => {
              if (prev.find(o => o.id === newOfficer.id)) return prev;
              const fullOfficer: SalesOfficer = {
                  ...INITIAL_OFFICER_TEMPLATE, // Use template defaults
                  ...newOfficer,
                  leads: [],
                  history: []
              };
              return [...prev, fullOfficer];
          });
      });
    }

    return () => {
      if (!user) socketService.disconnect();
    }
  }, [user]);

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
    localStorage.removeItem('bdo_auth_token');
    socketService.disconnect();
  };

  const handleAddBDO = async (name: string, code: string, password: string, avatar: string) => {
    // Prevent duplicate codes locally
    if (officers.find(o => o.id === code)) {
      alert("Error: BDO Code already exists!");
      return;
    }

    const newBdo: SalesOfficer = {
      id: code,
      name,
      password,
      lat: 14.5547, lng: 121.0244,
      battery: 100, signalStrength: 100, networkType: '5G',
      status: 'Offline', lastUpdate: new Date(),
      role: 'Account Executive',
      leads: [], history: [],
      pipelineValue: 0, visitCount: 0, quotaProgress: 0,
      qrOnboarded: 0, qrActivated: 0, qrVolume: 0,
      evidence: [], tasks: [],
      avatar: avatar || undefined
    };
    
    // Optimistic Update
    const updatedList = [...officers, newBdo];
    setOfficers(updatedList);
    
    // Save to DB
    await persistenceService.addOfficerAPI(newBdo);
    
    // Save to Cache
    persistenceService.saveOfficers(updatedList);
    persistenceService.saveToCloudR2(updatedList);
  };

  const handleDeleteBDO = async (id: string) => {
    const updated = officers.filter(o => o.id !== id);
    setOfficers(updated);
    // Delete from DB
    await persistenceService.deleteOfficerAPI(id);
    persistenceService.saveOfficers(updated);
  };

  const handleAssignTask = (officerId: string, taskTitle: string) => {
    setOfficers(prev => prev.map(off => {
      if (off.id === officerId) {
        const newTask: DeploymentTask = {
          id: `TASK-${Date.now()}`,
          title: taskTitle,
          description: "New Job assigned by Admin",
          status: 'Pending',
          createdAt: new Date()
        };
        return { ...off, tasks: [...off.tasks, newTask] };
      }
      return off;
    }));
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

  if (!user) return <Login onLogin={handleLogin} />;

  // Safely find the current officer or fallback
  const currentOfficer = officers.find(o => o.id === user.assignedOfficerId) || officers[0];

  // Prevent rendering BDOView if data isn't ready
  if (user.role === 'BDO' && !currentOfficer) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 gap-4">
           <div className="w-10 h-10 border-4 border-[#003366] border-t-transparent rounded-full animate-spin"></div>
           <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Initializing Fleet Data...</p>
        </div>
      );
  }

  return (
    <div className="h-screen w-full bg-slate-50 overflow-hidden">
      {user.role === 'Admin' ? (
        <AdminDashboard 
          user={user} 
          officers={officers} 
          geofences={geofences}
          stats={stats}
          messages={messages}
          onLogout={handleLogout}
          onAddBDO={handleAddBDO}
          onDeleteBDO={handleDeleteBDO}
          onAssignTask={handleAssignTask}
          onSendMessage={(t, d) => setMessages(p => [...p, { id: Date.now().toString(), text: t, isDirective: d, senderId: user.id, senderName: 'Admin', timestamp: new Date(), isEncrypted: false, isFromAdmin: true }])}
          wsStatus={wsStatus}
        />
      ) : (
        <BDOView 
          user={user} 
          officer={currentOfficer}
          messages={messages}
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
