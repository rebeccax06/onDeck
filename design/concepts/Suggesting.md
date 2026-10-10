# Suggesting

## Purpose

Keep candidate items recoverable for a group when ideas discovered now become useful later.

## Principle

A user suggests an item to a group. Later, the group can recover the item without rediscovering it. If the suggestion is no longer relevant, its suggester withdraws it and it no longer appears in that group’s collection.

## Types

```types
external User
  The person suggesting an item.
external Group
  The collection receiving suggestions.
external Item
  The suggested object.
```

## State

```state
a set of Suggestions with
  a suggester User
  a group Group
  an item Item
  unique group and item
```

## Actions

```actions
suggest(user: User, group: Group, item: Item) : returns (suggestion: Suggestion)
  where a suggestion exists with group and item
  then
    refuses ALREADY_SUGGESTED "That item is already in the group’s collection."
  where no suggestion exists with group and item
  then
    add a new suggestion with suggester user, group, and item
    returns suggestion

withdraw(user: User, suggestion: Suggestion) : returns ()
  where suggestion is not in Suggestions
  then
    refuses NO_SUCH_SUGGESTION "There is no such suggestion."
  where suggestion exists and user is not its suggester
  then
    refuses NOT_SUGGESTER "Only the suggester can withdraw this item."
  where suggestion exists and user is its suggester
  then
    remove suggestion
    returns
```

## Queries

```queries
_forGroup(group: Group) : many (suggestion: Suggestion, suggester: User, item: Item)
  Answers suggestions for group ordered by suggestion identity; no rows when none.
_get(suggestion: Suggestion) : optional (suggestion: Suggestion, suggester: User, group: Group, item: Item)
  Answers the suggestion; no row when unknown.
_contains(group: Group, item: Item) : one (suggested: Flag)
  Answers true exactly when a suggestion exists for group and item, otherwise false.
```
