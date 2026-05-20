import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";
import { AnimatedLayout } from "@/layouts/animated-layout";
import { ErrorBoundary } from "@/components/error-boundary";

const RootScreen = lazy(() => import("@/screens/root-screen"));
const LockScreen = lazy(() => import("@/screens/lock/lock-screen"));
const WelcomeScreen = lazy(() => import("@/screens/setup/welcome-screen"));
const CreateVaultScreen = lazy(() => import("@/screens/setup/create-vault-screen"));
const ImportVaultScreen = lazy(() => import("@/screens/setup/import-vault-screen"));
const DashboardScreen = lazy(() => import("@/screens/dashboard/dashboard-screen"));
const VaultsScreen = lazy(() => import("@/screens/vaults/vaults-screen"));
const VaultDetailScreen = lazy(() => import("@/screens/vaults/vault-detail-screen"));
const SendScreen = lazy(() => import("@/screens/send/send-screen"));
const SendManyScreen = lazy(() => import("@/screens/send/send-many-screen"));
const BurnScreen = lazy(() => import("@/screens/send/burn-screen"));
const StakeScreen = lazy(() => import("@/screens/stake/stake-screen"));
const ReceiveScreen = lazy(() => import("@/screens/receive/receive-screen"));
const HistoryScreen = lazy(() => import("@/screens/history/history-screen"));
const ContactsScreen = lazy(() => import("@/screens/contacts/contacts-screen"));
const RequestScreen = lazy(() => import("@/screens/request/request-screen"));
const SettingsScreen = lazy(() => import("@/screens/settings/settings-screen"));
const DappsScreen = lazy(() => import("@/screens/settings/dapps-screen"));
const SecurityScreen = lazy(() => import("@/screens/settings/security-screen"));
const NetworkScreen = lazy(() => import("@/screens/settings/network-screen"));
const AppearanceScreen = lazy(() => import("@/screens/settings/appearance-screen"));
const SettingsContactsScreen = lazy(() => import("@/screens/settings/contacts-screen"));
const NotificationsScreen = lazy(() => import("@/screens/settings/notifications-screen"));
const SupportScreen = lazy(() => import("@/screens/settings/support-screen"));

function Screen({ component: C }: { component: React.ComponentType }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <C />
      </Suspense>
    </ErrorBoundary>
  );
}

export const router = createHashRouter([
  {
    element: <AnimatedLayout />,
    children: [
      { path: "/", element: <Screen component={RootScreen} /> },
      { path: "/lock", element: <Screen component={LockScreen} /> },
      { path: "/setup", element: <Screen component={WelcomeScreen} /> },
      { path: "/setup/create", element: <Screen component={CreateVaultScreen} /> },
      { path: "/setup/import", element: <Screen component={ImportVaultScreen} /> },
      { path: "/dashboard", element: <Screen component={DashboardScreen} /> },
      { path: "/vaults", element: <Screen component={VaultsScreen} /> },
      { path: "/vaults/:id", element: <Screen component={VaultDetailScreen} /> },
      { path: "/send", element: <Screen component={SendScreen} /> },
      { path: "/send-many", element: <Screen component={SendManyScreen} /> },
      { path: "/burn", element: <Screen component={BurnScreen} /> },
      { path: "/stake", element: <Screen component={StakeScreen} /> },
      { path: "/receive", element: <Screen component={ReceiveScreen} /> },
      { path: "/history", element: <Screen component={HistoryScreen} /> },
      { path: "/contacts", element: <Screen component={ContactsScreen} /> },
      { path: "/request", element: <Screen component={RequestScreen} /> },
      { path: "/settings", element: <Screen component={SettingsScreen} /> },
      { path: "/settings/dapps", element: <Screen component={DappsScreen} /> },
      { path: "/settings/security", element: <Screen component={SecurityScreen} /> },
      { path: "/settings/network", element: <Screen component={NetworkScreen} /> },
      { path: "/settings/appearance", element: <Screen component={AppearanceScreen} /> },
      { path: "/settings/contacts", element: <Screen component={SettingsContactsScreen} /> },
      { path: "/settings/notifications", element: <Screen component={NotificationsScreen} /> },
      { path: "/settings/support", element: <Screen component={SupportScreen} /> },
    ],
  },
]);
