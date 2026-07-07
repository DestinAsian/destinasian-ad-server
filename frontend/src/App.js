import React, { useEffect, useRef, useState } from "react";
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

const pageRoutes = {
  dashboard: "/dashboard",
  campaigns: "/campaigns",
  inventory: "/inventory",
  users: "/users",
  accounts: "/accounts",
};

const routePages = Object.entries(pageRoutes).reduce((acc, [page, path]) => {
  acc[path] = page;
  return acc;
}, { "/": "dashboard" });

const authPages = new Set(["login", "signup", "forgot", "reset"]);

const getPageFromPath = () => {
  if (typeof window === "undefined") return "login";
  return routePages[window.location.pathname] || "dashboard";
};

function App() {
  const { isAuthenticated, loading, ownerExists, user, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState(() => getPageFromPath());
  const [resetToken, setResetToken] = useState("");
  const [headerSearch, setHeaderSearch] = useState("");
  const [isAdminDropdownOpen, setIsAdminDropdownOpen] = useState(false);
  const adminDropdownRef = useRef(null);

  useEffect(() => {
    if (isAuthenticated && authPages.has(currentPage)) {
      setCurrentPage("dashboard");
    }
  }, [isAuthenticated, currentPage]);

  useEffect(() => {
    const handlePopState = () => {
      setHeaderSearch("");
      setIsAdminDropdownOpen(false);
      setCurrentPage(getPageFromPath());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsAdminDropdownOpen(false);
      return undefined;
    }

    const handleOutsideClick = (event) => {
      if (!adminDropdownRef.current?.contains(event.target)) {
        setIsAdminDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
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
    setIsAdminDropdownOpen(false);
    setCurrentPage(page);
    const nextPath = pageRoutes[page];
    if (nextPath && window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
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
          <div className="app-nav-dropdown" ref={adminDropdownRef}>
            <button
              type="button"
              className={`app-nav-button app-nav-dropdown-toggle ${["inventory", "users", "accounts"].includes(currentPage) ? "is-active" : ""}`}
              aria-expanded={isAdminDropdownOpen}
              aria-haspopup="menu"
              onClick={() =>
                setIsAdminDropdownOpen((prev) => !prev)
              }
            >
              Admin
              <span aria-hidden="true" className="app-nav-dropdown-icon">
                {isAdminDropdownOpen ? "▾" : "▸"}
              </span>
            </button>
            {isAdminDropdownOpen && (
              <div className="app-nav-dropdown-menu" role="menu" aria-label="Admin menu">
                <button
                  type="button"
                  role="menuitem"
                  className={`app-nav-dropdown-item ${currentPage === "inventory" ? "is-active" : ""}`}
                  onClick={() => handleNavigate("inventory")}
                >
                  Ad Channels
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`app-nav-dropdown-item ${currentPage === "users" ? "is-active" : ""}`}
                  onClick={() => handleNavigate("users")}
                >
                  Users
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`app-nav-dropdown-item ${currentPage === "accounts" ? "is-active" : ""}`}
                  onClick={() => handleNavigate("accounts")}
                >
                  My Accounts
                </button>
              </div>
            )}
          </div>
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
