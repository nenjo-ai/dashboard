"use client";

import type { CouncilDetail } from "@/lib/types";
import { DELEGATION_STRATEGIES } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface CouncilDetailModalProps {
  council: CouncilDetail | null;
  onClose: () => void;
  onEdit: (council: CouncilDetail) => void;
  onDelete: (council: CouncilDetail) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <div className="flex-1 text-sm text-gray-700 dark:text-gray-300">{children}</div>
    </div>
  );
}

export function CouncilDetailModal({
  council,
  onClose,
  onEdit,
  onDelete,
}: CouncilDetailModalProps) {
  if (!council) return null;

  const strategy = DELEGATION_STRATEGIES.find(
    (s) => s.id === council.delegation_strategy,
  );

  return (
    <Modal
      open={!!council}
      onClose={onClose}
      title={council.name}
      className="max-w-2xl"
    >
      <div className="space-y-1 divide-y divide-gray-100 dark:divide-gray-700">
        {/* Badges */}
        <div className="flex flex-wrap gap-2 pb-3">
          <Badge variant="default">
            {strategy?.label ?? council.delegation_strategy}
          </Badge>
          <Badge variant="default">
            {council.members?.length ?? 0} member{(council.members?.length ?? 0) !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Description */}
        {council.description && (
          <div className="py-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {council.description}
            </p>
          </div>
        )}

        {/* Strategy Info */}
        <div className="py-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
            Delegation Strategy
          </h4>
          <div className="rounded-lg bg-deep-space-blue-50 px-4 py-3 dark:bg-deep-space-blue-900/30">
            <p className="text-sm font-medium text-deep-space-blue-700 dark:text-deep-space-blue-300">
              {strategy?.label ?? council.delegation_strategy}
            </p>
            {strategy && (
              <p className="mt-1 text-xs text-deep-space-blue-500 dark:text-deep-space-blue-400">
                {strategy.description}
              </p>
            )}
          </div>
        </div>

        {/* Leader */}
        <div className="py-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
            Council Leader
          </h4>
          <div className="flex items-center gap-3 rounded-lg border border-deep-space-blue-200 bg-deep-space-blue-50 px-4 py-3 dark:border-deep-space-blue-800 dark:bg-deep-space-blue-900/30">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-deep-space-blue-100 dark:bg-deep-space-blue-900/50">
              <svg
                className="h-4 w-4 text-deep-space-blue-600 dark:text-deep-space-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-deep-space-blue-700 dark:text-deep-space-blue-300">
                {council.leader_agent?.name ?? "Unknown Agent"}
              </p>
              <p className="text-xs text-deep-space-blue-500 dark:text-deep-space-blue-400">
                {council.leader_agent?.model_name ?? "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Members */}
        <div className="py-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
            Members ({council.members?.length ?? 0})
          </h4>
          {(council.members?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400 italic dark:text-gray-500">
              No members configured.
            </p>
          ) : (
            <div className="space-y-2">
              {council.members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-deep-space-blue-50 dark:bg-deep-space-blue-900/50">
                    <svg
                      className="h-4 w-4 text-deep-space-blue-500 dark:text-deep-space-blue-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {member.agent?.name ?? "Unknown Agent"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {member.agent?.model_name ?? "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="py-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-2">
            Details
          </h4>
          <DetailRow label="ID">
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-sm dark:bg-gray-700">
              {council.id}
            </code>
          </DetailRow>
          <DetailRow label="Created">{formatDate(council.created_at)}</DetailRow>
          <DetailRow label="Updated">{formatDate(council.updated_at)}</DetailRow>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDelete(council)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/50"
          >
            Delete
          </Button>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
          <Button size="sm" onClick={() => onEdit(council)}>
            Edit Council
          </Button>
        </div>
      </div>
    </Modal>
  );
}
