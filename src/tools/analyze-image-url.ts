import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  downloadFromUrl,
  detectUrlType,
  extractDriveFolderId,
  listDriveFolderImages,
  downloadDriveFile,
} from '../lib/video-url-downloader.js';
import { uploadVideo, isGcpEnabled } from '../lib/gcs-storage.js';
import { geminiClient, isGeminiEnabled, geminiConfig } from '../lib/gemini-client.js';

const AnalyzeImageUrlSchema = z.object({
  imageUrl: z.string().url().describe('Image URL or Google Drive folder URL containing images'),
  title: z.string().optional().describe('Optional title for the image'),
});

const ImageAnalysisSchema = z.object({
  visualElements: z.array(z.string()),
  textOverlays: z.array(z.object({
    text: z.string(),
    purpose: z.enum(['headline', 'subheading', 'cta', 'disclaimer', 'pricing', 'other']),
  })),
  emotionalTone: z.string(),
  creativeApproach: z.string(),
  colorPalette: z.array(z.string()),
  targetAudienceIndicators: z.array(z.string()),
  keyMessages: z.array(z.string()),
  layoutType: z.string(),
});

export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;

const geminiImageAnalysisSchema = {
  type: 'object',
  properties: {
    visualElements: { type: 'array', items: { type: 'string' } },
    textOverlays: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          purpose: { type: 'string', enum: ['headline', 'subheading', 'cta', 'disclaimer', 'pricing', 'other'] },
        },
        required: ['text', 'purpose'],
      },
    },
    emotionalTone: { type: 'string' },
    creativeApproach: { type: 'string' },
    colorPalette: { type: 'array', items: { type: 'string' } },
    targetAudienceIndicators: { type: 'array', items: { type: 'string' } },
    keyMessages: { type: 'array', items: { type: 'string' } },
    layoutType: { type: 'string' },
  },
  required: ['visualElements', 'textOverlays', 'emotionalTone', 'creativeApproach', 'colorPalette', 'targetAudienceIndicators', 'keyMessages', 'layoutType'],
};

const IMAGE_ANALYSIS_PROMPT = `Analyze this ad creative image for the purpose of writing Meta ad copy.

VISUAL ELEMENTS:
- List all key visual elements (people, products, backgrounds, props, icons)
- Note the composition and layout style (single image, split, grid, before/after, etc.)

TEXT OVERLAYS:
- Extract ALL text visible in the image with exact wording
- Classify each text element's purpose (headline, subheading, CTA, disclaimer, pricing, other)

CREATIVE & EMOTIONAL ANALYSIS:
- Overall emotional tone (aspirational, humorous, urgent, educational, luxurious, etc.)
- Creative approach (problem-solution, testimonial, lifestyle, product showcase, comparison, social proof, etc.)
- Dominant color palette (list 3-5 main colors)
- Target audience indicators (demographics, interests, pain points suggested by the creative)
- Key marketing messages and value propositions conveyed

LAYOUT:
- Describe the layout type (e.g., "hero image with text overlay", "product grid", "before/after split", "UGC-style", "minimal product on solid background")

Format your response as structured JSON matching the schema provided.`;

async function analyzeImageBuffer(
  imageBuffer: Buffer,
  mimeType: string,
  sourceUrl: string,
  urlType: string,
  title: string,
): Promise<{ gcsPath: string; analysis: ImageAnalysis }> {
  const imageId = `img_${Date.now()}`;
  const adId = 'url-upload';

  // Upload to GCS for archival
  const { Readable } = await import('stream');
  const gcsStream = Readable.from(imageBuffer);
  const gcsPath = await uploadVideo(gcsStream, adId, imageId, {
    contentType: mimeType,
    metadata: {
      sourceUrl,
      urlType,
      title,
      mediaType: 'image',
    },
  });

  console.log(`[analyze-image-url] Image uploaded to GCS: ${gcsPath}`);

  // Analyze with Gemini using inline image data
  const response = await geminiClient!.models.generateContent({
    model: geminiConfig.model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBuffer.toString('base64'),
            },
          },
          {
            text: IMAGE_ANALYSIS_PROMPT,
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: geminiImageAnalysisSchema,
    },
  });

  const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText) {
    throw new Error('No response text from Gemini API');
  }

  let cleaned = responseText.trim();
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n');
    cleaned = lines.slice(1, -1).join('\n');
    if (cleaned.startsWith('json')) {
      cleaned = cleaned.substring(4).trim();
    }
  }

  const parsed = JSON.parse(cleaned);
  const analysis = ImageAnalysisSchema.parse(parsed);

  console.log(`[analyze-image-url] Analysis complete: ${analysis.visualElements.length} visual elements, ${analysis.textOverlays.length} text overlays`);

  return { gcsPath, analysis };
}

