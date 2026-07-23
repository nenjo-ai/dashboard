"use client";

import { cn } from "@/lib/cn";
import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  CouncilDetail,
  DelegationStrategy,
  CreateCouncilRequest,
  UpdateCouncilRequest,
  AgentDefinition,
} from "@/lib/types";
import { DELEGATION_STRATEGIES } from "@/lib/types";
import {
  createCouncil,
  updateCouncil,
  fetchAgents,
} from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Label } from "@/components/ui/Label";
import { resourceSlug } from "@/lib/resourceSlug";


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberRowData {
  agent_id: string;
}

interface FormState {
  slug: string;
  name: string;
  description: string;
  delegation_strategy: DelegationStrategy;
  leader_agent_id: string;
  members: MemberRowData[];
}

interface FormErrors {
  slug?: string;
  name?: string;
  leader_agent_id?: string;
  members?: string;
  memberRows?: { agent_id?: string }[];
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL: FormState = {
  slug: "",
  name: "",
  description: "",
  delegation_strategy: "dynamic",
  leader_agent_id: "",
  members: [{ agent_id: "" }],
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CouncilFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** When set, form pre-populates for editing. */
  council?: CouncilDetail | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CouncilFormModal({
  open,
  onClose,
  onSaved,
  council,
}: CouncilFormModalProps) {
  const isEdit = !!council;

  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);

  // Agents from API
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Load agents when modal opens
  useEffect(() => {
    if (!open) return;

    async function loadAgents() {
      try {
        setLoadingAgents(true);
        const data = await fetchAgents();
        setAgents(data);
      } catch (e) {
        console.error("Failed to load agents:", e);
      } finally {
        setLoadingAgents(false);
      }
    }

    loadAgents();
  }, [open]);

  // Populate form on open
  useEffect(() => {
    if (!open) return;
    if (council) {
      setForm({
        slug: council.slug,
        name: council.name,
        description: council.description ?? "",
        delegation_strategy: council.delegation_strategy,
        leader_agent_id: council.leader_agent_id,
        members: (council.members?.length ?? 0) > 0
          ? council.members!.map((m) => ({
              agent_id: m.agent_id,
            }))
          : [{ agent_id: "" }],
      });
      setSlugEdited(true);
    } else {
      setForm(INITIAL);
      setSlugEdited(false);
    }
    setErrors({});
    setApiError(null);
  }, [open, council]);

  // Get the selected strategy description
  const selectedStrategy = useMemo(
    () => DELEGATION_STRATEGIES.find((s) => s.id === form.delegation_strategy),
    [form.delegation_strategy],
  );

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------

  const set = useCallback(
    <K extends keyof FormState>(key: K, val: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: val }));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    },
    [],
  );

  const agentRefForId = useCallback(
    (agentId: string): string => {
      const agent = agents.find((item) => item.id === agentId);
      return agent?.slug?.trim() || agent?.name || agentId;
    },
    [agents],
  );

  const handleMemberChange = useCallback(
    (index: number, value: string) => {
      setForm((prev) => {
        const members = [...prev.members];
        members[index] = { agent_id: value };
        return { ...prev, members };
      });
      // Clear member-level errors
      setErrors((prev) => {
        if (!prev.memberRows) return prev;
        const memberRows = [...prev.memberRows];
        if (memberRows[index]) {
          memberRows[index] = { agent_id: undefined };
        }
        return { ...prev, memberRows, members: undefined };
      });
    },
    [],
  );

  const handleAddMember = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      members: [...prev.members, { agent_id: "" }],
    }));
  }, []);

  const handleRemoveMember = useCallback((index: number) => {
    setForm((prev) => {
      const members = prev.members.filter((_, i) => i !== index);
      // Keep at least one member row
      if (members.length === 0) return prev;
      return { ...prev, members };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const validate = useCallback((): boolean => {
    const errs: FormErrors = {};
    const memberRowErrors: { agent_id?: string }[] = [];
    let hasRowErrors = false;

    if (!form.name.trim()) {
      errs.name = "Name is required.";
    }
    if (!resourceSlug(form.slug)) {
      errs.slug = "Stable slug is required.";
    }

    if (!form.leader_agent_id) {
      errs.leader_agent_id = "Council leader is required.";
    }

    if (form.members.length === 0) {
      errs.members = "At least one member is required.";
    }

    // Check for duplicate agents
    const usedAgents = new Set<string>();
    if (form.leader_agent_id) {
      usedAgents.add(form.leader_agent_id);
    }

    for (let i = 0; i < form.members.length; i++) {
      const row = form.members[i];
      const rowErr: { agent_id?: string } = {};

      if (!row.agent_id) {
        rowErr.agent_id = "Agent is required.";
        hasRowErrors = true;
      } else if (usedAgents.has(row.agent_id)) {
        rowErr.agent_id = "This agent is already in the council.";
        hasRowErrors = true;
      } else {
        usedAgents.add(row.agent_id);
      }

      memberRowErrors.push(rowErr);
    }

    if (hasRowErrors) {
      errs.memberRows = memberRowErrors;
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;
      setSubmitting(true);
      setApiError(null);

      try {
        if (isEdit && council) {
          const data: UpdateCouncilRequest = {
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            delegation_strategy: form.delegation_strategy,
          };
          await updateCouncil(council.id, data);
        } else {
          const data: CreateCouncilRequest = {
            slug: resourceSlug(form.slug),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            leader_agent: agentRefForId(form.leader_agent_id),
            delegation_strategy: form.delegation_strategy,
            members: form.members.map((m) => ({
              agent: agentRefForId(m.agent_id),
            })),
          };
          await createCouncil(data);
        }

        onSaved();
        onClose();
      } catch (err) {
        setApiError(
          err instanceof Error ? err.message : "Failed to save council.",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [form, isEdit, council, validate, agentRefForId, onSaved, onClose],
  );

  const handleClose = useCallback(() => {
    if (!submitting) onClose();
  }, [submitting, onClose]);

  // Format agent for display in dropdown
  const formatAgent = (agent: AgentDefinition): string => {
    return agent.description
      ? `${agent.name} — ${agent.description}`
      : agent.name;
  };

  // Get available agents (excluding already selected ones for members)
  const getAvailableAgents = (excludeIds: string[]): AgentDefinition[] => {
    return agents.filter(a => !excludeIds.includes(a.id));
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? "Edit Council" : "Create New Council"}
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* API Error */}
        {apiError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
            {apiError}
          </div>
        )}

        {/* Name */}
        <div>
          <Label required>
            Name
          </Label>
          <Input
            value={form.name}
            onChange={(e) => {
              set("name", e.target.value);
              if (!slugEdited && !isEdit) set("slug", resourceSlug(e.target.value));
            }}
            placeholder="e.g. Code Review Council"
            error={!!errors.name}
            disabled={submitting}
            className="mt-1"
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-500">{errors.name}</p>
          )}
        </div>

        <div>
          <Label required>Stable slug</Label>
          <Input
            value={form.slug}
            onChange={(e) => {
              set("slug", resourceSlug(e.target.value));
              setSlugEdited(true);
            }}
            placeholder="code-review-council"
            error={!!errors.slug}
            disabled={submitting || isEdit}
            className="mt-1 font-mono"
          />
          {errors.slug ? (
            <p className="mt-1 text-xs text-red-500">{errors.slug}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              Permanent reference used by agents; renaming the council will not change it.
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <Label>
            Description
          </Label>
          <Input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Brief description of this council's purpose..."
            disabled={submitting}
            className="mt-1"
          />
        </div>

        {/* Delegation Strategy */}
        <div>
          <Label>
            Delegation Strategy
          </Label>
          <Select
            value={form.delegation_strategy}
            onChange={(e) =>
              set("delegation_strategy", e.target.value as DelegationStrategy)
            }
            disabled={submitting}
            className="mt-1"
          >
            {DELEGATION_STRATEGIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          {selectedStrategy && (
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              {selectedStrategy.description}
            </p>
          )}
        </div>

        {/* Council Leader */}
        <div>
          <Label required>
            Council Leader
          </Label>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
            The leader orchestrates the council, delegates tasks, and synthesizes results.
          </p>

          {loadingAgents ? (
            <div className="animate-pulse h-10 bg-gray-200 rounded-sm dark:bg-gray-700"></div>
          ) : (
            <Select
              value={form.leader_agent_id}
              onChange={(e) => set("leader_agent_id", e.target.value)}
              disabled={submitting}
              error={!!errors.leader_agent_id}
            >
              <option value="">Select leader agent...</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {formatAgent(agent)}
                </option>
              ))}
            </Select>
          )}
          {errors.leader_agent_id && (
            <p className="mt-1 text-xs text-red-500">{errors.leader_agent_id}</p>
          )}
        </div>

        {/* Council Members */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label required>
              Council Members
            </Label>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {form.members.length} member{form.members.length !== 1 ? "s" : ""}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Select agents for each council member.
          </p>

          {errors.members && (
            <p className="mb-2 text-xs text-red-500">{errors.members}</p>
          )}

          <div className="space-y-2">
            {form.members.map((member, index) => {
              // Get agents that are available (not used by leader or other members)
              const usedIds = [
                form.leader_agent_id,
                ...form.members.map((m, i) => i !== index ? m.agent_id : null).filter(Boolean) as string[]
              ];
              const availableAgents = getAvailableAgents(usedIds);

              return (
                <div key={index} className="flex gap-2">
                  <div className="flex-1">
                    <Select
                      value={member.agent_id}
                      onChange={(e) => handleMemberChange(index, e.target.value)}
                      disabled={submitting}
                      error={!!errors.memberRows?.[index]?.agent_id}
                    >
                      <option value="">Select agent...</option>
                      {availableAgents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {formatAgent(agent)}
                        </option>
                      ))}
                    </Select>
                    {errors.memberRows?.[index]?.agent_id && (
                      <p className="mt-1 text-xs text-red-500">
                        {errors.memberRows[index].agent_id}
                      </p>
                    )}
                  </div>
                  {form.members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(index)}
                      disabled={submitting}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Member button */}
          <button
            type="button"
            onClick={handleAddMember}
            disabled={submitting}
            className={cn(
              "mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors",
              "hover:border-deep-space-blue-400 hover:text-deep-space-blue-600 hover:bg-deep-space-blue-50",
              "dark:border-gray-600 dark:text-gray-400 dark:hover:border-deep-space-blue-500 dark:hover:text-deep-space-blue-400 dark:hover:bg-deep-space-blue-950/30",
              "focus:outline-hidden focus:ring-2 focus:ring-deep-space-blue-500 focus:ring-offset-1",
              submitting && "opacity-50 cursor-not-allowed",
            )}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Member
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </>
            ) : isEdit ? (
              "Save Changes"
            ) : (
              "Create Council"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
