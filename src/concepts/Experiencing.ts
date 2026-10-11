import { MongoServerError, type Collection, type Db } from "mongodb";
export class AlreadyCompleted extends Error {}
export class InvalidPreference extends Error {}
export class NotCompleted extends Error {}
export type RepeatPreference = "UNKNOWN" | "YES" | "NO";
type Experience = { _id: string; user: string; item: string; repeatPreference: RepeatPreference };

export class ExperiencingConcept {
  private readonly experiences: Collection<Experience>;
  private readyPromise?: Promise<unknown>;
  constructor(db: Db, private readonly freshID: () => string = () => crypto.randomUUID()) {
    this.experiences = db.collection<Experience>("experiencing");
  }
  private get ready() { return this.readyPromise ??= this.experiences.createIndex({ user: 1, item: 1 }, { unique: true }); }
  async complete({ user, item }: { user: string; item: string }): Promise<{ experience: string }> {
    await this.ready;
    const experience = this.freshID();
    try { await this.experiences.insertOne({ _id: experience, user, item, repeatPreference: "UNKNOWN" }); }
    catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) throw new AlreadyCompleted("You already recorded doing this.");
      throw error;
    }
    return { experience };
  }
  async setRepeatPreference({ user, item, preference }: { user: string; item: string; preference: RepeatPreference }): Promise<Record<string, never>> {
    if (!["UNKNOWN", "YES", "NO"].includes(preference)) throw new InvalidPreference("Choose UNKNOWN, YES, or NO.");
    await this.ready;
    const result = await this.experiences.updateOne({ user, item }, { $set: { repeatPreference: preference } });
    if (!result.matchedCount) throw new NotCompleted("Record doing this before setting a repeat preference.");
    return {};
  }
  async undoCompletion({ user, item }: { user: string; item: string }): Promise<Record<string, never>> {
    await this.ready;
    const result = await this.experiences.deleteOne({ user, item });
    if (!result.deletedCount) throw new NotCompleted("You have not recorded doing this.");
    return {};
  }
  async _get({ user, item }: { user: string; item: string }): Promise<Array<{ experience: string; repeatPreference: RepeatPreference }>> {
    await this.ready;
    const found = await this.experiences.findOne({ user, item });
    return found ? [{ experience: found._id, repeatPreference: found.repeatPreference }] : [];
  }
  async _forItem({ item }: { item: string }): Promise<Array<{ experience: string; user: string; repeatPreference: RepeatPreference }>> {
    await this.ready;
    return (await this.experiences.find({ item }).sort({ user: 1 }).toArray())
      .map(({ _id: experience, user, repeatPreference }) => ({ experience, user, repeatPreference }));
  }
}
