import React, { useEffect, useState } from "react";
import { useAuth } from "./contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AccountManagement from "./pages/AccountManagement";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Inventory from "./pages/Inventory";

function App() {
  const { isAuthenticated, loading, user, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState("login");
  const [resetToken, setResetToken] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      setCurrentPage("dashboard");
    }
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          fontSize: "18px",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    const authPage = ["signup", "forgot", "reset"].includes(currentPage)
      ? currentPage
      : "login";
    return (
      <>
        {authPage === "login" && <Login onNavigate={setCurrentPage} />}
        {authPage === "signup" && <Signup onNavigate={setCurrentPage} />}
        {authPage === "forgot" && (
          <ForgotPassword
            onNavigate={setCurrentPage}
            onResetToken={(token) => {
              setResetToken(token);
              setCurrentPage("reset");
            }}
          />
        )}
        {authPage === "reset" && (
          <ResetPassword
            onNavigate={setCurrentPage}
            initialToken={resetToken}
          />
        )}
      </>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-topbar">
        <h1 className="app-title" aria-label="DestinAsian Ad Server Dashboard">
          <span className="app-title-main">DestinAsian</span>
          <span className="app-title-sub">Ad Server Dashboard</span>
        </h1>
        <div className="app-toolbar">
          <span className="app-greeting">
            Welcome, <strong>{user?.name}</strong>
          </span>
          <button
            onClick={() => setCurrentPage("dashboard")}
            className={`app-nav-button ${currentPage === "dashboard" ? "is-active" : ""}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentPage("campaigns")}
            className={`app-nav-button ${currentPage === "campaigns" ? "is-active" : ""}`}
          >
            Campaigns
          </button>
          <button
            onClick={() => setCurrentPage("accounts")}
            className={`app-nav-button ${currentPage === "accounts" ? "is-active" : ""}`}
          >
            My Accounts
          </button>
          <button
            onClick={() => setCurrentPage("inventory")}
            className={`app-nav-button ${currentPage === "inventory" ? "is-active" : ""}`}
          >
            Inventory
          </button>
          <button onClick={logout} className="app-logout-button">
            Logout
          </button>
        </div>
      </div>
      {currentPage === "dashboard" && <Dashboard view="overview" />}
      {currentPage === "campaigns" && <Dashboard view="campaigns" />}
      {currentPage === "accounts" && <AccountManagement />}
      {currentPage === "inventory" && <Inventory />}
    </div>
  );
}

export default App;
