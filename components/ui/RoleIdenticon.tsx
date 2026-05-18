"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import * as rings from "@dicebear/rings";
import { AnimatedRoleIdenticon } from "./AnimatedRoleIdenticon";

interface RoleIdenticonProps {
  roleId?: string | null;
  color?: string | null;
  size?: number;
  className?: string;
  animate?: boolean;
  /** Deprecated. Identicons are keyed by `roleId`, not agent name. */
  name?: string;
  /** Deprecated alias for `name`. */
  roleName?: string;
}

function normalizedRingColor(color: string | null | undefined): string {
  const hex = color?.trim().replace(/^#/, "") ?? "";
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex : "0EA5E9";
}

export function RoleIdenticon({
  roleId,
  color,
  size = 32,
  className,
  animate = false,
}: RoleIdenticonProps) {
  const seed = roleId?.trim() || "agent";
  const ringColor = normalizedRingColor(color);

  const svg = useMemo(() => {
    const avatar = createAvatar(rings, {
      seed,
      size,
      ringColor: [ringColor],
    });
    return avatar.toString();
  }, [seed, ringColor, size]);

  if (animate) {
    return (
      <AnimatedRoleIdenticon
        roleId={seed}
        color={ringColor}
        size={size}
        className={className}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
