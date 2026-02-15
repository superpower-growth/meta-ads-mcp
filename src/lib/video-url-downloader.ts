import axios from 'axios';
import { Readable } from 'stream';

export type UrlType = 'google-drive' | 'dropbox' | 'direct';

export interface DownloadResult {
  stream: Readable;
  contentType: string;
  fileName?: string;
}

/**
 * Detect the type of URL
 */
export function detectUrlType(url: string): UrlType {
  if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
    return 'google-drive';
  }
  if (url.includes('dropbox.com') || url.includes('dl.dropboxusercontent.com')) {
    return 'dropbox';
  }
  return 'direct';
}

/**
 * Extract Google Drive file ID from various URL formats
 */
function extractDriveFileId(url: string): string {
  // Format: https://drive.google.com/file/d/FILE_ID/view
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  // Format: https://drive.google.com/open?id=FILE_ID
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  throw new Error(`Cannot extract file ID from Google Drive URL: ${url}`);
}

/**
 * Convert Dropbox URL to direct download
 */
function convertDropboxUrl(url: string): string {
  // Replace dl=0 with dl=1 or add dl=1
  let directUrl = url.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
  if (directUrl.includes('dl=0')) {
    directUrl = directUrl.replace('dl=0', 'dl=1');
  } else if (!directUrl.includes('dl=1')) {
    directUrl += (directUrl.includes('?') ? '&' : '?') + 'dl=1';
  }
  return directUrl;
}

/**
 * Download video from any supported URL type
 */
export async function downloadFromUrl(url: string): Promise<DownloadResult> {
  const urlType = detectUrlType(url);

  switch (urlType) {
    case 'google-drive': {
      const fileId = extractDriveFileId(url);
      // Use Google Drive direct download URL
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const response = await axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
        timeout: 120000,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'meta-ads-mcp/1.0',
        },
      });
      return {
        stream: response.data,
        contentType: response.headers['content-type'] || 'video/mp4',
        fileName: `drive_${fileId}.mp4`,
      };
    }

    case 'dropbox': {
      const directUrl = convertDropboxUrl(url);
      const response = await axios({
        method: 'GET',
        url: directUrl,
        responseType: 'stream',
        timeout: 120000,
        maxRedirects: 5,
      });
      return {
        stream: response.data,
        contentType: response.headers['content-type'] || 'video/mp4',
      };
    }

    case 'direct': {
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 120000,
        maxContentLength: 500 * 1024 * 1024, // 500MB
      });
      return {
        stream: response.data,
        contentType: response.headers['content-type'] || 'video/mp4',
      };
    }
  }
}
