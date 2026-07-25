import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { RegisterForm } from "./register-form";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function RegisterPage({ params }: Props) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: form } = await supabase
    .from("registration_forms")
    .select("id, title, slug, description, is_active, require_passcode, fields, quiz_id, max_registrations, closes_at, org_id")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!form) notFound();

  const formRow = form as unknown as {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    is_active: boolean;
    require_passcode: boolean;
    fields: string[];
    quiz_id: string | null;
    max_registrations: number | null;
    closes_at: string | null;
    org_id: string;
  };

  // Check if closed
  if (formRow.closes_at && new Date(formRow.closes_at) < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Registration Closed</h1>
          <p className="mt-2 text-muted-foreground">This registration form is no longer accepting entries.</p>
        </div>
      </div>
    );
  }

  // Check max registrations
  if (formRow.max_registrations) {
    const { count } = await supabase
      .from("participants")
      .select("*", { count: "exact", head: true })
      .eq("org_id", formRow.org_id)
      .eq("metadata->>registration_form_id", formRow.id);

    if (count && count >= formRow.max_registrations) {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-2xl font-semibold">Registration Full</h1>
            <p className="mt-2 text-muted-foreground">This registration has reached maximum capacity.</p>
          </div>
        </div>
      );
    }
  }

  return (
    <RegisterForm
      form={{
        id: formRow.id,
        title: formRow.title,
        description: formRow.description,
        require_passcode: formRow.require_passcode,
        fields: formRow.fields,
        org_id: formRow.org_id,
      }}
    />
  );
}
