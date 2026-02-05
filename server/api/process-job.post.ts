import { promises as fs } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { getJob, updateJob } from '../utils/jobStore'
import { chunkAudio } from '../utils/chunkAudio'
import { mergeSegments } from '../utils/mergeSegments'

const runCommand = (command: string, args: string[]) => {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(stderr || `${command} exited with code ${code}`))
      }
    })
  })
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody<{ jobId?: string }>(event)

  if (!body?.jobId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing jobId'
    })
  }

  const job = await getJob(body.jobId)

  if (!job.videoPath) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Job has no video file'
    })
  }

  if (job.status === 'processing') {
    return { success: true, status: 'processing' }
  }

  if (job.status === 'completed') {
    return { success: true, status: 'completed' }
  }

  await updateJob(job.id, { status: 'processing', progress: 0 })

  const processAsync = async () => {
    try {
      const groqApiKey = config.groqApiKey || process.env.GROQ_API_KEY || process.env.NUXT_GROQ_API_KEY
      if (!groqApiKey) {
        throw new Error('Groq API key not configured')
      }

      const baseDir = path.dirname(job.videoPath)
      const audioPath = path.join(baseDir, `${job.id}_audio.mp3`)

      await updateJob(job.id, { audioPath, progress: 5 })

      // Extract audio
      await runCommand('ffmpeg', [
        '-y',
        '-i', job.videoPath,
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        '-b:a', '64k',
        audioPath
      ])

      let chunkDurationSec = Number(config.chunkDurationSec || 480)
      let overlapSec = Number(config.chunkOverlapSec || 10)
      if (!Number.isFinite(chunkDurationSec) || chunkDurationSec <= 0) {
        chunkDurationSec = 480
      }
      if (!Number.isFinite(overlapSec) || overlapSec < 0 || overlapSec >= chunkDurationSec) {
        overlapSec = 10
      }

      const chunksDir = path.join(baseDir, `${job.id}_chunks`)
      const { duration, chunks } = await chunkAudio(audioPath, chunksDir, chunkDurationSec, overlapSec)

      await updateJob(job.id, {
        chunks,
        progress: 15
      })

      if (chunks.length === 0) {
        throw new Error('No audio chunks were produced')
      }

      const { Groq } = await import('groq-sdk')
      const groq = new Groq({ apiKey: groqApiKey })

      const chunkResults: Array<{ segments: Array<{ start: number; end: number; text: string }>; offset: number }> = []
      let combinedText = ''

      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i]
        if (!chunk) {
          throw new Error('Chunk not found')
        }
        const fileData = await fs.readFile(chunk.path)

        let file: File | Blob
        if (typeof File !== 'undefined') {
          file = new File([fileData], path.basename(chunk.path), { type: 'audio/mpeg' })
        } else {
          file = new Blob([fileData], { type: 'audio/mpeg' })
        }

        const transcription = await groq.audio.transcriptions.create({
          file: file as any,
          model: 'whisper-large-v3',
          response_format: 'verbose_json'
        })

        const segments = (transcription as any).segments?.map((s: any) => ({
          start: s.start,
          end: s.end,
          text: s.text
        })) || []

        chunkResults.push({ segments, offset: chunk.start })
        combinedText += (transcription.text || '') + '\n'

        const progress = 15 + Math.floor(((i + 1) / chunks.length) * 70)
        await updateJob(job.id, { progress })
      }

      const mergedSegments = mergeSegments(chunkResults, overlapSec)
      const transcriptionText = combinedText.trim()

      await updateJob(job.id, {
        status: 'completed',
        progress: 100,
        transcriptionText,
        segments: mergedSegments
      })

      return { duration }
    } catch (error: any) {
      await updateJob(job.id, {
        status: 'error',
        progress: 0,
        error: error.message || 'Processing failed'
      })
      throw error
    }
  }

  setTimeout(() => {
    processAsync().catch(() => {
      // Errors are stored in job record
    })
  }, 0)

  return { success: true, status: 'processing' }
})
