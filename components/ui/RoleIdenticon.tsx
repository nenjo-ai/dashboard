"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { rings } from "@dicebear/collection";
import { AnimatedRoleIdenticon } from "./AnimatedRoleIdenticon";
import { SystemRoleIcon } from "./SystemRoleIcon";

interface RoleIdenticonProps {
  roleId: string;
  color: string;
  size?: number;
  className?: string;
  animate?: boolean;
  /** When the agent name is "system", renders the hardcoded system icon instead. */
  name?: string;
  /** Deprecated alias for `name`. */
  roleName?: string;
}

export function RoleIdenticon({
  roleId,
  color,
  size = 32,
  className,
  animate = false,
  name,
  roleName,
}: RoleIdenticonProps) {
  const resolvedName = name ?? roleName;
  const isSystemRole = resolvedName?.trim().toLowerCase() === "system";

  if (isSystemRole) {
    return (
      <SystemRoleIcon
        size={size}
        className={className}
        animate={animate}
      />
    );
  }

  const dataUri = useMemo(() => {
    // DiceBear expects hex colors without the '#' prefix
    const hex = color.startsWith("#") ? color.slice(1) : color;
    const avatar = createAvatar(rings, {
      seed: roleId,
      size,
      ringColor: [hex],
    });
    return avatar.toDataUri();
  }, [roleId, color, size]);

  if (animate) {
    return (
      <AnimatedRoleIdenticon
        roleId={roleId}
        color={color}
        size={size}
        className={className}
      />
    );
  }

  return (
    <img
      src={dataUri}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: "50%" }}
    />
  );
}
