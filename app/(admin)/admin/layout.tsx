import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import {
  LayoutDashboard,
  FileQuestion,
  CalendarDays,
  Users,
  UserCog,
  Trophy,
  Radio,
  Code2,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/quizzes", label: "Quizzes", icon: FileQuestion },
  { href: "/admin/sessions", label: "Sessions", icon: CalendarDays },
  { href: "/admin/participants", label: "Participants", icon: Users },
  { href: "/admin/results", label: "Results", icon: Trophy },
  { href: "/admin/live", label: "Live", icon: Radio },
  { href: "/admin/developers", label: "Developers", icon: Code2 },
  { href: "/admin/users", label: "Users", icon: UserCog },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-border bg-card">
        <div className="p-6">
          <h1 className="font-display text-xl font-semibold tracking-tight">
            Quizzly
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Admin Portal</p>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                buttonVariants({ variant: "ghost", size: "default" }),
                "justify-start gap-3"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <Separator />
        <div className="p-4">
          <p className="truncate text-xs text-muted-foreground">
            {user.email}
          </p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
