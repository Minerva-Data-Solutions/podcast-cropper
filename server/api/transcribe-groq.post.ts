export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const groqApiKey = config.groqApiKey
  
  if (!groqApiKey) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Groq API key not configured'
    })
  }
  
  // Rate limiting
  const { checkRateLimit } = await import('../utils/rateLimiter')
  const maxRequests = config.rateLimitMaxRequests || 10
  const windowMs = config.rateLimitWindowMs || 3600000 // 1 hour default
  
  const clientId = getClientIdentifier(event) || 'unknown'
  const rateLimit = checkRateLimit(clientId, maxRequests, windowMs)
  
  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetAt)
    throw createError({
      statusCode: 429,
      statusMessage: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000 / 60} minutes. Try again after ${resetDate.toISOString()}`
    })
  }
  
  // File validation
  const { validateAudioFile } = await import('../utils/validation')
  
  try {
    const { Groq } = await import('groq-sdk')
    const groq = new Groq({
      apiKey: groqApiKey
    })
    
    const formData = await readMultipartFormData(event)
    
    if (!formData || !formData.length) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No audio file provided'
      })
    }
    
    const audioFile = formData[0] as any;
    
    // Validate file
    const validation = validateAudioFile(audioFile)
    if (!validation.valid) {
      throw createError({
        statusCode: 400,
        statusMessage: validation.error || 'Invalid audio file'
      })
    }
    
    // Convert to Buffer if needed
    const fileData = audioFile.data instanceof Buffer 
      ? audioFile.data 
      : Buffer.from(audioFile.data)
    
    // Create File object for Groq SDK (File is available in Bun/Node.js 18+)
    // The Groq SDK accepts File, Blob, or Buffer
    let file: File | Blob
    
    if (typeof File !== 'undefined') {
      file = new File([fileData], audioFile.filename, { 
        type: audioFile.type || 'audio/mpeg' 
      })
    } else {
      // Fallback to Blob if File is not available
      file = new Blob([fileData], { type: audioFile.type || 'audio/mpeg' })
    }
    
    const transcription = await groq.audio.transcriptions.create({
      file: file as any,
      model: 'whisper-large-v3',
      response_format: 'verbose_json',
    })
    
    return {
      success: true,
      text: transcription.text,
      segments: (transcription as any).segments?.map((s: any) => ({
        start: s.start,
        end: s.end,
        text: s.text
      })) || [],
      service: 'groq',
      rateLimit: {
        remaining: rateLimit.remaining,
        resetAt: new Date(rateLimit.resetAt).toISOString()
      }
    }
  } catch (error: any) {
    console.error('Groq transcription error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || 'Transcription failed'
    })
  }
})