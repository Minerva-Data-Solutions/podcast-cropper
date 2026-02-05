import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

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

const getDurationSeconds = async (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]
    const child = spawn('ffprobe', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let stderr = ''
    child.stdout.on('data', (data) => {
      output += data.toString()
    })
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `ffprobe exited with code ${code}`))
        return
      }
      const duration = parseFloat(output.trim())
      resolve(Number.isFinite(duration) ? duration : 0)
    })
  })
}

export interface AudioChunk {
  path: string
  start: number
  duration: number
}

export const chunkAudio = async (
  audioPath: string,
  outputDir: string,
  chunkDurationSec: number,
  overlapSec: number
): Promise<{ duration: number; chunks: AudioChunk[] }> => {
  await fs.mkdir(outputDir, { recursive: true })
  const totalDuration = await getDurationSeconds(audioPath)
  const chunks: AudioChunk[] = []

  if (!totalDuration || totalDuration <= 0) {
    return { duration: 0, chunks: [] }
  }

  let index = 0
  for (let start = 0; start < totalDuration; start += chunkDurationSec) {
    const duration = Math.min(chunkDurationSec + overlapSec, totalDuration - start)
    const outputPath = path.join(outputDir, `chunk_${index}.mp3`)

    const args = [
      '-y',
      '-ss', start.toString(),
      '-t', duration.toString(),
      '-i', audioPath,
      '-vn',
      '-ac', '1',
      '-ar', '16000',
      '-b:a', '64k',
      outputPath
    ]

    await runCommand('ffmpeg', args)
    chunks.push({ path: outputPath, start, duration })
    index += 1
  }

  return { duration: totalDuration, chunks }
}
