import { NewSessionForm } from "@/components/session-new/NewSessionForm";
import { listTemplatePersonas } from "@/lib/personas";

export const dynamic = "force-dynamic";

// Hardcoded dev user id until auth is wired. Matches scripts/seed.ts.
const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

export default async function NewSessionPage() {
  const personas = await listTemplatePersonas();
  return <NewSessionForm personas={personas} createdBy={DEV_USER_ID} />;
}
