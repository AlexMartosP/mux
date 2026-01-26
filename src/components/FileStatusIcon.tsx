import type { FileStatus } from "../types/task";

interface FileStatusIconProps {
  status: FileStatus;
  size?: number;
}

export function FileStatusIcon({ status, size = 14 }: FileStatusIconProps) {
  const config = statusConfig[status];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ color: config.color, flexShrink: 0 }}
      aria-label={config.label}
    >
      <title>{config.label}</title>
      {config.icon}
    </svg>
  );
}

const statusConfig: Record<FileStatus, { color: string; label: string; icon: React.ReactNode }> = {
  added: {
    color: "var(--accent-green)",
    label: "Added",
    icon: (
      <>
        {/* File with plus */}
        <path
          d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M9 1v4h4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M7 8v4M5 10h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </>
    ),
  },
  modified: {
    color: "var(--accent-yellow)",
    label: "Modified",
    icon: (
      <>
        {/* File with pencil */}
        <path
          d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M9 1v4h4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M6 12l1.5-4L11 4.5l1.5 1.5L9 9.5 5 11l1 1z"
          stroke="currentColor"
          strokeWidth="1"
          fill="none"
        />
      </>
    ),
  },
  deleted: {
    color: "var(--accent-red)",
    label: "Deleted",
    icon: (
      <>
        {/* File with minus */}
        <path
          d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M9 1v4h4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M5 10h6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </>
    ),
  },
  renamed: {
    color: "var(--accent-cyan)",
    label: "Renamed",
    icon: (
      <>
        {/* File with arrow */}
        <path
          d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M9 1v4h4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M5 10h5M8 8l2 2-2 2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    ),
  },
  copied: {
    color: "var(--accent-magenta)",
    label: "Copied",
    icon: (
      <>
        {/* Two files */}
        <path
          d="M6 3h4l3 3v6a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M10 3v3h3"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M3 5v9a1 1 0 001 1h7"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
      </>
    ),
  },
  untracked: {
    color: "var(--text-dim)",
    label: "Untracked",
    icon: (
      <>
        {/* File with question mark */}
        <path
          d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M9 1v4h4"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M6.5 8.5a1.5 1.5 0 113 0c0 .75-.75 1-1.5 1.5M8 12v.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </>
    ),
  },
};
