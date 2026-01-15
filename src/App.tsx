import React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { isAuthed, onAppEvent } from "./lib/storage";

import ToastHost from "./components/ToastHost";

import Login from "./pages/Login";
import Today from "./pages/Today";
import Months from "./pages/Months";
import Settings from "./pages/Settings";
import Summary from "./pages/Summary";

type AuthedRouteProps = {
  children: React.ReactElement;
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; info: React.ErrorInfo | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ error, info });
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
          <div
            style={{
              border: "1px solid rgba(0,0,0,0.15)",
              background: "rgba(255,255,255,0.85)",
              borderRadius: 12,
              padding: 14
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>
              ⚠️ Errore in UI
            </div>
            <div
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 12,
                whiteSpace: "pre-wrap"
              }}
            >
              {String(this.state.error?.message || this.state.error)}
            </div>

            {this.state.error?.stack ? (
              <div
                style={{
                  marginTop: 10,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  opacity: 0.85
                }}
              >
                {this.state.error.stack}
              </div>
            ) : null}

            <div style={{ marginTop: 12, opacity: 0.8, fontSize: 12 }}>
              Copiami qui questo errore + stack e lo correggo subito.
            </div>
          </div>
        </div>
      );
    }

    return this.props.children as JSX.Element;
  }
}

function AuthedRoute({ children }: AuthedRouteProps) {
  const location = useLocation();
  const [authed, setAuthed] = React.useState<boolean>(() => {
    try {
      return isAuthed();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("isAuthed() threw in AuthedRoute:", e);
      return false;
    }
  });

  React.useEffect(() => {
    return onAppEvent((e) => {
      if (e.type === "auth:changed") setAuthed(e.isAuthed);
    });
  }, []);

  if (!authed) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

export default function App(): JSX.Element {
  return (
    <div className="appShell">
      <ErrorBoundary>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/today"
            element={
              <AuthedRoute>
                <Today />
              </AuthedRoute>
            }
          />
          <Route
            path="/months"
            element={
              <AuthedRoute>
                <Months />
              </AuthedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <AuthedRoute>
                <Settings />
              </AuthedRoute>
            }
          />
          <Route
            path="/summary"
            element={
              <AuthedRoute>
                <Summary />
              </AuthedRoute>
            }
          />

          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </ErrorBoundary>

      <ToastHost />
    </div>
  );
}
