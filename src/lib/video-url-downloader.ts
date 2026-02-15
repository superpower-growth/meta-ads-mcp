import axios from 'axios';
import { Readable } from 'stream';
import { GoogleAuth } from 'google-auth-library';
import { env } from '../config/env.js';

export type UrlType = 'google-drive-folder' | 'google-drive' | 'dropbox' | 'direct';

export interface DownloadResult {
  stream: Readable;
  contentType: string;
  fileName?: string;
}

/**
 * Detect the type of URL
 */
export function detectUrlType(url: string): UrlType {
  if (url.includes('drive.google.com/drive/folders/')) {
    return 'google-drive-folder';
  }
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
 * Extract Google Drive folder ID from URL
 */
function extractDriveFolderId(url: string): string {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  throw new Error(`Cannot extract folder ID from Google Drive URL: ${url}`);
}

const VIDEO_MIME_TYPES = new Set([
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
  'video/x-matroska', 'video/mpeg', 'video/3gpp', 'video/x-m4v',
]);

/**
 * List video files in a Google Drive folder using service account credentials
 */
async function listDriveFolderVideos(folderId: string): Promise<{ id: string; name: string; mimeType: string }[]> {
  const saJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON required to access Google Drive folders');
  }

  const credentials = JSON.parse(saJson);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const query = `'${folderId}' in parents and trashed = false`;
  const response = await axios.get('https://www.googleapis.com/drive/v3/files', {
    params: {
      q: query,
      fields: 'files(id,name,mimeType,size)',
      pageSize: 100,
      orderBy: 'createdTime desc',
    },
    headers: {
      Authorization: `Bearer ${typeof token === 'string' ? token : token.token}`,
    },
  });

  const files = response.data.files || [];
  return files.filter((f: any) => VIDEO_MIME_TYPES.has(f.mimeType));
}

/**
 * Download a file from Google Drive using service account credentials
 */
async function downloadDriveFile(fileId: string): Promise<DownloadResult> {
  const saJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON required to download from Google Drive');
  }

  const credentials = JSON.parse(saJson);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const response = await axios({
    method: 'GET',
    url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    responseType: 'stream',
    timeout: 120000,
    headers: {
      Authorization: `Bearer ${typeof token === 'string' ? token : token.token}`,
    },
  });

  return {
    stream: response.data,
    contentType: response.headers['content-type'] || 'video/mp4',
    fileName: `drive_${fileId}.mp4`,
  };
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
    case 'google-drive-folder': {
      const folderId = extractDriveFolderId(url);
      console.log(`[video-downloader] Listing videos in Drive folder: ${folderId}`);
      const videos = await listDriveFolderVideos(folderId);
      if (videos.length === 0) {
        throw new Error(`No video files found in Google Drive folder: ${url}`);
      }
      const video = videos[0];
      console.log(`[video-downloader] Found ${videos.length} video(s), using: "${video.name}" (${video.mimeType})`);
      return downloadDriveFile(video.id);
    }

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
