export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const groqApiKey = config.groqApiKey
  
  if (!groqApiKey) {
    return {
      healthy: false,
      service: 'groq',
      error: 'API key not configured'
    }
  }
  
  try {
    const { Groq } = await import('groq-sdk')
    const groq = new Groq({
      apiKey: groqApiKey
    })
    
    // Simple test - try to list models (lightweight operation)
    await groq.models.list()
    
    return {
      healthy: true,
      service: 'groq',
      status: 'available'
    }
  } catch (error: any) {
    return {
      healthy: false,
      service: 'groq',
      error: error.message || 'Connection failed'
    }
  }
})