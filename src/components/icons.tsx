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
export const ProofMapMark = ({ className }: Props) => (
  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden className={className}>
    <path d="M5 5.5L11 11M5 16.5L11 11M11 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
    <circle cx="5" cy="5.5" r="2.25" fill="currentColor" opacity="0.7" />
    <circle cx="5" cy="16.5" r="2.25" fill="currentColor" opacity="0.7" />
    <circle cx="11" cy="11" r="2.25" fill="currentColor" />
    <circle cx="17" cy="11" r="3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
