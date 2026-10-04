Concept Design

1. MembershipTracking

concept MembershipTracking [User]

**Purpose**

Let users form persistent groups with explicit membership, preventing ambiguity about who belongs to a recurring group.

**Principle**

A user can create a group and invite other users to join it. An invited user can accept the invitation and become a member. Members remain part of the group until they leave.

**Types**

external User
internal Group
internal Invitation

**State**

a set of Groups with
    a members set of Users
a set of Invitations with
    a group Group
    an inviter User
    an invitee User

**Actions**

create (creator: User): returns (group: Group)
    then
        create a new group
        add creator to the members of group
        return group
invite (inviter: User, group: Group, invitee: User): returns (invitation: Invitation)
    where
        inviter is a member of group
        invitee is not a member of group
        there is no existing invitation for invitee to group
    then
        create an invitation for group from inviter to invitee
        return invitation
accept (invitee: User, invitation: Invitation)
    where
        invitation exists
        invitee is the invitee of invitation
    then
        add invitee to the members of the invitation's group
        remove invitation
decline (invitee: User, invitation: Invitation)
    where
        invitation exists
        invitee is the invitee of invitation
    then
        remove invitation
leave (user: User, group: Group)
    where
        user is a member of group
    then
        remove user from the members of group

2. ActivityCapturing

concept ActivityCapturing [User]

**Purpose**

Turn rough discoveries into usable activity records with little manual entry, preventing good ideas from being lost because recording them requires too much effort.

**Principle**

A user starts a capture with a link or short description. The system can propose details inferred from that source. The user confirms or corrects the proposal, producing a saved activity without having to enter all of its information manually.

**Types**

external User
internal Capture
internal Activity
value ActivityDetails {
    name: String
    source: String?
    description: String?
    location: String?
    category: String?
    cost: String?
    dateTime: DateTime?
}

**State**

a set of Captures with
    an owner User
    a source String
    an optional proposedDetails ActivityDetails
a set of Activities with
    details ActivityDetails

**Actions**

start (user: User, source: String): returns (capture: Capture)
    then
        create a new capture with owner user and source
        return capture
propose (capture: Capture, details: ActivityDetails)
    where
        capture exists
    then
        set proposedDetails of capture to details
confirm (user: User, capture: Capture, details: ActivityDetails): returns (activity: Activity)
    where
        capture exists
        user is the owner of capture
    then
        create a new activity with details
        remove capture
        return activity
discard (user: User, capture: Capture)
    where
        capture exists
        user is the owner of capture
    then
        remove capture

notes: propose can be performed by whatever extraction mechanism is available, while ActivityCapturing is responsible only for the interaction in which a rough source becomes a confirmed activity.


3. Suggesting

concept Suggesting [User, Group, Item]

**Purpose**

Preserve candidate items for a group so that ideas discovered now can still be recovered when they become useful later.

**Principle**

A user suggests an item to a group. The suggestion remains associated with that group so it can be revisited later rather than rediscovered. The user who made the suggestion can withdraw it if it is no longer relevant.

**Types**

external User
external Group
external Item
internal Suggestion

**State**

a set of Suggestions with
    a suggester User
    a group Group
    an item Item

**Actions**

suggest (user: User, group: Group, item: Item): returns (suggestion: Suggestion)
    where
        there is no existing suggestion with the same group and item
    then
        create a suggestion with suggester user, group, and item
        return suggestion
withdraw (user: User, suggestion: Suggestion)
    where
        suggestion exists
        user is the suggester of suggestion
    then
        remove suggestion


4. Wanting

concept Wanting [User, Item]

**Purpose**

Preserve users’ current interest in future items so that preferences expressed when an idea is discovered remain useful later.

**Principle**

A user can mark an item as something they want to do. That interest remains recorded until the user no longer wants to do it, allowing their earlier preference to be recovered later.

**Types**

external User
external Item

**State**
a set of Users with
    a wanted set of Items

**Actions**

want (user: User, item: Item)
    where
        item is not already wanted by user
    then
        add item to the items wanted by user
unwant (user: User, item: Item)
    where
        item is wanted by user
    then
        remove item from the items wanted by user


