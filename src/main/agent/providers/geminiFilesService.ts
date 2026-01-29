/**
 * Gemini Files API Service
 * 
 * Handles file uploads, metadata retrieval, and lifecycle management
 * for the Gemini Files API. Use this for files larger than 20MB.
 * 
 * @see https://ai.google.dev/gemini-api/docs/files
 */

import { createLogger } from '../../logger';

const logger = createLogger('GeminiFilesService');

/**
 * File metadata returned by the Files API
 */
export interface GeminiFileMetadata {
  /** File resource name (e.g., 'files/abc123') */
  name: string;
  /** Display name */
  displayName: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: string;
  /** Creation timestamp */
  createTime: string;
  /** Last update timestamp */
  updateTime: string;
  /** Expiration timestamp (files expire after 48 hours) */
  expirationTime: string;
  /** SHA256 hash of the file */
  sha256Hash: string;
  /** File URI for use in API requests */
  uri: string;
  /** Processing state */
  state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
  /** Error details if state is FAILED */
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Options for file upload
 */
export interface UploadFileOptions {
  /** Display name for the file */
  displayName?: string;
  /** MIME type override (auto-detected if not provided) */
  mimeType?: string;
}

/**
 * Gemini Files API service for managing large file uploads
 * 
 * Features:
 * - Upload files larger than 20MB
 * - Get file metadata
 * - List uploaded files
 * - Delete files
 * - Wait for file processing completion
 * 
 * @example
 * ```typescript
 * const filesService = new GeminiFilesService(apiKey);
 * const file = await filesService.uploadFile(buffer, 'document.pdf', { mimeType: 'application/pdf' });
 * // Wait for processing
 * await filesService.waitForProcessing(file.name);
 * // Use file.uri in your generateContent request
 * ```
 */
export class GeminiFilesService {
  private readonly baseUrl: string;
  
  constructor(
    private readonly apiKey: string,
    baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
  ) {
    this.baseUrl = baseUrl;
  }
  
  /**
   * Upload a file to the Files API
   * 
   * @param data - File data as Buffer or base64 string
   * @param filename - Original filename
   * @param options - Upload options
   * @returns File metadata
   */
  async uploadFile(
    data: Buffer | string,
    filename: string,
    options: UploadFileOptions = {}
  ): Promise<GeminiFileMetadata> {
    const mimeType = options.mimeType || this.detectMimeType(filename);
    const displayName = options.displayName || filename;
    
    // Convert base64 string to Buffer if needed
    const buffer = typeof data === 'string' 
      ? Buffer.from(data, 'base64')
      : data;
    
    logger.debug('Uploading file to Gemini Files API', {
      filename,
      displayName,
      mimeType,
      sizeBytes: buffer.length,
    });
    
    // Step 1: Initiate resumable upload
    const uploadUrl = await this.initiateUpload(displayName, mimeType);
    
    // Step 2: Upload file data
    const fileMetadata = await this.uploadData(uploadUrl, buffer, mimeType);
    
    logger.info('File uploaded successfully', {
      name: fileMetadata.name,
      uri: fileMetadata.uri,
      state: fileMetadata.state,
    });
    
    return fileMetadata;
  }
  
  /**
   * Initiate a resumable upload and get the upload URL
   */
  private async initiateUpload(displayName: string, mimeType: string): Promise<string> {
    const url = `${this.baseUrl}/files?key=${this.apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      body: JSON.stringify({
        file: { displayName },
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to initiate upload: ${response.status} - ${errorText}`);
    }
    
    const uploadUrl = response.headers.get('X-Goog-Upload-URL');
    if (!uploadUrl) {
      throw new Error('No upload URL returned from Files API');
    }
    
