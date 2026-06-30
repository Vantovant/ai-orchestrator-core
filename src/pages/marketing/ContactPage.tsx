import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/marketing/Seo";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", type: "user", company: "", message: "" });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Light, non-DB submission for now — opens mailto so the user's app captures it.
    // A persistent contact_inquiries table can be added in a follow-up turn.
    try {
      const subject = encodeURIComponent(`[VantoOS · ${form.type}] ${form.name}`);
      const body = encodeURIComponent(
        `Name: ${form.name}\nEmail: ${form.email}\nType: ${form.type}\nCompany: ${form.company}\n\n${form.message}`
      );
      window.location.href = `mailto:hello@vantoos.com?subject=${subject}&body=${body}`;
      setSubmitted(true);
      toast.success("Thanks — opening your email client to send.");
    } catch {
      toast.error("Couldn't open mail client. Email hello@vantoos.com directly.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Seo
        title="Contact VantoOS"
        description="Get in touch with VantoOS — pilots, enterprise, investor enquiries, or demos of the Executive AI Command Center."
        path="/contact"
      />

      <section className="py-16 md:py-20 bg-gradient-to-b from-sidebar to-background text-sidebar-foreground">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-4">Contact</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Tell us how to help.</h1>
          <p className="mt-4 text-lg opacity-85">Pilots, enterprise rollouts, partnerships, investor enquiries.</p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          {submitted ? (
            <Card className="p-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-4" />
              <h2 className="text-2xl font-bold">Message ready.</h2>
              <p className="mt-2 text-muted-foreground">
                Your mail client should be opening. If not, email <a className="text-accent underline" href="mailto:hello@vantoos.com">hello@vantoos.com</a>.
              </p>
            </Card>
          ) : (
            <Card className="p-6 md:p-8">
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="type">I am a…</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger id="type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">Prospective user</SelectItem>
                        <SelectItem value="enterprise">Enterprise / Team buyer</SelectItem>
                        <SelectItem value="investor">Investor</SelectItem>
                        <SelectItem value="partner">Partner / Reseller</SelectItem>
                        <SelectItem value="press">Press / Media</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="company">Company (optional)</Label>
                    <Input id="company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="message">Message</Label>
                  <Textarea id="message" rows={5} required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
                </div>
                <Button type="submit" size="lg" className="w-full gap-2" disabled={loading}>
                  <Mail className="h-4 w-4" /> Send message
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Or email <a className="text-accent underline" href="mailto:hello@vantoos.com">hello@vantoos.com</a> directly.
                </p>
              </form>
            </Card>
          )}
        </div>
      </section>
    </>
  );
}
