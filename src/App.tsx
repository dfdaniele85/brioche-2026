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

function AuthedRoute({ children }: AuthedRouteProps) {
  const location = useLocation();
  const [authed, setAuthed] = React.useState<boolean>(() => isAuthed());

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

      {/* Toast globali (Salvato/Errore) */}
      <ToastHost />
    </div>
  );
}
