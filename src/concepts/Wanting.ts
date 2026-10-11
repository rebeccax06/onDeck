import { MongoServerError, type Collection, type Db } from "mongodb";
export class AlreadyWanted extends Error {}
export class NotWanted extends Error {}
type Wants = { _id: string; wanted: string[] };

export class WantingConcept {
  private readonly users: Collection<Wants>;
  constructor(db: Db) { this.users = db.collection<Wants>("wanting"); }
  async want({ user, item }: { user: string; item: string }): Promise<Record<string, never>> {
    // Initialize the external user's local state, then atomically add this one item.
    // A first-use race on two different items must not be mistaken for a duplicate want.
    try {
      await this.users.updateOne({ _id: user }, { $setOnInsert: { wanted: [] } }, { upsert: true });
    } catch (error) {
      if (!(error instanceof MongoServerError && error.code === 11000)) throw error;
    }
    const result = await this.users.updateOne({ _id: user, wanted: { $ne: item } }, { $addToSet: { wanted: item } });
    if (!result.matchedCount) throw new AlreadyWanted("You already want to do this.");
    return {};
  }
  async unwant({ user, item }: { user: string; item: string }): Promise<Record<string, never>> {
    const result = await this.users.updateOne({ _id: user, wanted: item }, { $pull: { wanted: item } });
    if (!result.matchedCount) throw new NotWanted("You have not marked this as wanted.");
    return {};
  }
  async _wants({ user, item }: { user: string; item: string }): Promise<{ wanted: boolean }> {
    return { wanted: !!await this.users.findOne({ _id: user, wanted: item }, { projection: { _id: 1 } }) };
  }
  async _forItem({ item }: { item: string }): Promise<Array<{ user: string }>> {
    return (await this.users.find({ wanted: item }).sort({ _id: 1 }).toArray()).map(({ _id: user }) => ({ user }));
  }
  async _forUser({ user }: { user: string }): Promise<Array<{ item: string }>> {
    const found = await this.users.findOne({ _id: user });
    return (found?.wanted ?? []).sort().map((item) => ({ item }));
  }
}
