"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  BackgroundVariant,
  MarkerType,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/Button";
import { RoutineStepNode, type StepNodeData } from "./RoutineStepNode";
import { TriggerNode, type TriggerNodeData } from "./TriggerNode";
import { StepConfigPanel } from "./StepConfigPanel";
import { AddStepModal } from "./AddStepModal";
import { HANDLE_GATE_PASS, HANDLE_GATE_FAIL } from "./constants";

import type {
  RoutineDetail,
  RoutineStep,
  RoutineEdge as RoutineEdgeType,
  RoutineStepType,
  RoutineEdgeCondition,
  RoutineTrigger,
  CouncilDetail,
  AgentDefinition,
} from "@/lib/types";
import { ROUTINE_TRIGGERS } from "@/lib/types";
import {
  updateRoutine,
  createRoutineStep,
  updateRoutineStep,
  deleteRoutineStep,
  createRoutineEdge,
  deleteRoutineEdge,
  fetchAgents,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRIGGER_NODE_ID = "__trigger__";
const TEMP_PREFIX = "__temp_";

// ---------------------------------------------------------------------------
// Edge styling helpers
// ---------------------------------------------------------------------------

/** Edge styling based on condition. Gate/cron/lambda edges show pass/fail labels. */
function conditionEdgeStyle(condition: RoutineEdgeCondition, isFromGate: boolean): {
  stroke: string;
  animated: boolean;
  label: string | undefined;
} {
  switch (condition) {
    case "on_pass":
    case "on_review_pass":
      return { stroke: "#34d399", animated: false, label: isFromGate ? "pass" : undefined };
    case "on_fail":
    case "on_review_fail":
      return { stroke: "#f87171", animated: true, label: isFromGate ? "fail" : undefined };
    default:
      return { stroke: "#9ca3af", animated: false, label: undefined };
  }
}

// ---------------------------------------------------------------------------
// Node types registration
// ---------------------------------------------------------------------------

const nodeTypes = {
  routineStep: RoutineStepNode,
  triggerNode: TriggerNode,
};

// ---------------------------------------------------------------------------
// Helpers: convert backend data → ReactFlow nodes/edges
// ---------------------------------------------------------------------------

function stepsToNodes(
  steps: RoutineStep[],
  agents: AgentDefinition[],
  councils: CouncilDetail[] | undefined,
  roles: AgentDefinition[]
): Node[] {
  return steps.map((step) => {
    const agent = agents.find((a) => a.id === step.agent_id);
    const council = step.council_id
      ? councils?.find((c) => c.id === step.council_id)
      : null;
    // Get agent_id from top-level DB column (preferred) or config fallback
    const roleId = (step.agent_id ?? step.config?.agent_id) as string | undefined;
    const role = roleId ? roles.find(r => r.id === roleId) : null;
    const roleName = role?.name ?? null;

    return {
      id: step.id,
      type: "routineStep",
      position: { x: step.position_x, y: step.position_y },
      data: {
        label: step.name,
        stepType: step.step_type,
        agentId: step.agent_id,
        agentName: agent?.name ?? null,
        agentRole: roleName,
        councilId: step.council_id ?? null,
        councilName: council?.name ?? null,
        lambdaId: step.lambda_id ?? null,
        delegationStrategy: council?.delegation_strategy ?? null,
        memberCount: council?.members?.length ?? null,
        config: step.config,
      } satisfies StepNodeData,
    };
  });
}

function makeTriggerNode(trigger: RoutineTrigger): Node {
  const triggerInfo = ROUTINE_TRIGGERS.find((t) => t.id === trigger);
  return {
    id: TRIGGER_NODE_ID,
    type: "triggerNode",
    position: { x: 250, y: -80 },
    draggable: true,
    selectable: false,
    deletable: false,
    data: {
      triggerLabel: triggerInfo?.label ?? trigger,
      triggerType: trigger,
    } satisfies TriggerNodeData,
  };
}

/** Build visual-only trigger edges from routine metadata entry_step_ids */
function triggerEdgesFromMetadata(metadata: Record<string, unknown>): Edge[] {
  const entryStepIds = Array.isArray(metadata?.entry_step_ids)
    ? (metadata.entry_step_ids as string[])
    : [];
  return entryStepIds.map((targetId) => ({
    id: `trigger-edge-${targetId}`,
    source: TRIGGER_NODE_ID,
    target: targetId,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    style: { strokeWidth: 2, strokeDasharray: "6 3" },
    animated: true,
    data: { condition: "trigger", isTriggerEdge: true },
  }));
}

function routineEdgesToFlowEdges(edges: RoutineEdgeType[], steps: RoutineStep[]): Edge[] {
  return edges.map((edge) => {
    const sourceStep = steps.find((s) => s.id === edge.source_step_id);
    const isFromGateOrCron = sourceStep?.step_type === "gate" || sourceStep?.step_type === "cron";
    const style = conditionEdgeStyle(edge.condition, isFromGateOrCron);

    // For gate/cron edges, map condition back to the correct source handle
    let sourceHandle: string | undefined;
    if (isFromGateOrCron) {
      if (edge.condition === "on_fail" || edge.condition === "on_review_fail") {
        sourceHandle = HANDLE_GATE_FAIL;
      } else {
        sourceHandle = HANDLE_GATE_PASS;
      }
    }

    return {
      id: edge.id,
      source: edge.source_step_id,
      target: edge.target_step_id,
      sourceHandle,
      label: style.label,
      type: "smoothstep",
      animated: style.animated,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: style.stroke },
      style: { strokeWidth: 2, stroke: style.stroke },
      data: { condition: edge.condition },
    };
  });
}

