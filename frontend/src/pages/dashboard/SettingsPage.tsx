import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { orgApiKeysAPI } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";

interface OrgApiKey {
  keyId: string;
  label: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}

const panel = "bg-surface border border-edge rounded-md";
const fieldLabel = "block text-sm font-medium text-ink-2 mb-1.5";
const input =
  "w-full bg-bg border border-edge rounded-sm h-10 px-3 text-sm text-ink " +
  "placeholder:text-muted focus:border-primary focus:outline-none " +
  "focus:ring-2 focus:ring-primary/20";
const btnPrimary =
  "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm text-sm " +
  "font-medium bg-primary text-white hover:bg-primary-hover " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 " +
  "disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnGhost =
  "inline-flex items-center justify-center gap-2 h-8 px-3 rounded-sm text-xs " +
  "font-medium text-ink-2 hover:text-ink hover:bg-surface-2 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 " +
  "transition-colors";
const th =
  "text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted py-2.5";

function formatDate(value?: string | null) {
  if (!value) return "never";
  return new Date(value).toLocaleString();
}

export default function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isAdmin = user?.role === "admin";

  const keysQuery = useQuery({
    queryKey: ["org-api-keys"],
    queryFn: async () => {
      const response = await orgApiKeysAPI.list();
      return (response.data?.apiKeys ?? []) as OrgApiKey[];
    },
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (value: string) => orgApiKeysAPI.create(value),
    onSuccess: (response) => {
      setRevealedKey(response.data?.apiKey ?? null);
      setNewLabel("");
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ["org-api-keys"] });
    },
    onError: () => {
      setErrorMessage("Could not create the key. Check your connection and try again.");
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => orgApiKeysAPI.revoke(keyId),
    onSuccess: () => {
      setErrorMessage(null);
      queryClient.invalidateQueries({ queryKey: ["org-api-keys"] });
    },
    onError: () => {
      setErrorMessage("Could not revoke the key. Check your connection and try again.");
    },
  });

  async function copyKey() {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMessage("Copying failed. Select the key and copy it manually.");
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-ink mb-1">Settings</h1>
        <p className="text-sm text-ink-2 mb-6">Organization configuration</p>
        <div className={`${panel} p-6`}>
          <h2 className="text-base font-semibold text-ink mb-2">
            Organization API keys are managed by an admin
          </h2>
          <p className="text-sm text-ink-2 max-w-prose">
            Your account has the <span className="font-mono text-ink">{user?.role}</span> role.
            API keys register new agents, so only an organization admin can create or revoke
            them. Ask an admin on your team to issue one for you.
          </p>
        </div>
      </div>
    );
  }

  const keys = keysQuery.data ?? [];
  const activeKeys = keys.filter((key) => !key.revokedAt);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold text-ink mb-1">Settings</h1>
      <p className="text-sm text-ink-2 mb-6">Organization API keys for registering agents</p>

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {errorMessage}
        </div>
      )}

      {revealedKey && (
        <div className={`${panel} p-4 sm:p-5 mb-4 border-success/50`}>
          <h2 className="text-base font-semibold text-ink mb-1">
            Copy this key now — it will not be shown again
          </h2>
          <p className="text-sm text-ink-2 mb-3 max-w-prose">
            Axon stores only a hash of this key. If you lose it, revoke it and create another.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <code className="flex-1 min-w-0 overflow-x-auto whitespace-nowrap bg-term-bg border border-edge rounded-sm px-3 py-2.5 font-mono text-xs text-success">
              {revealedKey}
            </code>
            <button type="button" onClick={copyKey} className={btnPrimary}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRevealedKey(null)}
            className={`${btnGhost} mt-3`}
          >
            I have saved it — hide
          </button>
        </div>
      )}

      <div className={`${panel} p-4 sm:p-5 mb-4`}>
        <h2 className="text-base font-semibold text-ink mb-3">Create a key</h2>
        <form
          className="flex flex-col sm:flex-row sm:items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (newLabel.trim()) createMutation.mutate(newLabel.trim());
          }}
        >
          <div className="flex-1 min-w-0">
            <label htmlFor="key-label" className={fieldLabel}>
              Label
            </label>
            <input
              id="key-label"
              name="label"
              className={input}
              placeholder="prod-us-east agents"
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className={btnPrimary}
            disabled={!newLabel.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Creating…" : "Create key"}
          </button>
        </form>
        <p className="text-xs text-muted mt-2">
          Name it after where it will be used, so you can revoke the right one later.
        </p>
      </div>

      <div className={panel}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-edge">
          <h2 className="text-base font-semibold text-ink">Existing keys</h2>
          <span className="font-mono text-xs text-muted tabular-nums">
            {activeKeys.length} active
          </span>
        </div>

        {keysQuery.isLoading ? (
          <p className="px-4 sm:px-5 py-6 text-sm text-ink-2">Loading keys…</p>
        ) : keys.length === 0 ? (
          <div className="px-4 sm:px-5 py-8 text-center">
            <p className="text-sm font-medium text-ink mb-1">No API keys yet</p>
            <p className="text-sm text-ink-2">
              Create one above, then use it to register your first agent.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-edge">
                  <th className={`${th} px-4 sm:px-5`}>Label</th>
                  <th className={`${th} px-4`}>Key ID</th>
                  <th className={`${th} px-4`}>Created</th>
                  <th className={`${th} px-4`}>Last used</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr
                    key={key.keyId}
                    className="border-b border-edge-subtle last:border-0 hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 sm:px-5 py-3 text-sm text-ink">
                      {key.label}
                      {key.revokedAt && (
                        <span className="ml-2 rounded-sm bg-danger/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-danger">
                          revoked
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">{key.keyId}</td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-2 tabular-nums">
                      {formatDate(key.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-2 tabular-nums">
                      {formatDate(key.lastUsedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!key.revokedAt && (
                        <button
                          type="button"
                          aria-label={`Revoke API key ${key.label}`}
                          className={`${btnGhost} text-danger hover:text-danger hover:bg-danger/10`}
                          disabled={revokeMutation.isPending}
                          onClick={() => revokeMutation.mutate(key.keyId)}
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
