import type { DesignBrief, Idea } from '../../shared/schema/project'
import { CONTENT_TYPE_LABELS } from './ideaOptions'

export function createBriefFromIdea(idea: Idea): DesignBrief {
  const now = new Date().toISOString()
  return {
    sourceIdeaId: idea.id,
    status: 'draft',
    title: idea.title,
    audience: idea.targetAudience,
    problem: idea.problemSolved,
    outcome: idea.proposedOutcome,
    format: CONTENT_TYPE_LABELS[idea.contentType],
    platform: idea.contentType === 'youtube-video' ? 'YouTube' : '',
    contentRequirements: [],
    visualDirection: '',
    constraints: [],
    createdAt: now,
    updatedAt: now,
  }
}
