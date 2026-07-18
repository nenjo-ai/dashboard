"use client";

import type { ReactNode } from "react";
import { Activity, Bot, FolderKanban, Gauge, LibraryBig, ListTodo, MessageSquare, Package, PlaySquare, Settings, Users, Workflow } from "lucide-react";

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
    label: "Tasks",
    href: "/dashboard/tasks",
    icon: <ListTodo className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/tasks"),
  },
  {
    label: "Library",
    href: "/dashboard/library",
    icon: <LibraryBig className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/library"),
  },
  {
    label: "Packages",
    href: "/dashboard/packages",
    icon: <Package className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/packages"),
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
    label: "Councils",
    href: "/dashboard/councils",
    icon: <Users className="h-5 w-5" />,
    match: (pathname) => pathname.startsWith("/dashboard/councils"),
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
