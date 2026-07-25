import { Badge } from "@/components/ui/badge";
import { UserCog } from "lucide-react";

export default function UsersPage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-32">
      <UserCog className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Users</h1>
      <Badge variant="secondary">Under Construction</Badge>
      <p className="text-sm text-muted-foreground">
        User accounts, roles, and permissions management coming soon.
      </p>
    </div>
  );
}
