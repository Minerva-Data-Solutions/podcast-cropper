import { getJob } from '../utils/jobStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const jobId = Array.isArray(query.jobId) ? query.jobId[0] : query.jobId

  if (!jobId || typeof jobId !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing jobId'
    })
  }

  let job
  try {
    job = await getJob(jobId)
  } catch {
    throw createError({
      statusCode: 404,
      statusMessage: 'Job not found'
    })
  }

  return {
    success: true,
    job: {
      id: job.id,
      status: job.status,
      progress: job.progress,
      transcriptionText: job.transcriptionText,
      segments: job.segments,
      error: job.error,
      updatedAt: job.updatedAt
    }
  }
})