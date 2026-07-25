"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

interface Props {
  form: {
    id: string;
    title: string;
    description: string | null;
    require_passcode: boolean;
    fields: string[];
    org_id: string;
  };
}

const FIELD_LABELS: Record<string, string> = {
  personal_id: "Personal ID / IC Number",
  full_name: "Full Name",
  email: "Email",
  phone: "Phone",
  school: "School",
  agency: "Agency / Organization",
  nationality: "Nationality (2-letter code)",
  date_of_birth: "Date of Birth",
  gender: "Gender",
};

const REQUIRED_FIELDS = ["personal_id", "full_name"];

export function RegisterForm({ form }: Props) {
  const [step, setStep] = useState<"passcode" | "form" | "success">(
    form.require_passcode ? "passcode" : "form"
  );
  const [passcodeInput, setPasscodeInput] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handlePasscodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasscodeError("");

    const res = await fetch(`/api/public/register/${form.id}/verify-passcode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: passcodeInput }),
    });

    if (res.ok) {
      setStep("form");
    } else {
      setPasscodeError("Incorrect passcode");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(`/api/public/register/${form.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          passcode: form.require_passcode ? passcodeInput : undefined,
        }),
      });

      if (res.ok) {
        setStep("success");
      } else {
        const data = await res.json();
        setError(data.error || "Registration failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500" />
            <h2 className="mt-4 text-xl font-semibold">Registration Successful!</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              You have been registered. Keep your Personal ID safe — you will need it to access the quiz.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "passcode") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{form.title}</CardTitle>
            {form.description && (
              <p className="text-sm text-muted-foreground">{form.description}</p>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasscodeSubmit} className="space-y-4">
              <div className="grid gap-1.5">
                <Label>Passcode</Label>
                <Input
                  type="password"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="Enter passcode to continue"
                  required
                />
                {passcodeError && (
                  <p className="text-xs text-destructive">{passcodeError}</p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{form.title}</CardTitle>
          {form.description && (
            <p className="text-sm text-muted-foreground">{form.description}</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {form.fields.map((field) => (
              <div key={field} className="grid gap-1.5">
                <Label>
                  {FIELD_LABELS[field] || field}
                  {REQUIRED_FIELDS.includes(field) && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>
                <Input
                  type={
                    field === "email"
                      ? "email"
                      : field === "date_of_birth"
                      ? "date"
                      : "text"
                  }
                  value={formData[field] || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, [field]: e.target.value })
                  }
                  required={REQUIRED_FIELDS.includes(field)}
                  placeholder={FIELD_LABELS[field] || field}
                />
              </div>
            ))}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Registering..." : "Register"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
