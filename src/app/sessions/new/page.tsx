import { NewSessionForm } from "@/components/session-new/NewSessionForm";
import { listTemplatePersonas } from "@/lib/personas";

export const dynamic = "force-dynamic";

export default async function NewSessionPage() {
  const personas = await listTemplatePersonas();
  return <NewSessionForm personas={personas} />;
}
