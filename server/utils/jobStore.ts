import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export type JobStatus = 'uploaded' | 'processing' | 'completed' | 'error'

export interface JobRecord {
  id: string
  status: JobStatus
  progress: number
  createdAt: string
  updatedAt: string
  originalName: string
  videoPath: string
  audioPath?: string
  chunks?: Array<{
    path: string
    start: number
    duration: number
  }>
  transcriptionText?: string
  segments?: Array<{ start: number; end: number; text: string }>
  error?: string
}

const getBaseDir = () => path.join(process.cwd(), '.data')
const getJobsDir = () => path.join(getBaseDir(), 'jobs')
const getUploadsDir = () => path.join(getBaseDir(), 'uploads')

const ensureDirs = async () => {
  await fs.mkdir(getJobsDir(), { recursive: true })
  await fs.mkdir(getUploadsDir(), { recursive: true })
}

const getJobPath = (jobId: string) => path.join(getJobsDir(), `${jobId}.json`)

export const createJob = async (originalName: string, videoPath: string): Promise<JobRecord> => {
  await ensureDirs()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const record: JobRecord = {
    id,
    status: 'uploaded',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    originalName,
    videoPath
  }

  await fs.writeFile(getJobPath(id), JSON.stringify(record, null, 2), 'utf8')
  return record
}

export const updateJob = async (jobId: string, patch: Partial<JobRecord>): Promise<JobRecord> => {
  const job = await getJob(jobId)
  const updated: JobRecord = {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString()
  }
  await fs.writeFile(getJobPath(jobId), JSON.stringify(updated, null, 2), 'utf8')
  return updated
}

export const getJob = async (jobId: string): Promise<JobRecord> => {
  const data = await fs.readFile(getJobPath(jobId), 'utf8')
  return JSON.parse(data) as JobRecord
}

export const getUploadsPathForJob = async (jobId: string, filename: string) => {
  await ensureDirs()
  const safeName = filename.replace(/[^\w.-]+/g, '_')
  return path.join(getUploadsDir(), `${jobId}_${safeName}`)
}
