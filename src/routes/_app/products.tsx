import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, ImagePlus, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/products")({
  component: ProductsPage,
});

type Product = { id: string; name: string; price: number; image_url: string | null };

function ProductsPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase.from("products").select("*").eq("owner_id", profile.id).order("created_at", { ascending: false });
    setItems((data ?? []) as Product[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [profile?.id]);

  if (profile?.role !== "owner") {
    return <div className="text-center text-muted-foreground py-20">Only owners can manage items.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black">Bar Items</h1>
          <p className="text-muted-foreground text-sm">{items.length} items</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-bold" style={{ background: "var(--gradient-hero)", color: "var(--primary-foreground)" }}>
              <Plus className="h-4 w-4 mr-1" /> Add Item
            </Button>
          </DialogTrigger>
          <AddItemDialog onDone={() => { setOpen(false); load(); }} />
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">No items yet — tap Add Item.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {items.map((p) => (
            <div key={p.id} className="aspect-square relative rounded-2xl overflow-hidden border border-border"
              style={{ background: "var(--gradient-card)" }}>
              {p.image_url ? <img src={p.image_url} alt={p.name} className="absolute inset-0 w-full h-full object-cover" />
                : <div className="absolute inset-0 flex items-center justify-center text-4xl">🍹</div>}
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent">
                <div className="font-bold text-sm text-white truncate">{p.name}</div>
                <div className="flex justify-between items-center">
                  <span className="text-primary font-black">${Number(p.price).toFixed(2)}</span>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="p-1 rounded text-white/70 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {p.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                          await supabase.from("products").delete().eq("id", p.id);
                          load();
                        }}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AddItemDialog({ onDone }: { onDone: () => void }) {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const onPick = (f: File | undefined | null) => {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!profile || !name || !price) return;
    setBusy(true);
    let image_url: string | null = null;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${profile.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { upsert: false });
      if (upErr) { toast.error(upErr.message); setBusy(false); return; }
      image_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const { error } = await supabase.from("products").insert({
      owner_id: profile.id, name: name.trim(), price: Number(price), image_url,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Item added");
    setName(""); setPrice(""); setFile(null); setPreview(null);
    onDone();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Add Bar Item</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Item image</Label>
          <div className="mt-2 aspect-square rounded-2xl border-2 border-dashed border-border overflow-hidden relative"
            style={{ background: "var(--gradient-card)" }}>
            {preview ? (
              <img src={preview} className="absolute inset-0 w-full h-full object-cover" alt="preview" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
                <ImagePlus className="h-10 w-10 text-muted-foreground" />
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => camRef.current?.click()}>
                    <Camera className="h-4 w-4 mr-1" /> Take Photo
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="h-4 w-4 mr-1" /> Upload
                  </Button>
                </div>
              </div>
            )}
            {preview && (
              <button onClick={() => { setFile(null); setPreview(null); }}
                className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => onPick(e.target.files?.[0])} />
            <input ref={fileRef} type="file" accept="image/*" hidden
              onChange={(e) => onPick(e.target.files?.[0])} />
          </div>
        </div>
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Heineken 330ml" />
        </div>
        <div>
          <Label>Price</Label>
          <Input type="number" inputMode="decimal" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="5.00" />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={busy || !name || !price} className="font-bold">
          {busy ? "Saving..." : "Save Item"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
