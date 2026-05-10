import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import {
  listAllProfiles,
  setUserStatus,
  adminDeleteUser,
} from "@/lib/admin.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Check, X, Ban, UserMinus, RotateCw, Trash2, Loader2, ShieldAlert, Search } from "lucide-react";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

type Row = {
  id: string;
  username: string;
  email: string;
  role: string;
  status: "pending" | "approved" | "suspended" | "expelled";
  wallet_balance: number;
  created_at: string;
};

function AdminPage() {
  const { profile, loading } = useAuth();
  const nav = useNavigate();
  const list = useServerFn(listAllProfiles);
  const setStatus = useServerFn(setUserStatus);
  const del = useServerFn(adminDeleteUser);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && profile && profile.role !== "admin") nav({ to: "/register" });
  }, [profile, loading, nav]);

  const refresh = async () => {
    setBusy(true);
    try {
      const data = (await list()) as Row[];
      setRows(data.filter((r) => r.role === "owner"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (profile?.role === "admin") refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role]);

  const buckets = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => r.username.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle))
      : rows;
    return {
      pending: filtered.filter((r) => r.status === "pending"),
      approved: filtered.filter((r) => r.status === "approved"),
      suspended: filtered.filter((r) => r.status === "suspended"),
      expelled: filtered.filter((r) => r.status === "expelled"),
    };
  }, [rows, q]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); toast.success(msg); await refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };

  if (loading || !profile) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (profile.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-black">Admin · Users</h1>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username or email…"
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="pending">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="pending" className="gap-2">
            Pending
            {buckets.pending.length > 0 && (
              <Badge variant="destructive" className="rounded-full px-2 py-0 text-xs">{buckets.pending.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="suspended">Suspended</TabsTrigger>
          <TabsTrigger value="expelled">Expelled</TabsTrigger>
        </TabsList>

        {(["pending", "approved", "suspended", "expelled"] as const).map((k) => (
          <TabsContent key={k} value={k} className="mt-4 space-y-3">
            {buckets[k].length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">No {k} users</p>
            )}
            {buckets[k].map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card">
                <div className="min-w-0">
                  <div className="font-semibold">{r.username}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {k === "pending" && (
                    <>
                      <Button size="sm" onClick={() => act(() => setStatus({ data: { user_id: r.id, status: "approved" } }), "Approved")}>
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => act(() => setStatus({ data: { user_id: r.id, status: "expelled" } }), "Denied")}>
                        <X className="h-4 w-4 mr-1" /> Deny
                      </Button>
                    </>
                  )}
                  {k === "approved" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => act(() => setStatus({ data: { user_id: r.id, status: "suspended" } }), "Suspended")}>
                        <Ban className="h-4 w-4 mr-1" /> Suspend
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => act(() => setStatus({ data: { user_id: r.id, status: "expelled" } }), "Expelled")}>
                        <UserMinus className="h-4 w-4 mr-1" /> Expel
                      </Button>
                    </>
                  )}
                  {k === "suspended" && (
                    <>
                      <Button size="sm" onClick={() => act(() => setStatus({ data: { user_id: r.id, status: "approved" } }), "Re-activated")}>
                        <RotateCw className="h-4 w-4 mr-1" /> Re-activate
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => act(() => setStatus({ data: { user_id: r.id, status: "expelled" } }), "Expelled")}>
                        <UserMinus className="h-4 w-4 mr-1" /> Expel
                      </Button>
                    </>
                  )}
                  {k !== "expelled" && (
                    <Button size="sm" variant="destructive" onClick={() => {
                      if (confirm(`Delete ${r.username}? This cannot be undone.`)) {
                        act(() => del({ data: { user_id: r.id } }), "Deleted");
                      }
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  {k === "expelled" && (
                    <span className="text-xs text-muted-foreground">Account expelled</span>
                  )}
                </div>
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>

      {busy && <div className="text-xs text-muted-foreground">Loading…</div>}
    </div>
  );
}