export async function analyzeImageUrl(input: unknown): Promise<string> {
  const args = AnalyzeImageUrlSchema.parse(input);

  if (!isGcpEnabled) {
    return JSON.stringify({
      error: 'GCP not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON for image features.',
    }, null, 2);
  }

  if (!isGeminiEnabled()) {
    return JSON.stringify({
      error: 'Gemini AI not configured. Set GEMINI_API_KEY or configure Vertex AI.',
    }, null, 2);
  }

  const urlType = detectUrlType(args.imageUrl);
  console.log(`[analyze-image-url] Processing ${urlType} URL...`);

  try {
    // Handle Google Drive folder: find images inside
    if (urlType === 'google-drive-folder') {
      const folderId = extractDriveFolderId(args.imageUrl);
      console.log(`[analyze-image-url] Listing images in Drive folder: ${folderId}`);
      const images = await listDriveFolderImages(folderId);

      if (images.length === 0) {
        return JSON.stringify({
          error: `No image files found in Google Drive folder. The folder may contain videos instead — use analyze-video-url for video creatives.`,
          sourceUrl: args.imageUrl,
          urlType,
        }, null, 2);
      }

      // Analyze the first (most recent) image
      const image = images[0];
      console.log(`[analyze-image-url] Found ${images.length} image(s), analyzing: "${image.name}" (${image.mimeType}, ${image.aspectRatio || 'unknown ratio'})`);

      const download = await downloadDriveFile(image.id);
      const chunks: Buffer[] = [];
      for await (const chunk of download.stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const imageBuffer = Buffer.concat(chunks);
      const mimeType = image.mimeType || download.contentType || 'image/jpeg';

      const { gcsPath, analysis } = await analyzeImageBuffer(
        imageBuffer, mimeType, args.imageUrl, urlType, args.title || image.name,
      );

      return JSON.stringify({
        gcsPath,
        analysis,
        folderContents: images.map(img => ({
          name: img.name,
          mimeType: img.mimeType,
          aspectRatio: img.aspectRatio,
          width: img.width,
          height: img.height,
        })),
        analyzedFile: image.name,
        metadata: {
          sourceUrl: args.imageUrl,
          urlType,
          folderId,
          title: args.title || image.name,
        },
      }, null, 2);
    }

    // Non-folder: download directly
    const download = await downloadFromUrl(args.imageUrl);
    const chunks: Buffer[] = [];
    for await (const chunk of download.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const imageBuffer = Buffer.concat(chunks);
    const mimeType = download.contentType || 'image/jpeg';

    const { gcsPath, analysis } = await analyzeImageBuffer(
      imageBuffer, mimeType, args.imageUrl, urlType, args.title || 'Untitled',
    );

    return JSON.stringify({
      gcsPath,
      analysis,
      metadata: {
        sourceUrl: args.imageUrl,
        urlType,
        title: args.title || 'Untitled',
      },
    }, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[analyze-image-url] Error: ${errorMessage}`);
    return JSON.stringify({
      error: `Failed to analyze image: ${errorMessage}`,
      sourceUrl: args.imageUrl,
      urlType,
    }, null, 2);
  }
}

export const analyzeImageUrlTool: Tool = {
  name: 'analyze-image-url',
  description: 'Download an image from URL or Google Drive folder, upload to GCS, and analyze with Gemini AI. For Drive folders, lists all images with dimensions/aspect ratios and analyzes the most recent one. Returns structured image analysis including visual elements, text overlays, emotional tone, color palette, and creative approach. Use BEFORE writing ad copy for static/carousel creatives.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      imageUrl: {
        type: 'string' as const,
        description: 'Image URL or Google Drive folder URL containing images',
      },
      title: {
        type: 'string' as const,
        description: 'Optional title for the image',
      },
    },
    required: ['imageUrl'],
  },
};
