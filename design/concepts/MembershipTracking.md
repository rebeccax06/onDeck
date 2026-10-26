# MembershipTracking

## Purpose

Prevent ambiguity about who belongs to a recurring group by preserving explicit membership.

## Principle

A user creates a group and invites another user. The invited user accepts and becomes a member. Later, the group’s members can be recovered without recreating the group; membership persists until a member leaves.

## Types

```types
external User
  A person who creates, joins, or leaves a group.
```

## State

```state
a set of Groups with
  a name String
  an optional cover String
  a members set of Users

Rule: Each Group also has invite links with a token hash, link identity, expiry Number, and name String. New links default to Invite link followed by a group-local sequence number, allocated atomically with creation and not reused after revocation. A link is expired when the current time reaches its expiry; refusal leaves membership unchanged.

a set of Invitations with
  a group Group
  an inviter User
  an invitee User
  unique group and invitee
```

## Actions

```actions
create(creator: User, name: String) : returns (group: Group)
  where name is blank after trimming
  then
    refuses INVALID_NAME "Give the group a name."
  where name is not blank after trimming
  then
    add a new group with trimmed name and members containing creator
    returns group

invite(inviter: User, group: Group, invitee: User) : returns (invitation: Invitation)
  where group is not in Groups
  then
    refuses NO_SUCH_GROUP "There is no such group."
  where group exists and inviter is not a member
  then
    refuses NOT_A_MEMBER "Only members can invite someone."
  where inviter is a member and invitee is a member
  then
    refuses ALREADY_A_MEMBER "That person already belongs to the group."
  where inviter is a member and invitee is not a member and an invitation exists for group and invitee
  then
    refuses ALREADY_INVITED "That person already has an invitation."
  where inviter is a member and invitee is not a member and no invitation exists for group and invitee
  then
    add a new invitation with group, inviter, and invitee
    returns invitation

accept(invitee: User, invitation: Invitation) : returns (group: Group)
  where invitation is not in Invitations
  then
    refuses NO_SUCH_INVITATION "There is no such invitation."
  where invitation exists and invitee is not its invitee
  then
    refuses NOT_INVITED "This invitation is for someone else."
  where invitation exists and invitee is its invitee
  then
    add invitee to the members of its group
    bind group to its group
    remove invitation
    returns group

decline(invitee: User, invitation: Invitation) : returns ()
  where invitation is not in Invitations
  then
    refuses NO_SUCH_INVITATION "There is no such invitation."
  where invitation exists and invitee is not its invitee
  then
    refuses NOT_INVITED "This invitation is for someone else."
  where invitation exists and invitee is its invitee
  then
    remove invitation
    returns

leave(user: User, group: Group) : returns ()
  where group is not in Groups
  then
    refuses NO_SUCH_GROUP "There is no such group."
  where group exists and user is not a member
  then
    refuses NOT_A_MEMBER "You do not belong to this group."
  where group exists and user is a member
  then
    remove user from its members
    returns

updateGroup(user: User, group: Group, name: String, cover: String | null) : returns ()
  where group does not exist
  then
    refuses NO_SUCH_GROUP "There is no such group."
  where user is not a current member
  then
    refuses NOT_A_MEMBER "Only members can edit a group."
  where name is blank after trimming
  then
    refuses INVALID_NAME "Give the group a name."
  where cover is neither null nor a valid PNG, JPEG, or WebP data URL of at most 350000 characters
  then
    refuses INVALID_COVER "Choose a valid group picture."
  where user is a member and details are valid
  then
    save the trimmed name and cover, removing the cover when null
    returns

deleteGroup(user: User, group: Group) : returns ()
  where group does not exist
  then
    refuses NO_SUCH_GROUP "There is no such group."
  where user is not a current member
  then
    refuses NOT_A_MEMBER "Only members can delete a group."
  where user is a current member
  then
    delete the group with its membership, invitations, and links
    returns

createLink(user: User, group: Group) : returns (link: String, token: String, expires: Number)
  where group does not exist
  then
    refuses NO_SUCH_GROUP "There is no such group."
  where user is not a member
  then
    refuses NOT_A_MEMBER "Only members can invite someone."
  where user is a member
  then
    create a random link, storing its automatic name, token hash, and expiry seven days from now
    returns link, token, expires

renameLink(user: User, group: Group, link: String, name: String) : returns ()
  where group does not exist
  then
    refuses NO_SUCH_GROUP "There is no such group."
  where group exists and user is not a member
  then
    refuses NOT_A_MEMBER "Only members can rename invite links."
  where user is a member and name is blank after trimming or longer than 80 characters after trimming
  then
    refuses INVALID_NAME "Use a link name between 1 and 80 characters."
  where user is a member and name is valid and link is missing, expired, or revoked
  then
    refuses INVALID_LINK "This invite link is no longer active."
  where user is a member and name is valid and link is active
  then
    replace only the link name with trimmed name
    returns

revokeLink(user: User, group: Group, link: String) : returns ()
  where group does not exist
  then
    refuses NO_SUCH_GROUP "There is no such group."
  where user is not a member
  then
    refuses NOT_A_MEMBER "Only members can revoke invitations."
  where user is a member
  then
    remove the link if present
    returns

joinLink(user: User, token: String) : returns (group: Group)
  where token has no unexpired link
  then
    refuses INVALID_LINK "This invitation has expired or was revoked."
  where link is valid and unrestricted
  then
    add user to the group's members
    returns group
```

## Queries

```queries
_groups(user: User) : many (group: Group, name: String)
  Answers groups containing user, ordered by name then group identity; no rows when none.
_get(group: Group) : optional (group: Group, name: String)
  Answers the named group; no row for an unknown group.
_members(group: Group) : many (user: User)
  Answers members ordered by user identity; no rows for unknown or empty groups.
_membership(user: User, group: Group) : one (member: Flag)
  Answers true exactly when user belongs to group, otherwise false.
_invitations(invitee: User) : many (invitation: Invitation, group: Group, inviter: User)
  Answers pending invitations for invitee ordered by invitation identity; no rows when none.
_invitation(invitation: Invitation) : optional (invitation: Invitation, group: Group, inviter: User, invitee: User)
  Answers the invitation; no row when unknown.

_cover(group: Group) : one (cover: String | null)
  Answers the group's picture data URL, or null if absent or unknown.
_links(group: Group) : many (link: String, expires: Number, name: String)
  Answers unexpired link summaries, without tokens, ordered by expiry then identity.
_link(token: String) : optional (group: Group, name: String, link: String)
  Answers minimal invitation metadata for a valid token; no row for expired or revoked tokens.
```
