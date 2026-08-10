import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout for /invoices, /invoices/new, /invoices/:id — children render via Outlet. */
export const Route = createFileRoute("/_authenticated/invoices")({
  component: () => <Outlet />,
});
