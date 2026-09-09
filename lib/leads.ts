import nodemailer from "nodemailer";
import { query } from "./db";

export type LeadInput = {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  originPort?: string;
  destPort?: string;
  message?: string;
  source: "tracker_web" | "tracker_embed";
};

function validate(input: Partial<LeadInput>): string | null {
  if (!input.name?.trim()) return "name is required";
  if (!input.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    return "a valid email is required";
  }
  if (input.name.length > 200 || input.email.length > 200) return "field too long";
  return null;
}

export async function insertLead(input: LeadInput): Promise<{ id: number }> {
  const err = validate(input);
  if (err) throw new Error(err);

  const [row] = await query<{ id: number }>(
    `INSERT INTO leads (name, email, phone, company, origin_port, dest_port, message, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.name.trim(),
      input.email.trim(),
      input.phone?.trim() || null,
      input.company?.trim() || null,
      input.originPort || null,
      input.destPort || null,
      input.message?.trim()?.slice(0, 2000) || null,
      input.source,
    ]
  );
  return row;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/** Best-effort: a lead is already saved in the DB by the time this runs, so a
 *  mail-server hiccup must never turn into a failed submission for the
 *  visitor. Failure here just means the row waits in `leads` unnotified. */
export async function notifyLead(id: number, input: LeadInput): Promise<boolean> {
  const t = getTransporter();
  const to = process.env.LEAD_NOTIFY_TO;
  if (!t || !to) return false;

  const lane = input.originPort && input.destPort ? `${input.originPort} -> ${input.destPort}` : "not specified";
  try {
    await t.sendMail({
      from: process.env.SMTP_USER,
      to,
      subject: `New freight tracker lead: ${input.name}`,
      text: [
        `New booking enquiry from the freight tracker (${input.source}).`,
        ``,
        `Name:    ${input.name}`,
        `Email:   ${input.email}`,
        `Phone:   ${input.phone || "-"}`,
        `Company: ${input.company || "-"}`,
        `Lane:    ${lane}`,
        `Message: ${input.message || "-"}`,
        ``,
        `Lead id: ${id}`,
      ].join("\n"),
    });
    await query(`UPDATE leads SET notified = true WHERE id = $1`, [id]);
    return true;
  } catch {
    return false;
  }
}
