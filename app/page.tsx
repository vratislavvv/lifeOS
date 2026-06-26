import { redirect } from "next/navigation";

// Entry point — will route to /setup on first run, /today thereafter.
// For now always redirects to /today (setup detection comes with the DB layer).
export default function Home() {
  redirect("/today");
}
