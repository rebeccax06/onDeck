import type { Collection, Db } from "mongodb";

export class InvalidName extends Error {}
export class InvalidCover extends Error {}
export class NoSuchGroup extends Error {}
export class NotAMember extends Error {}
export class AlreadyAMember extends Error {}
export class AlreadyInvited extends Error {}
export class NoSuchInvitation extends Error {}
export class NotInvited extends Error {}
export class InvalidLink extends Error {}

const hash = (token: string) =>
  new Bun.CryptoHasher("sha256").update(token).digest("hex");
type Link = { link: string; hash: string; expires: number };

type Invitation = { invitation: string; inviter: string; invitee: string };
type Group = {
  _id: string;
  name: string;
  cover?: string;
  members: string[];
  invitations: Invitation[];
  links?: Link[];
};
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Invitations live with their group so accepting membership consumes an invitation atomically. */
export class MembershipTrackingConcept {
  private readonly groups: Collection<Group>;
  constructor(
    db: Db,
    private readonly freshID: () => string = () => crypto.randomUUID(),
  ) {
    this.groups = db.collection<Group>("membershipTracking");
  }

  async create({
    creator,
    name,
  }: {
    creator: string;
    name: string;
  }): Promise<{ group: string }> {
    if (typeof name !== "string" || name.trim() === "")
      throw new InvalidName("Give the group a name.");
    const group = this.freshID();
    await this.groups.insertOne({
      _id: group,
      name: name.trim(),
      members: [creator],
      invitations: [],
    });
    return { group };
  }

  async invite({
    inviter,
    group,
    invitee,
  }: {
    inviter: string;
    group: string;
    invitee: string;
  }): Promise<{ invitation: string }> {
    const invitation = this.freshID();
    const result = await this.groups.updateOne(
      {
        _id: group,
        members: { $all: [inviter], $nin: [invitee] },
        "invitations.invitee": { $ne: invitee },
      },
      { $push: { invitations: { invitation, inviter, invitee } } },
    );
    if (!result.matchedCount) {
      const found = await this.groups.findOne({ _id: group });
      if (!found) throw new NoSuchGroup("There is no such group.");
      if (!found.members.includes(inviter))
        throw new NotAMember("Only members can invite someone.");
      if (found.members.includes(invitee))
        throw new AlreadyAMember("That person already belongs to the group.");
      throw new AlreadyInvited("That person already has an invitation.");
    }
    return { invitation };
  }

  async accept({
    invitee,
    invitation,
  }: {
    invitee: string;
    invitation: string;
  }): Promise<{ group: string }> {
    const found = await this.groups.findOneAndUpdate(
      { invitations: { $elemMatch: { invitation, invitee } } },
      {
        $addToSet: { members: invitee },
        $pull: { invitations: { invitation } },
      },
      { returnDocument: "before" },
    );
    if (!found) {
      if (await this.groups.findOne({ "invitations.invitation": invitation }))
        throw new NotInvited("This invitation is for someone else.");
      throw new NoSuchInvitation("There is no such invitation.");
    }
    return { group: found._id };
  }

  async decline({
    invitee,
    invitation,
  }: {
    invitee: string;
    invitation: string;
  }): Promise<Record<string, never>> {
    const result = await this.groups.updateOne(
      { invitations: { $elemMatch: { invitation, invitee } } },
      {
        $pull: { invitations: { invitation } },
      },
    );
    if (!result.matchedCount) {
      if (await this.groups.findOne({ "invitations.invitation": invitation }))
        throw new NotInvited("This invitation is for someone else.");
      throw new NoSuchInvitation("There is no such invitation.");
    }
    return {};
  }

  async leave({
    user,
    group,
  }: {
    user: string;
    group: string;
  }): Promise<Record<string, never>> {
    const result = await this.groups.updateOne(
      { _id: group, members: user },
      { $pull: { members: user } },
    );
    if (!result.matchedCount) {
      if (!(await this.groups.findOne({ _id: group })))
        throw new NoSuchGroup("There is no such group.");
      throw new NotAMember("You do not belong to this group.");
    }
    return {};
  }

