// @google/genai removed as per requirements.
// This service now returns mock/fallback data to keep the application stable.

export const verifyBdoIdentity = async (base64Image: string) => {
  console.log("Mock Identity Verification for:", base64Image.substring(0, 20) + "...");
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  return { 
    verified: true, 
    confidence: 0.99, 
    welcomeMessage: "Identity Verified (Mock Mode)" 
  };
};

export const getDispatchRecommendations = async (officers: any[], leads: any[]) => {
  console.log("Mock Dispatch Calculation");
  return [];
};

export const analyzeReportSentiment = async (report: any) => {
  return { 
    sentiment: 'Positive', 
    riskLevel: 'Low', 
    summary: 'Report analysis disabled (Mock Mode)' 
  };
};

export const getSalesPerformanceSummary = async (officers: any[]) => {
  return { text: "AI Analysis Module is currently disabled." };
};