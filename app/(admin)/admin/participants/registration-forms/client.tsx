"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Copy, ExternalLink, Pencil } from "lucide-react";
import {
  createRegistrationForm,
  updateRegistrationForm,
  deleteRegistrationForm,
  toggleRegistrationForm,
} from "@/lib/actions/registration-form";
import { toast } from "sonner";
import Link from "next/link";

interface FormRow {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  require_passcode: boolean;
  passcode: string | null;
  fields: string[];
  quiz_id: string | null;
  competition_session_id: string | null;
  max_registrations: number | null;
  closes_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  forms: FormRow[];
  quizzes: Array<{ id: string; title: string }>;
  competitionSessions: Array<{ id: string; title: string }>;
}

const AVAILABLE_FIELDS = [
  { value: "personal_id", label: "Personal ID (required)" },
  { value: "full_name", label: "Full Name (required)" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "school", label: "School" },
  { value: "agency", label: "Agency" },
  { value: "nationality", label: "Nationality" },
  { value: "date_of_birth", label: "Date of Birth" },
  { value: "gender", label: "Gender" },
];

export function RegistrationFormsClient({ forms: initialForms, quizzes, competitionSessions }: Props) {
  const [forms, setForms] = useState(initialForms);
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<FormRow | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    description: "",
    require_passcode: false,
    passcode: "",
    fields: ["personal_id", "full_name", "email", "school"],
    quiz_id: "",
    competition_session_id: "",
    max_registrations: "",
  });

  function resetFormData() {
    setFormData({
      title: "",
      slug: "",
      description: "",
      require_passcode: false,
      passcode: "",
      fields: ["personal_id", "full_name", "email", "school"],
      quiz_id: "",
      competition_session_id: "",
      max_registrations: "",
    });
    setEditingForm(null);
  }

  function openCreate() {
    resetFormData();
    setDialogOpen(true);
  }

  function openEdit(form: FormRow) {
    setEditingForm(form);
    setFormData({
      title: form.title,
      slug: form.slug,
      description: form.description || "",
      require_passcode: form.require_passcode,
      passcode: form.passcode || "",
      fields: form.fields || ["personal_id", "full_name"],
      quiz_id: form.quiz_id || "",
      competition_session_id: form.competition_session_id || "",
      max_registrations: form.max_registrations?.toString() || "",
    });
    setDialogOpen(true);
  }

  function handleSlugify(title: string) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    setFormData((prev) => ({ ...prev, title, slug }));
  }

  function handleFieldToggle(field: string) {
    setFormData((prev) => {
      const fields = prev.fields.includes(field)
        ? prev.fields.filter((f) => f !== field)
        : [...prev.fields, field];
      return { ...prev, fields };
    });
  }

  function handleSave() {
    if (!formData.title || !formData.slug) {
      toast.error("Title and slug are required");
      return;
    }

    startTransition(async () => {
      const payload = {
        title: formData.title,
        slug: formData.slug,
        description: formData.description || null,
        require_passcode: formData.require_passcode,
        passcode: formData.require_passcode ? formData.passcode : null,
        fields: formData.fields,
        quiz_id: formData.quiz_id || null,
        competition_session_id: formData.competition_session_id || null,
        max_registrations: formData.max_registrations
          ? parseInt(formData.max_registrations)
          : null,
      };

      if (editingForm) {
        const result = await updateRegistrationForm(editingForm.id, payload);
        if (result.error) {
          toast.error(result.error);
        } else {
          setForms(
            forms.map((f) => (f.id === editingForm.id ? { ...f, ...payload } : f))
          );
          setDialogOpen(false);
          toast.success("Form updated");
        }
      } else {
        const result = await createRegistrationForm(payload);
        if (result.error) {
          toast.error(result.error);
        } else if (result.id) {
          setForms([
            {
              id: result.id,
              org_id: "",
              ...payload,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as FormRow,
            ...forms,
          ]);
          setDialogOpen(false);
          toast.success("Registration form created");
        }
      }
    });
  }

  function handleDelete(formId: string) {
    if (!confirm("Delete this registration form?")) return;
    startTransition(async () => {
      const result = await deleteRegistrationForm(formId);
      if (result.error) {
        toast.error(result.error);
      } else {
        setForms(forms.filter((f) => f.id !== formId));
        toast.success("Form deleted");
      }
    });
  }

  function handleToggle(formId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await toggleRegistrationForm(formId, isActive);
      if (result.error) {
        toast.error(result.error);
      } else {
        setForms(forms.map((f) => (f.id === formId ? { ...f, is_active: isActive } : f)));
      }
    });
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/register/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Registration Forms
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create public registration endpoints for participants to self-register.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/participants">
            <Button variant="outline" size="sm">
              ← Participants
            </Button>
          </Link>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New Form
          </Button>
        </div>
      </div>

      {/* Forms list */}
      <div className="mt-6 grid gap-4">
        {forms.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground">No registration forms yet.</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Create your first form
              </Button>
            </CardContent>
          </Card>
        ) : (
          forms.map((form) => (
            <Card key={form.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{form.title}</CardTitle>
                    <Badge variant={form.is_active ? "default" : "secondary"}>
                      {form.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {form.require_passcode && (
                      <Badge variant="outline">Passcode Protected</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.is_active}
                      onCheckedChange={(checked) => handleToggle(form.id, checked)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyLink(form.slug)}
                      title="Copy link"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <a
                      href={`/register/${form.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="sm" title="Open form">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(form)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(form.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    URL: <code className="text-xs">/register/{form.slug}</code>
                  </span>
                  {form.max_registrations && (
                    <span>Max: {form.max_registrations}</span>
                  )}
                  <span>Fields: {form.fields?.length || 0}</span>
                  {form.description && <span>{form.description}</span>}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingForm ? "Edit Registration Form" : "New Registration Form"}
            </DialogTitle>
            <DialogDescription>
              {editingForm
                ? "Update the form settings."
                : "Create a public endpoint where participants can self-register."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                value={formData.title}
                onChange={(e) => handleSlugify(e.target.value)}
                placeholder="e.g. Math Olympiad Registration"
              />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Slug (URL path)</Label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">/register/</span>
                <Input
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({ ...formData, slug: e.target.value })
                  }
                  placeholder="math-olympiad"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Brief description shown on the form"
              />
            </div>

            {/* Passcode */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Require Passcode</p>
                <p className="text-xs text-muted-foreground">
                  Participants must enter a passcode to access the form
                </p>
              </div>
              <Switch
                checked={formData.require_passcode}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, require_passcode: checked })
                }
              />
            </div>

            {formData.require_passcode && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Passcode</Label>
                <Input
                  value={formData.passcode}
                  onChange={(e) =>
                    setFormData({ ...formData, passcode: e.target.value })
                  }
                  placeholder="Enter passcode"
                />
              </div>
            )}

            {/* Fields */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Fields to collect</Label>
              <div className="grid grid-cols-2 gap-2">
                {AVAILABLE_FIELDS.map((field) => {
                  const isRequired =
                    field.value === "personal_id" || field.value === "full_name";
                  const isChecked = formData.fields.includes(field.value);
                  return (
                    <label
                      key={field.value}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isRequired}
                        onChange={() => handleFieldToggle(field.value)}
                        className="rounded border-border"
                      />
                      {field.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Bind to Session */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Bind to Session</Label>
              <Select
                value={formData.competition_session_id || "none"}
                onValueChange={(v: string | null) =>
                  setFormData({ ...formData, competition_session_id: !v || v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (standalone)</SelectItem>
                  {competitionSessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Participants who register will be bound to this session.
              </p>
            </div>

            {/* Auto-assign quiz */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Auto-assign Quiz (optional)</Label>
              <Select
                value={formData.quiz_id || "none"}
                onValueChange={(v: string | null) =>
                  setFormData({ ...formData, quiz_id: !v || v === "none" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {quizzes.map((q) => (
                    <SelectItem key={q.id} value={q.id}>
                      {q.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Max registrations */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Max Registrations (optional)</Label>
              <Input
                type="number"
                min={1}
                value={formData.max_registrations}
                onChange={(e) =>
                  setFormData({ ...formData, max_registrations: e.target.value })
                }
                placeholder="Unlimited"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending
                ? "Saving..."
                : editingForm
                ? "Update"
                : "Create Form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
