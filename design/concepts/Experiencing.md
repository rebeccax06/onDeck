# Experiencing

## Purpose

Retain past experience and willingness to repeat an item as context for future choices.

## Principle

After doing an item, a user records completion and whether they would repeat it. Later, their record distinguishes a new item from one they have already done and would repeat.

## Types

```types
external User
  The person recording an experience.
external Item
  The experienced object.
RepeatPreference is UNKNOWN or YES or NO
  Whether the user has expressed willingness to repeat the item.
```

## State

```state
a set of Experiences with
  a user User
  an item Item
  a repeatPreference RepeatPreference
  unique user and item
```

## Actions

```actions
complete(user: User, item: Item) : returns (experience: Experience)
  where an experience exists for user and item
  then
    refuses ALREADY_COMPLETED "You already recorded doing this."
  where no experience exists for user and item
  then
    add a new experience with user, item, and repeatPreference UNKNOWN
    returns experience

setRepeatPreference(user: User, item: Item, preference: RepeatPreference) : returns ()
  where preference is not UNKNOWN, YES, or NO
  then
    refuses INVALID_PREFERENCE "Choose UNKNOWN, YES, or NO."
  where preference is valid and no experience exists for user and item
  then
    refuses NOT_COMPLETED "Record doing this before setting a repeat preference."
  where preference is valid and an experience exists for user and item
  then
    set its repeatPreference to preference
    returns

undoCompletion(user: User, item: Item) : returns ()
  where no experience exists for user and item
  then
    refuses NOT_COMPLETED "You have not recorded doing this."
  where an experience exists for user and item
  then
    remove that experience
    returns
```

## Queries

```queries
_get(user: User, item: Item) : optional (experience: Experience, repeatPreference: RepeatPreference)
  Answers the user’s experience; no row when no completion is recorded.
_forItem(item: Item) : many (experience: Experience, user: User, repeatPreference: RepeatPreference)
  Answers experiences ordered by user identity; no rows when none.
```
