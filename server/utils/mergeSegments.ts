export interface Segment {
  start: number
  end: number
  text: string
}

export const mergeSegments = (
  chunkSegments: Array<{ segments: Segment[]; offset: number }>,
  overlapSec: number
): Segment[] => {
  const merged: Segment[] = []

  const allSegments = chunkSegments.flatMap(({ segments, offset }) =>
    segments.map((segment) => ({
      start: segment.start + offset,
      end: segment.end + offset,
      text: segment.text
    }))
  )

  allSegments.sort((a, b) => a.start - b.start)

  for (const segment of allSegments) {
    const last = merged[merged.length - 1]
    if (!last) {
      merged.push(segment)
      continue
    }

    const overlapThreshold = overlapSec * 0.5
    if (segment.start <= last.end - overlapThreshold) {
      // Skip likely overlap segment
      continue
    }

    merged.push(segment)
  }

  return merged
}
