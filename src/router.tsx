import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";

const Loading = () => (
  <div
    style={{
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--text-mono-sm)",
      color: "var(--color-text-disabled)",
      letterSpacing: "0.05em",
    }}
  >
    [LOADING...]
  </div>
);

function Screen({ component: C }: { component: React.ComponentType }) {
  return (
    <Suspense fallback={<Loading />}>
      <C />
    </Suspense>
  );
}

const RootScreen = lazy(() => import("@/screens/root-screen"));
const LockScreen = lazy(() => import("@/screens/lock/lock-screen"));
const WelcomeScreen = lazy(() => import("@/screens/setup/welcome-screen"));
const CreateVaultScreen = lazy(() => import("@/screens/setup/create-vault-screen"));
const ImportVaultScreen = lazy(() => import("@/screens/setup/import-vault-screen"));
const DashboardScreen = lazy(() => import("@/screens/dashboard/dashboard-screen"));
const VaultsScreen = lazy(() => import("@/screens/vaults/vaults-screen"));
const VaultDetailScreen = lazy(() => import("@/screens/vaults/vault-detail-screen"));
const SendScreen = lazy(() => import("@/screens/send/send-screen"));
const ReceiveScreen = lazy(() => import("@/screens/receive/receive-screen"));
const HistoryScreen = lazy(() => import("@/screens/history/history-screen"));
const ContactsScreen = lazy(() => import("@/screens/contacts/contacts-screen"));
const RequestScreen = lazy(() => import("@/screens/request/request-screen"));
const SettingsScreen = lazy(() => import("@/screens/settings/settings-screen"));
const DappsScreen = lazy(() => import("@/screens/settings/dapps-screen"));
const SecurityScreen = lazy(() => import("@/screens/settings/security-screen"));

export const router = createHashRouter([
  { path: "/", element: <Screen component={RootScreen} /> },
  { path: "/lock", element: <Screen component={LockScreen} /> },
  { path: "/setup", element: <Screen component={WelcomeScreen} /> },
  { path: "/setup/create", element: <Screen component={CreateVaultScreen} /> },
  { path: "/setup/import", element: <Screen component={ImportVaultScreen} /> },
  { path: "/dashboard", element: <Screen component={DashboardScreen} /> },
  { path: "/vaults", element: <Screen component={VaultsScreen} /> },
  { path: "/vaults/:id", element: <Screen component={VaultDetailScreen} /> },
  { path: "/send", element: <Screen component={SendScreen} /> },
  { path: "/receive", element: <Screen component={ReceiveScreen} /> },
  { path: "/history", element: <Screen component={HistoryScreen} /> },
  { path: "/contacts", element: <Screen component={ContactsScreen} /> },
  { path: "/request", element: <Screen component={RequestScreen} /> },
  { path: "/settings", element: <Screen component={SettingsScreen} /> },
  { path: "/settings/dapps", element: <Screen component={DappsScreen} /> },
  { path: "/settings/security", element: <Screen component={SecurityScreen} /> },
]);
