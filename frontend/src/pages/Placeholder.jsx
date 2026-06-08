// Generic placeholder page used for tools that haven't been built yet.

import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function Placeholder({ title }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">This tool hasn't been built yet.</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Construction className="size-6" />
          </div>
          <div>
            <p className="font-medium">Coming soon</p>
            <p className="text-sm text-muted-foreground">This feature is planned for a later phase.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
