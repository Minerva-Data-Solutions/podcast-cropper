import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

export const useFFmpeg = () => {
  const ffmpeg = new FFmpeg()
  const isLoading = ref(false)
  const progress = ref(0)
  const isLoaded = ref(false)

  const load = async () => {
    if (isLoaded.value) return
    
    isLoading.value = true
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    
    ffmpeg.on('progress', ({ progress: p }) => {
      progress.value = p * 100
    })

    isLoaded.value = true
    isLoading.value = false
  }

  const extractAudio = async (videoFile: File): Promise<Blob> => {
    if (!isLoaded.value) await load()

    const inputName = 'input.mp4'
    const outputName = 'output.mp3'

    await ffmpeg.writeFile(inputName, await fetchFile(videoFile))
    
    // Extract audio and convert to mp3
    // -vn: no video
    // -ab: audio bitrate
    // -ar: audio rate (16k is good for Whisper)
    await ffmpeg.exec(['-i', inputName, '-vn', '-ar', '16000', '-ac', '1', '-b:a', '64k', outputName])
    
    const data = await ffmpeg.readFile(outputName)
    return new Blob([(data as any).buffer], { type: 'audio/mpeg' })
  }

  return {
    load,
    extractAudio,
    isLoading,
    progress,
    isLoaded
  }
}
