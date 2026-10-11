import type { Collection, Db } from "mongodb";

export class InvalidName extends Error {}
export class NoSuchGroup extends Error {}
export class NotAMember extends Error {}
export class AlreadyAMember extends Error {}
export class AlreadyInvited extends Error {}
export class NoSuchInvitation extends Error {}
export class NotInvited extends Error {}

type Invitation = { invitation: string; inviter: string; invitee: string };
type Group = { _id: string; name: string; members: string[]; invitations: Invitation[] };
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Invitations live with their group so accepting membership consumes an invitation atomically. */
export class MembershipTrackingConcept {
  private readonly groups: Collection<Group>;
  constructor(db: Db, private readonly freshID: () => string = () => crypto.randomUUID()) {
    this.groups = db.collection<Group>("membershipTracking");
  }

  async create({ creator, name }: { creator: string; name: string }): Promise<{ group: string }> {
    if (typeof name !== "string" || name.trim() === "") throw new InvalidName("Give the group a name.");
    const group = this.freshID();
    await this.groups.insertOne({ _id: group, name: name.trim(), members: [creator], invitations: [] });
    return { group };
  }

  async invite({ inviter, group, invitee }: { inviter: string; group: string; invitee: string }): Promise<{ invitation: string }> {
    const invitation = this.freshID();
    const result = await this.groups.updateOne({
      _id: group, members: { $all: [inviter], $nin: [invitee] }, "invitations.invitee": { $ne: invitee },
    }, { $push: { invitations: { invitation, inviter, invitee } } });
    if (!result.matchedCount) {
      const found = await this.groups.findOne({ _id: group });
      if (!found) throw new NoSuchGroup("There is no such group.");
      if (!found.members.includes(inviter)) throw new NotAMember("Only members can invite someone.");
      if (found.members.includes(invitee)) throw new AlreadyAMember("That person already belongs to the group.");
      throw new AlreadyInvited("That person already has an invitation.");
    }
    return { invitation };
  }

  async accept({ invitee, invitation }: { invitee: string; invitation: string }): Promise<{ group: string }> {
    const found = await this.groups.findOneAndUpdate({ invitations: { $elemMatch: { invitation, invitee } } }, {
      $addToSet: { members: invitee }, $pull: { invitations: { invitation } },
    }, { returnDocument: "before" });
    if (!found) {
      if (await this.groups.findOne({ "invitations.invitation": invitation })) throw new NotInvited("This invitation is for someone else.");
      throw new NoSuchInvitation("There is no such invitation.");
    }
    return { group: found._id };
  }

  async decline({ invitee, invitation }: { invitee: string; invitation: string }): Promise<Record<string, never>> {
    const result = await this.groups.updateOne({ invitations: { $elemMatch: { invitation, invitee } } }, {
      $pull: { invitations: { invitation } },
    });
    if (!result.matchedCount) {
      if (await this.groups.findOne({ "invitations.invitation": invitation })) throw new NotInvited("This invitation is for someone else.");
      throw new NoSuchInvitation("There is no such invitation.");
    }
    return {};
  }

  async leave({ user, group }: { user: string; group: string }): Promise<Record<string, never>> {
    const result = await this.groups.updateOne({ _id: group, members: user }, { $pull: { members: user } });
    if (!result.matchedCount) {
      if (!await this.groups.findOne({ _id: group })) throw new NoSuchGroup("There is no such group.");
      throw new NotAMember("You do not belong to this group.");
    }
    return {};
  }

  async _groups({ user }: { user: string }): Promise<Array<{ group: string; name: string }>> {
    return (await this.groups.find({ members: user }).sort({ name: 1, _id: 1 }).toArray())
      .map(({ _id: group, name }) => ({ group, name }));
  }
  async _get({ group }: { group: string }): Promise<Array<{ group: string; name: string }>> {
    const found = await this.groups.findOne({ _id: group });
    return found ? [{ group, name: found.name }] : [];
  }
  async _members({ group }: { group: string }): Promise<Array<{ user: string }>> {
    const found = await this.groups.findOne({ _id: group });
    return (found?.members ?? []).sort(order).map((user) => ({ user }));
  }
  async _membership({ user, group }: { user: string; group: string }): Promise<{ member: boolean }> {
    return { member: !!await this.groups.findOne({ _id: group, members: user }, { projection: { _id: 1 } }) };
  }
  async _invitations({ invitee }: { invitee: string }): Promise<Array<{ invitation: string; group: string; inviter: string }>> {
    const groups = await this.groups.find({ "invitations.invitee": invitee }).toArray();
    return groups.flatMap((group) => group.invitations.filter((invitation) => invitation.invitee === invitee)
      .map(({ invitation, inviter }) => ({ invitation, group: group._id, inviter })))
      .sort((a, b) => order(a.invitation, b.invitation));
  }
  async _invitation({ invitation }: { invitation: string }): Promise<Array<{ invitation: string; group: string; inviter: string; invitee: string }>> {
    const found = await this.groups.findOne({ "invitations.invitation": invitation });
    const entry = found?.invitations.find((entry) => entry.invitation === invitation);
    return found && entry ? [{ ...entry, group: found._id }] : [];
  }
}
