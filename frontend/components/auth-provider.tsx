"use client";

/**
 * Contexte d'authentification — premier provider posé sur l'arbre (cf.
 * app/layout.tsx). Hydraté depuis le jeton stocké en localStorage
 * (lib/auth.ts) au montage : un jeton présent déclenche un appel
 * GET /auth/me pour récupérer l'utilisateur associé, un jeton absent ou
 * invalide laisse `user` à `null` (état déconnecté, aucune erreur affichée).
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getCurrentUser, type AuthResult, type User } from "@/lib/api";
import { clearToken, getToken, setToken } from "@/lib/auth";

interface AuthContextValue {
  user: User | null;
  /** Vrai pendant l'hydratation initiale depuis le jeton stocké — évite un
   * flash "non connecté" avant que la vraie réponse arrive. */
  loading: boolean;
  login: (result: AuthResult) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      // `queueMicrotask` plutôt qu'un appel synchrone : poser un state
      // directement dans le corps d'un effet déclenche des rendus en
      // cascade (règle react-hooks/set-state-in-effect).
      queueMicrotask(() => setLoading(false));
      return;
    }
    getCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  function login(result: AuthResult) {
    setToken(result.token);
    setUser(result.user);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé sous AuthProvider.");
  return ctx;
}
