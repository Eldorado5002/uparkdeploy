// App.jsx
import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLogin = () => setIsAuthenticated(true);

  return (
    <Routes>
      {/* Public signup route as default entry; if already authed, go to '/' */}
      <Route
        path="/signup"
        element={localStorage.getItem('upark_token') ? <Navigate to="/" /> : <Signup />}
      />
      <Route
        path="/"
        element={localStorage.getItem('upark_token') ? <Index /> : <Navigate to="/signup" />}
      />
      <Route path="/login" element={<Login onLogin={handleLogin} />} />
      <Route
        path="/admin"
        element={isAuthenticated ? <Admin /> : <Navigate to="/login" />}
      />
    </Routes>
  );
}
