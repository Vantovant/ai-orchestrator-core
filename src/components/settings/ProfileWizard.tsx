import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { profileWizardService, type ExecutiveProfile } from "@/services/profileWizardService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCog, Briefcase, Scale, Calculator, Users, Rocket, Building2, Stethoscope, GraduationCap, Landmark, ShoppingBag, Truck, Hammer, Leaf } from "lucide-react";
import { toast } from "sonner";

const ROLES = [
  { id: "gov_executive", label: "Government Executive", icon: Briefcase, desc: "Public sector leadership" },
  { id: "attorney", label: "Attorney", icon: Scale, desc: "Legal practice" },
  { id: "accountant", label: "Accountant", icon: Calculator, desc: "Financial & tax services" },
  { id: "network_marketer", label: "Network Marketer", icon: Users, desc: "Direct sales & teams" },
  { id: "entrepreneur", label: "Entrepreneur", icon: Rocket, desc: "Business ownership & startups" },
  { id: "real_estate", label: "Real Estate", icon: Building2, desc: "Property & development" },
  { id: "healthcare", label: "Healthcare", icon: Stethoscope, desc: "Medical & wellness" },
  { id: "education", label: "Education", icon: GraduationCap, desc: "Teaching & training" },
  { id: "banking_finance", label: "Banking & Finance", icon: Landmark, desc: "Investment & advisory" },
  { id: "retail_ecommerce", label: "Retail & E-Commerce", icon: ShoppingBag, desc: "Consumer sales" },
  { id: "logistics", label: "Logistics & Transport", icon: Truck, desc: "Supply chain & fleet" },
  { id: "construction", label: "Construction & Engineering", icon: Hammer, desc: "Building & infrastructure" },
  { id: "agriculture", label: "Agriculture", icon: Leaf, desc: "Farming & agribusiness" },
];

export default function ProfileWizard({ onComplete }: { onComplete?: () => void }) {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ["executive_profile"], queryFn: profileWizardService.get });

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [workStart, setWorkStart] = useState("08:00");
  const [workEnd, setWorkEnd] = useState("17:00");
  const [initialized, setInitialized] = useState(false);

  // Initialize from fetched profile
  if (profile.data && !initialized) {
    setSelectedRoles(profile.data.role_profiles);
    setWorkStart(profile.data.default_work_start);
    setWorkEnd(profile.data.default_work_end);
    setInitialized(true);
  }

  const saveMut = useMutation({
    mutationFn: (p: ExecutiveProfile) => profileWizardService.save(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["executive_profile"] });
      toast.success("Profile saved");
      onComplete?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSave = () => {
    saveMut.mutate({
      role_profiles: selectedRoles,
      default_work_start: workStart,
      default_work_end: workEnd,
      preferred_templates: [],
      onboarding_complete: true,
    });
  };

  if (profile.isLoading) return <Skeleton className="h-48" />;

  const tips = profileWizardService.getRoleTips(selectedRoles);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserCog className="h-4 w-4" /> Executive Profile
        </CardTitle>
        <CardDescription>Select your roles to personalize AI recommendations across the app.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Role selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Your Industries <span className="text-xs font-normal text-muted-foreground">(select all that apply)</span></Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {ROLES.map((role) => {
              const checked = selectedRoles.includes(role.id);
              return (
                <button
                  type="button"
                  key={role.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                    checked
                      ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30"
                      : "border-border hover:border-primary/50 hover:bg-muted/50 active:scale-[0.98]"
                  }`}
                  onClick={() => toggleRole(role.id)}
                  aria-pressed={checked}
                >
                  <Checkbox checked={checked} onCheckedChange={() => toggleRole(role.id)} tabIndex={-1} />
                  <role.icon className={`h-4 w-4 shrink-0 ${checked ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{role.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{role.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Role tips */}
        {tips.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">AI will adapt recommendations for:</Label>
            <div className="flex flex-wrap gap-1">
              {tips.map((t, i) => (
                <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Work hours */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Default Work Hours</Label>
          <div className="flex items-center gap-3">
            <Input type="time" value={workStart} onChange={(e) => setWorkStart(e.target.value)} className="w-32" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} className="w-32" />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saveMut.isPending} className="w-full">
          {saveMut.isPending ? "Saving..." : "Save Profile"}
        </Button>
      </CardContent>
    </Card>
  );
}
