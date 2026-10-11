import { MongoServerError, type Collection, type Db } from "mongodb";
export class AlreadySuggested extends Error {}
export class NoSuchSuggestion extends Error {}
export class NotSuggester extends Error {}
type Suggestion = { _id: string; suggester: string; group: string; item: string };

export class SuggestingConcept {
  private readonly suggestions: Collection<Suggestion>;
  private readyPromise?: Promise<unknown>;
  constructor(db: Db, private readonly freshID: () => string = () => crypto.randomUUID()) {
    this.suggestions = db.collection<Suggestion>("suggesting");
  }
  private get ready() { return this.readyPromise ??= this.suggestions.createIndex({ group: 1, item: 1 }, { unique: true }); }

  async suggest({ user, group, item }: { user: string; group: string; item: string }): Promise<{ suggestion: string }> {
    await this.ready;
    const suggestion = this.freshID();
    try { await this.suggestions.insertOne({ _id: suggestion, suggester: user, group, item }); }
    catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) throw new AlreadySuggested("That item is already in the group's collection.");
      throw error;
    }
    return { suggestion };
  }
  async withdraw({ user, suggestion }: { user: string; suggestion: string }): Promise<Record<string, never>> {
    await this.ready;
    const result = await this.suggestions.deleteOne({ _id: suggestion, suggester: user });
    if (!result.deletedCount) {
      if (!await this.suggestions.findOne({ _id: suggestion })) throw new NoSuchSuggestion("There is no such suggestion.");
      throw new NotSuggester("Only the suggester can withdraw this item.");
    }
    return {};
  }
  async _forGroup({ group }: { group: string }): Promise<Array<{ suggestion: string; suggester: string; item: string }>> {
    await this.ready;
    return (await this.suggestions.find({ group }).sort({ _id: 1 }).toArray())
      .map(({ _id: suggestion, suggester, item }) => ({ suggestion, suggester, item }));
  }
  async _get({ suggestion }: { suggestion: string }): Promise<Array<{ suggestion: string; suggester: string; group: string; item: string }>> {
    await this.ready;
    const found = await this.suggestions.findOne({ _id: suggestion });
    return found ? [{ suggestion, suggester: found.suggester, group: found.group, item: found.item }] : [];
  }
  async _contains({ group, item }: { group: string; item: string }): Promise<{ suggested: boolean }> {
    await this.ready;
    return { suggested: !!await this.suggestions.findOne({ group, item }, { projection: { _id: 1 } }) };
  }
}
