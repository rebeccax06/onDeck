# Wanting

## Purpose

Keep earlier expressions of interest available when deciding which future items to pursue.

## Principle

A user marks an item as wanted. Later, their interest can be recovered without asking them again. When they no longer want the item, they remove that interest; other users’ wants remain unchanged.

## Types

```types
external User
  The person expressing interest.
external Item
  The object of current interest.
```

## State

```state
a set of Users with
  a wanted set of Items
```

## Actions

```actions
want(user: User, item: Item) : returns ()
  where item is already wanted by user
  then
    refuses ALREADY_WANTED "You already want to do this."
  where item is not wanted by user
  then
    add user to Users if absent
    add item to the items wanted by user
    returns

unwant(user: User, item: Item) : returns ()
  where item is not wanted by user
  then
    refuses NOT_WANTED "You have not marked this as wanted."
  where item is wanted by user
  then
    remove item from the items wanted by user
    returns
```

## Queries

```queries
_wants(user: User, item: Item) : one (wanted: Flag)
  Answers true exactly when user wants item, otherwise false, including an unknown user.
_forItem(item: Item) : many (user: User)
  Answers interested users ordered by user identity; no rows when none.
_forUser(user: User) : many (item: Item)
  Answers wanted items ordered by item identity; no rows when none.
```
