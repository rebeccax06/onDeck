import type { Collection, Db } from "mongodb";

export class InvalidOrder extends Error {}
export class GroupOrderingConcept {
  private readonly preferences: Collection<{ _id: string; order: string[] }>;
  constructor(db: Db) { this.preferences = db.collection("groupOrdering"); }
  async save({ user, order }: { user: string; order: string[] }): Promise<Record<string, never>> {
    if (!Array.isArray(order) || order.length > 1000 || order.some(id => typeof id !== "string" || !id) || new Set(order).size !== order.length)
      throw new InvalidOrder("Choose a valid group order.");
    await this.preferences.updateOne({ _id: user }, { $set: { order } }, { upsert: true });
    return {};
  }
  async _get({ user }: { user: string }): Promise<{ order: string[] }> {
    return { order: (await this.preferences.findOne({ _id: user }))?.order ?? [] };
  }
}
