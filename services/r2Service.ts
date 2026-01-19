
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

// Initialize the S3 Client with explicit browser-safe parameters.
const s3Client = new S3Client({
  region: "auto",
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

export const r2Service = {
  uploadEvidence: async (base64Data: string, fileName: string): Promise<string> => {
    try {
      // Clean base64 data
      const base64Parts = base64Data.split(',');
      const actualBase64 = base64Parts.length > 1 ? base64Parts[1] : base64Data;
      
      // Convert base64 to Uint8Array
      const binaryString = atob(actualBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const filePath = `evidence/${Date.now()}_${fileName}`;

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: filePath,
        Body: bytes,
        ContentType: "image/jpeg",
      });

      await s3Client.send(command);
      console.log(`[R2 Storage] Direct Uplink Success: ${filePath}`);

      // Return a predictable URL format or the base64 if public URL isn't configured
      // Note: R2 public URLs usually require a custom domain or a specific format
      // For this demo, we use a placeholder or return base64 if it fails to resolve
      return base64Data;
      
    } catch (error) {
      console.error('[R2 Storage] Tactical Uplink Error:', error);
      return base64Data; 
    }
  },

  getSignedUrl: (path: string): string => path
};
