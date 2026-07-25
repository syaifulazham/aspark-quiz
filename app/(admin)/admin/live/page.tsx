import { Badge } from "@/components/ui/badge";
import { Radio } from "lucide-react";

export default function LivePage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32">
      <Radio className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Live Sessions</h1>
      <Badge variant="secondary">Under Construction</Badge>
      <p className="text-sm text-muted-foreground">
        Real-time quiz monitoring and live session management coming soon.
      </p>
    </div>
  );
}
