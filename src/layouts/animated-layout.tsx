import { useLayoutEffect, useRef } from "react";
import { useLocation, useOutlet } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { useAutoLock } from "@/hooks/use-auto-lock";

type PageVariant = { opacity: number; x?: number; y?: number };

const ROUTE_DEPTH: Record<string, number> = {
  "/": 0,
  "/lock": 0,
  "/setup": 1,
  "/dashboard": 1,
  "/request": 1,
  "/setup/create": 2,
  "/setup/import": 2,
  "/send": 2,
  "/send-many": 2,
  "/burn": 2,
  "/stake": 2,
  "/receive": 2,
  "/history": 2,
  "/contacts": 2,
  "/vaults": 2,
  "/settings": 2,
  "/settings/dapps": 3,
  "/settings/security": 3,
  "/settings/network": 3,
  "/settings/appearance": 3,
  "/settings/contacts": 3,
  "/settings/notifications": 3,
};

function getDepth(pathname: string): number {
  if (ROUTE_DEPTH[pathname] !== undefined) return ROUTE_DEPTH[pathname];
  if (pathname.startsWith("/vaults/")) return 3;
  return 2;
}

export function AnimatedLayout() {
  useAutoLock();

  const location = useLocation();
  const element = useOutlet();

  const prevRef = useRef(location.pathname);
  const prev = prevRef.current;
  const cur = location.pathname;

  let initial: PageVariant;

  if (cur === "/request") {
    // Request sheet arrives from below
    initial = { opacity: 0, y: 64 };
  } else if (prev === "/request") {
    // Returning from request: fade in only (request slides out below)
    initial = { opacity: 0 };
  } else if (cur === "/lock" || prev === "/lock") {
    // Lock/unlock uses its own internal scale animation — outer wrapper fades only
    initial = { opacity: 0 };
  } else {
    const goingDeeper = getDepth(cur) >= getDepth(prev);
    initial = { opacity: 0, x: goingDeeper ? 20 : -20 };
  }

  // Update after render so the next render sees the correct "previous" path
  useLayoutEffect(() => {
    prevRef.current = cur;
  }, [cur]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.key}
        initial={initial}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.1, ease: "easeOut" } }}
        transition={{ duration: cur === "/request" ? 0.22 : 0.15, ease: "easeOut" }}
        style={{ height: "100%", position: "absolute", inset: 0 }}
      >
        {element}
      </motion.div>
    </AnimatePresence>
  );
}
