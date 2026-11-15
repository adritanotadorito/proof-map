/** Small inline icons, drawn for ProofMap on a 16px grid. */
type Props = { className?: string };
const base = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const BranchIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <circle cx="4" cy="3.5" r="1.75" />
    <circle cx="4" cy="12.5" r="1.75" />
    <circle cx="12" cy="5" r="1.75" />
    <path d="M4 5.25v5.5M12 6.75c0 2.5-3 2.75-8 3.25" />
  </svg>
);
export const CommitIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <circle cx="8" cy="8" r="2.75" />
    <path d="M1 8h4.25M10.75 8H15" />
  </svg>
);
export const FileIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M3.5 1.75h5.75L12.5 5v9.25h-9z" />
    <path d="M9 1.75V5.25h3.5" />
  </svg>
);
export const DiffIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M3.5 1.75h9v12.5h-9z" />
    <path d="M6 5.5h4M8 3.5v4M6 11h4" />
  </svg>
);
export const RepoIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M3 2h9.5v9.5H4.25A1.25 1.25 0 0 0 3 12.75z" />
    <path d="M3 12.75c0 .7.55 1.25 1.25 1.25h8.25v-2.5" />
  </svg>
);
export const RequirementIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <circle cx="8" cy="8" r="6.25" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);
export const OverviewIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M2 3.5h12M2 8h12M2 12.5h7" />
  </svg>
);
export const ReviewIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M2 3h12v8H8.5L5 14v-3H2z" />
  </svg>
);
export const CheckIcon = ({ className }: Props) => (
  <svg {...base} className={className} strokeWidth={2}>
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);
export const PersonIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <circle cx="8" cy="5.25" r="2.75" />
    <path d="M2.75 14c.5-2.75 2.5-4 5.25-4s4.75 1.25 5.25 4" />
  </svg>
);
export const ExternalIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5M11.5 9.5v4h-9v-9h4" />
  </svg>
);

/** ProofMap mark: three evidence nodes leading to one decision node. */
export const ProofMapMark = ({ className, size = 22 }: Props & { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden className={className}>
    <path d="M5 5.5L11 11M5 16.5L11 11M11 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
    <circle cx="5" cy="5.5" r="2.25" fill="currentColor" opacity="0.7" />
    <circle cx="5" cy="16.5" r="2.25" fill="currentColor" opacity="0.7" />
    <circle cx="11" cy="11" r="2.25" fill="currentColor" />
    <circle cx="17" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const FolderIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M1.75 3.5h4l1.5 1.75h7v7.25H1.75z" />
  </svg>
);
export const ChevronIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M4 6l4 4 4-4" />
  </svg>
);
export const StarIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M8 1.75l1.9 3.95 4.35.6-3.15 3.05.75 4.3L8 11.6l-3.85 2.05.75-4.3L1.75 6.3l4.35-.6z" />
  </svg>
);
export const SearchIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </svg>
);
export const CopyIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M5.5 5.5h8v8h-8z" />
    <path d="M10.5 5.5v-3h-8v8h3" />
  </svg>
);
export const DecisionIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M3.5 1.75h6L12.5 5v9.25h-9z" />
    <path d="M6 7.5h4M6 10h4M6 12h2" />
  </svg>
);
/** The AI reviewer. Deliberately a machine, so nobody mistakes it for a person. */
export const BotIcon = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M8 1.5v2" />
    <rect x="2.5" y="4" width="11" height="8.5" rx="2" />
    <circle cx="5.75" cy="8" r="1" fill="currentColor" stroke="none" />
    <circle cx="10.25" cy="8" r="1" fill="currentColor" stroke="none" />
    <path d="M6.25 10.5h3.5M1 7.5v2M15 7.5v2" />
  </svg>
);

/** Result markers for checks. A dashed ring always means "did not happen". */
export const PassMark = ({ className }: Props) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className={className}>
    <circle cx="8" cy="8" r="8" fill="var(--success)" />
    <path d="M4.5 8.3l2.3 2.3 4.7-5" fill="none" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const FailMark = ({ className }: Props) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className={className}>
    <circle cx="8" cy="8" r="8" fill="var(--danger)" />
    <path d="M5.25 5.25l5.5 5.5M10.75 5.25l-5.5 5.5" fill="none" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
export const NotRunMark = ({ className }: Props) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className={className}>
    <circle cx="8" cy="8" r="6.75" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="2.6 2.7" />
  </svg>
);

/** GitHub's mark, used only on controls that go to GitHub. */
export const GitHubMark = ({ className, size = 16 }: Props & { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);
