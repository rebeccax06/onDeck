# ActivityCapturing

## Purpose

Prevent discoveries from being lost because turning them into usable activity records requires too much manual entry.

## Principle

A user starts a capture with a link or short description. Proposed details reduce the information they must enter. They correct or complete the proposal and confirm it, producing a saved activity that can be recovered later.

## Types

```types
external User
  The owner of a capture.
```

## State

```state
a set of Captures with
  an owner User
  a source String

a set of Proposed Captures with
  a proposedName String
  an optional proposedSource String
  an optional proposedDescription String
  an optional proposedLocation String
  an optional proposedCategory String
  an optional proposedCost Number
  an optional proposedCurrency String
  an optional proposedDateTime DateTime

a set of Activities with
  an owner User
  a name String
  an optional source String
  an optional description String
  an optional location String
  an optional category String
  an optional cost Number
  an optional currency String
  an optional dateTime DateTime

Rule: every proposed capture is a capture with one current proposal.
Rule: activity name and proposed capture proposedName are nonblank after trimming.
Rule: optional fields may be absent; omitted values are not invented.
Rule: cost is an estimated amount per person in the currency’s major unit, such as 20.50 USD.
Rule: cost and currency are either both absent or both present, including in proposals.
Rule: cost is finite and nonnegative; zero means free, while absent means unknown.
Rule: currency is a supported uppercase three-letter currency code, such as USD.
Rule: cost has no more fractional digits than its currency permits.
Rule: dateTime, when present, is an ISO 8601 instant with an explicit UTC offset.
```

## Actions

```actions
start(user: User, source: String) : returns (capture: Capture)
  where source is blank after trimming
  then
    refuses EMPTY_SOURCE "Paste a link or enter a description."
  where source is not blank after trimming
  then
    add a new capture with owner user and trimmed source
    returns capture

propose(capture: Capture, name: String, source?: String, description?: String, location?: String, category?: String, cost?: Number, currency?: String, dateTime?: DateTime) : returns ()
  where capture is not in Captures
  then
    refuses NO_SUCH_CAPTURE "There is no such capture."
  where capture exists and name is blank after trimming, a supplied dateTime is invalid, or cost and currency violate their state rules
  then
    refuses INVALID_DETAILS "Provide a name, valid dates, and a nonnegative cost with its currency when known."
  where capture exists and name is nonblank after trimming, any supplied dateTime is valid, and cost and currency satisfy their state rules
  then
    add capture to Proposed Captures if absent
    replace its proposedName, proposedSource, proposedDescription, proposedLocation,
    proposedCategory, proposedCost, proposedCurrency, and proposedDateTime with the supplied values, trimming name
    clear each optional proposal field whose input is omitted
    returns

confirm(user: User, capture: Capture, name: String, source?: String, description?: String, location?: String, category?: String, cost?: Number, currency?: String, dateTime?: DateTime) : returns (activity: Activity)
  where capture is not in Captures
  then
    refuses NO_SUCH_CAPTURE "There is no such capture."
  where capture exists and user is not its owner
  then
    refuses NOT_CAPTURE_OWNER "Only the owner can confirm this capture."
  where user owns capture and name is blank after trimming, a supplied dateTime is invalid, or cost and currency violate their state rules
  then
    refuses INVALID_DETAILS "Provide a name, valid dates, and a nonnegative cost with its currency when known."
  where user owns capture and name is nonblank after trimming, any supplied dateTime is valid, and cost and currency satisfy their state rules
  then
    add a new activity owned by user with the supplied fields, trimming name
    leave each optional activity field absent when its input is omitted
    remove capture from Proposed Captures if present
    remove capture
    returns activity

update(activity: Activity, name: String, source?: String, description?: String, location?: String, category?: String, cost?: Number, currency?: String, dateTime?: DateTime) : returns ()
  where activity does not exist
  then
    refuses NO_SUCH_ACTIVITY "There is no such activity."
  where activity exists and supplied fields violate the activity state rules
  then
    refuses INVALID_DETAILS "Provide valid activity details."
  where activity exists and supplied fields satisfy the activity state rules
  then
    replace saved details with supplied fields, trimming name and clearing omitted optional fields
    retain activity identity and owner
    returns

discard(user: User, capture: Capture) : returns ()
  where capture is not in Captures
  then
    refuses NO_SUCH_CAPTURE "There is no such capture."
  where capture exists and user is not its owner
  then
    refuses NOT_CAPTURE_OWNER "Only the owner can discard this capture."
  where user owns capture
  then
    remove capture from Proposed Captures if present
    remove capture
    returns
```

## Queries

```queries
_capture(capture: Capture) : optional (capture: Capture, owner: User, source: String)
  Answers the pending capture; no row when unknown.
_proposal(capture: Capture) : optional (name: String, source?: String, description?: String, location?: String, category?: String, cost?: Number, currency?: String, dateTime?: DateTime)
  Answers proposedName as name and the other proposed fields under their corresponding input names, omitting absent optional fields; no row for an unknown capture or one without a proposal.
_get(activity: Activity) : optional (activity: Activity, name: String, source?: String, description?: String, location?: String, category?: String, cost?: Number, currency?: String, dateTime?: DateTime)
  Answers saved fields, omitting absent optional fields; no row for an unknown activity.
_owner(activity: Activity) : optional (owner: User)
  Answers the creator of a saved activity; no row if unknown or a legacy record has no retained owner.
```
