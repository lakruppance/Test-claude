import { redirect } from "next/navigation";

// The public landing page arrives in phase 4. Until then the root opens the app.
export default function Home() {
  redirect("/app");
}
