"use client";

import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { rings } from "@dicebear/collection";
import { AnimatedRoleIdenticon } from "./AnimatedRoleIdenticon";

interface RoleIdenticonProps {
  roleId: string;
  color: string;
  size?: number;
  className?: string;
  animate?: boolean;
  /** When the role name is "system", renders the hardcoded system icon instead. */
  roleName?: string;
}

export function RoleIdenticon({
  roleId,
  color,
  size = 32,
  className,
  animate = false,
  roleName,
}: RoleIdenticonProps) {
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
