"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import dynamic from "next/dynamic";
import { FileText, Link2, Search } from "lucide-react";
import {
  docGraphId,
  docGraphLabel,
  type KnowledgeManifestDoc,
  type KnowledgeManifestEdge,
  type KnowledgeManifestGraph,
} from "./knowledgeManifestGraph";

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  doc: KnowledgeManifestDoc;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  id: string;
  source: GraphNode;
  target: GraphNode;
  type: string;
  note?: string | null;
  curve: number;
}

const KIND_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  guide: { fill: "#eef2ff", stroke: "#6366f1", text: "#3730a3" },
  reference: { fill: "#ecfeff", stroke: "#0891b2", text: "#155e75" },
  taxonomy: { fill: "#f0fdf4", stroke: "#16a34a", text: "#166534" },
  domain: { fill: "#fef3c7", stroke: "#d97706", text: "#92400e" },
  entity: { fill: "#f5f3ff", stroke: "#7c3aed", text: "#5b21b6" },
  policy: { fill: "#fff1f2", stroke: "#e11d48", text: "#9f1239" },
};

const DEFAULT_COLOR = { fill: "#f8fafc", stroke: "#64748b", text: "#334155" };
const GRAPH_WIDTH = 2200;
const GRAPH_HEIGHT = 1400;
const GRAPH_CENTER_X = GRAPH_WIDTH / 2;
const GRAPH_CENTER_Y = GRAPH_HEIGHT / 2;
const EDGE_COLORS: Record<string, string> = {
  "depends on": "#2563eb",
  depends_on: "#2563eb",
  references: "#64748b",
  governs: "#7c3aed",
  "part of": "#0891b2",
  part_of: "#0891b2",
  classifies: "#16a34a",
};
const DEFAULT_EDGE_COLOR = "#94a3b8";
const KnowledgeGlobeView = dynamic(
  () => import("./KnowledgeGlobeView").then((module) => module.KnowledgeGlobeView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-22rem)] min-h-[760px] items-center justify-center rounded-lg border border-gray-200 bg-white text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        Loading globe...
      </div>
    ),
  },
);

