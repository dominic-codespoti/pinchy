import { Construction } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageContainer } from './page-container';
import Link from 'next/link';

interface NotAvailableProps {
  feature: string;
  description?: string;
  returnHref?: string;
  returnLabel?: string;
}

export function NotAvailable({
  feature,
  description = 'This feature is not available in the current backend configuration.',
  returnHref = '/dashboard',
  returnLabel = 'Back to Dashboard',
}: NotAvailableProps) {
  return (
    <PageContainer className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Construction className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold">{feature}</h1>
          <p className="text-sm text-muted-foreground">Feature status and configuration</p>
        </div>
      </div>

      <Card>
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-muted p-3">
              <Construction className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-xl">{feature} Not Available</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Link href={returnHref}>
            <Button variant="outline">{returnLabel}</Button>
          </Link>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
