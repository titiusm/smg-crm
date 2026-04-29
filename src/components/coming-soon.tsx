import { Card, CardBody, Badge } from "@/components/ui/primitives";
import { Wrench } from "lucide-react";

export function ComingSoon({ title, phase, description }: { title: string; phase: string; description: string }) {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-(--color-accent)" />
            <Badge variant="accent">{phase}</Badge>
          </div>
          <p className="text-sm text-(--color-muted-foreground)">{description}</p>
          <p className="text-xs text-(--color-muted-foreground)">
            The database schema and routing are already in place, so nothing will need to be rebuilt.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
