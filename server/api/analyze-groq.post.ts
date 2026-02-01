export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const groqApiKey = config.groqApiKey || process.env.GROQ_API_KEY || process.env.NUXT_GROQ_API_KEY
  
  if (!groqApiKey) {
    // Debug: Check if env var is set but not being read
    const envKey = process.env.GROQ_API_KEY || process.env.NUXT_GROQ_API_KEY
    const hasEnvKey = !!envKey
    
    console.error('Groq API key not found in runtime config', {
      hasEnvKey,
      envKeyLength: envKey?.length || 0,
      nodeEnv: process.env.NODE_ENV
    })
    
    throw createError({
      statusCode: 400,
      statusMessage: 'Groq API key not configured. Please set GROQ_API_KEY or NUXT_GROQ_API_KEY environment variable.'
    })
  }
  
  // Global rate limiting (shared bucket for all requests)
  const { checkGlobalRateLimit } = await import('../utils/rateLimiter')
  const maxRequests = config.rateLimitMaxRequests || 10
  const windowMs = config.rateLimitWindowMs || 3600000 // 1 hour default
  
  const rateLimit = checkGlobalRateLimit(maxRequests, windowMs)
  
  if (!rateLimit.allowed) {
    const resetDate = new Date(rateLimit.resetAt)
    throw createError({
      statusCode: 429,
      statusMessage: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000 / 60} minutes. Try again after ${resetDate.toISOString()}`
    })
  }
  
  // Input validation
  const { validateTranscription } = await import('../utils/validation')
  
  try {
    const { Groq } = await import('groq-sdk')
    const groq = new Groq({
      apiKey: groqApiKey
    })
    
    const body = await readBody(event)
    
    if (!body.transcription) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No transcription provided'
      })
    }
    
    const { transcription, segments = [], videoDuration = 0 } = body
    
    // Validate transcription
    const validation = validateTranscription(transcription)
    if (!validation.valid) {
      throw createError({
        statusCode: 400,
        statusMessage: validation.error || 'Invalid transcription'
      })
    }
    
    // Calculate actual duration from segments if not provided
    const actualDuration = videoDuration > 0 
      ? videoDuration 
      : segments.length > 0 
        ? Math.max(...segments.map((s: any) => s.end || 0))
        : 0
    
    // Build segments reference for the LLM
    const segmentsInfo = segments.length > 0
      ? `\n\nTranscription segments with accurate timestamps:\n${segments.slice(0, 20).map((s: any, i: number) => 
          `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: ${s.text.substring(0, 100)}${s.text.length > 100 ? '...' : ''}`
        ).join('\n')}${segments.length > 20 ? `\n... and ${segments.length - 20} more segments` : ''}`
      : ''
    
    const prompt = `Analyze the following video transcription and divide it into logical "themes" or "chapters".
For each theme, provide:
1. A start time in seconds (as a number) - MUST match actual timestamps from the transcription segments below.
2. An end time in seconds (as a number) - MUST match actual timestamps from the transcription segments below.
3. A short, punchy title.
4. A one-sentence summary.
5. An interestScore (a number between 0 and 1) representing how engaging or "viral" this specific segment is.

IMPORTANT CONSTRAINTS:
- The video duration is ${actualDuration.toFixed(1)} seconds (${(actualDuration / 60).toFixed(1)} minutes)
- ALL start and end times MUST be between 0 and ${actualDuration.toFixed(1)} seconds
- Use the exact timestamps from the transcription segments provided below
- Do NOT create segments that exceed the video duration
- Ensure segments cover the entire duration from 0 to ${actualDuration.toFixed(1)} seconds

Format the output as a JSON object with a key "themes" containing an array of these objects.
Example:
{
  "themes": [
    { "start": 0, "end": 60, "title": "Introduction", "summary": "The speakers introduce themselves and the topic.", "interestScore": 0.4 }
  ]
}

Ensure the segments cover the entire duration and do not overlap significantly.
Mandatory to write in the language of the transcription.

Full transcription text:
${transcription}${segmentsInfo}`

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are an expert podcast editor. Output ONLY valid JSON.' },
        { role: 'user', content: prompt }
      ],
      model: 'openai/gpt-oss-120b',
      response_format: { type: 'json_object' }
    })
    
    const content = chatCompletion.choices[0]?.message?.content || '{"themes": []}'
    const parsed = JSON.parse(content)
    
    // Validate and clamp theme timestamps to actual video duration
    const validatedThemes = (parsed.themes || []).map((theme: any) => {
      const start = Math.max(0, Math.min(Number(theme.start) || 0, actualDuration))
      const end = Math.max(start, Math.min(Number(theme.end) || start + 1, actualDuration))
      return {
        ...theme,
        start,
        end,
        interestScore: Number(theme.interestScore) || 0
      }
    }).filter((theme: any) => 
      Number.isFinite(theme.start) && 
      Number.isFinite(theme.end) && 
      theme.end > theme.start &&
      theme.start >= 0 &&
      theme.end <= actualDuration
    )
    
    return {
      success: true,
      themes: validatedThemes,
      service: 'groq',
      videoDuration: actualDuration,
      rateLimit: {
        remaining: rateLimit.remaining,
        resetAt: new Date(rateLimit.resetAt).toISOString()
      }
    }
  } catch (error: any) {
    console.error('Groq theme analysis error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      statusMessage: error.message || 'Theme analysis failed'
    })
  }
})