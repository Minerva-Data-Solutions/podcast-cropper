import { promises as fs } from 'node:fs'
import { createJob, getUploadsPathForJob, updateJob } from '../utils/jobStore'
import { validateAudioFile } from '../utils/validation'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)

  if (!formData || !formData.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No video file provided'
    })
  }

  const videoFile = formData[0]
  if (!videoFile) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No video file provided'
    })
  }

  const validation = validateAudioFile(videoFile)
  if (!validation.valid) {
    throw createError({
      statusCode: 400,
      statusMessage: validation.error || 'Invalid video file'
    })
  }

  const job = await createJob(videoFile.filename || 'video', '')
  const uploadPath = await getUploadsPathForJob(job.id, videoFile.filename || 'video')

  const fileData = videoFile.data instanceof Buffer
    ? videoFile.data
    : Buffer.from(videoFile.data)

  await fs.writeFile(uploadPath, fileData)

  const updated = await updateJob(job.id, { videoPath: uploadPath })

  return {
    success: true,
    jobId: updated.id
  }
})
