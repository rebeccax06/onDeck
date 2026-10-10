# Application types

Each person uses the same account throughout OnDeck. Signing in identifies them; entering someone’s name does not let you act as that person. Each group and activity has its own ID. If an activity is shared with multiple groups, your interest and past experience carry across those groups, while each group keeps its own suggestion. Unfinished captures are visible only to the person who started them.


```types
concrete Person
  A stable identity of an OnDeck user supplied by the host.
```

```instances
instantiate MembershipTracking with
  User is Person

instantiate ActivityCapturing with
  User is Person

instantiate Suggesting with
  User is Person
  Group is MembershipTracking.Group
  Item is ActivityCapturing.Activity

instantiate Wanting with
  User is Person
  Item is ActivityCapturing.Activity

instantiate Experiencing with
  User is Person
  Item is ActivityCapturing.Activity
```
