import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { contactService, type HubContactWithLinks } from "@/services/contactService";
import ContactDrawer from "@/components/contacts/ContactDrawer";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Contact, Search, Mail, Phone, MessageCircle, Link2, Smartphone, ShieldAlert, Pencil } from "lucide-react";
import { format } from "date-fns";

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [appFilter, setAppFilter] = useState<string>("all");
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState<HubContactWithLinks | null>(null);

  const contacts = useQuery({
    queryKey: ["hub-contacts", { includeDeleted: showDeleted }],
    queryFn: () => contactService.list({ includeDeleted: showDeleted }),
  });

  const apps = useQuery({ queryKey: ["suite-apps"], queryFn: () => contactService.listApps() });

  const filtered = useMemo(() => {
    let list = contacts.data ?? [];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.full_name.toLowerCase().includes(s) ||
          (c.email?.toLowerCase().includes(s) ?? false) ||
          (c.phone_e164?.toLowerCase().includes(s) ?? false) ||
          c.tags.some((t) => t.toLowerCase().includes(s))
      );
    }
    if (appFilter !== "all") {
      list = list.filter(
        (c) => c.source_app === appFilter || c.hub_contact_links.some((l) => l.app_key === appFilter)
      );
    }
    return list;
  }, [contacts.data, search, appFilter]);

  const activeApps = useMemo(() => {
    return (apps.data ?? []).filter((a) => a.role === "spoke");
  }, [apps.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Contact className="h-6 w-6 text-primary" /> Unified Contacts
          </h1>
          <p className="text-sm text-muted-foreground">
            Central hub contacts synced from Vanto CRM, Zazi Email, and other suite apps.
          </p>
        </div>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, phone or tag..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={appFilter} onValueChange={setAppFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All apps" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All apps</SelectItem>
                  {activeApps.map((app) => (
                    <SelectItem key={app.app_key} value={app.app_key}>
                      {app.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant={showDeleted ? "default" : "outline"}
                size="sm"
                onClick={() => setShowDeleted((v) => !v)}
              >
                Deleted
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {contacts.isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {contacts.isError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Could not load contacts</p>
                <p className="text-muted-foreground">{(contacts.error as Error)?.message}</p>
              </div>
            </div>
          )}

          {!contacts.isLoading && !contacts.isError && filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Contact className="mx-auto h-8 w-8 mb-3 opacity-40" />
              <p>No contacts found.</p>
              <p className="text-xs">Contacts pushed from connected suite apps will appear here.</p>
            </div>
          )}

          {!contacts.isLoading && filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setEditing(c)}
                  className={`w-full text-left flex flex-col gap-3 rounded-lg border border-border/60 p-4 transition-colors hover:bg-muted/40 hover:border-primary/40 sm:flex-row sm:items-center sm:justify-between ${
                    c.is_deleted ? "opacity-60" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{c.full_name}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {c.contact_type}
                      </Badge>
                      {c.is_deleted && <Badge variant="destructive" className="text-xs">Deleted</Badge>}
                      <Pencil className="h-3 w-3 text-muted-foreground ml-auto sm:hidden" />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {c.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" /> {c.email}
                        </span>
                      )}
                      {c.phone_e164 && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" /> {c.phone_e164}
                        </span>
                      )}
                      {c.last_synced_at && (
                        <span className="text-xs">Synced {format(new Date(c.last_synced_at), "dd MMM yyyy HH:mm")}</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {c.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:items-end">
                    <div className="flex items-center gap-1.5">
                      {c.consent_email && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Mail className="h-3 w-3" /> Email
                        </Badge>
                      )}
                      {c.consent_whatsapp && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <MessageCircle className="h-3 w-3" /> WhatsApp
                        </Badge>
                      )}
                      {c.consent_sms && (
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Smartphone className="h-3 w-3" /> SMS
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {c.hub_contact_links.map((link, i) => (
                        <Badge key={link.id ?? `${link.app_key}-${i}`} variant="outline" className="text-[10px] gap-1 capitalize">
                          <Link2 className="h-3 w-3" /> {link.app_key}
                        </Badge>
                      ))}
                      <span className="text-xs text-muted-foreground">Source: {c.source_app}</span>
                    </div>
                    {c.unsubscribed_channels.length > 0 && (
                      <div className="text-xs text-destructive">
                        Unsubscribed: {c.unsubscribed_channels.join(", ")}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ContactDrawer contact={editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
