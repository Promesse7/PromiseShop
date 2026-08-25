import { Card, CardKicker } from "@/components/ui/Card";

interface SpecificationsCardProps {
  specifications: string | null;
}

export function SpecificationsCard({ specifications }: SpecificationsCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Specifications</CardKicker>
      <p className="text-sm m-0 whitespace-pre-wrap">{specifications ?? "No specifications recorded."}</p>
    </Card>
  );
}
