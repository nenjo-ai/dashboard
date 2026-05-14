"use client";

import type { ReactNode } from "react";
import { Activity, BookOpen, Bot, FolderKanban, Gauge, MessageSquare, PlaySquare, Settings, Workflow } from "lucide-react";

export interface MobileNavItem {
  label: string;
  href: string;
  icon: ReactNode;
  match?: (pathname: string) => boolean;
}

export const mobileTabNavItems: MobileNavItem[] = [
  {
    label: "Home",
    href: "/dashboard",
    icon: <Gauge className="h-5 w-5" />,
    match: (pathname) => pathname === "/dashboard",
  },
  {
    label: "Chat",
    href: "/dashboard/chat",
    icon: <MessageSquare className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/chat"),
  },
  {
    label: "Agents",
    href: "/dashboard/agents",
    icon: <Bot className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/agents"),
  },
  {
    label: "Projects",
    href: "/dashboard/projects",
    icon: <FolderKanban className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/projects"),
  },
  {
    label: "Library",
    href: "/dashboard/knowledge",
    icon: <BookOpen className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/knowledge"),
  },
  {
    label: "Activity",
    href: "/dashboard/activity",
    icon: <Activity className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/activity"),
  },
  {
    label: "Routines",
    href: "/dashboard/routines",
    icon: <Workflow className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/routines"),
  },
  {
    label: "Executions",
    href: "/dashboard/executions",
    icon: <PlaySquare className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/executions"),
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: <Settings className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/settings"),
  },
];
