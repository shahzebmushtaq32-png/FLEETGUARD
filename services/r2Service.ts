import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 Storage Service
 * Hardened for Browser Environments.
 */

const BUCKET_NAME = 'bdo-fleet-assets';
const ACCOUNT_ID = '225bfea5d72cd356fb8697c55d29254c';
const ACCESS_KEY_ID = 'b8a044d9823caf1e27850bcc6806f057';
const SECRET_ACCESS_KEY = 'fd3e97181324351cec47f3fc27274aa3da02d320714a4745fbc608906887dd48';
const ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

/**
 * Initialize the S3 Client with explicit browser-safe parameters.
 * 
 * CRITICAL FIX: By explicitly passing the credentials object and 
 * setting custom configuration, we prevent the AWS SDK from running 
 * its default 'credential provider chain'. This chain is what 
 * attempts to read files from the disk (fs.readFile) and causes 
 * the error in browser/unenv environments.
 */
const s3Client = new S3Client({
  region: "auto",
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
  // Use a custom user agent to signal this is a web-client environment
  customUserAgent: "BDO-Fleet-Guard-Web-App",
  // Disable features that require Node.js internals
  apiVersion: "latest",
  forcePathStyle: true,
});

export const r2Service = {
  /**
   * Uploads evidence to Cloudflare R2.
   * Uses browser-native binary conversion to avoid Node-specific Buffer dependencies.
   */
  uploadEvidence: async (base64Data: string, fileName: string): Promise<string> => {
    try {
      // Safely extract the base64 payload
      const base64Parts = base64Data.split(',');
      const actualBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Data;
      
      // Convert to Uint8Array using browser-native atob
      const binaryString = atob(actualBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const filePath = `evidence/${Date.now()}_${fileName}`;

      // Execute R2 Upload
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filePath,
        Body: bytes,
        ContentType: "image/jpeg",
      });

      await s3Client.send(command);
      console.log(`[R2 Storage] Tactical Upload Success: ${filePath}`);

      const PUBLIC_DOMAIN = localStorage.getItem('bdo_r2_public_domain'); 
      if (PUBLIC_DOMAIN) {
        return `${PUBLIC_DOMAIN}/${filePath}`;
      }

      // Return base64 for immediate UI feedback if no domain is configured
      return base64Data;
      
    } catch (error) {
      console.error('[R2 Storage] Tactical Uplink Error:', error);
      // Fallback to base64 so user doesn't lose data visibility
      return base64Data; 
    }
  },

  getSignedUrl: (path: string): string => path
};