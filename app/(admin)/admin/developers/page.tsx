import { Badge } from "@/components/ui/badge";
import { Code2 } from "lucide-react";

export default function DevelopersPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32">
      <Code2 className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Developers</h1>
      <Badge variant="secondary">Under Construction</Badge>
      <p className="text-sm text-muted-foreground">
        API keys, webhooks, and integration settings coming soon.
      </p>
    </div>
  );
}
