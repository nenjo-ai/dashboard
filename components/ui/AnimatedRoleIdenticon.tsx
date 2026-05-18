"use client";

import { useId, useMemo, useRef, useEffect } from "react";
import { createAvatar } from "@dicebear/core";
import * as rings from "@dicebear/rings";

interface AnimatedRoleIdenticonProps {
  roleId: string;
  color?: string | null;
  size?: number;
  className?: string;
}

// Only the 3 outermost rings animate: CW, CCW, CW
const ANIMATED_RING_COUNT = 3;
const RING_DURATIONS = [3, 2.4, 1.8];

// Pendulum-style easing: fast through bottom (180°), slow at top (0°/360°)
// Uses keyTimes + keySplines to simulate pendulum motion over a full rotation.
// 4 segments: top→right (slow start), right→bottom (accelerate),
//             bottom→left (accelerate), left→top (decelerate)
// Pendulum: crawls at top (0°/360°), whips through bottom (180°)
// Top 40° takes 40% of time, bottom 280° takes 20% of time
// 7 keyframes with linear calcMode — speed baked directly into angle/time ratios
const PENDULUM_KEY_TIMES = "0;0.25;0.4;0.5;0.6;0.75;1";
const PENDULUM_VALUES_CW = "0 50 50;20 50 50;60 50 50;180 50 50;300 50 50;340 50 50;360 50 50";
const PENDULUM_VALUES_CCW = "0 50 50;-20 50 50;-60 50 50;-180 50 50;-300 50 50;-340 50 50;-360 50 50";

function normalizedRingColor(color: string | null | undefined): string {
  const hex = color?.trim().replace(/^#/, "") ?? "";
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex : "0EA5E9";
}

/**
 * Injects native SVG <animateTransform> elements into the DiceBear rings SVG.
 * Uses additive="sum" so the spin composes with existing rotate() transforms.
 * The full SVG structure (masks, defs, background) stays completely intact.
 */
function buildAnimatedSvg(svgString: string, uid: string): string | null {
  if (typeof DOMParser === "undefined") return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;

  // Make IDs unique to avoid collisions with multiple instances
  const idMap = new Map<string, string>();
  for (const el of Array.from(svg.querySelectorAll("[id]"))) {
    const oldId = el.getAttribute("id")!;
    const newId = `${oldId}-${uid}`;
    idMap.set(oldId, newId);
    el.setAttribute("id", newId);
  }
  // Update all url(#...) and href="#..." references
  for (const el of Array.from(svg.querySelectorAll("*"))) {
    for (const attr of Array.from(el.attributes)) {
      let val = attr.value;
      let changed = false;
      idMap.forEach((newId, oldId) => {
        if (val.includes(`#${oldId}`)) {
          val = val.split(`#${oldId}`).join(`#${newId}`);
          changed = true;
        }
      });
      if (changed) el.setAttribute(attr.name, val);
    }
  }

  // Structure: <g mask> → <g transform="translate rotate"> → ring groups
  const maskGroup = svg.querySelector("g[mask]");
  if (!maskGroup) return null;
  const parentGroup = maskGroup.querySelector(":scope > g");
  if (!parentGroup) return null;

  // Separate top-half rings, bottom-half mirrors, and overlays
  const topRings: Element[] = [];
  const bottomRings: Element[] = [];

  for (const child of Array.from(parentGroup.children)) {
    if (child.tagName !== "g") continue;
    const t = child.getAttribute("transform") || "";
    if (t.includes("matrix")) {
      bottomRings.push(child);
    } else if (t.includes("rotate")) {
      topRings.push(child);
    }
  }

  const svgNS = "http://www.w3.org/2000/svg";

  for (let i = 0; i < ANIMATED_RING_COUNT; i++) {
    const dir = i % 2 === 0 ? 1 : -1; // CW, CCW, CW
    const dur = RING_DURATIONS[i];

    // Top-half ring: pendulum rotation (speed baked into angle/time ratios)
    if (topRings[i]) {
      const anim = doc.createElementNS(svgNS, "animateTransform");
      anim.setAttribute("attributeName", "transform");
      anim.setAttribute("type", "rotate");
      anim.setAttribute("values", dir === 1 ? PENDULUM_VALUES_CW : PENDULUM_VALUES_CCW);
      anim.setAttribute("keyTimes", PENDULUM_KEY_TIMES);
      anim.setAttribute("calcMode", "linear");
      anim.setAttribute("dur", `${dur}s`);
      anim.setAttribute("repeatCount", "indefinite");
      anim.setAttribute("additive", "sum");
      topRings[i].appendChild(anim);
    }

    // Bottom-half ring: reversed direction (Y-flipped by parent matrix)
    if (bottomRings[i]) {
      const innerG = bottomRings[i].querySelector(":scope > g");
      if (innerG) {
        const anim = doc.createElementNS(svgNS, "animateTransform");
        anim.setAttribute("attributeName", "transform");
        anim.setAttribute("type", "rotate");
        anim.setAttribute("values", dir === 1 ? PENDULUM_VALUES_CCW : PENDULUM_VALUES_CW);
        anim.setAttribute("keyTimes", PENDULUM_KEY_TIMES);
        anim.setAttribute("calcMode", "linear");
        anim.setAttribute("dur", `${dur}s`);
        anim.setAttribute("repeatCount", "indefinite");
        anim.setAttribute("additive", "sum");
        innerG.appendChild(anim);
      }
    }
  }

  return new XMLSerializer().serializeToString(svg);
}

export function AnimatedRoleIdenticon({
  roleId,
  color,
  size = 32,
  className,
}: AnimatedRoleIdenticonProps) {
  const rawId = useId();
  const uid = rawId.replace(/:/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const ringColor = normalizedRingColor(color);

  const svgString = useMemo(() => {
    const avatar = createAvatar(rings, {
      seed: roleId,
      size,
      ringColor: [ringColor],
    });
    return avatar.toString();
  }, [roleId, ringColor, size]);

  const animatedSvg = useMemo(
    () => buildAnimatedSvg(svgString, uid),
    [svgString, uid],
  );

  // Set innerHTML via ref to avoid React re-diffing/remounting the SVG
  useEffect(() => {
    if (containerRef.current && animatedSvg) {
      containerRef.current.innerHTML = animatedSvg;
    }
  }, [animatedSvg]);

  // SSR fallback or parse failure
  if (!animatedSvg) {
    return (
      <div
        aria-hidden="true"
        className={className}
        style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden" }}
        dangerouslySetInnerHTML={{ __html: svgString }}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden" }}
    />
  );
}
