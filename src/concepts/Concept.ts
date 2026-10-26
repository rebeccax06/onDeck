import type { Collection, Db } from "mongodb";

export class EmptySource extends Error {}
export class NoSuchCapture extends Error {}
export class NoSuchActivity extends Error {}
export class InvalidDetails extends Error {}
export class NotCaptureOwner extends Error {}

export type ActivityFields = {
  name: string;
  source?: string;
  description?: string;
  location?: string;
  category?: string;
  cost?: number;
  currency?: string;
  dateTime?: string;
};

type CaptureDocument = {
  _id: string;
  kind: "capture" | "activity";
  owner?: string;
  source?: string;
  proposal?: ActivityFields;
  activity?: string;
  details?: ActivityFields;
};

const invalidDetailsMessage =
  "Provide a name, valid dates, and a nonnegative cost with its currency when known.";

export function validInstant(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, offset] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 &&
    Number(day) <= days && Number(hour) <= 23 && Number(minute) <= 59 &&
    Number(second) <= 59 && (offset === "Z" ||
      (Number(offset!.slice(1, 3)) <= 23 && Number(offset!.slice(4)) <= 59)) &&
    Number.isFinite(Date.parse(value));
}

export function checkedDetails(fields: { [K in keyof ActivityFields]: ActivityFields[K] | null }): ActivityFields {
  // Optional boundary inputs and absent former leaves use null; persist absence instead.
  const input = Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null)) as ActivityFields;
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new InvalidDetails(invalidDetailsMessage);
  }
  for (const key of ["source", "description", "location", "category"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "string") {
      throw new InvalidDetails(invalidDetailsMessage);
    }
  }
  if (input.dateTime !== undefined &&
      (typeof input.dateTime !== "string" || !validInstant(input.dateTime))) {
    throw new InvalidDetails(invalidDetailsMessage);
  }
  if ((input.cost === undefined) !== (input.currency === undefined)) {
    throw new InvalidDetails(invalidDetailsMessage);
  }
  if (input.cost !== undefined) {
    if (typeof input.cost !== "number" || !Number.isFinite(input.cost) || input.cost < 0 ||
        typeof input.currency !== "string" ||
        !Intl.supportedValuesOf("currency").includes(input.currency)) {
      throw new InvalidDetails(invalidDetailsMessage);
    }
    const digits = new Intl.NumberFormat("en", {
      style: "currency", currency: input.currency,
    }).resolvedOptions().maximumFractionDigits!;
    const scaled = input.cost * 10 ** digits;
    if (!Number.isSafeInteger(Math.round(scaled)) ||
        Math.abs(scaled - Math.round(scaled)) > Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4) {
      throw new InvalidDetails(invalidDetailsMessage);
    }
  }
  const result: ActivityFields = { name: input.name.trim() };
  for (const key of ["source", "description", "location", "category", "cost", "currency", "dateTime"] as const) {
    if (input[key] !== undefined) Object.assign(result, { [key]: input[key] });
  }
  return result;
}

/** Captures and activities share a collection so confirmation is one atomic transition.
 * A confirmed document retains its storage key but exposes a fresh activity identity.
 * Captures and proposals therefore disappear together, without MongoDB transactions.
 */
export class ActivityCapturingConcept {
  private readonly records: Collection<CaptureDocument>;
  private readyPromise?: Promise<unknown>;

  constructor(db: Db, private readonly freshID: () => string = () => crypto.randomUUID()) {
    this.records = db.collection<CaptureDocument>("activityCapturing");
  }

  private get ready(): Promise<unknown> {
    // Assembly and design checking do not connect to MongoDB; first use initializes storage.
    return this.readyPromise ??= this.records.createIndex({ activity: 1 }, {
      unique: true, partialFilterExpression: { kind: "activity" },
    });
  }

  async start({ user, source }: { user: string; source: string }): Promise<{ capture: string }> {
    if (typeof source !== "string" || source.trim() === "") {
      throw new EmptySource("Paste a link or enter a description.");
    }
    await this.ready;
    const capture = this.freshID();
    await this.records.insertOne({ _id: capture, kind: "capture", owner: user, source: source.trim() });
    return { capture };
  }

