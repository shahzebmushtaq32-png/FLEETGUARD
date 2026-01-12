import { LatLng } from "../types";

/**
 * ARCHITECTURE STEP 5: Historical Data Retrieval
 */

const FALLBACK_API_KEY = "BDO_SECURE_NODE_99122";
const FALLBACK_API_URL = "https://fleetguard-hrwf.onrender.com";

const WS_API_KEY = (typeof process !== 'undefined' && process.env && process.env.WS_API_KEY) 
  ? process.env.WS_API_KEY 
  : FALLBACK_API_KEY;

const getApiUrl = () => {
    let envUrl = '';
    if (typeof process !== 'undefined' && process.env && process.env.VITE_RENDER_WS_URL) {
        envUrl = process.env.VITE_RENDER_WS_URL;
    }
    if (!envUrl) return FALLBACK_API_URL;
    let finalUrl = envUrl;
    if (!finalUrl.startsWith('http')) finalUrl = `https://${finalUrl}`;
    return finalUrl.replace('wss://', 'https://');
};

const API_URL = getApiUrl();

export const historyService = {
  getOfficerRoute: async (officerId: string): Promise<LatLng[]> => {
    try {
      const response = await fetch(`${API_URL}/api/history/${officerId}`, {
        headers: {
          'x-api-key': WS_API_KEY,
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error(`API Error`);
      const historyData = await response.json();
      return historyData.map((point: any) => ({
        lat: parseFloat(point.lat),
        lng: parseFloat(point.lng)
      }));
    } catch (error) {
      console.warn("[History] Failed to fetch route:", error);
      return [];
    }
  }
};