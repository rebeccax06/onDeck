# GroupOrdering

## Purpose

Remember a person's preferred arrangement without changing anyone else's layout.

## Principle

A person saves an ordered list of group identities and retrieves it on another visit.

## Types

```types
opaque Json
  A serialized JSON value.
external User
  The person arranging cards.
```

## State

```state
a set of Preferences with
  a user User
  an order Json
  unique user
```

## Actions

```actions
save(user: User, order: Json) : returns ()
  where order is not an array of distinct nonempty strings or has more than 1000 entries
  then
    refuses INVALID_ORDER "Choose a valid group order."
  where order is an array of distinct nonempty strings with at most 1000 entries
  then
    replace the user's saved order
    returns
```

## Queries

```queries
_get(user: User) : one (order: Json)
  Answers the saved array, or an empty array before a person saves an order.
```
