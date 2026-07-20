import type { ConfidentKeywordSet } from '../../shared/schema/project'
import { ConfidentTextList } from './ConfidentTextList'

type Props = {
  title: string
  keywords: ConfidentKeywordSet
  onChange: (keywords: ConfidentKeywordSet) => void
  aiLabel?: string
}

export function ConfidentKeywordClassificationEditor({ title, keywords, onChange, aiLabel }: Props) {
  return (
    <div className="keyword-classification">
      <h3>
        {title}
        {aiLabel && <span className="ai-badge">{aiLabel}</span>}
      </h3>
      <ConfidentTextList
        label="Primary keywords"
        items={keywords.primary}
        onChange={(primary) => onChange({ ...keywords, primary })}
      />
      <ConfidentTextList
        label="Secondary keywords"
        items={keywords.secondary}
        onChange={(secondary) => onChange({ ...keywords, secondary })}
      />
      <ConfidentTextList
        label="Long-tail keywords"
        items={keywords.longTail}
        onChange={(longTail) => onChange({ ...keywords, longTail })}
      />
    </div>
  )
}
