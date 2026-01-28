<script setup lang="ts">
import { useFFmpeg } from './composables/useFFmpeg'
import { transcribeAudio, analyzeThemes, type TranscriptionSegment, type ThemeSegment } from './utils/groq'

const { extractAudio, isLoading: isFFmpegLoading, progress: ffmpegProgress } = useFFmpeg()

const videoFile = ref<File | null>(null)
const videoUrl = ref<string | null>(null)
const videoPlayer = ref<HTMLVideoElement | null>(null)

const transcription = ref<TranscriptionSegment[]>([])
const themes = ref<ThemeSegment[]>([])
const isProcessing = ref(false)
const statusMessage = ref('')

const currentTime = ref(0)
const hoveredTime = ref<number | null>(null)

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

    statusMessage.value = ''
  } catch (error) {
    console.error(error)
    statusMessage.value = 'Error processing video. Check console.'
  } finally {
    isProcessing.value = false
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

const currentTranscription = computed(() => {
  const time = hoveredTime.value !== null ? hoveredTime.value : currentTime.value
  return transcription.value.find(s => time >= s.start && time <= s.end)?.text || ''
})

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
      <h1 class="text-xl font-medium tracking-tight uppercase">Podcast Cropper</h1>
      <div v-if="!videoFile" class="flex items-center gap-4">
        <input type="file" accept="video/*" @change="onFileChange" class="file-input file-input-bordered file-input-sm w-full max-w-xs" />
      </div>
      <div v-else class="flex items-center gap-4">
        <button @click="processVideo" :disabled="isProcessing" class="btn btn-primary btn-sm uppercase tracking-wider">
          {{ isProcessing ? 'Processing...' : 'Analyze Video' }}
        </button>
        <button @click="videoFile = null; videoUrl = null" class="btn btn-ghost btn-sm uppercase tracking-wider">Reset</button>
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
            No video loaded
          </div>
        </div>

        <!-- Timeline -->
        <div class="h-64 border-t border-base-300 p-6 bg-base-200/50 overflow-hidden flex flex-col">
          <div v-if="themes.length > 0" class="h-full flex flex-col gap-4">
            <div class="flex h-12 w-full bg-base-300 rounded-sm overflow-hidden relative group shrink-0">
              <div 
                v-for="(theme, index) in themes" 
                :key="index"
                class="h-full border-r border-base-100/20 relative cursor-pointer hover:brightness-110 transition-all"
                :style="{ width: `${((theme.end - theme.start) / (videoPlayer?.duration || 1)) * 100}%` }"
                @click="seekTo(theme.start)"
                @mouseenter="hoveredTime = theme.start"
                @mouseleave="hoveredTime = null"
              >
                <div class="absolute inset-0 flex items-center justify-center px-2">
                  <span class="text-[10px] uppercase font-bold truncate opacity-50 group-hover:opacity-100">{{ theme.title }}</span>
                </div>
              </div>
              <!-- Playhead -->
              <div 
                class="absolute top-0 bottom-0 w-0.5 bg-primary z-10 pointer-events-none"
                :style="{ left: `${(currentTime / (videoPlayer?.duration || 1)) * 100}%` }"
              ></div>
            </div>
            
            <div class="flex gap-4 overflow-x-auto pb-2">
              <div 
                v-for="(theme, index) in themes" 
                :key="index"
                class="min-w-[200px] p-3 bg-base-100 border border-base-300 rounded-sm cursor-pointer hover:border-primary transition-colors"
                @click="seekTo(theme.start)"
              >
                <div class="text-[10px] text-primary font-bold uppercase mb-1">{{ formatTime(theme.start) }}</div>
                <div class="text-xs font-medium uppercase mb-1 truncate">{{ theme.title }}</div>
                <div class="text-[10px] leading-relaxed opacity-60 line-clamp-2">{{ theme.summary }}</div>
              </div>
            </div>
          </div>
          <div v-else-if="isProcessing" class="h-full flex flex-col items-center justify-center gap-4">
            <span class="loading loading-ring loading-lg text-primary"></span>
            <div class="text-[10px] uppercase tracking-widest font-medium">{{ statusMessage }}</div>
            <progress v-if="ffmpegProgress > 0" class="progress progress-primary w-56" :value="ffmpegProgress" max="100"></progress>
          </div>
          <div v-else class="h-full flex items-center justify-center text-base-content/30 uppercase tracking-widest text-xs">
            Timeline will appear after analysis
          </div>
        </div>
      </div>

      <!-- Transcription Sidebar (25%) -->
      <aside class="w-1/4 bg-base-100 flex flex-col">
        <div class="p-6 border-b border-base-300">
          <h2 class="text-sm font-bold uppercase tracking-widest">Transcription</h2>
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
            {{ isProcessing ? 'Transcribing...' : 'No transcription yet' }}
          </div>
        </div>
      </aside>
    </main>

    <!-- Hover Preview -->
    <div 
      v-if="currentTranscription && hoveredTime !== null" 
      class="fixed bottom-8 left-1/2 -translate-x-1/2 bg-base-content text-base-100 px-6 py-3 rounded-sm text-sm font-medium tracking-wide pointer-events-none z-50 max-w-2xl text-center shadow-2xl uppercase"
    >
      {{ currentTranscription }}
    </div>
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
