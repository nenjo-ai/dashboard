"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { Link2, Search } from "lucide-react";
import {
  docGraphId,
  docGraphLabel,
  type KnowledgeManifestDoc,
  type KnowledgeManifestEdge,
  type KnowledgeManifestGraph,
} from "./knowledgeManifestGraph";

interface GlobeNode {
  id: string;
  label: string;
  doc: KnowledgeManifestDoc;
  base: THREE.Vector3;
}

interface GlobeEdge {
  id: string;
  source: GlobeNode;
  target: GlobeNode;
  type: string;
  note?: string | null;
}

interface RuntimeNode extends GlobeNode {
  target: THREE.Vector3;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  labelSprite: THREE.Sprite;
}

interface RuntimeEdge {
  id: string;
  source: RuntimeNode;
  target: RuntimeNode;
  type: string;
  note?: string | null;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
}

const NODE_COLORS: Record<string, string> = {
  guide: "#6366f1",
  reference: "#0891b2",
  taxonomy: "#16a34a",
  domain: "#d97706",
  entity: "#7c3aed",
  policy: "#e11d48",
};

const EDGE_COLORS: Record<string, string> = {
  "depends on": "#2563eb",
  depends_on: "#2563eb",
  references: "#64748b",
  governs: "#7c3aed",
  "part of": "#0891b2",
  part_of: "#0891b2",
  classifies: "#16a34a",
};

const DEFAULT_NODE_COLOR = "#64748b";
const DEFAULT_EDGE_COLOR = "#94a3b8";
const SPHERE_RADIUS = 260;

