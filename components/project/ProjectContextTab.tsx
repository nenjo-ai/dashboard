"use client";

import { useState, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { updateProject } from "@/lib/api";
import type { Project } from "@/lib/types";

interface ProjectContextTabProps {
  project: Project | undefined;
  onUpdated: () => void;
}

export function ProjectContextTab({ project, onUpdated }: ProjectContextTabProps) {
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      const ctx = (project.settings as Record<string, unknown>)?.context;
      setValue(typeof ctx === "string" ? ctx : "");
    }
  }, [project]);

  const handleSave = useCallback(async () => {
    if (!project) return;
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateProject(project.id, {
        settings: { ...project.settings, context: value },
      });
      onUpdated();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save context");
    } finally {
      setIsSaving(false);
    }
  }, [project, value, onUpdated]);

  const isDirty =
    project != null &&
    value !== ((project.settings as Record<string, unknown>)?.context ?? "");

  if (!project) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-500 dark:text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <Card static>
      <CardHeader>
        <CardTitle>Project Context</CardTitle>
        <CardDescription>
          Global context shared with all agents working in this project. Describe goals,
          architecture, conventions, or anything agents should know.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe project context, goals, architecture, conventions..."
          className="min-h-[300px] font-mono text-sm"
        />
      </CardContent>
      <CardFooter className="gap-3">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
        {saved && (
          <span className="text-sm text-green-600 dark:text-green-400">Saved</span>
        )}
        {error && (
          <span className="text-sm text-flag-red-600 dark:text-flag-red-400">{error}</span>
        )}
      </CardFooter>
    </Card>
  );
}
