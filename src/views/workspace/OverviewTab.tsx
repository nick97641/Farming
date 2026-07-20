type Props = {
  title: string
  topic: string
  onChangeTitle: (title: string) => void
  onChangeTopic: (topic: string) => void
}

export function OverviewTab({ title, topic, onChangeTitle, onChangeTopic }: Props) {
  return (
    <div className="overview-tab">
      <label className="field">
        Title
        <input value={title} onChange={(event) => onChangeTitle(event.target.value)} />
      </label>

      <label className="field">
        Topic
        <input value={topic} onChange={(event) => onChangeTopic(event.target.value)} />
      </label>
    </div>
  )
}
