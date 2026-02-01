<script setup lang="ts">
import { useFFmpeg } from './composables/useFFmpeg'
import { transcribeAudio, analyzeThemes, type TranscriptionSegment, type ThemeSegment } from './utils/groq'

const { extractAudio, extractClip, isLoading: isFFmpegLoading, progress: ffmpegProgress, isLoaded: isFFmpegLoaded } = useFFmpeg()

const videoFile = ref<File | null>(null)
const videoUrl = ref<string | null>(null)
const videoPlayer = ref<HTMLVideoElement | null>(null)
const videoDuration = ref(0)

const transcription = ref<TranscriptionSegment[]>([])
const transcriptionText = ref('')
const themes = ref<ThemeSegment[]>([])
const isProcessing = ref(false)
const isExporting = ref(false)
const statusMessage = ref('')
const copySuccess = ref(false)

const currentTime = ref(0)

const onFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    videoFile.value = target.files[0]
    videoUrl.value = URL.createObjectURL(videoFile.value)
    // Reset state
    transcription.value = []
    transcriptionText.value = ''
    themes.value = []
    videoDuration.value = 0
  }
}

const downloadTranscription = () => {
  if (!transcriptionText.value) return
  
  const text = transcriptionText.value
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  
  // Generate filename from video file name or use default
  const videoName = videoFile.value?.name.replace(/\.[^/.]+$/, '') || 'transcription'
  a.download = `${videoName}_transcription.txt`
  
  a.click()
  URL.revokeObjectURL(url)
}

const copyTranscription = async () => {
  if (!transcriptionText.value) return
  
  try {
    await navigator.clipboard.writeText(transcriptionText.value)
    copySuccess.value = true
    setTimeout(() => {
      copySuccess.value = false
    }, 2000)
  } catch (error) {
    console.error('Failed to copy transcription:', error)
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = transcriptionText.value
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.select()
    try {
      document.execCommand('copy')
      copySuccess.value = true
      setTimeout(() => {
        copySuccess.value = false
      }, 2000)
    } catch (err) {
      console.error('Fallback copy failed:', err)
    }
    document.body.removeChild(textArea)
  }
}

const onVideoLoadedMetadata = () => {
  if (videoPlayer.value) {
    videoDuration.value = videoPlayer.value.duration || 0
  }
}

const processVideo = async () => {
  if (!videoFile.value) {
    alert('Please select a video file')
    return
  }

  try {
    isProcessing.value = true
    statusMessage.value = 'Extracting audio locally...'
    const audioBlob = await extractAudio(videoFile.value)

    statusMessage.value = 'Transcribing with Groq Whisper...'
    const { text, segments } = await transcribeAudio(audioBlob)
    transcription.value = segments
    transcriptionText.value = text

    // Get video duration - use stored value or wait for metadata
    let finalDuration = videoDuration.value || videoPlayer.value?.duration || 0
    
    // If video duration not available yet, wait for it to load
    if (!finalDuration && videoPlayer.value) {
      await new Promise((resolve) => {
        const onLoadedMetadata = () => {
          if (videoPlayer.value) {
            finalDuration = videoPlayer.value.duration || 0
            videoDuration.value = finalDuration
          }
          videoPlayer.value?.removeEventListener('loadedmetadata', onLoadedMetadata)
          resolve(null)
        }
        videoPlayer.value?.addEventListener('loadedmetadata', onLoadedMetadata)
        // If already loaded, check immediately
        if (videoPlayer.value.readyState >= 1) {
          onLoadedMetadata()
        } else {
          // Timeout after 5 seconds
          setTimeout(resolve, 5000)
        }
      })
    }
    
    // Fallback to last segment end time if video duration still not available
    if (!finalDuration && segments.length > 0) {
      finalDuration = segments[segments.length - 1]?.end || 0
    }

    statusMessage.value = 'Analyzing themes with Groq Llama 3...'
    const analyzedThemes = await analyzeThemes(text, segments, finalDuration)
    
    // Validate and clamp theme timestamps to actual video duration
    themes.value = analyzedThemes
      .map((theme) => {
        const start = Math.max(0, Math.min(Number(theme.start) || 0, finalDuration))
        const end = Math.max(start, Math.min(Number(theme.end) || start + 1, finalDuration))
        return {
          ...theme,
          start,
          end,
          interestScore: Number(theme.interestScore) || 0,
        }
      })
      .filter((theme) => 
        Number.isFinite(theme.start) && 
        Number.isFinite(theme.end) && 
        theme.end > theme.start &&
        theme.start >= 0 &&
        theme.end <= finalDuration
      )

    statusMessage.value = ''
  } catch (error) {
    console.error(error)
    statusMessage.value = 'Error processing video. Check console.'
  } finally {
    isProcessing.value = false
  }
}

