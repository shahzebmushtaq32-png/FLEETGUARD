
export type UserRole = 'Admin' | 'BDO';
export type VerificationStatus = 'Pending' | 'Verified' | 'Flagged' | 'Rejected';
export type ReportRiskLevel = 'Low' | 'Medium' | 'High';
export type MerchantQrStatus = 'Prospect' | 'Onboarded_Inactive' | 'Active' | 'Power_User';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Incident {
  id: string;
  title: string;
  desc: string;
  time: Date;
  severity: 'critical' | 'warning' | 'info';
}

export interface EvidenceAsset {
  id: string;
  type: string;
  url: string;
  timestamp: Date;
  location: LatLng;
  status: VerificationStatus;
  aiNotes?: string;
  officerId?: string;
}

export interface InteractionReport {
  id: string;
  leadId: string;
  officerId: string;
  rawNotes: string;
  expandedContent: string;
  riskLevel: ReportRiskLevel;
  sentiment: string;
  timestamp: Date;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected';
  evidenceUrl?: string;
}

export interface DeploymentTask {
  id: string;
  title: string;
  description: string;
  status: 'Pending' | 'Completed';
  createdAt: Date;
}

export interface SalesLead {
  id: string;
  clientName: string;
  value: number; 
  stage: 'Prospecting' | 'Meeting' | 'Proposal' | 'Closing';
  probability: number;
  location?: LatLng;
  reports: InteractionReport[];
  qrStatus: MerchantQrStatus;
  lastTxDate?: Date;
  currentMonthVolume: number;
  onboardingDate?: Date;
}

export interface SalesOfficer {
  id: string;
  name: string;
  password?: string; // Added for auth simulation
  lat: number;
  lng: number;
  battery: number;
  signalStrength: number;
  networkType: '5G' | '4G' | 'LTE' | 'Offline';
  status: 'Active' | 'Meeting' | 'Break' | 'Offline' | 'On Duty';
  lastUpdate: Date;
  role: 'Senior BDO' | 'Account Executive' | 'Lead Gen';
  leads: SalesLead[];
  history: LatLng[];
  pipelineValue: number;
  visitCount: number;
  quotaProgress: number; 
  qrOnboarded: number;   
  qrActivated: number;   
  qrVolume: number;      
  avatar?: string; 
  evidence: EvidenceAsset[];
  tasks: DeploymentTask[];
  // NEW FIELDS FOR NATIVE APP SUPPORT
  // Fix: Extended telemetrySource to include 'NEW_DB' and 'SUPER_DB' for data source tracking.
  telemetrySource?: 'WEB' | 'ANDROID_BG' | 'ANDROID_FG' | 'NEW_DB' | 'SUPER_DB'; 
  appVersion?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Date;
  isEncrypted: boolean;
  isFromAdmin: boolean;
  isDirective?: boolean;
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  assignedOfficerId?: string;
}

export interface Geofence {
  id: string;
  lat: number;
  lng: number;
  radius: number;
  label: string;
  targetOfficerId?: string;
}

export interface DispatchRecommendation {
  leadId: string;
  officerId: string;
  matchScore: number;
  reasoning: string;
  estimatedArrival: string;
}

export interface SystemStats {
  totalPipeline: number;
  activeMeetings: number;
  dailyVisits: number;
  teamPerformance: number;
  onlineCount: number;
  criticalBattery: number;
  saturationLevel: number;
  totalQrVolume: number;
  totalOnboarded: number;
}