  async updateGroup({
    user,
    group,
    name,
    cover,
  }: {
    user: string;
    group: string;
    name: string;
    cover: string | null;
  }): Promise<Record<string, never>> {
    await requireMember(this.groups, user, group);
    if (typeof name !== "string" || !name.trim())
      throw new InvalidName("Give the group a name.");
    if (cover !== null && !validCover(cover))
      throw new InvalidCover("Choose a valid group picture.");
    const result = await this.groups.updateOne(
      { _id: group, members: user },
      {
        $set: { name: name.trim(), ...(cover === null ? {} : { cover }) },
        ...(cover === null ? { $unset: { cover: "" as const } } : {}),
      },
    );
    if (!result.matchedCount) await requireMember(this.groups, user, group);
    return {};
  }
  async _cover({
    group,
  }: {
    group: string;
  }): Promise<{ cover: string | null }> {
    return {
      cover:
        (
          await this.groups.findOne(
            { _id: group },
            { projection: { cover: 1 } },
          )
        )?.cover ?? null,
    };
  }
  async deleteGroup({
    user,
    group,
  }: {
    user: string;
    group: string;
  }): Promise<Record<string, never>> {
    const result = await this.groups.deleteOne({ _id: group, members: user });
    if (!result.deletedCount) {
      if (!(await this.groups.findOne({ _id: group })))
        throw new NoSuchGroup("There is no such group.");
      throw new NotAMember("Only members can delete a group.");
    }
    return {};
  }
  async createLink({
    user,
    group,
  }: {
    user: string;
    group: string;
  }): Promise<{ link: string; token: string; expires: number }> {
    await requireMember(this.groups, user, group);
    const token = crypto.randomUUID() + crypto.randomUUID();
    const link = this.freshID(),
      expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const result = await this.groups.updateOne(
      { _id: group, members: user },
      { $push: { links: { link, hash: hash(token), expires } } },
    );
    if (!result.matchedCount)
      throw new NotAMember("Only members can invite someone.");
    return { link, token, expires };
  }
  async revokeLink({
    user,
    group,
    link,
  }: {
    user: string;
    group: string;
    link: string;
  }): Promise<Record<string, never>> {
    await requireMember(this.groups, user, group);
    const result = await this.groups.updateOne(
      { _id: group, members: user },
      { $pull: { links: { link } } },
    );
    if (!result.matchedCount)
      throw new NotAMember("Only members can revoke invitations.");
    return {};
  }
  async joinLink({
    user,
    token,
  }: {
    user: string;
    token: string;
  }): Promise<{ group: string }> {
    const found = await this.groups.findOne({
      links: {
        $elemMatch: { hash: hash(token), expires: { $gt: Date.now() } },
      },
    });
    const entry = found?.links?.find(
      (link) => link.hash === hash(token) && link.expires > Date.now(),
    );
    if (!found || !entry)
      throw new InvalidLink("This invitation has expired or was revoked.");
    const result = await this.groups.updateOne(
      {
        _id: found._id,
        links: {
          $elemMatch: { hash: entry.hash, expires: { $gt: Date.now() } },
        },
      },
      {
        $addToSet: { members: user },
      },
    );
    if (!result.matchedCount)
      throw new InvalidLink("This invitation has expired or was revoked.");
    return { group: found._id };
  }
  async _links({
    group,
  }: {
    group: string;
  }): Promise<Array<{ link: string; expires: number }>> {
    return ((await this.groups.findOne({ _id: group }))?.links ?? [])
      .filter((link) => link.expires > Date.now())
      .sort((a, b) => a.expires - b.expires || order(a.link, b.link))
      .map(({ link, expires }) => ({ link, expires }));
  }
  async _link({
    token,
  }: {
    token: string;
  }): Promise<Array<{ group: string; name: string; link: string }>> {
    const found = await this.groups.findOne({
      links: {
        $elemMatch: { hash: hash(token), expires: { $gt: Date.now() } },
      },
    });
    const link = found?.links?.find(
      (link) => link.hash === hash(token) && link.expires > Date.now(),
    );
    return found && link
      ? [{ group: found._id, name: found.name, link: link.link }]
      : [];
  }

  async _groups({
    user,
  }: {
    user: string;
  }): Promise<Array<{ group: string; name: string }>> {
    return (
      await this.groups
        .find({ members: user })
        .sort({ name: 1, _id: 1 })
        .toArray()
    ).map(({ _id: group, name }) => ({ group, name }));
  }
  async _get({
    group,
  }: {
    group: string;
  }): Promise<Array<{ group: string; name: string }>> {
    const found = await this.groups.findOne({ _id: group });
    return found ? [{ group, name: found.name }] : [];
  }
  async _members({
    group,
  }: {
    group: string;
  }): Promise<Array<{ user: string }>> {
    const found = await this.groups.findOne({ _id: group });
    return (found?.members ?? []).sort(order).map((user) => ({ user }));
  }
  async _membership({
    user,
    group,
  }: {
    user: string;
    group: string;
  }): Promise<{ member: boolean }> {
    return {
      member: !!(await this.groups.findOne(
        { _id: group, members: user },
        { projection: { _id: 1 } },
      )),
    };
  }
  async _invitations({
    invitee,
  }: {
    invitee: string;
  }): Promise<Array<{ invitation: string; group: string; inviter: string }>> {
    const groups = await this.groups
      .find({ "invitations.invitee": invitee })
      .toArray();
    return groups
      .flatMap((group) =>
        group.invitations
          .filter((invitation) => invitation.invitee === invitee)
          .map(({ invitation, inviter }) => ({
            invitation,
            group: group._id,
            inviter,
          })),
      )
      .sort((a, b) => order(a.invitation, b.invitation));
  }
  async _invitation({
    invitation,
  }: {
    invitation: string;
  }): Promise<
    Array<{
      invitation: string;
      group: string;
      inviter: string;
      invitee: string;
    }>
  > {
    const found = await this.groups.findOne({
      "invitations.invitation": invitation,
    });
    const entry = found?.invitations.find(
      (entry) => entry.invitation === invitation,
    );
    return found && entry ? [{ ...entry, group: found._id }] : [];
  }
}

async function requireMember(
  groups: Collection<Group>,
  user: string,
  group: string,
) {
  const found = await groups.findOne({ _id: group });
  if (!found) throw new NoSuchGroup("There is no such group.");
  if (!found.members.includes(user))
    throw new NotAMember("Only members can invite someone.");
}

function validCover(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 350000) return false;
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.toString("base64") !== match[2]) return false;
  if (match[1] === "png")
    return (
      bytes.length > 24 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  if (match[1] === "jpeg")
    return (
      bytes.length > 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217
    );
  return (
    bytes.length > 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  );
}
