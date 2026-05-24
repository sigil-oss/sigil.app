import { createHashRouter } from "react-router-dom";
import { AnimatedLayout } from "@/layouts/animated-layout";
import { ErrorBoundary } from "@/components/error-boundary";

import SplashScreen from "@/screens/splash/splash-screen";
import LockScreen from "@/screens/lock/lock-screen";
import WelcomeScreen from "@/screens/setup/welcome-screen";
import CreateVaultScreen from "@/screens/setup/create-vault-screen";
import ImportVaultScreen from "@/screens/setup/import-vault-screen";
import DashboardScreen from "@/screens/dashboard/dashboard-screen";
import VaultsScreen from "@/screens/vaults/vaults-screen";
import VaultDetailScreen from "@/screens/vaults/vault-detail-screen";
import SendScreen from "@/screens/send/send-screen";
import SendManyScreen from "@/screens/send/send-many-screen";
import BurnScreen from "@/screens/send/burn-screen";
import StakeScreen from "@/screens/stake/stake-screen";
import ReceiveScreen from "@/screens/receive/receive-screen";
import HistoryScreen from "@/screens/history/history-screen";
import ContactsScreen from "@/screens/contacts/contacts-screen";
import RequestScreen from "@/screens/request/request-screen";
import SettingsScreen from "@/screens/settings/settings-screen";
import DappsScreen from "@/screens/settings/dapps-screen";
import SecurityScreen from "@/screens/settings/security-screen";
import NetworkScreen from "@/screens/settings/network-screen";
import AppearanceScreen from "@/screens/settings/appearance-screen";
import SettingsContactsScreen from "@/screens/settings/contacts-screen";
import NotificationsScreen from "@/screens/settings/notifications-screen";
import SupportScreen from "@/screens/settings/support-screen";

function Screen({ component: C }: { component: React.ComponentType }) {
  return (
    <ErrorBoundary>
      <C />
    </ErrorBoundary>
  );
}

export const router = createHashRouter([
  {
    element: <AnimatedLayout />,
    children: [
      { path: "/", element: <Screen component={SplashScreen} /> },
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
