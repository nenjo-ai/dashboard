"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createRoutine } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";

export function CreateRoutineDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) return;
    setName("");
    setDescription("");
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const routine = await createRoutine({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      onCreated();
      onClose();
      toast.success("Routine created.");
      router.push(`/dashboard/routines/${routine.id}?tab=workflow`);
    } catch {
      toast.error("Failed to create routine.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create routine">
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <label className="theme-text mb-1.5 block text-sm font-medium" htmlFor="routine-name">
            Name
          </label>
          <Input
            autoFocus
            id="routine-name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Code review pipeline"
            value={name}
          />
          <p className="theme-text-muted mt-1.5 text-xs">Use a name that describes the repeatable outcome.</p>
        </div>
        <div>
          <label className="theme-text mb-1.5 block text-sm font-medium" htmlFor="routine-description">
            Description <span className="theme-text-muted font-normal">optional</span>
          </label>
          <Textarea
            id="routine-description"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Explain when this workflow should be used."
            value={description}
          />
        </div>
        <div className="theme-border flex justify-end gap-2 border-t pt-4">
          <Button disabled={creating} onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button disabled={!name.trim()} isLoading={creating} type="submit">
            {creating ? "Creating" : "Create routine"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
