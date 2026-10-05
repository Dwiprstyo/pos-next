import { redirect } from "next/navigation";

import { defaultHomeFor, getSessionContext } from "@/lib/auth";

export default async function Home() {
  const session = await getSessionContext();

  if (!session) {
    redirect("/login");
  }

  redirect(defaultHomeFor(session.role));
}
