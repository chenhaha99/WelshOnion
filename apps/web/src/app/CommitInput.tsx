import { useEffect, useId, useState } from "react";

interface CommitInputProps {
  label: string;
  /** false：不显示标签文字，只作为读屏名字（表格里用） */
  showLabel?: boolean;
  /** 文档里现在存的值 */
  value: string;
  /** 保存（或决定不保存）；返回要显示的错误，没错给 null */
  commit: (text: string) => string | null;
  inputMode?: "text" | "numeric" | "decimal";
  hint?: string;
  /** 空着时输入框里的淡字 */
  placeholder?: string;
  className?: string;
}

/** 回车或离开时保存；Esc 放弃这次改动。没在改的时候跟着文档走（撤销、别的标签页改了都会变）。 */
export function CommitInput({
  label,
  showLabel = true,
  value,
  commit,
  inputMode = "text",
  hint,
  placeholder,
  className = "input",
}: CommitInputProps) {
  const id = useId();
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);

  const submit = () => {
    const message = commit(text.trim());
    setError(message);
    // 出错时留着用户填的字，方便改；保存了（或不用存）就回到跟着文档走
    if (message === null) setEditing(false);
  };

  const input = (
    <input
      id={id}
      className={className}
      inputMode={inputMode}
      placeholder={placeholder}
      value={text}
      aria-label={showLabel ? undefined : label}
      aria-invalid={error !== null}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(event) => {
        setEditing(true);
        setText(event.target.value);
      }}
      onBlur={() => {
        if (editing) submit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          submit();
        } else if (event.key === "Escape" && editing) {
          event.stopPropagation();
          setEditing(false);
          setError(null);
        }
      }}
    />
  );

  const below = error ? (
    <p id={`${id}-error`} className="text-sm text-danger">
      {error}
    </p>
  ) : (
    hint && <p className="text-xs text-ink-muted">{hint}</p>
  );

  if (!showLabel) {
    return (
      <>
        {input}
        {below}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-ink-muted">
        {label}
      </label>
      {input}
      {below}
    </div>
  );
}
