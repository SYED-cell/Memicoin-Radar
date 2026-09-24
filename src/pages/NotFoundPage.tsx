import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';

export default function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The radar couldn't find this page. It may have moved."
        action={
          <div className="flex gap-2">
            <Link to="/dashboard" className="btn btn-primary">Dashboard</Link>
            <Link to="/tokens" className="btn btn-outline">Tokens</Link>
          </div>
        }
      />
    </div>
  );
}
