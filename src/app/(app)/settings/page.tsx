import { requireRole } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardBody, CardHeader, CardTitle, Input, Label, Textarea } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { updateSettings, updateLineItem } from "./actions";

export default async function SettingsPage() {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);

  const [settings, lineItems] = await Promise.all([
    prisma.globalSetting.findMany(),
    prisma.lineItemMenu.findMany({ orderBy: { itemName: "asc" } }),
  ]);
  const get = (key: string) => settings.find((s) => s.key === key)?.value as unknown;
  const gs = (key: string) => (typeof get(key) === "string" ? (get(key) as string) : "");
  const gn = (key: string) => (typeof get(key) === "number" ? (get(key) as number) : 0);
  const gb = (key: string) => get(key) === true;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-(--color-muted-foreground)">
          Company info, email defaults, operational thresholds.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Company &amp; branding</CardTitle></CardHeader>
        <CardBody>
          <form action={updateSettings} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Company logo path</Label>
              <Input name="company_logo_path" defaultValue={gs("company_logo_path")} placeholder="/logos/smg.png" />
              <p className="text-[11px] text-(--color-muted-foreground)">
                Stored on disk or S3. File uploads arrive in Phase 1B.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>License number</Label>
                <Input name="license_number" defaultValue={gs("license_number")} />
              </div>
              <div className="space-y-1.5">
                <Label>Company physical address (CAN-SPAM)</Label>
                <Input name="company_physical_address" defaultValue={gs("company_physical_address")} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Default email &quot;From&quot; name</Label>
                <Input name="default_email_from_name" defaultValue={gs("default_email_from_name")} />
              </div>
              <div className="space-y-1.5">
                <Label>Default email &quot;From&quot; address</Label>
                <Input name="default_email_from_email" type="email" defaultValue={gs("default_email_from_email")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Standard estimate terms</Label>
              <Textarea name="estimate_terms_text" rows={4} defaultValue={gs("estimate_terms_text")} />
            </div>

            <h3 className="mt-6 border-t border-(--color-border) pt-4 text-sm font-semibold">Operational thresholds</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Follow-up interval (days)</Label>
                <Input name="follow_up_interval_days" type="number" defaultValue={gn("follow_up_interval_days")} />
              </div>
              <div className="space-y-1.5">
                <Label>Dormant threshold (days)</Label>
                <Input name="dormant_threshold_days" type="number" defaultValue={gn("dormant_threshold_days")} />
              </div>
              <div className="space-y-1.5">
                <Label>Rep inactive threshold (days)</Label>
                <Input name="rep_inactive_threshold_days" type="number" defaultValue={gn("rep_inactive_threshold_days")} />
              </div>
              <div className="space-y-1.5">
                <Label>High-value prospect review threshold</Label>
                <Input name="high_value_review_threshold" type="number" defaultValue={gn("high_value_review_threshold")} />
              </div>
              <div className="space-y-1.5">
                <Label>Daily campaign sending limit</Label>
                <Input name="daily_campaign_sending_limit" type="number" defaultValue={gn("daily_campaign_sending_limit")} />
              </div>
            </div>
            <label className="flex items-center gap-2 pt-2 text-sm">
              <input type="checkbox" name="two_party_consent_required" defaultChecked={gb("two_party_consent_required")} />
              Two-party consent state (play recording notification before calls)
            </label>
            <div className="flex justify-end pt-2">
              <Button type="submit">Save settings</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Standard line item menu</CardTitle></CardHeader>
        <CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-(--color-border) bg-(--color-muted)/40">
              <tr className="text-left text-xs uppercase tracking-wide text-(--color-muted-foreground)">
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Default price</th>
                <th className="px-4 py-2">Unit</th>
                <th className="px-4 py-2">Active</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2 font-medium">{item.itemName}</td>
                  <td className="px-4 py-2">
                    <form action={updateLineItem} className="flex items-center gap-2">
                      <input type="hidden" name="id" value={item.id} />
                      <Input
                        name="defaultUnitPrice"
                        type="number"
                        step="0.01"
                        min={0}
                        defaultValue={item.defaultUnitPrice.toString()}
                        className="w-28"
                      />
                      <Input
                        name="unitType"
                        defaultValue={item.unitType}
                        className="w-28"
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="isActive" defaultChecked={item.isActive} />
                        Active
                      </label>
                      <Button type="submit" variant="outline" size="sm">Save</Button>
                    </form>
                  </td>
                  <td className="px-4 py-2 text-xs text-(--color-muted-foreground)">{item.unitType}</td>
                  <td className="px-4 py-2 text-xs">{item.isActive ? "Yes" : "No"}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