// ---------------------------------------------------------------------------
// Step update payload (accumulated per-node for batch save)
// ---------------------------------------------------------------------------

interface StepUpdatePayload {
  name?: string;
  step_type?: RoutineStepType;
  agent_id?: string | null;
  council_id?: string;
  lambda_id?: string | null;
  config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RoutineEditorProps {
  routine: RoutineDetail;
  agents: AgentDefinition[];
  councils?: CouncilDetail[];
  onSaved: () => void;
}

// ---------------------------------------------------------------------------
// Inner component (must be inside ReactFlowProvider)
// ---------------------------------------------------------------------------

function RoutineEditorInner({
  routine,
  agents,
  councils,
  onSaved,
}: RoutineEditorProps) {
  // ── State ──────────────────────────────────────────────────────────────
  const initialTrigger = routine.trigger as RoutineTrigger;

  // Load roles for displaying role names in nodes
  const [roles, setRoles] = useState<AgentDefinition[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);

  useEffect(() => {
    async function loadRoles() {
      try {
        const data = await fetchAgents();
        setRoles(data);
      } catch (e) {
        console.error("Failed to load roles:", e);
      } finally {
        setLoadingRoles(false);
      }
    }
    loadRoles();
  }, []);

  // Update nodes when roles finish loading
  useEffect(() => {
    if (!loadingRoles) {
      setNodes((nds) => [
        nds[0], // Keep trigger node
        ...stepsToNodes(routine.steps, agents, councils, roles),
      ]);
    }
  }, [loadingRoles, roles, routine.steps, agents, councils]);

  const [nodes, setNodes, onNodesChange] = useNodesState([makeTriggerNode(initialTrigger)]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([
    ...triggerEdgesFromMetadata(routine.metadata),
    ...routineEdgesToFlowEdges(routine.edges, routine.steps),
  ]);

  const [trigger, setTrigger] = useState<RoutineTrigger>(initialTrigger);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Accumulated step config updates (from StepConfigPanel "Apply")
  const [pendingStepUpdates, setPendingStepUpdates] = useState<Map<string, StepUpdatePayload>>(new Map());

  // Temp ID counter for new steps/edges
  const tempIdCounter = useRef(0);
  const nextTempId = useCallback((prefix: string) => {
    tempIdCounter.current += 1;
    return `${TEMP_PREFIX}${prefix}_${tempIdCounter.current}`;
  }, []);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // ── Re-sync from backend after save ────────────────────────────────────
  const lastRoutineUpdatedAt = useRef(routine.updated_at);
  useEffect(() => {
    if (routine.updated_at !== lastRoutineUpdatedAt.current) {
      lastRoutineUpdatedAt.current = routine.updated_at;
      setEdges([
        ...triggerEdgesFromMetadata(routine.metadata),
        ...routineEdgesToFlowEdges(routine.edges, routine.steps),
      ]);
      setTrigger(routine.trigger as RoutineTrigger);
      setIsDirty(false);
      setPendingStepUpdates(new Map());
    }
  }, [routine.updated_at, routine.metadata, routine.edges, routine.steps, routine.trigger, setEdges]);

  // ── Update trigger node when trigger changes ───────────────────────────
  const handleTriggerChange = useCallback(
    (newTrigger: RoutineTrigger) => {
      setTrigger(newTrigger);
      setIsDirty(true);
      const triggerInfo = ROUTINE_TRIGGERS.find((t) => t.id === newTrigger);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === TRIGGER_NODE_ID
            ? {
                ...n,
                data: {
                  triggerLabel: triggerInfo?.label ?? newTrigger,
                  triggerType: newTrigger,
                } satisfies TriggerNodeData,
              }
            : n,
        ),
      );
    },
    [setNodes],
  );