5. Experiencing

concept Experiencing [User, Item]

**Purpose**

Preserve users’ history with activities and whether they would repeat them, so groups can look back on shared experiences and retain useful context for future plans.

**Principle**

After doing an item, a user can record that they have done it. They can also indicate whether they would be willing to do it again. Later, their prior experience can distinguish something new from something they have already done but would repeat.

**Types**

external User
external Item
internal Experience
value RepeatPreference = unknown | yes | no

**State**

a set of Experiences with
    a user User
    an item Item
    a repeatPreference RepeatPreference

There is at most one experience for each (user, item) pair.

**Actions**

complete (user: User, item: Item): returns (experience: Experience)
    where
        there is no existing experience for user and item
    then
        create an experience for user and item
        set repeatPreference to unknown
        return experience
setRepeatPreference (user: User, item: Item, preference: RepeatPreference)
    where
        an experience exists for user and item
    then
        set its repeatPreference to preference
undoCompletion (user: User, item: Item)
    where
        an experience exists for user and item
    then
        remove that experience

## Essential Reactions

**Saving an Activity to a Group**
Capturing an activity and associating it with a group are intentionally separate. A user might capture an activity before deciding which group should see it.

when Requesting.addToGroup (user, group, activity)
where
    MembershipTracking: user is a member of group
then
    Suggesting.suggest (user, group, activity)

This keeps membership out of the Suggesting concept while ensuring that users cannot add activities to groups they do not belong to.

**Suggesting Implies Initial Interest**

Usually, if someone goes to the effort of adding an activity to their group’s OnDeck, they are interested in doing it themselves. Recording that automatically avoids making the user perform a second action.

when Suggesting.suggest (user, group, activity)
where
    Wanting: user does not already want activity
then
    Wanting.want (user, activity)

This is particularly important in avoiding turning casual social planning into work.

**Completing an Activity Clears an Outstanding Want**

If a user marks an activity as completed, it should no longer appear as something they have not yet done.

when Experiencing.complete (user, activity)
where
    Wanting: user wants activity
then
    Wanting.unwant (user, activity)

Whether they would do it again is represented separately by Experiencing.setRepeatPreference.

**Repeating an Experience Restores Interest**
If a user records that they have completed an activity and would do it again, OnDeck treats that activity as something they currently want to do.

when Experiencing.setRepeatPreference (user, activity, yes)
where
    Wanting: user does not already want activity
then
    Wanting.want (user, activity)

notes: Completing an activity removes it from the user’s outstanding wants because it is no longer an unfinished activity. If the user later marks it as something they would repeat, the second reaction restores it to Wanting, making it eligible for future plans again. 

## How the Concepts Work Together

OnDeck separates the lifecycle of a group activity into several independent concerns.

ActivityCapturing handles the low-friction process of turning something found elsewhere, such as a restaurant link or event post, into a saved activity in OnDeck.

MembershipTracking represents recurring friend groups and who belongs to them. Its Group individuals are used by Suggesting to associate saved activities with the correct group.

Suggesting records which activities a group has put “on deck.” This gives the group a shared pool of ideas that can be recovered later instead of rediscovered from scratch.

Wanting records which activities individual users currently want to do and is used primarily for future planning. Each group member can independently mark a suggested activity as something they want to do, allowing interest to accumulate over time without requiring the whole group to respond at once.

Experiencing preserves users’ history with activities and whether they would do them again. This allows group members to look back at things they have done and also provides useful context during future planning.

The two concepts remain separate because past experience and current interest are different facts, but they can be coordinated through reactions. For example, when a user marks an activity as something they have done and would repeat, OnDeck automatically marks it as wanted again so it can continue to appear in future planning.

The Pick for Now feature is produced by composing these concepts rather than by introducing another concept. OnDeck begins with activities that Suggesting associates with the group, then uses Wanting to identify which of those activities are relevant to the people currently making plans. Experiencing can provide additional context about whether someone has already done an activity and whether they would repeat it. Details stored through ActivityCapturing, such as category, location, cost, or event date, can help narrow the options further.

