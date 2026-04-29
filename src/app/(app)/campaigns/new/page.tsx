import Link from "next/link";
import { requireRole } from "@/auth";
import { Card, CardBody, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { createCampaign } from "../actions";

export default async function NewCampaignPage() {
  await requireRole(["OWNER", "LIMITED_ADMIN"]);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/campaigns" className="text-xs text-(--color-muted-foreground) hover:text-(--color-foreground)">
        ← Back to campaigns
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
      <Card>
        <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
        <CardBody>
          <form action={createCampaign} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input name="name" placeholder="Spring Re-engagement 2026" required />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select name="type" defaultValue="COLD_OUTREACH">
                <option value="COLD_OUTREACH">Cold outreach</option>
                <option value="DRIP">Drip</option>
                <option value="ONBOARDING">Onboarding</option>
                <option value="RE_ENGAGEMENT">Re-engagement</option>
                <option value="CUSTOM">Custom</option>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Link href="/campaigns"><Button variant="outline" type="button">Cancel</Button></Link>
              <Button type="submit">Create &amp; continue</Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
