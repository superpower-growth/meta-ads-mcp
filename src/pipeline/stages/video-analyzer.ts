/**
 * Video Analyzer Pipeline Stage
 *
 * Takes an asset link (Google Drive folder or direct file URL), downloads the video,
 * uploads it to GCS, and analyzes it with Gemini. Results are cached in Firestore
 * to avoid redundant analysis of the same video.
 */

import {
  detectUrlType,
  extractDriveFolderId,
  listDriveFolderFiles,
  downloadDriveFile,
  downloadFromUrl,
  type DriveFileInfo,
} from '../../lib/video-url-downloader.js';
import { uploadVideo } from '../../lib/gcs-storage.js';
import { analyzeVideo, type VideoAnalysis } from '../../lib/gemini-analyzer.js';
import { getCached, setCached } from '../../lib/firestore-cache.js';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.webm', '.mkv', '.mpeg', '.3gp', '.m4v']);
const VIDEO_MIME_PREFIXES = ['video/'];

/**
 * Determine whether a Drive file is a video based on its mimeType or file extension.
 */
function isVideoFile(file: DriveFileInfo): boolean {
  if (VIDEO_MIME_PREFIXES.some((prefix) => file.mimeType.startsWith(prefix))) {
    return true;
  }
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

/**
 * Analyze a video from a Google Drive asset link.
 *
 * Workflow:
 * 1. Detect whether the link is a folder or a direct file.
 * 2. For folders: list files, find the first video, and download it.
 *    For direct links: download the file directly.
 * 3. Upload the video stream to GCS.
 * 4. Check Firestore cache for an existing analysis.
 * 5. If not cached, run Gemini analysis and cache the result.
 * 6. Return the GCS path, analysis, and cache status.
 *
 * @param assetLink - Google Drive folder URL or direct file URL
 * @param jobId - Unique job identifier used for GCS path and cache key
 * @returns GCS path, video analysis result, and whether the result was cached
 */
export async function analyzeVideoFromAssetLink(
  assetLink: string,
  jobId: string
): Promise<{ gcsPath: string; videoAnalysis: VideoAnalysis; cached: boolean }> {
  const urlType = detectUrlType(assetLink);

  let downloadResult;
  let videoFileName: string;

  if (urlType === 'google-drive-folder') {
    // --- Folder link: list files and find the first video ---
    const folderId = extractDriveFolderId(assetLink);
    console.log(`[video-analyzer] Listing files in Drive folder: ${folderId}`);

    const files = await listDriveFolderFiles(folderId);
    const videoFiles = files.filter(isVideoFile);

    if (videoFiles.length === 0) {
      throw new Error(
        `No video files found in Google Drive folder: ${assetLink}. ` +
        `Found ${files.length} file(s) but none matched video types. ` +
        `Supported formats: ${[...VIDEO_EXTENSIONS].join(', ')}`
      );
    }

    const video = videoFiles[0];
    console.log(
      `[video-analyzer] Found ${videoFiles.length} video(s), using: "${video.name}" (${video.mimeType})`
    );

    videoFileName = video.name;
    downloadResult = await downloadDriveFile(video.id);
  } else {
    // --- Direct file link (Drive file, Dropbox, or raw URL) ---
    console.log(`[video-analyzer] Downloading video from direct link: ${assetLink}`);
    downloadResult = await downloadFromUrl(assetLink);
    videoFileName = downloadResult.fileName || `video_${jobId}.mp4`;
  }

  // --- Upload to GCS ---
  console.log(`[video-analyzer] Uploading "${videoFileName}" to GCS...`);
  const gcsPath = await uploadVideo(downloadResult.stream, jobId, videoFileName, {
    contentType: downloadResult.contentType,
    metadata: { sourceUrl: assetLink },
  });
  console.log(`[video-analyzer] Uploaded to GCS: ${gcsPath}`);

  // --- Check Firestore cache ---
  const cacheKey = gcsPath;
  const cached = await getCached(cacheKey);

  if (cached) {
    console.log(`[video-analyzer] Cache hit for ${cacheKey}`);
    return {
      gcsPath,
      videoAnalysis: cached.analysisResults as VideoAnalysis,
      cached: true,
    };
  }

  // --- Analyze with Gemini ---
  console.log(`[video-analyzer] Cache miss — running Gemini analysis on ${gcsPath}`);
  const videoAnalysis = await analyzeVideo(gcsPath);

  // --- Cache the result ---
  await setCached({
    videoId: cacheKey,
    adId: jobId,
    analysisResults: videoAnalysis,
    gcsPath,
  });

  return {
    gcsPath,
    videoAnalysis,
    cached: false,
  };
}
