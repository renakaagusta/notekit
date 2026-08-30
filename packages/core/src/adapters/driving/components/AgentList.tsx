import { Pencil, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentProfile } from "../../../domain/entities/agent";
import { gravatarUrlFor } from "../../../domain/gravatar";
import { SkeletonCommitList } from "./Skeleton";

const MONO_FONT = "var(--mono-font)" as const;

export interface AgentListProps {
  agents: AgentProfile[] | null;
  error: string | null;
  editingSlug: string | null;
  renderEditForm(agent: AgentProfile): ReactNode;
  rowRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  startEdit(agent: AgentProfile): void;
  onDelete(slug: string): void;
}

function AgentRow({
  agent,
  rowRefs,
  onEdit,
  onRevoke,
}: {
  agent: AgentProfile;
  rowRefs: AgentListProps["rowRefs"];
  onEdit(): void;
  onRevoke(): void;
}) {
  return (
    <li
      className="nk-commit"
      ref={(el) => {
        if (el) rowRefs.current.set(agent.slug, el);
        else rowRefs.current.delete(agent.slug);
      }}
    >
      <div className="nk-commit-row">
        <img className="nk-commit-avatar" src={gravatarUrlFor(agent.email)} alt="" />
        <div className="nk-commit-body">
          <div className="nk-commit-msg">{agent.name}</div>
          {agent.description && <div className="nk-agent-desc">{agent.description}</div>}
          <div className="nk-commit-meta">
            <code style={{ fontFamily: MONO_FONT }}>{agent.email}</code>
            {" · "}created {formatTime(agent.createdAt)}
            {" · "}
            <code style={{ fontFamily: MONO_FONT }}>agents/{agent.slug}.json</code>
          </div>
        </div>
        <button
          className="nk-iconbtn"
          onClick={onEdit}
          title="Edit agent"
          aria-label={`Edit ${agent.slug}`}
        >
          <Pencil size={13} aria-hidden />
        </button>
        <button
          className="nk-iconbtn"
          onClick={onRevoke}
          title="Revoke agent"
          aria-label={`Revoke ${agent.slug}`}
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </li>
  );
}

export function AgentList({
  agents,
  error,
  editingSlug,
  renderEditForm,
  rowRefs,
  startEdit,
  onDelete,
}: AgentListProps) {
  if (!error && agents === null) return <SkeletonCommitList count={3} />;
  if (!agents) return null;
  if (agents.length === 0) {
    return (
      <div className="nk-empty">
        <p>No agents yet.</p>
        <p className="nk-empty-hint">
          Create an agent to give an AI assistant its own identity. Commits it
          makes are attributed to the agent in git history, with you as the
          committer.
        </p>
      </div>
    );
  }
  return (
    <ol className="nk-commitlist">
      {agents.map((a) =>
        editingSlug === a.slug ? (
          <li key={a.slug} className="nk-commit">
            {renderEditForm(a)}
          </li>
        ) : (
          <AgentRow
            key={a.slug}
            agent={a}
            rowRefs={rowRefs}
            onEdit={() => startEdit(a)}
            onRevoke={() => onDelete(a.slug)}
          />
        ),
      )}
    </ol>
  );
}

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
