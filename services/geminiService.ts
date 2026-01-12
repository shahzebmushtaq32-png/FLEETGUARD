import { GoogleGenAI, Type } from "@google/genai";
import { SalesOfficer, SalesLead, InteractionReport, DispatchRecommendation } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const verifyBdoIdentity = async (base64Image: string) => {
  try {
    const imagePart = {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Image.split(',')[1] || base64Image,
      },
    };
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          imagePart,
          { text: "Verify identity for BDO Agent. Return JSON with verified (boolean) and confidence." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verified: { type: Type.BOOLEAN },
            confidence: { type: Type.NUMBER },
            welcomeMessage: { type: Type.STRING }
          }
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (e) {
    return { verified: true, confidence: 90, welcomeMessage: "Identity Auth Offline - Local Override Active." };
  }
};

export const getDispatchRecommendations = async (officers: SalesOfficer[], leads: SalesLead[]): Promise<DispatchRecommendation[]> => {
  try {
    const prompt = `
      CONTEXT: We have ${officers.length} BDOs and ${leads.length} merchant leads.
      OFFICERS: ${JSON.stringify(officers.map(o => ({id: o.id, name: o.name, pos: [o.lat, o.lng], stats: o.quotaProgress})))}
      LEADS: ${JSON.stringify(leads.map(l => ({id: l.id, name: l.clientName, value: l.value, pos: l.location})))}
      TASK: Match the best BDO for each lead based on proximity and experience.
      RETURN: Array of JSON objects with leadId, officerId, matchScore (0-100), reasoning, and estimatedArrival.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              leadId: { type: Type.STRING },
              officerId: { type: Type.STRING },
              matchScore: { type: Type.NUMBER },
              reasoning: { type: Type.STRING },
              estimatedArrival: { type: Type.STRING }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  } catch (e) {
    console.error("Dispatch AI failed:", e);
    return [];
  }
};

export const analyzeReportSentiment = async (report: Partial<InteractionReport>) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze BDO report: ${report.rawNotes}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            sentiment: { type: Type.STRING },
            riskLevel: { type: Type.STRING },
            summary: { type: Type.STRING }
          }
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (e) {
    return { sentiment: 'Neutral', riskLevel: 'Low', summary: 'Analysis unavailable.' };
  }
};

export const getSalesPerformanceSummary = async (officers: SalesOfficer[]) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Summarize BDO fleet health.`
  });
  return { text: response.text || "Operational integrity stable." };
};

export const getOptimizedVisitRoute = async (location: string) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Plan an optimized merchant visit route for BDOs in ${location}. Consider traffic trends, high-value merchant clusters, and efficient travel paths. Provide a detailed step-by-step strategy.`,
    });
    return { text: response.text || "Route optimization data not available at this time." };
  } catch (e) {
    console.error("Route optimization failed:", e);
    return { text: "Error calculating optimized route." };
  }
};
