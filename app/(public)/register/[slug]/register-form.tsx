"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, Search } from "lucide-react";

interface Props {
  form: {
    id: string;
    title: string;
    description: string | null;
    require_passcode: boolean;
    fields: string[];
    org_id: string;
  };
}

const FIELD_LABELS: Record<string, string> = {
  personal_id: "Personal ID / IC Number",
  full_name: "Full Name",
  email: "Email",
  phone: "Phone",
  school: "School",
  agency: "Agency / Organization",
  nationality: "Nationality",
  date_of_birth: "Date of Birth",
  gender: "Gender",
};

const REQUIRED_FIELDS = ["personal_id", "full_name"];

const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AG", name: "Antigua and Barbuda" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" },
  { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BW", name: "Botswana" },
  { code: "BR", name: "Brazil" },
  { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" },
  { code: "CV", name: "Cape Verde" },
  { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "KM", name: "Comoros" },
  { code: "CG", name: "Congo" },
  { code: "CR", name: "Costa Rica" },
  { code: "HR", name: "Croatia" },
  { code: "CU", name: "Cuba" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominica" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" },
  { code: "ET", name: "Ethiopia" },
  { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GR", name: "Greece" },
  { code: "GD", name: "Grenada" },
  { code: "GT", name: "Guatemala" },
  { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HN", name: "Honduras" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KI", name: "Kiribati" },
  { code: "KP", name: "North Korea" },
  { code: "KR", name: "South Korea" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Islands" },
  { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" },
  { code: "MX", name: "Mexico" },
  { code: "FM", name: "Micronesia" },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibia" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" },
  { code: "PS", name: "Palestine" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "RW", name: "Rwanda" },
  { code: "KN", name: "Saint Kitts and Nevis" },
  { code: "LC", name: "Saint Lucia" },
  { code: "VC", name: "Saint Vincent and the Grenadines" },
  { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" },
  { code: "ST", name: "Sao Tome and Principe" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "SB", name: "Solomon Islands" },
  { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" },
  { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" },
  { code: "SR", name: "Suriname" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" },
  { code: "TG", name: "Togo" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" },
  { code: "TV", name: "Tuvalu" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VU", name: "Vanuatu" },
  { code: "VA", name: "Vatican City" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
];

export function RegisterForm({ form }: Props) {
  const [step, setStep] = useState<"passcode" | "form" | "success">(
    form.require_passcode ? "passcode" : "form"
  );
  const [passcodeInput, setPasscodeInput] = useState("");
  const [passcodeError, setPasscodeError] = useState("");
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [nationalitySearch, setNationalitySearch] = useState("");

  const filteredCountries = useMemo(() => {
    if (!nationalitySearch) return COUNTRIES;
    const q = nationalitySearch.toLowerCase();
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [nationalitySearch]);

  const selectedCountryName = COUNTRIES.find((c) => c.code === formData.nationality)?.name;

  async function handlePasscodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasscodeError("");

    const res = await fetch(`/api/public/register/${form.id}/verify-passcode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: passcodeInput }),
    });

    if (res.ok) {
      setStep("form");
    } else {
      setPasscodeError("Incorrect passcode");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch(`/api/public/register/${form.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          passcode: form.require_passcode ? passcodeInput : undefined,
        }),
      });

      if (res.ok) {
        setStep("success");
      } else {
        const data = await res.json();
        setError(data.error || "Registration failed. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center py-12">
            <CheckCircle className="h-16 w-16 text-green-500" />
            <h2 className="mt-4 text-xl font-semibold">Registration Successful!</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              You have been registered. Keep your Personal ID safe — you will need it to access the quiz.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "passcode") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{form.title}</CardTitle>
            {form.description && (
              <p className="text-sm text-muted-foreground">{form.description}</p>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasscodeSubmit} className="space-y-4">
              <div className="grid gap-1.5">
                <Label>Passcode</Label>
                <Input
                  type="password"
                  value={passcodeInput}
                  onChange={(e) => setPasscodeInput(e.target.value)}
                  placeholder="Enter passcode to continue"
                  required
                />
                {passcodeError && (
                  <p className="text-xs text-destructive">{passcodeError}</p>
                )}
              </div>
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{form.title}</CardTitle>
          {form.description && (
            <p className="text-sm text-muted-foreground">{form.description}</p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {form.fields.map((field) => (
              <div key={field} className="grid gap-1.5">
                <Label>
                  {FIELD_LABELS[field] || field}
                  {REQUIRED_FIELDS.includes(field) && (
                    <span className="text-destructive"> *</span>
                  )}
                </Label>

                {field === "nationality" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start font-normal"
                      onClick={() => {
                        setNationalitySearch("");
                        setNationalityOpen(true);
                      }}
                    >
                      {selectedCountryName
                        ? `${selectedCountryName} (${formData.nationality})`
                        : "Select nationality..."}
                    </Button>
                    <Dialog open={nationalityOpen} onOpenChange={setNationalityOpen}>
                      <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                          <DialogTitle>Select Nationality</DialogTitle>
                        </DialogHeader>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="pl-9"
                            placeholder="Search country..."
                            value={nationalitySearch}
                            onChange={(e) => setNationalitySearch(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          {filteredCountries.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">
                              No countries found
                            </p>
                          ) : (
                            filteredCountries.map((c) => (
                              <button
                                key={c.code}
                                type="button"
                                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50 rounded ${
                                  formData.nationality === c.code ? "bg-muted font-medium" : ""
                                }`}
                                onClick={() => {
                                  setFormData({ ...formData, nationality: c.code });
                                  setNationalityOpen(false);
                                }}
                              >
                                <span>{c.name}</span>
                                <span className="text-xs text-muted-foreground">{c.code}</span>
                              </button>
                            ))
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </>
                ) : field === "gender" ? (
                  <Select
                    value={formData.gender || ""}
                    onValueChange={(v: string | null) =>
                      v && setFormData({ ...formData, gender: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={
                      field === "email"
                        ? "email"
                        : field === "date_of_birth"
                        ? "date"
                        : "text"
                    }
                    value={formData[field] || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, [field]: e.target.value })
                    }
                    required={REQUIRED_FIELDS.includes(field)}
                    placeholder={FIELD_LABELS[field] || field}
                  />
                )}
              </div>
            ))}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Registering..." : "Register"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
