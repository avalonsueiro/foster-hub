// App shell: a small hash router plus the signed-in-user context.
//
// Hash routing on purpose — five views don't justify a router dependency,
// and hash URLs need no server-side SPA fallback, so `vite preview` and any
// static host serve every route with zero config. Routes:
//
//   #/dogs       Dogs discovery grid (default)
//   #/orgs       the original organizations table + map, unchanged
//   #/signup     Become a foster wizard
//   #/login      Log in
//   #/dashboard  Foster dashboard (signed-in)

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import DogsPage from './pages/DogsPage.jsx';
import OrgsPage from './pages/OrgsPage.jsx';
import SignupWizard from './pages/SignupWizard.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import { getMe, getToken, logout as apiLogout } from './api.js';

const AuthContext = createContext({ user: null, refresh: () => {}, signOut: () => {} });
export const useAuth = () => useContext(AuthContext);

export function navigate(route) {
  window.location.hash = route.startsWith('#') ? route : `#${route}`;
}

function currentRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/dogs';
}

export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setAuthChecked(true);
      return null;
    }
    try {
      const me = await getMe();
      setUser(me);
      return me;
    } catch {
      // Stale or invalid token — api.js already cleared it on 401.
      setUser(null);
      return null;
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    try { await apiLogout(); } catch { /* token cleared regardless */ }
    setUser(null);
    navigate('/dogs');
  }, []);

  let page;
  if (route.startsWith('/orgs')) page = <OrgsPage />;
  else if (route.startsWith('/signup')) page = <SignupWizard />;
  else if (route.startsWith('/login')) page = <LoginPage />;
  else if (route.startsWith('/dashboard')) {
    // Wait for the initial token check so a signed-in user refreshing the
    // dashboard isn't bounced to login before their session resolves.
    page = !authChecked ? null : user ? <DashboardPage /> : <LoginPage />;
  } else page = <DogsPage />;

  return (
    <AuthContext.Provider value={{ user, refresh, signOut }}>
      {page}
    </AuthContext.Provider>
  );
}
