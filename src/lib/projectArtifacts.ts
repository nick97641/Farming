import type { Project } from '../../shared/schema/project'

export function safeArtifactBaseName(title: string): string {
  const value = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return value || 'farming-project'
}

export function buildProductTemplate(project: Project): string {
  const idea = project.ideas.find((candidate) => candidate.id === project.selectedIdeaId)
  const brief = project.designBrief

  return [
    `# ${project.title} — Product Template`,
    '',
    `Topic: ${project.topic || '(not set)'}`,
    `Selected idea: ${idea?.title || '(not selected)'}`,
    '',
    '## Customer',
    brief?.audience || idea?.targetAudience || '',
    '',
    '## Problem',
    brief?.problem || idea?.problemSolved || '',
    '',
    '## Intended outcome',
    brief?.outcome || idea?.proposedOutcome || '',
    '',
    '## Format',
    brief?.format || idea?.contentType || '',
    '',
    '## Product description',
    project.products.productDescription,
    '',
    '## Content requirements',
    ...(brief?.contentRequirements.map((item) => `- ${item}`) ?? []),
    '',
    '## Constraints',
    ...(brief?.constraints.map((item) => `- ${item}`) ?? []),
    '',
  ].join('\n')
}

export function buildProductionSummary(project: Project): string {
  const idea = project.ideas.find((candidate) => candidate.id === project.selectedIdeaId)
  const image = project.imageJobs.find((candidate) => candidate.id === project.selectedImageJobId)
  const videos = project.assets.filter((asset) => asset.type === 'video')

  return [
    `# ${project.title} — Production Summary`,
    '',
    `Topic: ${project.topic || '(not set)'}`,
    `Project status: ${project.status}`,
    `Selected idea: ${idea?.title || '(not selected)'}`,
    `Idea stage: ${idea?.productionStage || '(not selected)'}`,
    `Design brief: ${project.designBrief?.status || '(not created)'}`,
    `Preferred image: ${image?.label || '(not selected)'}`,
    `YouTube script: ${project.content.longFormScript.trim() ? 'ready' : 'not created'}`,
    `PDF draft: ${project.content.pdfDraft.trim() ? 'ready' : 'not created'}`,
    `Rendered videos: ${videos.length}`,
    '',
    '## Publication',
    `Platform: ${idea?.publication.platform || ''}`,
    `URL: ${idea?.publication.url || ''}`,
    `Published: ${idea?.publication.publishedAt || ''}`,
    `Notes: ${idea?.publication.notes || ''}`,
    '',
  ].join('\n')
}
