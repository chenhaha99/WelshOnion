import { useState, type FormEvent } from "react";
import { navigate, planHref } from "../app/route";
import { useLibrary, useNow } from "../app/services";
import { createPlan } from "../storage/plans";

/** 「新建计划」按钮；点开是一个只问名字的输入框，建好直接进这个计划。 */
export function NewPlan({ label }: { label: string }) {
  const library = useLibrary();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  const cancel = () => {
    setOpen(false);
    setName("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const trimmed = name.trim();
      const plan = await createPlan(library, { name: trimmed === "" ? undefined : trimmed, now: now() });
      navigate(planHref(plan.planId));
      void plan.close();
    } catch (error) {
      setCreating(() => {
        throw error;
      });
    }
  };

  return (
    <form className="flex flex-wrap items-center justify-center gap-2" onSubmit={submit}>
      <input
        aria-label="计划名"
        autoFocus
        className="input w-56"
        placeholder="未命名计划"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") cancel();
        }}
      />
      <button type="submit" className="btn btn-primary" disabled={creating}>
        新建
      </button>
      <button type="button" className="btn btn-ghost" onClick={cancel}>
        取消
      </button>
    </form>
  );
}
