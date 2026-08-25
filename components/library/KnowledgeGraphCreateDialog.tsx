"use client";

import { useState } from "react";
import { Network, Plus } from "lucide-react";

import { createKnowledgePack } from "@/lib/api";
import { useSafeRouter } from "@/lib/safeRouter";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";

export function KnowledgeGraphCreateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const router = useSafeRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (pending) return;
    setName(""); setDescription(""); setError(null); onClose();
  };
  const create = async () => {
    if (!name.trim()) return;
    setPending(true); setError(null);
    try {
      const graph = await createKnowledgePack({ name: name.trim(), description: description.trim() || null });
      onCreated();
      onClose();
      router.push(`/dashboard/library/graphs/${graph.slug}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Knowledge graph could not be created");
    } finally {
      setPending(false);
    }
  };

  return <Modal open={open} onClose={close} title="Create knowledge graph">
    <div className="space-y-5 p-1">
      <div className="flex items-start gap-3 rounded-xl bg-violet-500/[0.07] p-3.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Network className="h-4 w-4" /></span><div><p className="theme-text text-sm font-medium">Connected context for agents</p><p className="theme-text-muted mt-0.5 text-xs leading-5">Add documents and relationships after creating the graph.</p></div></div>
      <label className="theme-text block text-sm font-medium">Graph name<Input autoFocus className="mt-1.5" value={name} onChange={(event) => setName(event.target.value)} placeholder="Product knowledge" /></label>
      <label className="theme-text block text-sm font-medium">Description<Textarea className="mt-1.5 min-h-28" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What should agents learn from this graph?" /></label>
      {error ? <p className="text-sm text-red-500" role="alert">{error}</p> : null}
      <div className="theme-border flex justify-end gap-2 border-t pt-4"><Button variant="ghost" onClick={close}>Cancel</Button><Button disabled={!name.trim()} isLoading={pending} onClick={() => void create()}><Plus className="h-4 w-4" />Create graph</Button></div>
    </div>
  </Modal>;
}