export function KnowledgeGraphView({ manifest }: { manifest: KnowledgeManifestGraph }) {
  const graph = useMemo(() => buildGraph(manifest), [manifest]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<SVGGElement | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "globe">("map");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(graph.nodes[0]?.id ?? null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const selectedEdge = graph.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedNode = selectedEdge ? null : graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0] ?? null;
  const connectedIds = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const ids = new Set<string>([selectedNode.id]);
    for (const edge of graph.edges) {
      if (edge.source.id === selectedNode.id) ids.add(edge.target.id);
      if (edge.target.id === selectedNode.id) ids.add(edge.source.id);
    }
    return ids;
  }, [graph.edges, selectedNode]);
  const connectedEdges = selectedNode
    ? graph.edges.filter((edge) => edge.source.id === selectedNode.id || edge.target.id === selectedNode.id)
    : [];
  const incoming = selectedNode ? connectedEdges.filter((edge) => edge.target.id === selectedNode.id) : [];
  const outgoing = selectedNode ? connectedEdges.filter((edge) => edge.source.id === selectedNode.id) : [];

  useEffect(() => {
    if (!svgRef.current || !viewportRef.current) return;

    const svg = d3.select(svgRef.current);
    const viewport = d3.select(viewportRef.current);
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.35, 3.2])
      .translateExtent([
        [-GRAPH_WIDTH * 0.6, -GRAPH_HEIGHT * 0.6],
        [GRAPH_WIDTH * 1.6, GRAPH_HEIGHT * 1.6],
      ])
      .on("zoom", (event) => {
        viewport.attr("transform", event.transform.toString());
      });

    svg.call(zoom);
    return () => {
      svg.on(".zoom", null);
    };
  }, [graph]);

  if (!graph.nodes.length) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        No documents are declared in this knowledge pack manifest.
      </div>
    );
  }

  if (viewMode === "globe") {
    return (
      <KnowledgeGlobeView
        manifest={manifest}
        headerControls={<GraphModeToggle activeView={viewMode} onChange={setViewMode} />}
      />
    );
  }

  return (
    <div className="grid h-[calc(100vh-22rem)] min-h-[760px] overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col overflow-hidden bg-gray-50/70 dark:bg-gray-950/20">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-gray-500" />
              <h2 className="truncate text-sm font-semibold text-gray-950 dark:text-gray-50">Knowledge map</h2>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {graph.nodes.length} documents, {graph.edges.length} relationships
            </p>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700 sm:flex">
            <Search className="h-3.5 w-3.5" />
            Scroll to zoom, drag to pan
          </div>
          <GraphModeToggle activeView={viewMode} onChange={setViewMode} />
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
          className="min-h-0 w-full flex-1 touch-none select-none"
        >
          <defs>
            <marker id="knowledge-arrow-active" markerHeight="10" markerWidth="10" orient="auto" refX="9" refY="5">
              <path d="M0,0 L10,5 L0,10 Z" fill="#2563eb" />
            </marker>
            {Array.from(new Set(graph.edges.map((edge) => edge.type))).map((type) => (
              <marker
                key={type}
                id={edgeMarkerId(type)}
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="8"
                refY="4"
              >
                <path d="M0,0 L8,4 L0,8 Z" fill={edgeColor(type)} />
              </marker>
            ))}
          </defs>
          <g ref={viewportRef}>
            {graph.edges.map((edge) => {
              const active = selectedNode
                ? edge.source.id === selectedNode.id || edge.target.id === selectedNode.id
                : selectedEdgeId === edge.id;
              const dimmed = selectedNode ? !active : false;
              const label = edgeLabelPoint(edge);
              const showLabel = active || selectedEdgeId === edge.id;
              return (
                <g key={edge.id}>
                  <path
                    d={edgePath(edge)}
                    fill="none"
                    stroke={active ? "#2563eb" : edgeColor(edge.type)}
                    strokeWidth={active ? 3.2 : 1.7}
                    strokeLinecap="round"
                    opacity={dimmed ? 0.15 : active ? 0.95 : 0.46}
                    markerEnd={active ? "url(#knowledge-arrow-active)" : `url(#${edgeMarkerId(edge.type)})`}
                    onClick={() => {
                      setSelectedEdgeId(edge.id);
                      setSelectedNodeId(null);
                    }}
                    className="cursor-pointer"
                  />
                  {showLabel ? (
                    <g className="pointer-events-none">
                      <rect
                        x={label.x - edgeLabel(edge).length * 3.8 - 8}
                        y={label.y - 15}
                        width={edgeLabel(edge).length * 7.6 + 16}
                        height={21}
                        rx={10.5}
                        fill="white"
                        stroke={active ? "#93c5fd" : "#e2e8f0"}
                        opacity={0.94}
                      />
                      <text
                        x={label.x}
                        y={label.y}
                        textAnchor="middle"
                        className="fill-gray-700 text-[11px] font-semibold dark:fill-gray-200"
                      >
                        {edgeLabel(edge)}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
            {graph.nodes.map((node) => {
              const color = nodeColor(node.doc);
              const selected = node.id === selectedNodeId;
              const dimmed = selectedNode ? !connectedIds.has(node.id) : false;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    setSelectedEdgeId(null);
                  }}
                  className="cursor-pointer"
                  opacity={dimmed ? 0.52 : 1}
                >
                  <circle
                    r={selected ? 34 : 29}
                    fill={color.fill}
                    stroke={selected ? "#111827" : color.stroke}
                    strokeWidth={selected ? 3 : 2}
                  />
                  <FileText x={-8} y={-11} width={16} height={16} color={color.stroke} />
                  <text
                    y={48}
                    textAnchor="middle"
                    stroke="white"
                    strokeWidth={4}
                    paintOrder="stroke"
                    className="fill-gray-900 text-[12px] font-semibold dark:fill-gray-100"
                  >
                    {truncate(node.label, 24)}
                  </text>
                  {node.doc.kind ? (
                    <text
                      y={64}
                      textAnchor="middle"
                      stroke="white"
                      strokeWidth={4}
                      paintOrder="stroke"
                      className="text-[10px] font-medium"
                      fill={color.text}
                    >
                      {node.doc.kind}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        {selectedNode ? (
          <NodeDetails node={selectedNode} incoming={incoming} outgoing={outgoing} />
        ) : selectedEdge ? (
          <EdgeDetails edge={selectedEdge} />
        ) : (
          <div className="text-sm text-gray-500 dark:text-gray-400">Select a document or relationship.</div>
        )}
      </aside>
    </div>
  );
}

function NodeDetails({ node, incoming, outgoing }: { node: GraphNode; incoming: GraphEdge[]; outgoing: GraphEdge[] }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-950 dark:text-gray-50">{node.label}</h3>
        <p className="mt-1 break-all font-mono text-xs text-gray-500 dark:text-gray-400">{node.id}</p>
      </div>
      <Detail label="Kind" value={node.doc.kind ?? "None" } />
      <Detail label="Authority" value={node.doc.authority ?? "None" } />
      {node.doc.summary ? <Detail label="Summary" value={node.doc.summary} /> : null}
      <TokenList label="Tags" values={node.doc.tags ?? []} />
      <ConnectionList title={`Outgoing (${outgoing.length})`} edges={outgoing} direction="outgoing" />
      <ConnectionList title={`Incoming (${incoming.length})`} edges={incoming} direction="incoming" />
    </div>
  );
}

function GraphModeToggle({ activeView, onChange }: { activeView: "map" | "globe"; onChange: (view: "map" | "globe") => void }) {
  return (
    <div className="flex shrink-0 rounded-lg bg-white p-0.5 ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
      {(["map", "globe"] as const).map((view) => (
        <button
          key={view}
          type="button"
          onClick={() => onChange(view)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
            activeView === view
              ? "bg-deep-space-blue-50 text-deep-space-blue-700 shadow-sm dark:bg-deep-space-blue-950/40 dark:text-deep-space-blue-300"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          {view}
        </button>
      ))}
    </div>
  );
}

function EdgeDetails({ edge }: { edge: GraphEdge }) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-gray-950 dark:text-gray-50">{edge.type.replace(/_/g, " ")}</h3>
      <Detail label="From" value={edge.source.label} />
      <Detail label="To" value={edge.target.label} />
      {edge.note ? <Detail label="Note" value={edge.note} /> : null}
    </div>
  );
}

function ConnectionList({ title, edges, direction }: { title: string; edges: GraphEdge[]; direction: "incoming" | "outgoing" }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h4>
      {edges.length ? (
        <div className="space-y-2">
          {edges.map((edge) => {
            const other = direction === "outgoing" ? edge.target : edge.source;
            return (
              <div key={edge.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-950/30">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{edge.type.replace(/_/g, " ")}</div>
                <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{other.label}</div>
                {edge.note ? <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{edge.note}</div> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">No connections.</p>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}

function TokenList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</h4>
      {values.length ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span key={value} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">None.</p>
      )}
    </div>
  );
}

function buildGraph(manifest: KnowledgeManifestGraph): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = (manifest.docs ?? []).map((doc) => ({
    id: docGraphId(doc),
    label: docGraphLabel(doc),
    doc,
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byPath = new Map<string, GraphNode>();
  for (const node of nodes) {
    for (const value of [node.doc.id, node.doc.virtual_path, node.doc.source_path, node.doc.title]) {
      if (value) byPath.set(value, node);
    }
  }
  const rawEdges: KnowledgeManifestEdge[] = [
    ...(manifest.edges ?? []),
    ...nodes.flatMap((node) => (node.doc.related ?? []).map((related) => ({
      source: node.id,
      target: related.target ?? "",
      type: related.type ?? "related",
      note: related.note,
    }))),
  ];
  const edges: GraphEdge[] = [];
  rawEdges.forEach((edge, index) => {
    const source = byId.get(edge.source) ?? byPath.get(edge.source);
    const target = byId.get(edge.target) ?? byPath.get(edge.target);
    if (!source || !target || source.id === target.id) return;
    edges.push({
      id: `${edge.source}:${edge.type}:${edge.target}:${index}`,
      source,
      target,
      type: edge.type,
      note: edge.note,
      curve: 0,
    });
  });

  applyEdgeCurves(edges);
  seedNodePositions(nodes, edges);

  const simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink<GraphNode, GraphEdge>(edges).id((node) => node.id).distance(330).strength(0.28))
    .force("charge", d3.forceManyBody().strength(-1550))
    .force("center", d3.forceCenter(GRAPH_CENTER_X, GRAPH_CENTER_Y))
    .force("x", d3.forceX<GraphNode>(GRAPH_CENTER_X).strength(0.028))
    .force("y", d3.forceY<GraphNode>(GRAPH_CENTER_Y).strength(0.03))
    .force("radial", d3.forceRadial<GraphNode>((node) => radialDistance(node, edges), GRAPH_CENTER_X, GRAPH_CENTER_Y).strength(0.08))
    .force("collision", d3.forceCollide<GraphNode>().radius(138).strength(1))
    .stop();

  for (let index = 0; index < 720; index += 1) simulation.tick();

  for (const node of nodes) {
    node.x = clamp(node.x ?? GRAPH_CENTER_X, 145, GRAPH_WIDTH - 145);
    node.y = clamp(node.y ?? GRAPH_CENTER_Y, 135, GRAPH_HEIGHT - 150);
  }

  return { nodes, edges };
}

function nodeColor(doc: KnowledgeManifestDoc) {
  return doc.kind ? KIND_COLORS[doc.kind] ?? DEFAULT_COLOR : DEFAULT_COLOR;
}

function edgeLabel(edge: GraphEdge): string {
  return edge.type.replace(/_/g, " ");
}

function edgeColor(type: string): string {
  return EDGE_COLORS[type] ?? EDGE_COLORS[type.replace(/_/g, " ")] ?? DEFAULT_EDGE_COLOR;
}

function edgeMarkerId(type: string): string {
  return `knowledge-arrow-${type.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function edgePath(edge: GraphEdge): string {
  const start = trimPoint(edge.source, edge.target, 38);
  const end = trimPoint(edge.target, edge.source, 42);
  const control = edgeControlPoint(edge);
  return `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;
}

function edgeControlPoint(edge: GraphEdge): { x: number; y: number } {
  const sourceX = edge.source.x ?? GRAPH_CENTER_X;
  const sourceY = edge.source.y ?? GRAPH_CENTER_Y;
  const targetX = edge.target.x ?? GRAPH_CENTER_X;
  const targetY = edge.target.y ?? GRAPH_CENTER_Y;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const length = Math.hypot(dx, dy) || 1;
  const offset = edge.curve;
  return {
    x: (sourceX + targetX) / 2 + (-dy / length) * offset,
    y: (sourceY + targetY) / 2 + (dx / length) * offset,
  };
}

function edgeLabelPoint(edge: GraphEdge): { x: number; y: number } {
  const sourceX = edge.source.x ?? GRAPH_CENTER_X;
  const sourceY = edge.source.y ?? GRAPH_CENTER_Y;
  const targetX = edge.target.x ?? GRAPH_CENTER_X;
  const targetY = edge.target.y ?? GRAPH_CENTER_Y;
  const control = edgeControlPoint(edge);
  return {
    x: sourceX * 0.25 + control.x * 0.5 + targetX * 0.25,
    y: sourceY * 0.25 + control.y * 0.5 + targetY * 0.25,
  };
}

function trimPoint(from: GraphNode, to: GraphNode, radius: number): { x: number; y: number } {
  const fromX = from.x ?? GRAPH_CENTER_X;
  const fromY = from.y ?? GRAPH_CENTER_Y;
  const toX = to.x ?? GRAPH_CENTER_X;
  const toY = to.y ?? GRAPH_CENTER_Y;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: fromX + (dx / length) * radius,
    y: fromY + (dy / length) * radius,
  };
}

function applyEdgeCurves(edges: GraphEdge[]) {
  const groups = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const key = [edge.source.id, edge.target.id].sort().join("::");
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }

  Array.from(groups.values()).forEach((group) => {
    const center = (group.length - 1) / 2;
    group.forEach((edge, index) => {
      const sameDirection = edge.source.id < edge.target.id ? 1 : -1;
      edge.curve = (index - center) * 48 * sameDirection;
      if (group.length === 1) edge.curve = 32 * sameDirection;
    });
  });
}

function seedNodePositions(nodes: GraphNode[], edges: GraphEdge[]) {
  const degrees = new Map<string, number>();
  for (const edge of edges) {
    degrees.set(edge.source.id, (degrees.get(edge.source.id) ?? 0) + 1);
    degrees.set(edge.target.id, (degrees.get(edge.target.id) ?? 0) + 1);
  }

  const grouped = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const key = node.doc.kind ?? "unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), node]);
  }

  const groups = Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  groups.forEach(([, group], groupIndex) => {
    const baseAngle = (groupIndex / Math.max(groups.length, 1)) * Math.PI * 2;
    group.forEach((node, nodeIndex) => {
      const degree = degrees.get(node.id) ?? 0;
      const spread = group.length <= 1 ? 0 : (nodeIndex / group.length - 0.5) * 0.9;
      const radius = degree === 0 ? 560 : clamp(520 - degree * 36, 260, 520);
      const angle = baseAngle + spread;
      node.x = GRAPH_CENTER_X + Math.cos(angle) * radius;
      node.y = GRAPH_CENTER_Y + Math.sin(angle) * radius;
    });
  });
}

function radialDistance(node: GraphNode, edges: GraphEdge[]): number {
  const degree = edges.reduce((count, edge) => count + (edge.source.id === node.id || edge.target.id === node.id ? 1 : 0), 0);
  if (degree === 0) return 610;
  return clamp(560 - degree * 42, 260, 560);
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
