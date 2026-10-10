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
  a members set of Users

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
```
