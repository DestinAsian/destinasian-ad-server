import React, { useEffect, useState } from "react";
import { useAuth } from "./contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import AccountManagement from "./pages/AccountManagement";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Inventory from "./pages/Inventory";
import Users from "./pages/Users";
import TwoFactorSetup from "./pages/TwoFactorSetup";

function App() {
  const { isAuthenticated, loading, ownerExists, user, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState("login");
  const [resetToken, setResetToken] = useState("");
  const [headerSearch, setHeaderSearch] = useState("");

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
    const availableAuthPages = ownerExists
      ? ["forgot", "reset"]
      : ["signup", "forgot", "reset"];
    const authPage = availableAuthPages.includes(currentPage)
      ? currentPage
      : "login";
    return (
      <>
        {authPage === "login" && (
          <Login onNavigate={setCurrentPage} canRegister={!ownerExists} />
        )}
        {authPage === "signup" && (
          <Signup onNavigate={setCurrentPage} ownerExists={ownerExists} />
        )}
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

  const ownerNeedsTwoFactorSetup =
    user?.role === "owner" && user?.twoFactorSetupRequired;

  const topbarSearchPlaceholder = "Search campaigns, ad channels, ad units...";

  const handleNavigate = (page) => {
    setHeaderSearch("");
    setCurrentPage(page);
  };

  if (ownerNeedsTwoFactorSetup) {
    return <TwoFactorSetup />;
  }

  return (
    <div className="app-shell">
      <div className="app-topbar">
        <h1 className="app-title" aria-label="DestinAsian Ad Server Dashboard">
          <span className="app-title-main">DestinAsian</span>
          <span className="app-title-sub">Ad Server Dashboard</span>
        </h1>
        {(currentPage === "dashboard" ||
          currentPage === "campaigns" ||
          currentPage === "inventory") && (
          <div className="app-search-wrap">
            <input
              type="search"
              className="app-search-input"
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              placeholder={topbarSearchPlaceholder}
              aria-label="Global search"
            />
          </div>
        )}
        <div className="app-toolbar">
          <button
            onClick={() => handleNavigate("dashboard")}
            className={`app-nav-button ${currentPage === "dashboard" ? "is-active" : ""}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => handleNavigate("campaigns")}
            className={`app-nav-button ${currentPage === "campaigns" ? "is-active" : ""}`}
          >
            Campaigns
          </button>
          <button
            onClick={() => handleNavigate("inventory")}
            className={`app-nav-button ${currentPage === "inventory" ? "is-active" : ""}`}
          >
            Ad Channels
          </button>
          <button
            onClick={() => handleNavigate("users")}
            className={`app-nav-button ${currentPage === "users" ? "is-active" : ""}`}
          >
            Users
          </button>
          <button
            onClick={() => handleNavigate("accounts")}
            className={`app-nav-button ${currentPage === "accounts" ? "is-active" : ""}`}
          >
            My Accounts
          </button>
          <button onClick={logout} className="app-logout-button">
            Logout
          </button>
          <span className="app-greeting">
            Welcome, <strong>{user?.name}</strong>
          </span>
        </div>
      </div>
      {currentPage === "dashboard" && (
        <Dashboard view="overview" searchQuery={headerSearch} />
      )}
      {currentPage === "campaigns" && (
        <Dashboard view="campaigns" searchQuery={headerSearch} />
      )}
      {currentPage === "accounts" && <AccountManagement />}
      {currentPage === "inventory" && <Inventory searchQuery={headerSearch} />}
      {currentPage === "users" && <Users />}
    </div>
  );
}

export default App;
