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
  saveRoutineGraph,
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

/** Edge styling based on condition. Gate/cron edges show pass/fail labels. */
function conditionEdgeStyle(condition: RoutineEdgeCondition, isFromGate: boolean): {
  stroke: string;
  animated: boolean;
  label: string | undefined;
} {
  switch (condition) {
    case "on_pass":
      return { stroke: "#34d399", animated: false, label: isFromGate ? "pass" : undefined };
    case "on_fail":
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
      if (edge.condition === "on_fail") {
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
      data: { condition: edge.condition, metadata: edge.metadata ?? {} },
    };
  });
}

function edgeMetadata(edge: Edge | undefined): Record<string, unknown> {
  const metadata = (edge?.data as Record<string, unknown> | undefined)?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

// ---------------------------------------------------------------------------
// Step update payload (accumulated per-node for batch save)
// ---------------------------------------------------------------------------

interface StepUpdatePayload {
  name?: string;
  step_type?: RoutineStepType;
  agent_id?: string | null;
  council_id?: string;
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isDesktopCanvas, setIsDesktopCanvas] = useState(false);

  // Accumulated step config updates (from StepConfigPanel "Apply")
  const [pendingStepUpdates, setPendingStepUpdates] = useState<Map<string, StepUpdatePayload>>(new Map());

  // Temp ID counter for new steps/edges
  const tempIdCounter = useRef(0);
  const nextTempId = useCallback((prefix: string) => {
    tempIdCounter.current += 1;
    return `${TEMP_PREFIX}${prefix}_${tempIdCounter.current}`;
  }, []);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktopCanvas(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

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
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId),
    [edges, selectedEdgeId],
  );

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
            data: { condition, metadata: {} },
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
    setSelectedEdgeId(null);
    setSelectedNodeId(node.id);
  }, []);

  // Click an edge → open config panel.
  const onEdgeClick: EdgeMouseHandler = useCallback((_event, edge) => {
    setSelectedNodeId(null);
    setSelectedEdgeId(edge.id);
  }, []);

  const handleUpdateEdge = useCallback(
    (edgeId: string, metadata: Record<string, unknown>) => {
      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: {
                  ...(edge.data as Record<string, unknown> | undefined),
                  metadata,
                },
              }
            : edge,
        ),
      );
      setIsDirty(true);
    },
    [setEdges],
  );

  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
      setSelectedEdgeId(null);
      setIsDirty(true);
    },
    [setEdges],
  );

  // Click canvas background → deselect
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
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
    (stepType: RoutineStepType, roleId?: string, councilId?: string) => {
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
    setSelectedEdgeId(null);
    setIsDirty(true);
  }, [selectedNodeId, setNodes, setEdges]);

  // ── Save Routine (batch all changes to backend) ──────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const currentStepNodes = nodes.filter((n) => n.id !== TRIGGER_NODE_ID);
      const currentRegularEdges = edges.filter(
        (e) => !(e.data as Record<string, unknown>)?.isTriggerEdge,
      );
      const stepPayload = currentStepNodes.map((node, index) => {
        const data = node.data as StepNodeData;
        const pendingUpdate = pendingStepUpdates.get(node.id);
        return {
          client_ref: node.id,
          id: node.id.startsWith(TEMP_PREFIX) ? undefined : node.id,
          name: pendingUpdate?.name ?? data.label,
          step_type: (pendingUpdate?.step_type ?? data.stepType) as RoutineStepType,
          agent_id: pendingUpdate?.agent_id ?? (data.config?.agent_id as string) ?? data.agentId ?? undefined,
          council_id: pendingUpdate?.council_id ?? data.councilId ?? undefined,
          config: pendingUpdate?.config ?? data.config ?? {},
          position_x: Math.round(node.position.x),
          position_y: Math.round(node.position.y),
          order_index: index,
        };
      });

      const edgePayload = currentRegularEdges.map((edge) => ({
        source_ref: edge.source,
        target_ref: edge.target,
        condition: ((edge.data as Record<string, unknown>)?.condition as RoutineEdgeCondition | undefined) ?? "always",
        metadata: edgeMetadata(edge),
      }));

      const entryStepRefs = edges
        .filter((e) => (e.data as Record<string, unknown>)?.isTriggerEdge)
        .map((e) => e.target);

      await saveRoutineGraph(routine.id, {
        trigger,
        metadata: routine.metadata,
        entry_step_refs: entryStepRefs,
        steps: stepPayload,
        edges: edgePayload,
      });

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
      <div className="theme-border theme-surface flex shrink-0 items-center justify-between gap-2 overflow-hidden border-b px-3 py-2.5 md:px-4">
        {/* Left: trigger + add step */}
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 shrink-0">
              Trigger:
            </label>
            <select
              value={trigger}
              onChange={(e) => handleTriggerChange(e.target.value as RoutineTrigger)}
              className="theme-border theme-surface min-w-0 rounded-lg border px-2.5 py-1.5 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:text-gray-100"
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
            Click an edge to configure retry routing · Gate nodes have pass/fail outputs
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
          {isDesktopCanvas && (
            <div
              className="pointer-events-none absolute inset-0 z-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, var(--app-border-strong) 1px, transparent 1px), linear-gradient(to bottom, var(--app-border-strong) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
                opacity: 0.65,
              }}
            />
          )}
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
            {!isDesktopCanvas && (
              <Background
                variant={BackgroundVariant.Dots}
                gap={16}
                size={1}
                color="var(--app-border-color)"
              />
            )}
            <Controls />
            <MiniMap
              nodeStrokeWidth={3}
              className="theme-surface-muted! theme-border!"
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
            config={selectedNodeData.config}
            agents={agents}
            councils={councils}
            onUpdate={handleUpdateStep}
            onDelete={handleDeleteStep}
            onClose={() => setSelectedNodeId(null)}
          />
        )}

        {selectedEdge && (
          <EdgeConfigPanel
            edge={selectedEdge}
            steps={nodes.filter((node) => node.id !== TRIGGER_NODE_ID)}
            onUpdate={handleUpdateEdge}
            onDelete={handleDeleteEdge}
            onClose={() => setSelectedEdgeId(null)}
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

function EdgeConfigPanel({
  edge,
  steps,
  onUpdate,
  onDelete,
  onClose,
}: {
  edge: Edge;
  steps: Node[];
  onUpdate: (edgeId: string, metadata: Record<string, unknown>) => void;
  onDelete: (edgeId: string) => void;
  onClose: () => void;
}) {
  const metadata = edgeMetadata(edge);
  const [maxAttempts, setMaxAttempts] = useState(
    metadata.max_attempts != null ? String(metadata.max_attempts) : "",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextMetadata = edgeMetadata(edge);
    setMaxAttempts(nextMetadata.max_attempts != null ? String(nextMetadata.max_attempts) : "");
    setError(null);
  }, [edge]);

  const sourceStep = steps.find((step) => step.id === edge.source);
  const sourceData = sourceStep?.data as StepNodeData | undefined;
  const sourceLabel = sourceData?.label;
  const targetLabel = steps.find((step) => step.id === edge.target)?.data?.label as string | undefined;
  const canRetry = sourceData?.stepType === "gate" || sourceData?.stepType === "cron";

  const handleApply = () => {
    const nextMetadata = { ...metadata };
    if (canRetry && maxAttempts.trim()) {
      const parsed = Number.parseInt(maxAttempts, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError("Max attempts must be a positive number");
        return;
      }
      nextMetadata.max_attempts = parsed;
    } else {
      delete nextMetadata.max_attempts;
    }
    delete nextMetadata.on_exhausted_step_id;

    setError(null);
    onUpdate(edge.id, nextMetadata);
  };

  return (
    <div className="absolute inset-0 z-10 flex h-full w-full flex-col border-l-0 border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 md:relative md:inset-auto md:w-80 md:border-l">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Configure Edge</h3>
        <button
          onClick={onClose}
          className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <div className="truncate">{sourceLabel ?? edge.source}</div>
          <div className="text-gray-400">to</div>
          <div className="truncate">{targetLabel ?? edge.target}</div>
        </div>

        {canRetry ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">Max Attempts</label>
            <input
              type="number"
              min={1}
              value={maxAttempts}
              onChange={(event) => setMaxAttempts(event.target.value)}
              placeholder="No limit"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
          </div>
        ) : (
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            Retry attempts are only available on edges leaving gate or cron steps.
          </p>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <div className="space-y-2 border-t border-gray-200 p-4 dark:border-gray-700">
        <Button onClick={handleApply} size="sm" className="w-full">
          Apply
        </Button>
        <Button onClick={() => onDelete(edge.id)} variant="danger" size="sm" className="w-full">
          Delete Edge
        </Button>
      </div>
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
