const MAX_FILE_SIZE = 3 * 1024 * 1024 * 1024 // 3GB - suitable for long podcast videos
const MAX_TRANSCRIPTION_LENGTH = 500000 // ~500k characters
const ALLOWED_MEDIA_TYPES = [
  // Audio types
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/m4a',
  'audio/flac',
  'audio/ogg',
  'audio/webm',
  // Video types
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-matroska',
  'video/avi',
  // Generic fallback
  'application/octet-stream' // Some browsers send this for media files
]

const ALLOWED_MEDIA_EXTENSIONS = [
  // Audio extensions
  '.mp3',
  '.wav',
  '.m4a',
  '.flac',
  '.ogg',
  '.webm',
  // Video extensions
  '.mp4',
  '.mpeg',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.m4v'
]

export const validateAudioFile = (file: { filename?: string; data: any; type?: string }): { valid: boolean; error?: string } => {
  if (!file.filename || !file.data) {
    return { valid: false, error: 'Invalid file: missing filename or data' }
  }
  
  // Check file size
  const fileSize = file.data instanceof Buffer 
    ? file.data.length 
    : Buffer.from(file.data).length
    
  if (fileSize > MAX_FILE_SIZE) {
    const fileSizeGB = (fileSize / 1024 / 1024 / 1024).toFixed(2)
    const maxSizeGB = (MAX_FILE_SIZE / 1024 / 1024 / 1024).toFixed(2)
    return { 
      valid: false, 
      error: `File too large: ${fileSizeGB}GB. Maximum allowed: ${maxSizeGB}GB` 
    }
  }
  
  if (fileSize === 0) {
    return { valid: false, error: 'File is empty' }
  }
  
  // Check file extension
  const extension = file.filename.toLowerCase().substring(file.filename.lastIndexOf('.'))
  if (!ALLOWED_MEDIA_EXTENSIONS.includes(extension)) {
    return { 
      valid: false, 
      error: `Invalid file type: ${extension}. Allowed: ${ALLOWED_MEDIA_EXTENSIONS.join(', ')}` 
    }
  }
  
  // Check MIME type if provided
  if (file.type && !ALLOWED_MEDIA_TYPES.includes(file.type.toLowerCase())) {
    return { 
      valid: false, 
      error: `Invalid MIME type: ${file.type}. Allowed: ${ALLOWED_MEDIA_TYPES.join(', ')}` 
    }
  }
  
  return { valid: true }
}

export const validateTranscription = (transcription: string): { valid: boolean; error?: string } => {
  if (!transcription || typeof transcription !== 'string') {
    return { valid: false, error: 'Transcription must be a non-empty string' }
  }
  
  if (transcription.length > MAX_TRANSCRIPTION_LENGTH) {
    return { 
      valid: false, 
      error: `Transcription too long: ${transcription.length} characters. Maximum: ${MAX_TRANSCRIPTION_LENGTH}` 
    }
  }
  
  // Basic sanitization check for potential injection
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i
  ]
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(transcription)) {
      return { valid: false, error: 'Transcription contains potentially unsafe content' }
    }
  }
  
  return { valid: true }
}