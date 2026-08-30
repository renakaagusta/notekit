import type { ReactNode } from "react";
import { AccessTokensView } from "./AccessTokensView";
import { AgentsView } from "./AgentsView";
import { DevicesPanel } from "./DevicesPanel";
import { HistoryView } from "./HistoryView";
import { Modal } from "./Modal";
import { NotificationSettings } from "./NotificationSettings";
import { NotificationsInbox } from "./NotificationsInbox";

interface ModalShellProps {
  title: string;
  subtitle: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

function ModalShell({ title, subtitle, onClose, children }: ModalShellProps) {
  return (
    <Modal open onClose={onClose} title={title}>
      <p className="nk-modal-sub">{subtitle}</p>
      {children}
    </Modal>
  );
}

interface AppModalsProps {
  agentsOpen: boolean;
  onCloseAgents: () => void;
  focusAgent: { slug: string; seq: number } | null;
  tokensOpen: boolean;
  onCloseTokens: () => void;
  devicesOpen: boolean;
  onCloseDevices: () => void;
  notificationsOpen: boolean;
  onCloseNotifications: () => void;
  historyOpen: boolean;
  onCloseHistory: () => void;
  notePath: string | undefined;
  showNoteHistoryHint: boolean;
}

export function AppModals({
  agentsOpen,
  onCloseAgents,
  focusAgent,
  tokensOpen,
  onCloseTokens,
  devicesOpen,
  onCloseDevices,
  notificationsOpen,
  onCloseNotifications,
  historyOpen,
  onCloseHistory,
  notePath,
  showNoteHistoryHint,
}: AppModalsProps) {
  return (
    <>
      {agentsOpen && (
        <ModalShell
          title="Agents"
          subtitle="Give an AI assistant its own git identity. Commits it makes on your behalf are attributed to the agent, not to you."
          onClose={onCloseAgents}
        >
          <AgentsView focusAgent={focusAgent} />
        </ModalShell>
      )}
      {tokensOpen && (
        <ModalShell
          title="API tokens"
          subtitle="Long-lived credentials for the NoteKit CLI and the MCP server (Claude Desktop, Cursor). The full token is shown exactly once — copy it the moment you mint it."
          onClose={onCloseTokens}
        >
          <AccessTokensView />
        </ModalShell>
      )}
      {devicesOpen && (
        <ModalShell
          title="Devices"
          subtitle="Devices paired to your encrypted vault. Pair a new one with a 6-digit code, or unlock it with your recovery phrase — verify the emoji fingerprint matches on both screens before approving."
          onClose={onCloseDevices}
        >
          <DevicesPanel />
        </ModalShell>
      )}
      {notificationsOpen && (
        <ModalShell
          title="Notifications"
          subtitle="What agents have done in your vault — and which channels deliver those updates outside the app."
          onClose={onCloseNotifications}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
            <NotificationsInbox />
            <NotificationSettings />
          </div>
        </ModalShell>
      )}
      {historyOpen && (
        <ModalShell
          title="Activity"
          subtitle={
            <>
              Recent commits across this vault.
              {showNoteHistoryHint && " Filtered to the active note."}
            </>
          }
          onClose={onCloseHistory}
        >
          <HistoryView notePath={notePath} />
        </ModalShell>
      )}
    </>
  );
}
