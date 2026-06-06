"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type {
  DependencyGraph as DependencyGraphData,
  Task,
} from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { useTheme } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

interface LayoutNode {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  group: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface LayoutEdge {
  source: string;
  target: string;
}

interface GroupBox {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Status colors — light & dark variants + glow for hover
// ---------------------------------------------------------------------------

interface StatusColorSet {
  light: { fill: string; stroke: string; text: string };
  dark: { fill: string; stroke: string; text: string };
  glow: string;
}

const STATUS_COLORS: Record<string, StatusColorSet> = {
  open: {
    light: { fill: "#EFF6FF", stroke: "#3B82F6", text: "#1D4ED8" },
    dark: { fill: "#1E3A5F", stroke: "#60A5FA", text: "#93C5FD" },
    glow: "#3B82F6",
  },
  ready: {
    light: { fill: "#EEF2FF", stroke: "#6366F1", text: "#4338CA" },
    dark: { fill: "#2E1065", stroke: "#818CF8", text: "#A5B4FC" },
    glow: "#6366F1",
  },
  backlog: {
    light: { fill: "#F3F4F6", stroke: "#9CA3AF", text: "#4B5563" },
    dark: { fill: "#374151", stroke: "#6B7280", text: "#9CA3AF" },
    glow: "#9CA3AF",
  },
  in_progress: {
    light: { fill: "#DBEAFE", stroke: "#3B82F6", text: "#1E40AF" },
    dark: { fill: "#1E3A5F", stroke: "#3B82F6", text: "#93C5FD" },
    glow: "#3B82F6",
  },
  done: {
    light: { fill: "#D1FAE5", stroke: "#10B981", text: "#047857" },
    dark: { fill: "#064E3B", stroke: "#34D399", text: "#6EE7B7" },
    glow: "#10B981",
  },
  failed: {
    light: { fill: "#FEE2E2", stroke: "#EF4444", text: "#B91C1C" },
    dark: { fill: "#450A0A", stroke: "#FF5555", text: "#FCA5A5" },
    glow: "#FF5555",
  },
};

function getStatusColor(status: string, mode: "light" | "dark") {
  const set = STATUS_COLORS[status] ?? STATUS_COLORS.open;
  return set[mode];
}

function getStatusGlow(status: string) {
  return (STATUS_COLORS[status] ?? STATUS_COLORS.open).glow;
}

// ---------------------------------------------------------------------------
// Group color palette — deterministic per group name
// ---------------------------------------------------------------------------

const GROUP_PALETTE = [
  { light: { bg: "#EFF6FF", border: "#BFDBFE", text: "#1E40AF" }, dark: { bg: "#1E293B", border: "#334155", text: "#93C5FD" } },
  { light: { bg: "#F0FDF4", border: "#BBF7D0", text: "#166534" }, dark: { bg: "#1A2E1A", border: "#2D4A2D", text: "#86EFAC" } },
  { light: { bg: "#FFF7ED", border: "#FED7AA", text: "#9A3412" }, dark: { bg: "#2A1F0E", border: "#4A3520", text: "#FDBA74" } },
  { light: { bg: "#FDF2F8", border: "#FBCFE8", text: "#9D174D" }, dark: { bg: "#2A1225", border: "#4A2040", text: "#F9A8D4" } },
  { light: { bg: "#F5F3FF", border: "#DDD6FE", text: "#5B21B6" }, dark: { bg: "#1E1533", border: "#352A55", text: "#C4B5FD" } },
  { light: { bg: "#ECFDF5", border: "#A7F3D0", text: "#065F46" }, dark: { bg: "#0F2A20", border: "#1E4A38", text: "#6EE7B7" } },
  { light: { bg: "#FEF2F2", border: "#FECACA", text: "#991B1B" }, dark: { bg: "#2A1212", border: "#4A2020", text: "#FCA5A5" } },
  { light: { bg: "#FFFBEB", border: "#FDE68A", text: "#92400E" }, dark: { bg: "#2A2008", border: "#4A3815", text: "#FCD34D" } },
];

function getGroupColor(index: number, mode: "light" | "dark") {
  return GROUP_PALETTE[index % GROUP_PALETTE.length][mode];
}

// ---------------------------------------------------------------------------
// Force-directed layout with group clustering
// ---------------------------------------------------------------------------

const NODE_W = 140;
const NODE_H = 44;
const GROUP_PAD = 40;

function layoutGraph(
  graph: DependencyGraphData,
  width: number,
  height: number,
  tagMap: Map<string, string>,
): { nodes: LayoutNode[]; edges: LayoutEdge[]; groups: GroupBox[] } {
  // Determine groups
  const groupNames: string[] = [];
  const groupSet = new Set<string>();
  for (const n of graph.nodes) {
    const g = tagMap.get(n.id) ?? "Ungrouped";
    if (!groupSet.has(g)) {
      groupSet.add(g);
      groupNames.push(g);
    }
  }

  // Arrange group centers in a grid
  const cols = Math.ceil(Math.sqrt(groupNames.length));
  const rows = Math.ceil(groupNames.length / cols);
  const cellW = width / cols;
  const cellH = height / rows;
  const groupCenters = new Map<string, { cx: number; cy: number }>();
  groupNames.forEach((name, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    groupCenters.set(name, {
      cx: cellW * (col + 0.5),
      cy: cellH * (row + 0.5),
    });
  });

  // Create nodes with initial positions near their group center
  const nodes: LayoutNode[] = graph.nodes.map((n) => {
    const group = tagMap.get(n.id) ?? "Ungrouped";
    const center = groupCenters.get(group)!;
    // Spread within group in a grid to avoid starting overlapped
    const groupNodes = graph.nodes.filter(
      (gn) => (tagMap.get(gn.id) ?? "Ungrouped") === group,
    );
    const idx = groupNodes.findIndex((gn) => gn.id === n.id);
    const gridCols = Math.ceil(Math.sqrt(groupNodes.length));
    const gRow = Math.floor(idx / gridCols);
    const gCol = idx % gridCols;
    const spacingX = NODE_W + 20;
    const spacingY = NODE_H + 20;
    const gridOffsetX = ((gridCols - 1) * spacingX) / 2;
    const gridOffsetY = ((Math.ceil(groupNodes.length / gridCols) - 1) * spacingY) / 2;
    return {
      id: n.id,
      title: n.title.length > 22 ? n.title.slice(0, 20) + "\u2026" : n.title,
      slug: n.slug,
      status: n.status,
      group,
      x: center.cx + gCol * spacingX - gridOffsetX,
      y: center.cy + gRow * spacingY - gridOffsetY,
      vx: 0,
      vy: 0,
    };
  });

  const edges: LayoutEdge[] = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Minimum separation distances (node dimensions + padding)
  const minSepX = NODE_W + 16;
  const minSepY = NODE_H + 12;

  // Force simulation with group gravity + collision resolution
  const iterations = 250;
  const repulsion = 8000;
  const attraction = 0.006;
  const groupGravity = 0.03;
  const damping = 0.85;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations; // cooling

    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const sameGroup = nodes[i].group === nodes[j].group;
        const rep = sameGroup ? repulsion * 1.5 : repulsion;
        const force = rep / (dist * dist);
        const fx = (dx / dist) * force * alpha;
        const fy = (dy / dist) * force * alpha;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const s = nodeMap.get(edge.source);
      const t = nodeMap.get(edge.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const fx = dx * attraction;
      const fy = dy * attraction;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    }

    // Group gravity — pull nodes toward their group center
    for (const node of nodes) {
      const center = groupCenters.get(node.group);
      if (!center) continue;
      node.vx += (center.cx - node.x) * groupGravity;
      node.vy += (center.cy - node.y) * groupGravity;
    }

    // Apply velocities
    for (const node of nodes) {
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
    }

    // Collision resolution — push apart overlapping nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const overlapX = minSepX - Math.abs(dx);
        const overlapY = minSepY - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          // Push apart along the axis with less overlap
          if (overlapX < overlapY) {
            const push = overlapX / 2 + 0.5;
            const sign = dx >= 0 ? 1 : -1;
            nodes[i].x -= sign * push;
            nodes[j].x += sign * push;
          } else {
            const push = overlapY / 2 + 0.5;
            const sign = dy >= 0 ? 1 : -1;
            nodes[i].y -= sign * push;
            nodes[j].y += sign * push;
          }
        }
      }
    }
  }

  // Compute group bounding boxes
  const groupNodesMap = new Map<string, LayoutNode[]>();
  for (const n of nodes) {
    const arr = groupNodesMap.get(n.group) ?? [];
    arr.push(n);
    groupNodesMap.set(n.group, arr);
  }

  const groups: GroupBox[] = [];
  for (const [label, gNodes] of Array.from(groupNodesMap)) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of gNodes) {
      minX = Math.min(minX, n.x - NODE_W / 2);
      maxX = Math.max(maxX, n.x + NODE_W / 2);
      minY = Math.min(minY, n.y - NODE_H / 2);
      maxY = Math.max(maxY, n.y + NODE_H / 2);
    }
    groups.push({
      label,
      x: minX - GROUP_PAD,
      y: minY - GROUP_PAD - 16, // extra space for label
      width: maxX - minX + GROUP_PAD * 2,
      height: maxY - minY + GROUP_PAD * 2 + 16,
    });
  }

  return { nodes, edges, groups };
}

