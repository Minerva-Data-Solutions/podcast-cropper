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

export interface JobStatus {
  id: string
  status: 'uploaded' | 'processing' | 'completed' | 'error'
  progress: number
  transcriptionText?: string
  segments?: TranscriptionSegment[]
  error?: string
  updatedAt?: string
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

export const uploadVideoForProcessing = async (videoFile: File): Promise<{ jobId: string }> => {
  const formData = new FormData()
  formData.append('video', videoFile, videoFile.name)

  const response = await $fetch<{ success: boolean; jobId: string }>('/api/upload-video', {
    method: 'POST',
    body: formData
  })

  if (!response.success || !response.jobId) {
    throw new Error('Failed to upload video for processing')
  }

  return { jobId: response.jobId }
}

export const startProcessingJob = async (jobId: string) => {
  const response = await $fetch<{ success: boolean; status: string }>('/api/process-job', {
    method: 'POST',
    body: { jobId }
  })

  if (!response.success) {
    throw new Error('Failed to start processing job')
  }

  return response
}

export const getJobStatus = async (jobId: string): Promise<JobStatus> => {
  const response = await $fetch<{ success: boolean; job: JobStatus }>('/api/job-status', {
    method: 'GET',
    query: { jobId }
  })

  if (!response.success) {
    throw new Error('Failed to fetch job status')
  }

  return response.job
}