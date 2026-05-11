import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { createCashier, deleteCashier } from "@/lib/cashiers.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, Eraser, UserPlus, User, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/cashiers")({
  component: CashiersPage,
});

type Cashier = { id: string; username: string; wallet_balance: number };

function CashiersPage() {
  const { profile, session, refreshProfile } = useAuth();
  const [list, setList] = useState<Cashier[]>([]);
  const [tab, setTab] = useState("add");
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const create = useServerFn(createCashier);
  const del = useServerFn(deleteCashier);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from("profiles")
      .select("id,username,wallet_balance")
      .eq("parent_id", profile.id)
      .order("created_at", { ascending: false });
    setList((data ?? []) as Cashier[]);
  };

  // Initial load
  useEffect(() => { load(); }, [profile?.id]);

  // Realtime: watch profiles where parent_id = owner
  useEffect(() => {
    if (!profile?.id) return;
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const ch = supabase
      .channel(`cashiers-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `parent_id=eq.${profile.id}`,
        },
        () => load()
      )
      .subscribe();

    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [profile?.id]);

  if (profile?.role !== "owner") {
    return (
      <div className="text-center text-muted-foreground py-20">
        Only owners can manage cashiers.
      </div>
    );
  }

  const authHeaders = session?.access_token
    ? { authorization: `Bearer ${session.access_token}` }
    : {};

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) { toast.error("Not authenticated"); return; }
    setBusy(true);
    try {
      await create({
        data: { username: u, password: p },
        headers: authHeaders as Record<string, string>,
      });
      toast.success(`Cashier "${u}" created`);
      setU(""); setP("");
      setTab("manage");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create cashier");
    } finally {
      setBusy(false);
    }
  };

  const onClear = async (c: Cashier) => {
    const { error } = await supabase.rpc("transfer_cashier_to_owner", {
      _cashier_id: c.id,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Cleared $${Number(c.wallet_balance).toFixed(2)} from ${c.username}`);
      load();
      refreshProfile();
    }
  };

  const onDelete = async (c: Cashier) => {
    if (!session?.access_token) { toast.error("Not authenticated"); return; }
    try {
      await del({
        data: { cashier_id: c.id },
        headers: authHeaders as Record<string, string>,
      });
      toast.success(`Removed ${c.username}`);
      load();
      refreshProfile();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete cashier");
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-black mb-6">Cashiers</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="add">Add Cashier</TabsTrigger>
          <TabsTrigger value="manage">Manage ({list.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="add">
          <form
            onSubmit={onCreate}
            className="mt-6 rounded-2xl p-4 space-y-4 border border-border"
            style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
          >
            <div>
              <Label>Username</Label>
              <Input
                value={u}
                onChange={(e) => setU(e.target.value)}
                placeholder="cashier1"
                required
                minLength={3}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Lowercase letters, numbers, underscore.
              </p>
            </div>
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={p}
                onChange={(e) => setP(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full h-12 font-black"
              style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}
            >
              {busy ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</>
              ) : (
                <><UserPlus className="h-4 w-4 mr-2" /> Create Cashier</>
              )}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="manage">
          <div className="mt-6 space-y-2">
            {list.length === 0 && (
              <div className="text-muted-foreground py-8 text-center">No cashiers yet.</div>
            )}
            {list.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl p-3 flex flex-wrap items-center gap-3 border border-border"
                style={{ background: "var(--gradient-card)" }}
              >
                <div
                  className="h-11 w-11 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <User className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{c.username}</div>
                  <div className="text-sm text-muted-foreground">
                    Balance:{" "}
                    <span className="text-primary font-black">
                      ${Number(c.wallet_balance).toFixed(2)}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onClear(c)}
                  disabled={Number(c.wallet_balance) === 0}
                >
                  <Eraser className="h-4 w-4 mr-1" /> Clear
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {c.username}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Any wallet balance will be transferred to your account first,
                        then the account is removed permanently.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(c)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
