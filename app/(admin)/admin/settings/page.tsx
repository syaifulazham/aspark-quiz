import { Badge } from "@/components/ui/badge";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32">
      <Settings className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Badge variant="secondary">Under Construction</Badge>
      <p className="text-sm text-muted-foreground">
        Organization settings, branding, and user management coming soon.
      </p>
    </div>
  );
}
