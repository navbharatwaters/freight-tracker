"use client";
import { useState } from "react";

export default function LeadForm({
  origin,
  dest,
  embed,
}: {
  origin: string;
  dest: string;
  embed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setStatus("busy");
    setErrorMsg("");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          company: form.get("company"),
          message: form.get("message"),
          originPort: origin,
          destPort: dest,
          source: embed ? "tracker_embed" : "tracker_web",
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `request failed: ${res.status}`);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  if (status === "done") {
    return (
      <section className="border border-emerald-200 bg-emerald-50 rounded-lg p-4 md:p-5 text-sm text-emerald-800">
        Thanks — we&apos;ve got your details and will send a quote for {origin} → {dest} shortly.
      </section>
    );
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-5 py-2.5 rounded-md"
        >
          Get a quote for this lane
        </button>
      </div>
    );
  }

  return (
    <section className="border border-slate-200 rounded-lg p-4 md:p-5">
      <h2 className="text-sm font-semibold mb-1">Get a quote for {origin} → {dest}</h2>
      <p className="text-xs text-slate-500 mb-4">
        Leave your details and we&apos;ll come back with a rate for your shipment.
      </p>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
        <input
          name="name" required placeholder="Name"
          className="border border-slate-300 rounded-md px-3 py-2 text-sm sm:col-span-1"
        />
        <input
          name="email" type="email" required placeholder="Email"
          className="border border-slate-300 rounded-md px-3 py-2 text-sm sm:col-span-1"
        />
        <input
          name="phone" placeholder="Phone (optional)"
          className="border border-slate-300 rounded-md px-3 py-2 text-sm sm:col-span-1"
        />
        <input
          name="company" placeholder="Company (optional)"
          className="border border-slate-300 rounded-md px-3 py-2 text-sm sm:col-span-1"
        />
        <textarea
          name="message" rows={3} placeholder="Shipment details (volume, commodity, target date)..."
          className="border border-slate-300 rounded-md px-3 py-2 text-sm sm:col-span-2"
        />
        {status === "error" && (
          <p className="text-xs text-rose-700 sm:col-span-2">{errorMsg}</p>
        )}
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={status === "busy"}
            className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium px-5 py-2.5 rounded-md disabled:opacity-50"
          >
            {status === "busy" ? "Sending…" : "Request quote"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