export function KnowledgeGlobeView({ manifest, headerControls }: { manifest: KnowledgeManifestGraph; headerControls?: ReactNode }) {
  const graph = useMemo(() => buildGlobeGraph(manifest), [manifest]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = graph.nodes.some((node) => node.id === selectedIdRef.current)
      ? selectedIdRef.current
      : null;
    setSelectedNodeId(selectedIdRef.current);
  }, [graph]);

  const selectedNode = graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const connectedEdges = selectedNode
    ? graph.edges.filter((edge) => edge.source.id === selectedNode.id || edge.target.id === selectedNode.id)
    : [];
  const incoming = selectedNode ? connectedEdges.filter((edge) => edge.target.id === selectedNode.id) : [];
  const outgoing = selectedNode ? connectedEdges.filter((edge) => edge.source.id === selectedNode.id) : [];

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !graph.nodes.length) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.width = "100%";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
    camera.position.set(0, 0, 940);
    camera.lookAt(0, 0, 0);
    let targetCameraZ = camera.position.z;

    const group = new THREE.Group();
    scene.add(group);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(SPHERE_RADIUS, 48, 32),
      new THREE.MeshBasicMaterial({
        transparent: true,
        wireframe: true,
      }),
    );
    applyGlobeTheme(globe.material as THREE.MeshBasicMaterial);
    group.add(globe);

    const runtimeNodes: RuntimeNode[] = [];
    for (const node of graph.nodes) {
      const color = nodeColor(node.doc);
      const mesh = new THREE.Mesh(
        nodeGeometry(node.doc),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        }),
      );
      mesh.position.copy(node.base);
      mesh.userData.nodeId = node.id;
      group.add(mesh);

      const labelSprite = makeLabelSprite(node.label, color);
      labelSprite.position.copy(node.base).multiplyScalar(1.08);
      labelSprite.userData.nodeId = node.id;
      group.add(labelSprite);
      runtimeNodes.push({
        ...node,
        base: node.base.clone(),
        target: node.base.clone(),
        mesh,
        labelSprite,
      });
    }

    const runtimeNodeById = new Map(runtimeNodes.map((node) => [node.id, node]));
    const runtimeEdges: RuntimeEdge[] = [];
    for (const edge of graph.edges) {
      const source = runtimeNodeById.get(edge.source.id);
      const target = runtimeNodeById.get(edge.target.id);
      if (!source || !target) continue;
      const line = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: edgeColor(edge.type),
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
        }),
      );
      group.add(line);
      runtimeEdges.push({ ...edge, source, target, line });
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const nodeMeshes = runtimeNodes.map((node) => node.mesh);
    let frameId = 0;
    let width = 1;
    let height = 1;

    const resize = () => {
      width = Math.max(container.clientWidth, 1);
      height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0, 0);
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const themeObserver = new MutationObserver(() => {
      applyGlobeTheme(globe.material as THREE.MeshBasicMaterial);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const selectNode = (nodeId: string | null) => {
      selectedIdRef.current = nodeId;
      setSelectedNodeId(nodeId);
      setTargets({ nodes: runtimeNodes, edges: runtimeEdges }, nodeId);
    };
    setTargets({ nodes: runtimeNodes, edges: runtimeEdges }, selectedIdRef.current);

    const onPointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(nodeMeshes, false)[0];
      selectNode(hit?.object.userData.nodeId ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      targetCameraZ = clamp(targetCameraZ + event.deltaY * 0.55, 520, 1280);
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const currentSelectedId = selectedIdRef.current;
      camera.position.z += (targetCameraZ - camera.position.z) * 0.14;
      camera.lookAt(0, 0, 0);
      if (!currentSelectedId) group.rotation.y += 0.0025;
      else group.rotation.y += (0 - group.rotation.y) * 0.018;

      const connected = currentSelectedId ? connectedNodeIds({ edges: runtimeEdges }, currentSelectedId) : new Set<string>();
      for (const node of runtimeNodes) {
        node.mesh.position.lerp(node.target, 0.085);
        node.labelSprite.position.copy(node.mesh.position).multiplyScalar(currentSelectedId ? 1.1 : 1.08);
        const isSelected = node.id === currentSelectedId;
        const isConnected = connected.has(node.id);
        const opacity = !currentSelectedId || isSelected || isConnected ? 0.95 : 0.18;
        node.mesh.material.opacity += (opacity - node.mesh.material.opacity) * 0.12;
        const labelMaterial = node.labelSprite.material as THREE.SpriteMaterial;
        labelMaterial.opacity += ((isSelected || isConnected || !currentSelectedId ? 0.9 : 0.12) - labelMaterial.opacity) * 0.12;
        const scale = isSelected ? 1.55 : isConnected ? 1.18 : 1;
        node.mesh.scale.setScalar(node.mesh.scale.x + (scale - node.mesh.scale.x) * 0.12);
      }

      for (const edge of runtimeEdges) {
        const active = currentSelectedId
          ? edge.source.id === currentSelectedId || edge.target.id === currentSelectedId
          : false;
        edge.line.geometry.dispose();
        edge.line.geometry = edgeGeometry(edge.source.mesh.position, edge.target.mesh.position, active);
        edge.line.material.opacity += ((currentSelectedId ? (active ? 0.9 : 0.08) : 0.32) - edge.line.material.opacity) * 0.14;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("wheel", onWheel);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      for (const edge of runtimeEdges) {
        edge.line.geometry.dispose();
        edge.line.material.dispose();
      }
      for (const node of runtimeNodes) {
        node.mesh.geometry.dispose();
        node.mesh.material.dispose();
        node.labelSprite.material.map?.dispose();
        node.labelSprite.material.dispose();
      }
      globe.geometry.dispose();
      (globe.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [graph]);

  if (!graph.nodes.length) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-gray-300 bg-white text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
        No documents are declared in this knowledge pack manifest.
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-22rem)] min-h-[760px] overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-950 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col overflow-hidden bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-950">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-gray-500 dark:text-slate-400" />
              <h2 className="truncate text-sm font-semibold text-gray-950 dark:text-slate-50">Knowledge map</h2>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              {graph.nodes.length} documents, {graph.edges.length} relationships
            </p>
          </div>
          <div className="hidden items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200 dark:bg-slate-950 dark:text-slate-400 dark:ring-slate-700 sm:flex">
            <Search className="h-3.5 w-3.5" />
            Scroll to zoom
          </div>
          {headerControls}
        </div>
        <div
          className="relative min-h-0 flex-1 overflow-hidden bg-slate-50 [--knowledge-globe-grid:rgba(51,65,85,0.20)] dark:bg-slate-950 dark:[--knowledge-globe-grid:rgba(148,163,184,0.24)]"
          style={{
            backgroundImage:
              "linear-gradient(var(--knowledge-globe-grid) 1px, transparent 1px), linear-gradient(90deg, var(--knowledge-globe-grid) 1px, transparent 1px)",
            backgroundPosition: "center",
            backgroundSize: "36px 36px",
          }}
        >
          <div ref={containerRef} className="h-full w-full" />
          <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-200 backdrop-blur dark:bg-slate-950/85 dark:text-slate-300 dark:ring-slate-700">
            Click a node to focus relationships. Click empty space to resume rotation.
          </div>
        </div>
      </div>
      <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        {selectedNode ? (
          <NodeDetails node={selectedNode} incoming={incoming} outgoing={outgoing} />
        ) : (
          <div className="text-sm text-gray-500 dark:text-slate-400">Select a document.</div>
        )}
      </aside>
    </div>
  );
}