  async propose({ capture, ...fields }: {
    capture: string; name: string; source?: string | null; description?: string | null; location?: string | null;
    category?: string | null; cost?: number | null; currency?: string | null; dateTime?: string | null;
  }): Promise<Record<string, never>> {
    await this.ready;
    if (!await this.records.findOne({ _id: capture, kind: "capture" })) {
      throw new NoSuchCapture("There is no such capture.");
    }
    const proposal = checkedDetails(fields);
    const result = await this.records.updateOne({ _id: capture, kind: "capture" }, { $set: { proposal } });
    if (result.matchedCount === 0) throw new NoSuchCapture("There is no such capture.");
    return {};
  }

  async confirm({ user, capture, ...fields }: {
    user: string; capture: string; name: string; source?: string | null; description?: string | null;
    location?: string | null; category?: string | null; cost?: number | null; currency?: string | null; dateTime?: string | null;
  }): Promise<{ activity: string }> {
    await this.ready;
    const pending = await this.records.findOne({ _id: capture, kind: "capture" });
    if (!pending) throw new NoSuchCapture("There is no such capture.");
    if (pending.owner !== user) throw new NotCaptureOwner("Only the owner can confirm this capture.");
    const details = checkedDetails(fields);
    const activity = this.freshID();
    const result = await this.records.updateOne({ _id: capture, kind: "capture", owner: user }, {
      $set: { kind: "activity", activity, details },
      $unset: { source: "", proposal: "" },
    });
    if (result.matchedCount === 0) throw new NoSuchCapture("There is no such capture.");
    return { activity };
  }

  async update({ activity, ...fields }: { activity: string; name: string; source?: string | null;
    description?: string | null; location?: string | null; category?: string | null;
    cost?: number | null; currency?: string | null; dateTime?: string | null;
  }): Promise<Record<string, never>> {
    await this.ready;
    if (!await this.records.findOne({ activity, kind: "activity" })) throw new NoSuchActivity("There is no such activity.");
    const details = checkedDetails(fields);
    const result = await this.records.updateOne({ activity, kind: "activity" }, { $set: { details } });
    if (!result.matchedCount) throw new NoSuchActivity("There is no such activity.");
    return {};
  }

  async discard({ user, capture }: { user: string; capture: string }): Promise<Record<string, never>> {
    await this.ready;
    const pending = await this.records.findOne({ _id: capture, kind: "capture" });
    if (!pending) throw new NoSuchCapture("There is no such capture.");
    if (pending.owner !== user) throw new NotCaptureOwner("Only the owner can discard this capture.");
    const result = await this.records.deleteOne({ _id: capture, kind: "capture", owner: user });
    if (result.deletedCount === 0) throw new NoSuchCapture("There is no such capture.");
    return {};
  }

  async _capture({ capture }: { capture: string }): Promise<Array<{ capture: string; owner: string; source: string }>> {
    await this.ready;
    const pending = await this.records.findOne({ _id: capture, kind: "capture" });
    return pending ? [{ capture, owner: pending.owner!, source: pending.source! }] : [];
  }

  async _proposal({ capture }: { capture: string }): Promise<Array<{
    name: string; source?: string; description?: string; location?: string;
    category?: string; cost?: number; currency?: string; dateTime?: string;
  }>> {
    await this.ready;
    const pending = await this.records.findOne({ _id: capture, kind: "capture" });
    return pending?.proposal ? [pending.proposal] : [];
  }

  async _owner({ activity }: { activity: string }): Promise<Array<{ owner: string }>> {
    await this.ready;
    const saved = await this.records.findOne({ activity, kind: "activity" });
    return saved?.owner ? [{ owner: saved.owner }] : [];
  }

  async _get({ activity }: { activity: string }): Promise<Array<{
    activity: string; name: string; source?: string; description?: string; location?: string;
    category?: string; cost?: number; currency?: string; dateTime?: string;
  }>> {
    await this.ready;
    const saved = await this.records.findOne({ activity, kind: "activity" });
    return saved ? [{ activity, ...saved.details! }] : [];
  }
}
