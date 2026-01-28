<script setup lang="ts">
import { useFFmpeg } from './composables/useFFmpeg'
import { transcribeAudio, analyzeThemes, type TranscriptionSegment, type ThemeSegment } from './utils/groq'

const { extractAudio, extractClip, isLoading: isFFmpegLoading, progress: ffmpegProgress, isLoaded: isFFmpegLoaded } = useFFmpeg()

const videoFile = ref<File | null>(null)
const videoUrl = ref<string | null>(null)
const videoPlayer = ref<HTMLVideoElement | null>(null)

const transcription = ref<TranscriptionSegment[]>([])
const themes = ref<ThemeSegment[]>([])
const isProcessing = ref(false)
const isExporting = ref(false)
const statusMessage = ref('')

const currentTime = ref(0)

const onFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    videoFile.value = target.files[0]
    videoUrl.value = URL.createObjectURL(videoFile.value)
    // Reset state
    transcription.value = []
    themes.value = []
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

    statusMessage.value = 'Analyzing themes with Groq Llama 3...'
    const analyzedThemes = await analyzeThemes(text)
    themes.value = analyzedThemes
      .map((theme) => ({
        ...theme,
        start: Number(theme.start),
        end: Number(theme.end),
        interestScore: Number(theme.interestScore),
      }))
      .filter((theme) => Number.isFinite(theme.start) && Number.isFinite(theme.end) && theme.end > theme.start)

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
          <h2 class="text-sm font-bold uppercase tracking-widest">Transcripció</h2>
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