// ---------------------------------------------------------------------------
// Edge path helpers — cubic bezier, shortened to node border
// ---------------------------------------------------------------------------

function edgePath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx;
  const dy = ty - sy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;

  const startX = sx + nx * (NODE_W / 2);
  const startY = sy + ny * (NODE_H / 2);
  const endX = tx - nx * (NODE_W / 2 + 6);
  const endY = ty - ny * (NODE_H / 2 + 6);

  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const offset = dist * 0.15;
  const perpX = -ny * offset;
  const perpY = nx * offset;

  const cpx = midX + perpX * 0.5;
  const cpy = midY + perpY * 0.5;

  return `M ${startX} ${startY} C ${cpx} ${cpy}, ${cpx} ${cpy}, ${endX} ${endY}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

interface DependencyGraphProps {
  graph: DependencyGraphData | undefined;
  isLoading: boolean;
  isError: boolean;
  tasks?: Task[];
  onNodeClick?: (taskId: string) => void;
}

export function DependencyGraph({
  graph,
  isLoading,
  isError,
  tasks,
  onNodeClick,
}: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [viewTransform, setViewTransform] = useState<ViewTransform>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{
    x: number;
    y: number;
    tx: number;
    ty: number;
  } | null>(null);
  const didDragRef = useRef(false);
  const { resolved: themeMode } = useTheme();

  // Build tag lookup: nodeId → primary tag
  const tagMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!tasks || !graph) return map;
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    for (const node of graph.nodes) {
      const task = taskMap.get(node.id);
      if (task && task.tags.length > 0) {
        map.set(node.id, task.tags[0]);
      }
    }
    return map;
  }, [tasks, graph]);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(entry.contentRect.height, 400),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!graph || graph.nodes.length === 0) return null;
    return layoutGraph(graph, dimensions.width, dimensions.height, tagMap);
  }, [graph, dimensions.width, dimensions.height, tagMap]);

  const nodeMap = useMemo(() => {
    if (!layout) return new Map<string, LayoutNode>();
    return new Map(layout.nodes.map((n) => [n.id, n]));
  }, [layout]);

  // Group index map for deterministic colors
  const groupIndexMap = useMemo(() => {
    if (!layout) return new Map<string, number>();
    const map = new Map<string, number>();
    const seen: string[] = [];
    for (const g of layout.groups) {
      if (!map.has(g.label)) {
        map.set(g.label, seen.length);
        seen.push(g.label);
      }
    }
    return map;
  }, [layout]);

  // Connected edges for hover highlight
  const connectedEdges = useMemo(() => {
    if (!hoveredNode || !layout) return new Set<string>();
    const set = new Set<string>();
    for (const e of layout.edges) {
      if (e.source === hoveredNode || e.target === hoveredNode) {
        set.add(e.source);
        set.add(e.target);
      }
    }
    return set;
  }, [hoveredNode, layout]);

  // Fit-to-view
  const fitToView = useCallback(() => {
    if (!layout || layout.nodes.length === 0) return;
    const padding = 80;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    // Use group boxes for bounding (they include padding already)
    for (const g of layout.groups) {
      minX = Math.min(minX, g.x);
      maxX = Math.max(maxX, g.x + g.width);
      minY = Math.min(minY, g.y);
      maxY = Math.max(maxY, g.y + g.height);
    }
    const graphW = maxX - minX + padding * 2;
    const graphH = maxY - minY + padding * 2;
    const svgH = dimensions.height - 44;
    const scaleX = dimensions.width / graphW;
    const scaleY = svgH / graphH;
    const scale = Math.min(scaleX, scaleY, 3);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setViewTransform({
      x: dimensions.width / 2 - cx * scale,
      y: svgH / 2 + 44 - cy * scale,
      scale: Math.max(scale, 0.3),
    });
  }, [layout, dimensions]);

  // Fit on mount / graph change
  useEffect(() => {
    const frame = requestAnimationFrame(fitToView);
    return () => cancelAnimationFrame(frame);
  }, [fitToView]);

  // Wheel event capture — prevent page scrolling, zoom graph
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleWheel(e: WheelEvent) {
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setViewTransform((prev) => {
        const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
        const newScale = Math.max(0.3, Math.min(3, prev.scale * zoomFactor));
        const ratio = newScale / prev.scale;
        return {
          x: mouseX - (mouseX - prev.x) * ratio,
          y: mouseY - (mouseY - prev.y) * ratio,
          scale: newScale,
        };
      });
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      didDragRef.current = false;
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: viewTransform.x,
        ty: viewTransform.y,
      };
    },
    [viewTransform.x, viewTransform.y],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        didDragRef.current = true;
      }
      setViewTransform((prev) => ({
        ...prev,
        x: panStartRef.current!.tx + dx,
        y: panStartRef.current!.ty + dy,
      }));
    },
    [isPanning],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // Node click handler — only fires if no drag occurred
  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (didDragRef.current) return;
      onNodeClick?.(nodeId);
    },
    [onNodeClick],
  );

  // Zoom controls
  const zoomIn = useCallback(() => {
    setViewTransform((prev) => {
      const newScale = Math.min(3, prev.scale * 1.25);
      const ratio = newScale / prev.scale;
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      return {
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
        scale: newScale,
      };
    });
  }, [dimensions]);

  const zoomOut = useCallback(() => {
    setViewTransform((prev) => {
      const newScale = Math.max(0.3, prev.scale * 0.8);
      const ratio = newScale / prev.scale;
      const cx = dimensions.width / 2;
      const cy = dimensions.height / 2;
      return {
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
        scale: newScale,
      };
    });
  }, [dimensions]);

  // Theme colors
  const isDark = themeMode === "dark";
  const bgColor = isDark ? "#1F2937" : "#FFFFFF";
  const dotColor = isDark ? "#374151" : "#E5E7EB";
  const edgeColor = isDark ? "#4B5563" : "#CBD5E1";
  const edgeHighlight = "#2d4682";
  const arrowColor = isDark ? "#6B7280" : "#94A3B8";
  const arrowHighlightColor = "#2d4682";

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800 h-full">
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 h-full flex items-center justify-center">
        Failed to load dependency graph.
      </div>
    );
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white flex flex-col items-center justify-center h-full dark:border-gray-700 dark:bg-gray-800">
        <svg
          className="h-12 w-12 text-gray-300"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
          />
        </svg>
        <h3 className="mt-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
          No dependency graph
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Generate tasks first, then dependencies will appear here.
        </p>
      </div>
    );
  }

  const svgH = dimensions.height - 44;

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-gray-200 bg-white overflow-hidden dark:border-gray-700 dark:bg-gray-800 h-full flex flex-col relative touch-none"
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
    >
      {/* Legend */}
      <div className="border-b border-gray-100 px-4 py-2 flex items-center gap-4 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400 shrink-0">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          Legend:
        </span>
        {Object.entries(STATUS_COLORS).map(([status, colorSet]) => {
          const colors = colorSet[themeMode];
          return (
            <span key={status} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colors.stroke }}
              />
              <span className="capitalize">{status.replace("_", " ")}</span>
            </span>
          );
        })}
      </div>

      {/* SVG canvas */}
      <svg
        width={dimensions.width}
        height={svgH}
        className="select-none flex-1"
        style={{ cursor: isPanning ? "grabbing" : "grab" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          {/* Drop shadow filter */}
          <filter
            id="dropShadow"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
          >
            <feDropShadow
              dx="0"
              dy="1"
              stdDeviation="2"
              floodColor="#000000"
              floodOpacity={isDark ? 0.3 : 0.08}
            />
          </filter>

          {/* Glow filter for hovered node */}
          <filter
            id="glowFilter"
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Arrow marker — default */}
          <marker
            id="arrow"
            viewBox="0 0 10 7"
            refX="10"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3.5 L 0 7 z" fill={arrowColor} />
          </marker>

          {/* Arrow marker — highlighted */}
          <marker
            id="arrow-highlight"
            viewBox="0 0 10 7"
            refX="10"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 3.5 L 0 7 z" fill={arrowHighlightColor} />
          </marker>

          {/* Dot grid pattern */}
          <pattern
            id="dotGrid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="10" cy="10" r="1" fill={dotColor} />
          </pattern>
        </defs>

        {/* Background */}
        <rect width="100%" height="100%" fill={bgColor} />

        {/* Transform group — all content pans/zooms */}
        <g
          transform={`translate(${viewTransform.x}, ${viewTransform.y}) scale(${viewTransform.scale})`}
        >
          {/* Dot grid background */}
          <rect
            x={-5000}
            y={-5000}
            width={10000}
            height={10000}
            fill="url(#dotGrid)"
          />

          {/* Group boundaries */}
          {layout?.groups.map((group) => {
            const idx = groupIndexMap.get(group.label) ?? 0;
            const colors = getGroupColor(idx, themeMode);
            return (
              <g key={`group-${group.label}`}>
                <rect
                  x={group.x}
                  y={group.y}
                  width={group.width}
                  height={group.height}
                  rx={12}
                  fill={colors.bg}
                  stroke={colors.border}
                  strokeWidth={1}
                  opacity={0.6}
                  strokeDasharray="4 2"
                />
                <text
                  x={group.x + 12}
                  y={group.y + 16}
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    fontFamily: "inherit",
                  }}
                  fill={colors.text}
                  opacity={0.8}
                >
                  {group.label}
                </text>
              </g>
            );
          })}

          {/* Edges */}
          {layout?.edges.map((edge, i) => {
            const s = nodeMap.get(edge.source);
            const t = nodeMap.get(edge.target);
            if (!s || !t) return null;

            const isHighlighted =
              hoveredNode &&
              connectedEdges.has(edge.source) &&
              connectedEdges.has(edge.target);
            const isHovering = !!hoveredNode;

            return (
              <path
                key={`e-${i}`}
                d={edgePath(s.x, s.y, t.x, t.y)}
                fill="none"
                stroke={isHighlighted ? edgeHighlight : edgeColor}
                strokeWidth={isHighlighted ? 2.5 : 1.5}
                opacity={isHovering && !isHighlighted ? 0.2 : 1}
                markerEnd={
                  isHighlighted ? "url(#arrow-highlight)" : "url(#arrow)"
                }
                className="transition-all duration-200"
              />
            );
          })}

          {/* Nodes */}
          {layout?.nodes.map((node) => {
            const colors = getStatusColor(node.status, themeMode);
            const glow = getStatusGlow(node.status);
            const isHovered = node.id === hoveredNode;
            const isHighlighted =
              !hoveredNode ||
              node.id === hoveredNode ||
              connectedEdges.has(node.id);

            return (
              <g
                key={node.id}
                data-graph-node
                transform={`translate(${node.x}, ${node.y})`}
                style={{
                  cursor: "pointer",
                  opacity: isHighlighted ? 1 : 0.25,
                  transition: "opacity 200ms",
                }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onMouseUp={() => handleNodeClick(node.id)}
              >
                {/* Glow ring on hover */}
                {isHovered && (
                  <rect
                    x={-NODE_W / 2 - 3}
                    y={-NODE_H / 2 - 3}
                    width={NODE_W + 6}
                    height={NODE_H + 6}
                    rx={12}
                    fill="none"
                    stroke={glow}
                    strokeWidth={2}
                    opacity={0.5}
                    filter="url(#glowFilter)"
                  >
                    <animate
                      attributeName="opacity"
                      values="0.5;0.3;0.5"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </rect>
                )}

                {/* Node body */}
                <rect
                  x={-NODE_W / 2}
                  y={-NODE_H / 2}
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill={colors.fill}
                  stroke={colors.stroke}
                  strokeWidth={isHovered ? 2 : 1.5}
                  filter="url(#dropShadow)"
                />

                {/* Status indicator dot */}
                <circle
                  cx={-NODE_W / 2 + 14}
                  cy={0}
                  r={4}
                  fill={colors.stroke}
                />

                {/* Slug label (above title) */}
                {node.slug && (
                  <text
                    x={0}
                    y={-6}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="pointer-events-none"
                    style={{ fontSize: "8px", fontFamily: "inherit" }}
                    fill={colors.text}
                    opacity={0.6}
                  >
                    {node.slug}
                  </text>
                )}

                {/* Title */}
                <text
                  x={0}
                  y={node.slug ? 7 : 0}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none"
                  style={{
                    fontSize: "11px",
                    fontWeight: 500,
                    fontFamily: "inherit",
                  }}
                  fill={colors.text}
                >
                  {node.title}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-0 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden backdrop-blur-xs bg-white/80 dark:bg-gray-800/80">
        <button
          onClick={zoomIn}
          className="px-2.5 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-600"
          title="Zoom in"
        >
          +
        </button>
        <button
          onClick={zoomOut}
          className="px-2.5 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-600"
          title="Zoom out"
        >
          &minus;
        </button>
        <button
          onClick={fitToView}
          className="px-2.5 py-1.5 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Fit to view"
        >
          <svg
            className="h-3.5 w-3.5 mx-auto"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
