import type { ReactNode } from "react";

export function Page({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="fiuriContainer">
      <div className="pageHeader">
        <h1 className="pageTitle">{title}</h1>
        {right ? <div className="pageRight">{right}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="fiuriCard" style={{ borderRadius: 14, padding: 14, ...style }}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="sectionTitle">{children}</div>;
}
