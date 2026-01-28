import { Groq } from 'groq-sdk'

let groq: Groq | null = null

export const useGroq = () => {
  if (!groq) {
    const config = useRuntimeConfig()
    // In a real app, we'd use a server route to keep the key secret, 
    // but for this local-first tool, we'll use it directly if provided in env.
    groq = new Groq({
      apiKey: config.public.groqApiKey || '',
      dangerouslyAllowBrowser: true
    })
  }
  return groq
}

export interface TranscriptionSegment {
  start: number
  end: number
  text: string
}

export interface ThemeSegment {
  start: number
  end: number
  title: string
  summary: string
}

export const transcribeAudio = async (audioBlob: Blob): Promise<{ text: string, segments: TranscriptionSegment[] }> => {
  const client = useGroq()
  
  // Convert Blob to File for the SDK
  const file = new File([audioBlob], 'audio.mp3', { type: 'audio/mpeg' })
  
  const transcription = await client.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    response_format: 'verbose_json',
  })

  return {
    text: transcription.text,
    segments: (transcription as any).segments.map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text
    }))
  }
}

export const analyzeThemes = async (transcription: string): Promise<ThemeSegment[]> => {
  const client = useGroq()
  
  const prompt = `
    Analyze the following podcast transcription and divide it into logical "themes" or "chapters".
    For each theme, provide:
    1. A start time in seconds.
    2. An end time in seconds.
    3. A short, punchy title.
    4. A one-sentence summary.

    Format the output as a JSON array of objects with keys: start, end, title, summary.
    Ensure the segments cover the entire duration and do not overlap significantly.

    Transcription:
    ${transcription}
  `

  const chatCompletion = await client.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are an expert podcast editor. Output ONLY valid JSON.' },
      { role: 'user', content: prompt }
    ],
    model: 'llama-3.3-70b-versatile',
    response_format: { type: 'json_object' }
  })

  const content = chatCompletion.choices[0]?.message?.content || '{"themes": []}'
  const parsed = JSON.parse(content)
  return parsed.themes || []
}
