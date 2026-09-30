import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateStr, inr } from "../lib/format";
import { Card, Empty, ErrorBox, Spinner } from "../components/ui";

export default function Work() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<any[] | null>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    api<any[]>("/assessments").then(setRows).catch((e) => setErr(e.message));
    api<any[]>("/quotes").then(setQuotes).catch(() => undefined);
  }, [user]);
  if (loading) return <Spinner />;
  if (!user) return <Card><p>Please <Link className="underline" to="/login?next=/work">sign in</Link> to see saved work.</p></Card>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">My work</h1>
        <Link to="/assess" className="btn-primary">+ New assessment</Link>
      </div>
      <Card title="Assessments">
        <ErrorBox error={err} />
        {!rows ? <Spinner /> : rows.length === 0 ? <Empty>No assessments yet.</Empty> : (
          <table className="table-clean">
            <thead><tr><th>Title</th><th>Created</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><Link className="font-semibold text-brand hover:underline" to={`/results/${r.id}`}>{r.title}</Link>{r.parent_id && <div className="text-xs text-ink-3">reassessment of #{r.parent_id}</div>}</td>
                <td>{dateStr(r.created_at)}</td>
                <td>{r.selected_plan_id ? <span className="chip bg-good-bg text-good">plan chosen</span> : <span className="chip bg-surface text-ink-2">comparing</span>}</td>
                <td className="whitespace-nowrap text-right">{r.selected_plan_id && <><Link className="btn-ghost btn-sm" to={`/source/${r.id}`}>Source</Link> <Link className="btn-ghost btn-sm" to={`/pack/${r.id}`}>Pack</Link></>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Card title="Quotation & sample requests (simulated)">
        {quotes.length === 0 ? <Empty>No requests yet.</Empty> : (
          <table className="table-clean"><thead><tr><th>#</th><th>Supplier</th><th>Kind</th><th>Units</th><th>Response</th></tr></thead>
            <tbody>{quotes.map((q) => <tr key={q.id}><td>{q.id}</td><td>{q.supplier}</td><td>{q.kind}</td><td>{q.units}</td><td className="text-xs">{q.response.subtotalInr ? inr(q.response.subtotalInr) : q.response.totalInr ? inr(q.response.totalInr) : q.response.sampleUnits ? `${q.response.sampleUnits} samples` : ""} · valid until {q.response.validUntil}</td></tr>)}</tbody></table>
        )}
      </Card>
    </div>
  );
}