    return uploadUrl;
  }
  
  /**
   * Upload file data to the resumable upload URL
   */
  private async uploadData(
    uploadUrl: string,
    data: Buffer,
    mimeType: string
  ): Promise<GeminiFileMetadata> {
    // Convert Buffer to Uint8Array and then to ArrayBuffer for Blob compatibility
    const uint8Array = new Uint8Array(data);
    const arrayBuffer = uint8Array.buffer as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: mimeType });
    
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'Content-Length': data.length.toString(),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: blob,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload file data: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    return result.file as GeminiFileMetadata;
  }
  
  /**
   * Get metadata for an uploaded file
   * 
   * @param fileName - File resource name (e.g., 'files/abc123')
   * @returns File metadata
   */
  async getFile(fileName: string): Promise<GeminiFileMetadata> {
    // Ensure fileName has correct format
    const name = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
    const url = `${this.baseUrl}/${name}?key=${this.apiKey}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get file: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
  }
  
  /**
   * List all uploaded files
   * 
   * @param pageSize - Maximum number of files to return (default 10, max 100)
   * @param pageToken - Token for pagination
   * @returns List of files and next page token
   */
  async listFiles(
    pageSize = 10,
    pageToken?: string
  ): Promise<{ files: GeminiFileMetadata[]; nextPageToken?: string }> {
    let url = `${this.baseUrl}/files?key=${this.apiKey}&pageSize=${pageSize}`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }
    
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list files: ${response.status} - ${errorText}`);
    }
    
    const result = await response.json();
    return {
      files: result.files || [],
      nextPageToken: result.nextPageToken,
    };
  }
  
  /**
   * Delete an uploaded file
   * 
   * @param fileName - File resource name (e.g., 'files/abc123')
   */
  async deleteFile(fileName: string): Promise<void> {
    // Ensure fileName has correct format
    const name = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
    const url = `${this.baseUrl}/${name}?key=${this.apiKey}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete file: ${response.status} - ${errorText}`);
    }
    
    logger.info('File deleted successfully', { name });
  }
  
  /**
   * Wait for a file to finish processing
   * 
   * @param fileName - File resource name
   * @param maxWaitMs - Maximum time to wait (default 5 minutes)
   * @param pollIntervalMs - Polling interval (default 2 seconds)
   * @returns Processed file metadata
   * @throws Error if file processing fails or times out
   */
  async waitForProcessing(
    fileName: string,
    maxWaitMs = 300000,
    pollIntervalMs = 2000
  ): Promise<GeminiFileMetadata> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      const file = await this.getFile(fileName);
      
      if (file.state === 'ACTIVE') {
        logger.debug('File processing complete', { name: file.name });
        return file;
      }
      
      if (file.state === 'FAILED') {
        throw new Error(
          `File processing failed: ${file.error?.message || 'Unknown error'}`
        );
      }
      
      logger.debug('File still processing, waiting...', {
        name: file.name,
        state: file.state,
        elapsedMs: Date.now() - startTime,
      });
      
      await this.sleep(pollIntervalMs);
    }
    
    throw new Error(`File processing timed out after ${maxWaitMs}ms`);
  }
  
  /**
   * Check if a file size exceeds the inline data limit
   * Files larger than 20MB should use the Files API
   */
  static shouldUseFilesApi(sizeBytes: number): boolean {
    const INLINE_LIMIT = 20 * 1024 * 1024; // 20MB
    return sizeBytes > INLINE_LIMIT;
  }
  
  /**
   * Detect MIME type from filename extension
   */
  private detectMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    
    const mimeTypes: Record<string, string> = {
      // Images
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'webp': 'image/webp',
      'heic': 'image/heic',
      'heif': 'image/heif',
      'gif': 'image/gif',
      
      // Audio
      'wav': 'audio/wav',
      'mp3': 'audio/mp3',
      'aiff': 'audio/aiff',
      'aac': 'audio/aac',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
      
      // Video
      'mp4': 'video/mp4',
      'mpeg': 'video/mpeg',
      'mpg': 'video/mpeg',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'flv': 'video/x-flv',
      'webm': 'video/webm',
      'wmv': 'video/x-ms-wmv',
      '3gp': 'video/3gpp',
      
      // Documents
      'pdf': 'application/pdf',
      
      // Text
      'txt': 'text/plain',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'text/javascript',
      'ts': 'text/typescript',
      'json': 'application/json',
      'xml': 'application/xml',
      'md': 'text/markdown',
    };
    
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Export singleton factory for convenience
 */
let filesServiceInstance: GeminiFilesService | null = null;
let currentApiKey: string | null = null;

export function getGeminiFilesService(apiKey: string): GeminiFilesService {
  if (!filesServiceInstance || currentApiKey !== apiKey) {
    filesServiceInstance = new GeminiFilesService(apiKey);
    currentApiKey = apiKey;
  }
  return filesServiceInstance;
}
