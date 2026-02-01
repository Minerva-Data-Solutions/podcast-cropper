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
  interestScore: number
}

export const transcribeAudio = async (audioBlob: Blob): Promise<{ text: string, segments: TranscriptionSegment[] }> => {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'audio.mp3')
  
  const response = await $fetch<{
    success: boolean
    text: string
    segments: TranscriptionSegment[]
    service: string
  }>('/api/transcribe-groq', {
    method: 'POST',
    body: formData
  })
  
  if (!response.success) {
    throw new Error('Transcription failed')
  }
  
  return {
    text: response.text,
    segments: response.segments
  }
}

export const analyzeThemes = async (
  transcription: string, 
  segments: TranscriptionSegment[] = [], 
  videoDuration: number = 0
): Promise<ThemeSegment[]> => {
  const response = await $fetch<{
    success: boolean
    themes: ThemeSegment[]
    service: string
  }>('/api/analyze-groq', {
    method: 'POST',
    body: {
      transcription,
      segments,
      videoDuration
    }
  })
  
  if (!response.success) {
    throw new Error('Theme analysis failed')
  }
  
  return response.themes || []
}