  // ── Selected node data ─────────────────────────────────────────────────
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId],
  );
  const selectedNodeData = selectedNode?.data as StepNodeData | undefined;

  // ── Callbacks (all local-only — no API calls) ──────────────────────────

  // Connect two nodes — local only
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Trigger → step edge
      if (connection.source === TRIGGER_NODE_ID) {
        setEdges((eds) =>
          addEdge(
            {
              ...connection,
              id: `trigger-edge-${connection.target}`,
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              style: { strokeWidth: 2, strokeDasharray: "6 3" },
              animated: true,
              data: { condition: "trigger", isTriggerEdge: true },
            },
            eds,
          ),
        );
        setIsDirty(true);
        return;
      }

      // Derive condition from gate handle, otherwise "always"
      let condition: RoutineEdgeCondition = "always";
      if (connection.sourceHandle === HANDLE_GATE_PASS) {
        condition = "on_pass";
      } else if (connection.sourceHandle === HANDLE_GATE_FAIL) {
        condition = "on_fail";
      }

      const isFromGate = condition !== "always";
      const style = conditionEdgeStyle(condition, isFromGate);
      const tempEdgeId = nextTempId("edge");

      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: tempEdgeId,
            type: "smoothstep",
            label: style.label,
            animated: style.animated,
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: style.stroke },
            style: { strokeWidth: 2, stroke: style.stroke },
            data: { condition },
          },
          eds,
        ),
      );
      setIsDirty(true);
    },
    [setEdges, nextTempId],
  );

  // Click a node → open config panel (not for trigger node)
  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    if (node.id === TRIGGER_NODE_ID) return;
    setSelectedNodeId(node.id);
  }, []);

  // Click an edge → delete it locally
  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      setIsDirty(true);
    },
    [setEdges],
  );

  // Click canvas background → deselect
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Node drag stop → just mark dirty (position is tracked in ReactFlow state)
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.id === TRIGGER_NODE_ID) return;
      setIsDirty(true);
    },
    [],
  );

  // Prevent deleting the trigger node
  const handleNodesChange: OnNodesChange<Node> = useCallback(
    (changes) => {
      const filtered = changes.filter((change) => {
        if (change.type === "remove" && change.id === TRIGGER_NODE_ID) return false;
        return true;
      });
      onNodesChange(filtered);
    },
    [onNodesChange],
  );

  // Prevent deleting trigger edges via keyboard
  const handleEdgesChange: OnEdgesChange<Edge> = useCallback(
    (changes) => {
      const filtered = changes.filter((change) => {
        if (change.type === "remove") {
          const edge = edges.find((e) => e.id === change.id);
          const edgeData = edge?.data as Record<string, unknown> | undefined;
          if (edgeData?.isTriggerEdge) return false;
        }
        return true;
      });
      onEdgesChange(filtered);
    },
    [onEdgesChange, edges],
  );

  // ── Add Step (local only) ──────────────────────────────────────────────

  const handleAddStep = useCallback(
    (stepType: RoutineStepType, roleId?: string, councilId?: string, lambdaId?: string) => {
      const council = councilId ? councils?.find((c) => c.id === councilId) : null;
      const role = roleId ? roles.find(r => r.id === roleId) : null;
      const roleName = role?.name ?? null;

      const name =
        stepType === "council"
          ? council?.name ?? "New Council Step"
          : stepType === "agent"
            ? "Agent Step"
            : stepType === "cron"
              ? "Cron Step"
              : stepType === "lambda"
                ? "Lambda Step"
                : stepType === "gate"
                  ? "Quality Gate"
                  : stepType === "terminal_fail"
                    ? "Failed"
                    : "Done";

      const stepNodes = nodes.filter((n) => n.id !== TRIGGER_NODE_ID);
      const position_x = 250;
      const position_y = 50 + stepNodes.length * 120;

      const config: Record<string, unknown> = {};
      if (roleId) config.agent_id = roleId;
      if (lambdaId && stepType === "cron") config.lambda_id = lambdaId;

      const tempId = nextTempId("step");

      const newNode: Node = {
        id: tempId,
        type: "routineStep",
        position: { x: position_x, y: position_y },
        data: {
          label: name,
          stepType: stepType,
          agentId: null,
          agentName: null,
          agentRole: roleName,
          councilId: councilId ?? null,
          councilName: council?.name ?? null,
          lambdaId: lambdaId ?? null,
          delegationStrategy: council?.delegation_strategy ?? null,
          memberCount: council?.members?.length ?? null,
          config,
        } satisfies StepNodeData,
      };

      // Store the creation payload
      setPendingStepUpdates((prev) => {
        const next = new Map(prev);
        next.set(tempId, {
          name,
          step_type: stepType,
          agent_id: roleId ?? null,
          council_id: councilId,
          lambda_id: lambdaId ?? null,
          config,
        });
        return next;
      });

      setNodes((nds) => [...nds, newNode]);
      setAddStepOpen(false);
      setIsDirty(true);
    },
    [councils, nodes, roles, setNodes, nextTempId],
  );

  // ── Update Step (local only — from config panel "Apply") ──────────────

  const handleUpdateStep = useCallback(
    (data: StepUpdatePayload) => {
      if (!selectedNodeId) return;

      // Accumulate the update payload
      setPendingStepUpdates((prev) => {
        const next = new Map(prev);
        const existing = next.get(selectedNodeId) ?? {};
        next.set(selectedNodeId, { ...existing, ...data });
        return next;
      });

      // Update local node data for visual representation
      const agent = data.agent_id ? agents.find((a) => a.id === data.agent_id) : undefined;
      const council = data.council_id ? councils?.find((c) => c.id === data.council_id) : undefined;
      const roleId = data.agent_id ?? data.config?.agent_id as string | undefined;
      const role = roleId ? roles.find((r) => r.id === roleId) : undefined;

      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== selectedNodeId) return n;
          const d = n.data as StepNodeData;
          return {
            ...n,
            data: {
              label: data.name ?? d.label,
              stepType: (data.step_type ?? d.stepType) as RoutineStepType,
              agentId: data.agent_id !== undefined ? data.agent_id : d.agentId,
              agentName: agent ? agent.name : (data.agent_id !== undefined ? null : d.agentName),
              agentRole: role ? role.name : (data.agent_id !== undefined ? null : d.agentRole),
              councilId: data.council_id !== undefined ? (data.council_id ?? null) : d.councilId,
              councilName: council ? council.name : (data.council_id !== undefined ? null : d.councilName),
              lambdaId: data.lambda_id !== undefined ? data.lambda_id : d.lambdaId,
              delegationStrategy: council?.delegation_strategy ?? d.delegationStrategy,
              memberCount: council?.members?.length ?? d.memberCount,
              config: data.config ?? d.config,
            } satisfies StepNodeData,
          };
        }),
      );
      setIsDirty(true);
    },
    [selectedNodeId, agents, councils, roles, setNodes],
  );

  // ── Delete Step (local only) ──────────────────────────────────────────

  const handleDeleteStep = useCallback(() => {
    if (!selectedNodeId) return;

    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) =>
      eds.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      ),
    );
    // Remove from pending updates
    setPendingStepUpdates((prev) => {
      const next = new Map(prev);
      next.delete(selectedNodeId);
      return next;
    });
    setSelectedNodeId(null);
    setIsDirty(true);
  }, [selectedNodeId, setNodes, setEdges]);

  // ── Save Routine (batch all changes to backend) ──────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const currentStepNodes = nodes.filter((n) => n.id !== TRIGGER_NODE_ID);
      const originalStepIds = new Set(routine.steps.map((s) => s.id));
      const originalEdgeIds = new Set(routine.edges.map((e) => e.id));

      // ── 1. Create new steps (temp IDs → real IDs) ──
      const newNodes = currentStepNodes.filter((n) => n.id.startsWith(TEMP_PREFIX));
      const tempToReal = new Map<string, string>();

      for (const node of newNodes) {
        const data = node.data as StepNodeData;
        const updates = pendingStepUpdates.get(node.id);
        const step = await createRoutineStep(routine.id, {
          name: updates?.name ?? data.label,
          step_type: (updates?.step_type ?? data.stepType) as RoutineStepType,
          agent_id: updates?.agent_id ?? (data.config?.agent_id as string) ?? undefined,
          council_id: updates?.council_id ?? data.councilId ?? undefined,
          lambda_id: updates?.lambda_id ?? data.lambdaId ?? undefined,
          config: updates?.config ?? data.config ?? {},
          position_x: Math.round(node.position.x),
          position_y: Math.round(node.position.y),
          order_index: currentStepNodes.indexOf(node),
        });
        tempToReal.set(node.id, step.id);
      }

      // ── 2. Delete removed steps ──
      const deletedStepIds = routine.steps
        .filter((s) => !currentStepNodes.some((n) => n.id === s.id))
        .map((s) => s.id);
      for (const id of deletedStepIds) {
        await deleteRoutineStep(routine.id, id);
      }

      // ── 3. Update existing steps (position + config) ──
      const existingNodes = currentStepNodes.filter((n) => originalStepIds.has(n.id));
      for (const node of existingNodes) {
        const original = routine.steps.find((s) => s.id === node.id)!;
        const updates: Record<string, unknown> = {};
        const pendingUpdate = pendingStepUpdates.get(node.id);

        // Position changes
        if (Math.round(node.position.x) !== original.position_x) {
          updates.position_x = Math.round(node.position.x);
        }
        if (Math.round(node.position.y) !== original.position_y) {
          updates.position_y = Math.round(node.position.y);
        }

        // Config/name/type changes from panel
        if (pendingUpdate) {
          Object.assign(updates, pendingUpdate);
        }

        if (Object.keys(updates).length > 0) {
          await updateRoutineStep(routine.id, node.id, updates);
        }
      }

      // ── 4. Delete removed edges ──
      // Skip edges connected to deleted steps — those are already cascade-deleted
      // by the DB when the step was removed in phase 2.
      const deletedStepIdSet = new Set(deletedStepIds);
      const currentRegularEdges = edges.filter(
        (e) => !(e.data as Record<string, unknown>)?.isTriggerEdge,
      );
      const deletedEdgeIds = routine.edges
        .filter((e) => !currentRegularEdges.some((ce) => ce.id === e.id))
        .filter((e) => !deletedStepIdSet.has(e.source_step_id) && !deletedStepIdSet.has(e.target_step_id))
        .map((e) => e.id);
      for (const id of deletedEdgeIds) {
        await deleteRoutineEdge(routine.id, id);
      }

      // ── 5. Create new edges (mapping temp step IDs) ──
      const newEdges = currentRegularEdges.filter((e) => !originalEdgeIds.has(e.id));
      for (const edge of newEdges) {
        const sourceId = tempToReal.get(edge.source) ?? edge.source;
        const targetId = tempToReal.get(edge.target) ?? edge.target;
        const condition = (edge.data as Record<string, unknown>)?.condition as RoutineEdgeCondition ?? "always";
        await createRoutineEdge(routine.id, {
          source_step_id: sourceId,
          target_step_id: targetId,
          condition,
        });
      }

      // ── 6. Update routine (trigger + entry_step_ids) ──
      const entryStepIds = edges
        .filter((e) => (e.data as Record<string, unknown>)?.isTriggerEdge)
        .map((e) => tempToReal.get(e.target) ?? e.target);

      await updateRoutine(routine.id, {
        trigger,
        metadata: { ...routine.metadata, entry_step_ids: entryStepIds },
      });

      // ── 7. Reset state ──
      setPendingStepUpdates(new Map());
      setIsDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save routine");
    } finally {
      setSaving(false);
    }
  }, [nodes, edges, trigger, routine, pendingStepUpdates, onSaved]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 md:px-4 py-2.5 shrink-0 overflow-hidden">
        {/* Left: trigger + add step */}
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 shrink-0">
              Trigger:
            </label>
            <select
              value={trigger}
              onChange={(e) => handleTriggerChange(e.target.value as RoutineTrigger)}
              className="min-w-0 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {ROUTINE_TRIGGERS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAddStepOpen(true)}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="hidden sm:inline">Add Step</span>
          </Button>

          {/* Hint — hidden on mobile */}
          <span className="hidden lg:inline text-[10px] text-gray-400 dark:text-gray-500">
            Click an edge to delete · Gate nodes have pass/fail outputs
          </span>
        </div>

        {/* Right: status + save */}
        <div className="flex items-center gap-2 shrink-0">
          {error && (
            <span className="hidden md:inline text-xs text-red-500 truncate max-w-xs">
              {error}
            </span>
          )}
          {isDirty && !saving && !saved && (
            <span className="hidden md:inline text-[10px] text-amber-500 dark:text-amber-400">
              Unsaved
            </span>
          )}
          <Button onClick={handleSave} size="sm" disabled={saving || saved || !isDirty}>
            {saving ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="hidden sm:inline">Saving…</span>
              </>
            ) : saved ? (
              <>
                <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="hidden sm:inline">Saved!</span>
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>

      {/* Canvas + Side Panel */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* ReactFlow Canvas */}
        <div ref={reactFlowWrapper} className="flex-1 min-w-0 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.5, maxZoom: 0.8 }}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              style: { strokeWidth: 2 },
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              className="bg-gray-50! dark:bg-gray-800! border-gray-200! dark:border-gray-700!"
            />
          </ReactFlow>
        </div>

        {/* Step Config Side Panel */}
        {selectedNodeId && selectedNodeData && (
          <StepConfigPanel
            stepId={selectedNodeId}
            name={selectedNodeData.label}
            stepType={selectedNodeData.stepType}
            agentId={selectedNodeData.agentId}
            councilId={selectedNodeData.councilId}
            lambdaId={selectedNodeData.lambdaId}
            config={selectedNodeData.config}
            agents={agents}
            councils={councils}
            onUpdate={handleUpdateStep}
            onDelete={handleDeleteStep}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      <AddStepModal
        open={addStepOpen}
        councils={councils}
        onAdd={handleAddStep}
        onClose={() => setAddStepOpen(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrapper with ReactFlowProvider
// ---------------------------------------------------------------------------

export function RoutineEditor(props: RoutineEditorProps) {
  return (
    <ReactFlowProvider>
      <RoutineEditorInner {...props} />
    </ReactFlowProvider>
  );
}
