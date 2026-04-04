import { CardGridSkeleton } from "@/components/ui/page-skeleton";

export default function Loading() {
  return <CardGridSkeleton count={6} cardHeight="md" columns={3} />;
}
