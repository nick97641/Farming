import { useMemo } from 'react'

import type { IdeaSourceReference, Research } from '../../../shared/schema/project'
import { collectResearchReferenceCandidates, type ResearchReferenceCandidate } from '../../lib/researchReferences'

type Props = {
  research: Research
  selected: IdeaSourceReference[]
  onChange: (selected: IdeaSourceReference[]) => void
}

export function ResearchPicker({ research, selected, onChange }: Props) {
  const candidates = useMemo(() => collectResearchReferenceCandidates(research), [research])

  const grouped = useMemo(() => {
    const groups = new Map<string, ResearchReferenceCandidate[]>()
    for (const candidate of candidates) {
      const list = groups.get(candidate.groupLabel) ?? []
      list.push(candidate)
      groups.set(candidate.groupLabel, list)
    }
    return groups
  }, [candidates])

  function isSelected(candidate: ResearchReferenceCandidate) {
    return selected.some((ref) => ref.kind === candidate.kind && ref.referencedId === candidate.referencedId)
  }

  function toggle(candidate: ResearchReferenceCandidate) {
    if (isSelected(candidate)) {
      onChange(selected.filter((ref) => !(ref.kind === candidate.kind && ref.referencedId === candidate.referencedId)))
    } else {
      onChange([
        ...selected,
        { id: crypto.randomUUID(), kind: candidate.kind, referencedId: candidate.referencedId, text: candidate.text },
      ])
    }
  }

  if (candidates.length === 0) {
    return <p className="empty-hint">No research items yet — add some in the Research tab first.</p>
  }

  return (
    <div className="research-picker">
      {[...grouped.entries()].map(([groupLabel, items]) => (
        <div key={groupLabel} className="research-picker-group">
          <h4>{groupLabel}</h4>
          <ul className="research-picker-items">
            {items.map((candidate) => (
              <li key={`${candidate.kind}-${candidate.referencedId}`}>
                <label>
                  <input type="checkbox" checked={isSelected(candidate)} onChange={() => toggle(candidate)} />
                  {candidate.text}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
