import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { logout } from "../lib/storage";

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
  const canLogout = !hideNav;

  function onLogout() {
    logout();
    // redirect "hard" (robusto, funziona sempre)
    window.location.href = "/login";
  }

  return (
    <header className="topbar" role="banner">
      <div className="topbarInner">
        <div>
          <div className="topbarTitle">{title}</div>
          {subtitle ? <div className="topbarSubtitle">{subtitle}</div> : null}
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          {right}

          {canLogout ? (
            <button type="button" className="btn btnGhost btnSmall" onClick={onLogout} title="Esci">
              Esci
            </button>
          ) : null}
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