function NodeDetails({ node, incoming, outgoing }: { node: GlobeNode; incoming: GlobeEdge[]; outgoing: GlobeEdge[] }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-semibold text-gray-950 dark:text-slate-50">{node.label}</h3>
        <p className="mt-1 break-all font-mono text-xs text-gray-500 dark:text-slate-400">{node.id}</p>
      </div>
      <Detail label="Kind" value={node.doc.kind ?? "None"} />
      {node.doc.summary ? <Detail label="Summary" value={node.doc.summary} /> : null}
      <TokenList label="Tags" values={node.doc.tags ?? []} />
      <ConnectionList title={`Outgoing (${outgoing.length})`} edges={outgoing} direction="outgoing" />
      <ConnectionList title={`Incoming (${incoming.length})`} edges={incoming} direction="incoming" />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-sm text-gray-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function TokenList({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">{label}</h4>
      {values.length ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span key={value} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-slate-800 dark:text-slate-300">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-slate-400">None.</p>
      )}
    </div>
  );
}

function ConnectionList({ title, edges, direction }: { title: string; edges: GlobeEdge[]; direction: "incoming" | "outgoing" }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">{title}</h4>
      {edges.length ? (
        <div className="space-y-2">
          {edges.map((edge) => {
            const other = direction === "outgoing" ? edge.target : edge.source;
            return (
              <div key={edge.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950/50">
                <div className="text-xs font-medium text-gray-500 dark:text-slate-400">{edgeLabel(edge.type)}</div>
                <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{other.label}</div>
                {edge.note ? <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">{edge.note}</div> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-slate-400">No connections.</p>
      )}
    </div>
  );
}

function buildGlobeGraph(manifest: KnowledgeManifestGraph): { nodes: GlobeNode[]; edges: GlobeEdge[] } {
  const nodes: GlobeNode[] = (manifest.docs ?? []).map((doc, index, allDocs) => {
    const base = fibonacciSphere(index, allDocs.length, SPHERE_RADIUS);
    return {
      id: docGraphId(doc),
      label: docGraphLabel(doc),
      doc,
      base,
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byPath = new Map<string, GlobeNode>();
  for (const node of nodes) {
    for (const value of [node.doc.id, node.doc.path, node.doc.title]) {
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
  const edges: GlobeEdge[] = [];
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
    });
  });
  return { nodes, edges };
}

function setTargets(graph: { nodes: RuntimeNode[]; edges: RuntimeEdge[] }, selectedId: string | null) {
  if (!selectedId) {
    for (const node of graph.nodes) node.target.copy(node.base);
    return;
  }

  const selected = graph.nodes.find((node) => node.id === selectedId);
  if (!selected) return;
  const connectedEdges = graph.edges.filter((edge) => edge.source.id === selectedId || edge.target.id === selectedId);
  const connectedNodes = connectedEdges.map((edge) => (edge.source.id === selectedId ? edge.target : edge.source));
  const connectedIds = new Set(connectedNodes.map((node) => node.id));

  selected.target.set(0, 0, 140);
  connectedNodes.forEach((node, index) => {
    const angle = (index / Math.max(connectedNodes.length, 1)) * Math.PI * 2;
    const z = 70 + (index % 3) * 32;
    node.target.set(Math.cos(angle) * 190, Math.sin(angle) * 145, z);
  });

  for (const node of graph.nodes) {
    if (node.id === selectedId || connectedIds.has(node.id)) continue;
    node.target.copy(node.base.clone().normalize().multiplyScalar(390));
    node.target.z -= 120;
  }
}

function connectedNodeIds(graph: { edges: RuntimeEdge[] }, selectedId: string): Set<string> {
  const ids = new Set<string>([selectedId]);
  for (const edge of graph.edges) {
    if (edge.source.id === selectedId) ids.add(edge.target.id);
    if (edge.target.id === selectedId) ids.add(edge.source.id);
  }
  return ids;
}

function fibonacciSphere(index: number, total: number, radius: number): THREE.Vector3 {
  if (total <= 1) return new THREE.Vector3(0, 0, radius);
  const y = 1 - (index / (total - 1)) * 2;
  const horizontalRadius = Math.sqrt(1 - y * y);
  const theta = index * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(
    Math.cos(theta) * horizontalRadius * radius,
    y * radius,
    Math.sin(theta) * horizontalRadius * radius,
  );
}

function edgeGeometry(source: THREE.Vector3, target: THREE.Vector3, active: boolean): THREE.BufferGeometry {
  const midpoint = source.clone().add(target).multiplyScalar(0.5);
  const control = midpoint.lengthSq() > 0 ? midpoint.clone().normalize().multiplyScalar(active ? 360 : 315) : new THREE.Vector3(0, 0, 320);
  const curve = new THREE.QuadraticBezierCurve3(source, control, target);
  return new THREE.BufferGeometry().setFromPoints(curve.getPoints(active ? 42 : 24));
}

function applyGlobeTheme(material: THREE.MeshBasicMaterial) {
  const isDark = document.documentElement.classList.contains("dark");
  material.color.set(isDark ? 0xe2e8f0 : 0x334155);
  material.opacity = isDark ? 0.11 : 0.24;
  material.needsUpdate = true;
}

function makeLabelSprite(label: string, _color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = 300;
  canvas.height = 82;
  if (context) {
    const labelText = truncate(label, 20).toUpperCase();
    const x = 18;
    const y = 18;
    const width = 264;
    const height = 44;
    const cut = 15;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.shadowColor = "rgba(15, 23, 42, 0.18)";
    context.shadowBlur = 8;
    context.fillStyle = "rgba(248, 250, 252, 0.86)";
    labelPlatePath(context, x, y, width, height, cut);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = "rgba(15, 23, 42, 0.22)";
    context.lineWidth = 1;
    labelPlatePath(context, x, y, width, height, cut);
    context.stroke();
    context.strokeStyle = "rgba(15, 23, 42, 0.14)";
    context.beginPath();
    context.moveTo(44, 27);
    context.lineTo(259, 27);
    context.moveTo(40, 53);
    context.lineTo(255, 53);
    context.stroke();
    context.font = "700 19px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#0f172a";
    context.fillText(labelText, 150, 40);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.86, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(132, 36, 1);
  return sprite;
}

function labelPlatePath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, cut: number) {
  context.beginPath();
  context.moveTo(x + cut, y);
  context.lineTo(x + width, y);
  context.lineTo(x + width, y + height - cut);
  context.lineTo(x + width - cut, y + height);
  context.lineTo(x, y + height);
  context.lineTo(x, y + cut);
  context.closePath();
}

function nodeColor(doc: KnowledgeManifestDoc): string {
  return doc.kind ? NODE_COLORS[doc.kind] ?? DEFAULT_NODE_COLOR : DEFAULT_NODE_COLOR;
}

function nodeGeometry(doc: KnowledgeManifestDoc): THREE.BufferGeometry {
  switch (doc.kind) {
    case "reference":
      return new THREE.BoxGeometry(22, 22, 22);
    case "taxonomy":
      return new THREE.OctahedronGeometry(16, 0);
    case "domain":
      return new THREE.DodecahedronGeometry(18, 0);
    case "entity":
      return new THREE.IcosahedronGeometry(16, 0);
    case "policy":
      return new THREE.ConeGeometry(15, 28, 5);
    case "guide":
    default:
      return new THREE.SphereGeometry(12, 24, 16);
  }
}

function edgeColor(type: string): string {
  return EDGE_COLORS[type] ?? EDGE_COLORS[type.replace(/_/g, " ")] ?? DEFAULT_EDGE_COLOR;
}

function edgeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
