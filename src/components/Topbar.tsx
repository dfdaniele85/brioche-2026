import React from "react";
import { NavLink, useLocation } from "react-router-dom";

type TopbarProps = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  showNav?: boolean;
};

const NAV = [
  { to: "/today", label: "Oggi" },
  { to: "/months", label: "Mesi" },
  { to: "/settings", label: "Impostazioni" },
  { to: "/summary", label: "Riepilogo" }
] as const;

export default function Topbar(props: TopbarProps): JSX.Element {
  const { title, subtitle, right, showNav = true } = props;
  const loc = useLocation();

  // su /login non mostrare nav
  const hideNav = loc.pathname === "/login";

  return (
    <header className="topbar" role="banner">
      <div className="topbarInner">
        <div>
          <div className="topbarTitle">{title}</div>
          {subtitle ? <div className="topbarSubtitle">{subtitle}</div> : null}
        </div>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          {right}
        </div>
      </div>

      {!hideNav && showNav ? (
        <nav className="topbarNav" aria-label="Navigazione principale">
          <div className="topbarNavInner">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `topbarTab ${isActive ? "topbarTabActive" : ""}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
