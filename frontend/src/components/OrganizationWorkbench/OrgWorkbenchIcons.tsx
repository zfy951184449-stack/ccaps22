import React from 'react';

interface OrgWorkbenchIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

const iconProps = (size: number, className = '') => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
});

export const PlusIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 16, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </svg>
);

export const DownloadIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 16, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

export const UploadIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 16, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <path d="M12 21V9" />
    <path d="m7 14 5-5 5 5" />
    <path d="M5 3h14" />
  </svg>
);

export const SearchIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 16, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const EditIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 15, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z" />
  </svg>
);

export const DeleteIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 15, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <path d="M4 7h16" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M6 7l1 14h10l1-14" />
    <path d="M9 7V4h6v3" />
  </svg>
);

export const FolderIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 16, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <path d="M3 6h7l2 2h9v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
  </svg>
);

export const TeamIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 16, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9" r="2" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M14 16.5a5 5 0 0 1 7 3.5" />
  </svg>
);

export const GroupIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 16, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <path d="M6 9h12" />
    <path d="M6 15h12" />
    <path d="M9 6v12" />
    <path d="M15 6v12" />
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);

export const ShiftIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 16, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l3 2" />
    <path d="M4 12H2" />
    <path d="M22 12h-2" />
  </svg>
);

export const MoveIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 15, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <path d="M7 7h10" />
    <path d="m14 4 3 3-3 3" />
    <path d="M17 17H7" />
    <path d="m10 14-3 3 3 3" />
  </svg>
);

export const UserIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 16, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const IdCardIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 16, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="12" r="2" />
    <path d="M14 10h4" />
    <path d="M14 14h3" />
  </svg>
);

export const SettingsIcon: React.FC<OrgWorkbenchIconProps> = ({ size = 15, className = '', ...props }) => (
  <svg {...iconProps(size, className)} {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1L7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1Z" />
  </svg>
);
