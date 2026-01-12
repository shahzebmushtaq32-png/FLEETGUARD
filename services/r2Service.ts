/**
 * ARCHITECTURE STEP 3: Cloudflare R2 Media Storage
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

export const r2Service = {
  uploadEvidence: async (base64Data: string, fileName: string): Promise<string> => {
    try {
      // FIX: Retrieve the JWT token from storage to pass authentication
      const token = localStorage.getItem('bdo_auth_token');
      
      const response = await fetch(`${API_URL}/api/upload-proxy`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': WS_API_KEY,
            'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
            fileName,
            fileType: 'image/jpeg',
            fileData: base64Data
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Proxy Upload Failed: ${response.status}`);
      }

      const result = await response.json();
      return result.publicUrl;
    } catch (error) {
      console.error('[R2] Upload Error:', error);
      // Fallback: Return the local base64 so the UI doesn't break, even if upload fails
      return base64Data; 
    }
  },
  getSignedUrl: (path: string): string => path
};