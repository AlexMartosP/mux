import { useState } from "react";

export function EditText({ value, onBlur }: { value: string, onBlur: (value: string) => void }) {

  const [isEditing, setIsEditing] = useState(false);
  const [saveValue, setSaveValue] = useState(value);
  const [width, setWidth] = useState(0);

  function handleBlur() {
    setIsEditing(false);
    onBlur(saveValue);
  }

  if (isEditing) {
    return (
      <input
        type="text"
        className="border-b border-foreground outline-none -mb-px"
        value={saveValue}
        onChange={(e) => setSaveValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleBlur();
          if (e.key === "Escape") setIsEditing(false);
        }}
        autoFocus
        style={{ width: `${width}px` }}
      />
    )
  }

  return (
    <h2
      ref={(ref) => {
        if (ref) {
          setWidth(ref.clientWidth);
        }
      }}
      className="px-1.5 py-0.5 cursor-text"
      title="Agent name/description being generated"
      onClick={() => setIsEditing(true)}
    >
      {value}
    </h2>
  )

}
