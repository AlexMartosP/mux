import { createFileRoute, Outlet, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bell, MessageSquare, MessageCircle, RefreshCw, Icon, Plus } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useUpdater } from "@/hooks/useUpdater";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWorkspacesQuery } from "@/domains/workspaces/data/workspaces-queries";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/settings")({
  component: SettingsLayout,
});

type NavItem = {
  type: "link" | "button";
  label: string;
  path?: string;
  icon?: React.ElementType;
  disabled?: boolean;
  onClick?: () => void;
};

function SettingsLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { checking, checkForUpdates, updateAvailable, downloading, downloadProgress, downloadAndInstall } = useUpdater();
  const getWorkspaces = useWorkspacesQuery();

  const handleSendFeedback = () => {
    openUrl("https://github.com/muxinc/mux-coder/issues");
  };

  const navItems: NavItem[] = [
    {
      type: "link" as const,
      label: "Chat",
      path: "/settings/chat",
      icon: MessageSquare,
    },
    {
      type: "link" as const,
      label: "Notifications",
      path: "/settings/notifications",
      icon: Bell,
    },
    {
      type: "button" as const,
      label: "Send feedback",
      icon: MessageCircle,
      onClick: handleSendFeedback,
    },
    {
      type: "button" as const,
      label: updateAvailable
        ? downloading
          ? `Downloading ${downloadProgress}%`
          : `Update to ${updateAvailable.version}`
        : checking
          ? "Checking..."
          : "Check for updates",
      icon: RefreshCw,
      onClick: updateAvailable ? downloadAndInstall : checkForUpdates,
      disabled: checking || downloading,
    },
  ];

  return (
    <div className="flex h-screen">
      <aside className="w-[280px] h-full flex flex-col border-r border-border bg-background">
        <div className="pl-[80px] pt-3.5">
          <h1 className="font-semibold text-lg">Settings</h1>
        </div>
        <div className="p-3">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 text-xs rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            Back to app
          </Link>
        </div>

        <div className="px-3 py-2">
          <h1 className="text-sm font-medium text-foreground">Settings</h1>
        </div>

        <nav className="flex-1 px-2">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;

              if (item.type === "link") {
                const isActive = location.pathname === item.path;
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md transition-colors",
                        isActive
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      {Icon && <Icon size={14} />}
                      {item.label}
                    </Link>
                  </li>
                );
              }

              return (
                <li key={item.label}>
                  <button
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      item.disabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {Icon && <Icon size={14} />}
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>

          <Separator orientation="horizontal" className="h-px my-2" />

          <ul className="space-y-1">
            {getWorkspaces.data?.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  to="/settings/workspace/$workspaceId"
                  params={{ workspaceId: workspace.id }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded transition-colors",
                    location.pathname === `/settings/workspace/${workspace.id}`
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  )}
                >
                  {workspace.name}
                </Link>
              </li>
            ))}
            <li>
              <Link
                to="/settings/workspaces"
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded transition-colors",
                  location.pathname === "/settings/workspaces"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Plus size={14} />
                New Workspace
              </Link>
            </li>
          </ul>


        </nav>
      </aside >

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl">
          <Outlet />
        </div>
      </main>
    </div >
  );
}
