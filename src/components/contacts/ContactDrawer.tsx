import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { contactService, type ContactEditableFields, type HubContactWithLinks } from "@/services/contactService";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Link2, Trash2, AlertTriangle, RotateCcw, RefreshCw, GitMerge, Search } from "lucide-react";
import { format } from "date-fns";

const CONTACT_SOURCES = ["unknown", "facebook", "twilio", "maytapi", "manual", "google", "email"];
const CONFIDENCES = ["confirmed", "guessed", "unknown"];
const LEAD_TYPES = ["prospect", "registered", "buyer", "vip", "expired"];
const TEMPERATURES = ["hot", "warm", "cold"];
const CONTACT_TYPES = ["mlm", "email_marketing", "personal", "mixed"];

interface Props {
  contact: HubContactWithLinks | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function initialFromContact(c: HubContactWithLinks | null): ContactEditableFields {
  if (!c) return {};
  return {
    full_name: c.full_name,
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    whatsapp_display_name: c.whatsapp_display_name ?? "",
    email: c.email ?? "",
    phone_e164: c.phone_e164 ?? "",
    contact_type: c.contact_type,
    contact_source: c.contact_source ?? "unknown",
    contact_confidence: c.contact_confidence ?? "unknown",
    name_needs_confirmation: c.name_needs_confirmation,
    lead_type: c.lead_type ?? "prospect",
    temperature: c.temperature ?? "warm",
    notes: c.notes ?? "",
    tags: c.tags ?? [],
    consent_email: c.consent_email,
    consent_sms: c.consent_sms,
    consent_whatsapp: c.consent_whatsapp,
  };
}

export default function ContactDrawer({ contact, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<ContactEditableFields>({});
  const [tagInput, setTagInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const [selectedDupIds, setSelectedDupIds] = useState<Set<string>>(new Set());

  const { data: allContacts = [] } = useQuery({
    queryKey: ["hub-contacts"],
    queryFn: () => contactService.list(),
    enabled: mergeOpen,
  });

  const mergeCandidates = useMemo(() => {
    if (!contact) return [] as HubContactWithLinks[];
    const q = mergeQuery.trim().toLowerCase();
    return allContacts
      .filter((c) => c.id !== contact.id && !c.is_deleted)
      .filter((c) => {
        if (!q) return true;
        return (
          c.full_name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.phone_e164 ?? "").toLowerCase().includes(q) ||
          (c.whatsapp_display_name ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 25);
  }, [allContacts, contact, mergeQuery]);

  const mergeMut = useMutation({
    mutationFn: async () => {
      if (!contact) throw new Error("No contact");
      if (selectedDupIds.size === 0) throw new Error("Select at least one duplicate to merge");
      return contactService.merge(contact.id, Array.from(selectedDupIds));
    },
    onSuccess: async (r) => {
      toast.success(
        `Merged ${r.merged_duplicates} duplicate${r.merged_duplicates === 1 ? "" : "s"}. Moved ${r.moved_links} app link${r.moved_links === 1 ? "" : "s"}.`,
      );
      qc.invalidateQueries({ queryKey: ["hub-contacts"] });
      setMergeOpen(false);
      setSelectedDupIds(new Set());
      setMergeQuery("");
      // Push consolidated state (and tombstones for the duplicates) to spokes
      try {
        await contactService.syncNow();
        toast.success("Pushed merged state to connected apps.");
      } catch (e) {
        toast.error(`Merged, but push to spokes failed: ${(e as Error).message}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });


  useEffect(() => {
    setForm(initialFromContact(contact));
    setTagInput((contact?.tags ?? []).join(", "));
  }, [contact]);

  const set = <K extends keyof ContactEditableFields>(k: K, v: ContactEditableFields[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!contact) throw new Error("No contact");
      const payload: ContactEditableFields = {
        ...form,
        tags: tagInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      // Null-safe: send empty strings as null so we don't overwrite with junk
      for (const k of ["first_name", "last_name", "whatsapp_display_name", "email", "phone_e164", "notes"] as const) {
        if (payload[k] === "") (payload as Record<string, unknown>)[k] = null;
      }
      if (!payload.full_name || payload.full_name.trim() === "") {
        throw new Error("Full name is required");
      }
      return contactService.update(contact.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hub-contacts"] });
      toast.success("Contact saved — will sync to connected apps on next pull");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const syncOneMut = useMutation({
    mutationFn: async () => {
      if (!contact) throw new Error("No contact");
      return contactService.syncOne(contact.id);
    },
    onSuccess: (results) => {
      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) {
        toast.success(`Sync sent to ${ok} connected app${ok === 1 ? "" : "s"}.`);
      } else {
        toast.error(`${failed.length} app${failed.length === 1 ? "" : "s"} failed. ${ok} succeeded.`);
        failed.forEach((r) => toast.error(`${r.app_key}: ${r.error ?? "no response"}`));
      }
      qc.invalidateQueries({ queryKey: ["hub-contacts"] });
    },
    onError: (e: Error) => toast.error(`Sync failed: ${e.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      if (!contact) throw new Error("No contact");
      return contact.is_deleted
        ? contactService.restore(contact.id)
        : contactService.softDelete(contact.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hub-contacts"] });
      toast.success(contact?.is_deleted ? "Contact restored" : "Contact deleted");
      setConfirmDelete(false);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!contact) return null;

  const nameMismatch =
    !!form.whatsapp_display_name &&
    !!form.full_name &&
    form.whatsapp_display_name.trim().toLowerCase() !== form.full_name.trim().toLowerCase();

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[28rem] overflow-y-auto">
          <SheetHeader className="pb-3 border-b">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                {(form.full_name ?? contact.full_name).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-base">{form.full_name || "Untitled contact"}</SheetTitle>
                <div className="text-xs text-muted-foreground truncate">
                  {form.phone_e164 || form.email || "No phone or email"}
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="space-y-6 py-4">
            {/* Core Identity */}
            <section className="space-y-3">
              <SectionTitle>Core Identity</SectionTitle>
              <Field label="Full name" required>
                <Input
                  value={form.full_name ?? ""}
                  onChange={(e) => set("full_name", e.target.value)}
                  placeholder="Display name"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="First name">
                  <Input
                    value={form.first_name ?? ""}
                    onChange={(e) => set("first_name", e.target.value)}
                  />
                </Field>
                <Field label="Last name">
                  <Input
                    value={form.last_name ?? ""}
                    onChange={(e) => set("last_name", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Phone (E.164)">
                <Input
                  value={form.phone_e164 ?? ""}
                  onChange={(e) => set("phone_e164", e.target.value)}
                  placeholder="+27..."
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email ?? ""}
                  onChange={(e) => set("email", e.target.value.toLowerCase())}
                  placeholder="name@example.com"
                />
              </Field>
            </section>

            {/* Contact Identity Bridge */}
            <section className="space-y-3">
              <SectionTitle>Contact Identity Bridge</SectionTitle>
              <Field label="WhatsApp display name">
                <Input
                  value={form.whatsapp_display_name ?? ""}
                  onChange={(e) => set("whatsapp_display_name", e.target.value)}
                />
              </Field>
              {nameMismatch && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>WhatsApp display name doesn't match Full name — consider setting "Name needs confirmation".</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Field label="Source">
                  <Select value={form.contact_source ?? "unknown"} onValueChange={(v) => set("contact_source", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONTACT_SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Confidence">
                  <Select value={form.contact_confidence ?? "unknown"} onValueChange={(v) => set("contact_confidence", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CONFIDENCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="flex items-center justify-between rounded-md border p-2">
                <Label className="text-xs">Name needs confirmation</Label>
                <Switch
                  checked={!!form.name_needs_confirmation}
                  onCheckedChange={(v) => set("name_needs_confirmation", v)}
                />
              </div>
            </section>

            {/* Classification */}
            <section className="space-y-3">
              <SectionTitle>Classification</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Lead type">
                  <Select value={form.lead_type ?? "prospect"} onValueChange={(v) => set("lead_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LEAD_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Temperature">
                  <Select value={form.temperature ?? "warm"} onValueChange={(v) => set("temperature", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TEMPERATURES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Contact type (hub gate)">
                <Select value={form.contact_type ?? "mixed"} onValueChange={(v) => set("contact_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTACT_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </section>

            {/* Notes & Tags */}
            <section className="space-y-3">
              <SectionTitle>Notes &amp; Tags</SectionTitle>
              <Field label="Notes">
                <Textarea
                  rows={3}
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Free-text notes"
                />
              </Field>
              <Field label="Tags (comma-separated)">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="vip, jhb, 2026" />
              </Field>
            </section>

            {/* Consent */}
            <section className="space-y-2">
              <SectionTitle>Consent</SectionTitle>
              <ConsentRow label="WhatsApp" checked={!!form.consent_whatsapp} onChange={(v) => set("consent_whatsapp", v)} />
              <ConsentRow label="Email" checked={!!form.consent_email} onChange={(v) => set("consent_email", v)} />
              <ConsentRow label="SMS" checked={!!form.consent_sms} onChange={(v) => set("consent_sms", v)} />
              {contact.unsubscribed_channels.length > 0 && (
                <div className="text-xs text-destructive">
                  Unsubscribed: {contact.unsubscribed_channels.join(", ")}
                </div>
              )}
            </section>

            {/* Sync map */}
            <section className="space-y-2">
              <SectionTitle>Linked Apps</SectionTitle>
              <div className="text-xs text-muted-foreground">
                Source: <span className="font-medium text-foreground">{contact.source_app === "vanto_crm" ? "getwell_hub" : contact.source_app}</span> · v{contact.version}
                {contact.last_synced_at && (
                  <> · last synced {format(new Date(contact.last_synced_at), "dd MMM yyyy HH:mm")}</>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {contact.hub_contact_links.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Not linked yet.</span>
                ) : (
                  contact.hub_contact_links.map((l, i) => (
                    <Badge key={l.id ?? `${l.app_key}-${i}`} variant="outline" className="text-[10px] gap-1 capitalize">
                      <Link2 className="h-3 w-3" /> {l.app_key === "vanto_crm" ? "getwell_hub" : l.app_key}

                    </Badge>
                  ))
                )}
              </div>
              <p className="text-[11px] text-muted-foreground pt-1">
                Saving here bumps the hub version. Connected apps (Vanto CRM, Zazi Email, …) will pick up your correction on their next scheduled pull.
              </p>
            </section>
          </div>

          <div className="sticky bottom-0 bg-background border-t pt-3 pb-2 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={contact.is_deleted ? "" : "text-destructive"}
              onClick={() => setConfirmDelete(true)}
            >
              {contact.is_deleted ? (
                <><RotateCcw className="h-4 w-4 mr-1" /> Restore</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-1" /> Delete</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMergeOpen(true)}
              disabled={contact.is_deleted}
              title="Merge duplicate contacts into this one"
            >
              <GitMerge className="h-4 w-4 mr-1" />
              Merge…
            </Button>
            <div className="flex-1" />

            <Button
              variant="outline"
              size="sm"
              onClick={() => syncOneMut.mutate()}
              disabled={syncOneMut.isPending || saveMut.isPending}
              title="Push this contact to all connected apps now"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${syncOneMut.isPending ? "animate-spin" : ""}`} />
              {syncOneMut.isPending ? "Syncing…" : "Sync now"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {contact.is_deleted ? "Restore this contact?" : "Delete this contact?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {contact.is_deleted
                ? "The contact will be restored and pushed to linked apps on the next sync."
                : "The contact will be soft-deleted on the hub. Connected apps will be signaled to remove it on their next pull."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate()}>
              {contact.is_deleted ? "Restore" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={mergeOpen} onOpenChange={setMergeOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[26rem] overflow-y-auto">
          <SheetHeader className="pb-3 border-b">
            <SheetTitle className="text-base flex items-center gap-2">
              <GitMerge className="h-4 w-4" /> Merge into "{contact.full_name}"
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Pick the duplicate rows to fold into this contact. Their app links (Vanto CRM, Zazi, GetWell) move here, missing fields fill in, and duplicates are soft-deleted so spokes remove them on the next pull.
            </p>
          </SheetHeader>

          <div className="py-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-7"
                placeholder="Search by name, email, phone…"
                value={mergeQuery}
                onChange={(e) => setMergeQuery(e.target.value)}
              />
            </div>

            <div className="text-[11px] text-muted-foreground">
              {selectedDupIds.size} selected · showing {mergeCandidates.length} candidates
            </div>

            <div className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
              {mergeCandidates.length === 0 ? (
                <div className="text-xs text-muted-foreground py-6 text-center">
                  No matching contacts.
                </div>
              ) : (
                mergeCandidates.map((c) => {
                  const checked = selectedDupIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelectedDupIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                      className={`w-full text-left rounded-md border p-2 flex items-start gap-2 transition ${
                        checked ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        readOnly
                        checked={checked}
                        className="mt-1 h-3.5 w-3.5 accent-primary"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{c.full_name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {[c.phone_e164, c.email].filter(Boolean).join(" · ") || "no phone or email"}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.hub_contact_links.map((l) => (
                            <Badge key={`${c.id}-${l.app_key}`} variant="outline" className="text-[9px] capitalize">
                              {l.app_key === "vanto_crm" ? "getwell_hub" : l.app_key}

                            </Badge>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="sticky bottom-0 bg-background border-t pt-3 pb-2 flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setMergeOpen(false)}>
              Cancel
            </Button>
            <div className="flex-1" />
            <Button
              size="sm"
              onClick={() => mergeMut.mutate()}
              disabled={mergeMut.isPending || selectedDupIds.size === 0}
            >
              <GitMerge className="h-4 w-4 mr-1" />
              {mergeMut.isPending ? "Merging…" : `Merge ${selectedDupIds.size || ""}`.trim()}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}


function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{children}</h3>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function ConsentRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