const downloadClip = async (theme: ThemeSegment) => {
  if (!videoFile.value) return
  
  try {
    isExporting.value = true
    statusMessage.value = `Exporting clip: ${theme.title}...`
    
    const duration = videoPlayer.value?.duration || 0
    const safeStart = Math.max(0, Number(theme.start) || 0)
    const safeEnd = Math.max(safeStart + 1, Number(theme.end) || safeStart + 1)
    const clampedEnd = duration > 0 ? Math.min(safeEnd, duration) : safeEnd
    const clipBlob = await extractClip(videoFile.value, safeStart, clampedEnd)
    
    const url = URL.createObjectURL(clipBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${theme.title.replace(/\s+/g, '_')}_clip.mp4`
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Export failed:', error)
    alert('Failed to export clip. Check console for details.')
  } finally {
    isExporting.value = false
    statusMessage.value = ''
  }
}

const onTimeUpdate = () => {
  if (videoPlayer.value) {
    currentTime.value = videoPlayer.value.currentTime
  }
}

const seekTo = (time: number) => {
  if (videoPlayer.value) {
    videoPlayer.value.currentTime = time
    videoPlayer.value.play()
  }
}

const interestBadgeClass = (score: number) => {
  if (score >= 0.8) return 'bg-orange-500 text-white'
  if (score >= 0.55) return 'bg-primary text-primary-content'
  return 'bg-base-300 text-base-content'
}

const goToTheme = (theme: ThemeSegment) => {
  seekTo(Number(theme.start) || 0)
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
</script>

<template>
  <div class="min-h-screen bg-base-100 text-base-content font-sans selection:bg-primary selection:text-primary-content">
    <!-- Header -->
    <header class="border-b border-base-300 py-6 px-8 flex justify-between items-center">
      <h1 class="text-xl font-medium tracking-tight uppercase">Podcast Cropper pel David</h1>
      <div v-if="!videoFile" class="flex items-center gap-4">
        <input type="file" accept="video/*" @change="onFileChange" class="file-input file-input-bordered file-input-sm w-full max-w-xs" />
      </div>
      <div v-else class="flex items-center gap-4">
        <button @click="processVideo" :disabled="isProcessing" class="btn btn-primary btn-sm uppercase tracking-wider">
            {{ isProcessing ? 'Processant...' : 'Analitzar vídeo' }}
        </button>
        <button @click="videoFile = null; videoUrl = null" class="btn btn-ghost btn-sm uppercase tracking-wider">Reiniciar</button>
      </div>
    </header>

    <main class="flex h-[calc(100vh-73px)] overflow-hidden">
      <!-- Main Content (75%) -->
      <div class="w-3/4 flex flex-col border-r border-base-300 h-full">
        <!-- Video Player -->
        <div class="flex-1 bg-black flex items-center justify-center overflow-hidden min-h-0">
          <video 
            v-if="videoUrl" 
            ref="videoPlayer" 
            :src="videoUrl" 
            controls 
            class="max-h-full max-w-full object-contain"
            @timeupdate="onTimeUpdate"
            @loadedmetadata="onVideoLoadedMetadata"
          ></video>
          <div v-else class="text-base-content/30 uppercase tracking-widest text-sm">
            No hi ha cap vídeo carregat.
          </div>
        </div>

        <!-- Timeline -->
        <div class="h-64 border-t border-base-300 p-6 bg-base-200/50 overflow-hidden flex flex-col relative">
          <div v-if="themes.length > 0" class="h-full flex flex-col gap-4">
            
            <!-- Scrollable Cards Container -->
            <div
              class="flex gap-4 overflow-x-auto pb-4 timeline-scrollbar"
            >
              <div 
                v-for="(theme, index) in themes" 
                :key="index"
                class="min-w-[280px] p-4 bg-base-100 border border-base-300 rounded-sm hover:border-primary transition-all relative group/card shrink-0"
              >
                <div class="flex justify-between items-start mb-2">
                  <div class="text-[10px] text-primary font-bold uppercase">{{ formatTime(theme.start) }} - {{ formatTime(theme.end) }}</div>
                  <div class="flex items-center gap-2">
                    <div class="badge badge-sm font-bold border-none" :class="interestBadgeClass(theme.interestScore)">
                      {{ Math.round(theme.interestScore * 100) }}%
                    </div>
                    <button
                      class="btn btn-xs btn-circle btn-ghost opacity-60 hover:opacity-100"
                      @click.stop="goToTheme(theme)"
                      title="Go to segment"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div class="text-xs font-bold uppercase mb-1 truncate">{{ theme.title }}</div>
                <div class="text-[10px] leading-relaxed opacity-60 line-clamp-2 mb-3">{{ theme.summary }}</div>
                
                <button 
                  @click.stop="downloadClip(theme)"
                  class="btn btn-xs btn-outline btn-primary w-full uppercase text-[9px] tracking-widest opacity-0 group-hover/card:opacity-100 transition-opacity"
                  :disabled="isExporting"
                >
                    Descarrega el clip
                </button>
              </div>
            </div>
          </div>
          
          <!-- Exporting Overlay -->
          <div v-if="isExporting" class="absolute inset-0 bg-base-200/80 z-50 flex flex-col items-center justify-center gap-2">
            <span class="loading loading-spinner loading-md text-primary"></span>
            <div class="text-[10px] uppercase tracking-widest font-bold">{{ statusMessage }}</div>
          </div>
          <div v-else-if="isProcessing" class="h-full flex flex-col items-center justify-center gap-4">
            <span class="loading loading-ring loading-lg text-primary"></span>
            <div class="text-[10px] uppercase tracking-widest font-medium">{{ statusMessage }}</div>
            <progress v-if="ffmpegProgress > 0" class="progress progress-primary w-56" :value="ffmpegProgress" max="100"></progress>
          </div>
        </div>
      </div>

      <!-- Transcription Sidebar (25%) -->
      <aside class="w-1/4 bg-base-100 flex flex-col">
        <div class="p-6 border-b border-base-300">
          <div class="flex justify-between items-center mb-3">
            <h2 class="text-sm font-bold uppercase tracking-widest">Transcripció</h2>
            <div v-if="videoDuration > 0" class="text-[10px] text-base-content/50 uppercase">
              {{ formatTime(videoDuration) }}
            </div>
          </div>
          <div v-if="transcriptionText" class="flex gap-2">
            <button 
              @click="downloadTranscription"
              class="btn btn-xs btn-ghost uppercase text-[9px] tracking-wider"
              title="Download transcription as .txt file"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 mr-1">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download
            </button>
            <button 
              @click="copyTranscription"
              class="btn btn-xs btn-ghost uppercase text-[9px] tracking-wider"
              :class="{ 'btn-success': copySuccess }"
              title="Copy transcription to clipboard"
            >
              <svg v-if="!copySuccess" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 mr-1">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3 mr-1">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              {{ copySuccess ? 'Copied!' : 'Copy' }}
            </button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-8 font-serif leading-relaxed text-lg">
          <div v-if="transcription.length > 0" class="space-y-6">
            <p 
              v-for="(s, i) in transcription" 
              :key="i"
              class="cursor-pointer transition-colors"
              :class="{ 
                'text-primary font-medium': (currentTime >= s.start && currentTime <= s.end),
                'opacity-30 hover:opacity-100': !(currentTime >= s.start && currentTime <= s.end)
              }"
              @click="seekTo(s.start)"
            >
              {{ s.text }}
            </p>
          </div>
          <div v-else class="h-full flex items-center justify-center text-center text-base-content/20 uppercase tracking-widest text-xs italic">
            {{ isProcessing ? 'Transcribint...' : 'No hi ha transcripció encara.' }}
          </div>
        </div>
      </aside>
    </main>

  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Crimson+Pro:ital,wght@0,400;0,500;1,400&display=swap');

:root {
  --font-sans: 'Inter', sans-serif;
  --font-serif: 'Crimson Pro', serif;
}

body {
  font-family: var(--font-sans);
}

.font-serif {
  font-family: var(--font-serif);
}

.timeline-scrollbar::-webkit-scrollbar {
  height: 12px;
}
.timeline-scrollbar::-webkit-scrollbar-track {
  background: hsl(var(--b3));
  border-radius: 6px;
}
.timeline-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--bc) / 0.3);
  border-radius: 6px;
}
.timeline-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--bc) / 0.5);
}
.timeline-scrollbar {
  scrollbar-width: auto;
  scrollbar-color: hsl(var(--bc) / 0.3) hsl(var(--b3));
}

/* Custom Scrollbar for Braun Aesthetic */
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: hsl(var(--bc) / 0.1);
  border-radius: 0;
}

::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--bc) / 0.2);
}
</style>
