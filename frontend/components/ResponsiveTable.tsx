import type { ReactNode } from "react";

interface ResponsiveTableProps {
  desktop?: ReactNode;
  mobile: ReactNode;
  desktopClassName?: string;
  mobileClassName?: string;
}

export default function ResponsiveTable({
  desktop,
  mobile,
  desktopClassName = "",
  mobileClassName = "",
}: ResponsiveTableProps) {
  return (
    <>
      {desktop && <div className={`hidden md:block ${desktopClassName}`}>{desktop}</div>}
      <div className={`space-y-4 md:hidden ${mobileClassName}`}>{mobile}</div>
    </>
  );
}
