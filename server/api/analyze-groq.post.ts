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
    
    const { transcription } = body
    
    // Validate transcription
    const validation = validateTranscription(transcription)
    if (!validation.valid) {
      throw createError({
        statusCode: 400,
        statusMessage: validation.error || 'Invalid transcription'
      })
    }
    
    const prompt = `Analyze the following video transcription and divide it into logical "themes" or "chapters".
For each theme, provide:
1. A start time in seconds (as a number).
2. An end time in seconds (as a number).
3. A short, punchy title.
4. A one-sentence summary.
5. An interestScore (a number between 0 and 1) representing how engaging or "viral" this specific segment is.

Format the output as a JSON object with a key "themes" containing an array of these objects.
Example:
{
  "themes": [
    { "start": 0, "end": 60, "title": "Introduction", "summary": "The speakers introduce themselves and the topic.", "interestScore": 0.4 }
  ]
}

Ensure the segments cover the entire duration and do not overlap significantly.
Mandatory to write in the language of the transcription.

Transcription:
${transcription}`

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
    
    return {
      success: true,
      themes: parsed.themes || [],
      service: 'groq',
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