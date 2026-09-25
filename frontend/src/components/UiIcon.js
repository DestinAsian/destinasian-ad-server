import React from "react";

const iconPaths = {
  play: <path d="M9 6.5 17 12l-8 5.5v-11Z" />,
  pause: (
    <>
      <path d="M9 7v10" />
      <path d="M15 7v10" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="10" height="11" rx="2" />
      <path d="M15 8V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1" />
    </>
  ),
  edit: (
    <>
      <path d="m14.5 5.5 4 4" />
      <path d="m5 19 3.5-.7L18 8.8a1.8 1.8 0 0 0-2.5-2.5L6 15.8 5 19Z" />
    </>
  ),
  delete: (
    <>
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="m7 7 1 12h8l1-12" />
      <path d="M10 10v6M14 10v6" />
    </>
  ),
  "chevron-down": <path d="m8 10 4 4 4-4" />,
  "chevron-up": <path d="m8 14 4-4 4 4" />,
  minus: <path d="M8 12h8" />,
  close: (
    <>
      <path d="m8 8 8 8" />
      <path d="m16 8-8 8" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m5 17 4.5-4 3 2.5 2-2 4.5 3.5" />
    </>
  ),
};

function UiIcon({ name, size = 18, className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={`ui-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {iconPaths[name] || null}
    </svg>
  );
}

export default UiIcon;
