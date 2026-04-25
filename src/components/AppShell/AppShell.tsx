import { AppLayout } from "../AppLayout/AppLayout";
import { Calendar } from "../Calendar";
import { Header } from "../Header/Header";

interface AppShellProps {
  year: number;
  now: Date;
}

// Rendered both in SSG (prerender plugin) and as the pre-hydration view
// in AppBootstrap. Keeping a single source of truth for the initial layout
// prevents a flash when React swaps in the full `App` after hydration.
export function AppShell({ year, now }: AppShellProps) {
  return (
    <AppLayout header={<Header />}>
      <Calendar year={year} hasNote={() => false} now={now} />
    </AppLayout>
  );
}
