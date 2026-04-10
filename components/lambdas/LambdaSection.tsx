"use client";

import { useState } from "react";
import { useLambdas } from "@/lib/hooks";
import { deleteLambda } from "@/lib/api";
import { LambdaFormModal } from "./LambdaFormModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import type { Lambda, LambdaInterpreter } from "@/lib/types";

const INTERPRETER_LABELS: Record<LambdaInterpreter, string> = {
  auto: "Auto",
  bash: "Bash",
  sh: "Shell",
  python3: "Python 3",
  node: "Node.js",
};

const INTERPRETER_COLORS: Record<LambdaInterpreter, string> = {
  auto: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  bash: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300",
  sh: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-300",
  python3: "bg-blue-50 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300",
  node: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
};

export function LambdaSection() {
  const { lambdas, isLoading, isError, mutate } = useLambdas();
  const [formOpen, setFormOpen] = useState(false);
  const [editingLambda, setEditingLambda] = useState<Lambda | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = () => {
    setEditingLambda(null);
    setFormOpen(true);
  };

  const handleEdit = (lambda: Lambda) => {
    setEditingLambda(lambda);
    setFormOpen(true);
  };

  const handleDelete = async (lambda: Lambda) => {
    if (deletingId) return;
    setDeletingId(lambda.id);
    try {
      await deleteLambda(lambda.id);
      mutate();
    } catch {
      // Silently fail — in production show a toast
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = () => {
    mutate();
    setFormOpen(false);
    setEditingLambda(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 py-12 dark:border-red-900 dark:bg-red-950/50">
        <svg
          className="h-10 w-10 text-flag-red-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Failed to load lambdas
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Please check your connection and try again.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Header with Create button */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Lambdas
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Reusable scripts that execute as routine steps without an LLM.
          </p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="hidden sm:inline">New Lambda</span>
        </Button>
      </div>

      {/* Empty state */}
      {(!lambdas || lambdas.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white px-6 py-16 dark:border-gray-600 dark:bg-gray-800">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-900/50">
            <span className="text-2xl font-bold text-orange-500">&#955;</span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            No lambdas yet
          </h3>
          <p className="mt-2 max-w-sm text-center text-sm text-gray-500 dark:text-gray-400">
            Lambdas are deterministic scripts (bash, python, node) that run as routine steps.
            Use them for git setup, testing, deployment, and other automated tasks.
          </p>
          <Button className="mt-4" onClick={handleCreate}>
            Create Your First Lambda
          </Button>
        </div>
      )}

      {/* Lambda cards */}
      {lambdas && lambdas.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lambdas.map((lambda) => (
            <LambdaCard
              key={lambda.id}
              lambda={lambda}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isDeleting={deletingId === lambda.id}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <LambdaFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingLambda(null);
        }}
        onSaved={handleSaved}
        lambda={editingLambda}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LambdaCard (private to this file)
// ---------------------------------------------------------------------------

function LambdaCard({
  lambda,
  onEdit,
  onDelete,
  isDeleting,
}: {
  lambda: Lambda;
  onEdit: (l: Lambda) => void;
  onDelete: (l: Lambda) => void;
  isDeleting: boolean;
}) {
  const lineCount = lambda.body.split("\n").length;

  return (
    <div className="group rounded-xl border border-gray-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {lambda.name}
          </h4>
          <p className="mt-0.5 truncate text-xs font-mono text-gray-500 dark:text-gray-400">
            {lambda.path}
          </p>
        </div>
        <span
          className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${INTERPRETER_COLORS[lambda.interpreter]}`}
        >
          {INTERPRETER_LABELS[lambda.interpreter]}
        </span>
      </div>

      {/* Description */}
      {lambda.description && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
          {lambda.description}
        </p>
      )}

      {/* Metadata */}
      <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
          {lineCount} line{lineCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
        <button
          onClick={() => onEdit(lambda)}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(lambda)}
          disabled={isDeleting}
          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-flag-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-flag-red-400 dark:hover:bg-red-900/30"
        >
          {isDeleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  );
}
