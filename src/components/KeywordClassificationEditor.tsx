import type { KeywordSet } from '../../shared/schema/project'
import { EditableStringList } from './EditableStringList'

type Props = {
  title: string
  keywords: KeywordSet
  onChange: (keywords: KeywordSet) => void
  aiLabel?: string
}

export function KeywordClassificationEditor({ title, keywords, onChange, aiLabel }: Props) {
  return (
    <div className="keyword-classification">
      <h3>
        {title}
        {aiLabel && <span className="ai-badge">{aiLabel}</span>}
      </h3>
      <EditableStringList
        label="Primary keywords"
        items={keywords.primary}
        onChange={(primary) => onChange({ ...keywords, primary })}
      />
      <EditableStringList
        label="Secondary keywords"
        items={keywords.secondary}
        onChange={(secondary) => onChange({ ...keywords, secondary })}
      />
      <EditableStringList
        label="Long-tail keywords"
        items={keywords.longTail}
        onChange={(longTail) => onChange({ ...keywords, longTail })}
      />
    </div>
  )
}
