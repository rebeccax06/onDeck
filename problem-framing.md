# Problem Framing and Stakeholders

## Domain

Friend groups regularly discover things they might want to do together. Someone might see a restaurant on TikTok and send it to a group chat, hear about a concert from another friend, save a hiking trail on Google Maps, or suggest an activity while talking in person. Over time, a group can accumulate many ideas across different people and platforms.

The difficulty is that discovery and decision-making usually happen at different times. A restaurant someone shares on Tuesday may not become relevant until the group is looking for dinner several weeks later. By then, the original recommendation may be buried in a group chat, forgotten, or separated from the conversation that gave it meaning.

Even when the group remembers an activity, whether it is a good option depends on social context that changes over time. Different subsets of the group may be free on different days. Some members may be excited about an activity, some may have already done it, and others may not be interested. An activity that was a good idea for one combination of people may be a poor option for another.

This means that the problem is not simply finding activities nearby. Friend groups already find many activities they like to do and send them in group chats. The harder problem is preserving enough context around those ideas that they remain useful later, when a particular subset of the group is actually making plans.

At the same time, any solution risks making hanging out feel like work. Casual social planning should not require people to maintain detailed schedules, fill out forms, formally vote on every idea, or continuously update a database. A useful design must therefore preserve important context with as little additional effort as possible.

## Stakeholders

* Friend group members: People who repeatedly make plans with the same group. They discover and suggest activities, express interest or disinterest, and later participate in deciding what the group should do.
* Plan initiators: Group members who initiate hangouts or push plans to actually happen. Thus, they experience the friction of recovering old suggestions and figuring out which options work for the people currently available.
* Activity suggesters: Group members who encounter restaurants, events, or other activities and share them with the group, but whose suggestions may become difficult to recover by the time the group is ready to act on them.
* Plan participants: The subset of group members involved in a particular outing; their interests and previous experiences determine whether an activity that appealed to the broader group is actually appropriate for the current plan.

## Bad Situations

### Situation 1: A good idea is forgotten before it becomes useful

A friend sees a restaurant on TikTok and sends it to a group chat with the message, “We need to go here.” Everyone in the group chat likes the message and indicates that they want to go there.  Over the next month, there are lots of other unrelated messages  sent to the same chat, along with links to other restaurants, events, and activities.

A few weeks later, three members of the group are together on a Saturday afternoon deciding where to eat. Someone remembers that the group had talked about several restaurants they wanted to try, but nobody remembers their names. One person scrolls through weeks of old messages looking for the links but eventually gives up.

The group goes to a familiar restaurant instead.

The problem is not that the group lacked ideas. They had already found options they were excited about, but those ideas were difficult to recover when they finally became useful.

### Situation 2: A group preference does not necessarily fit the people making plans

Five friends discuss going to a pottery-painting studio. Let's say Amy, Sarah, and Rebecca are excited about it. Maya has already been there, and Emily is not especially interested.

Several weeks later, Rebecca, Maya, and Emily happen to be free on the same evening. Rebecca remembers that “the group wanted to go pottery painting” and suggests it.

Only after they start discussing the plan do they realize that neither Maya nor Emily actually wants to go.

The activity was genuinely a good idea when it was first discussed, but the people available now are different from the people who were interested then.

A group’s preference is not a single property of an activity. Whether something is a good option depends on which members are currently participating. If the context around a past suggestion is lost, the group may incorrectly remember an activity as something “everyone wanted to do.”

### Situation 3: The group repeatedly starts over

Over several months, a friend group encounters dozens of restaurants, events, and activities that its members say they want to try.

Despite this, when someone asks, “What should we do tonight?”, the group often starts from scratch. Members search TikTok, Google Maps, Instagram, or Google for new options, send possibilities into the group chat, and debate them again.

This duplicates discovery work the group has already done. It can lead to long discussions, defaulting to familiar activities, or abandoning the plan entirely, even though the group has previously encountered options its members wanted to try.

Across these situations, the underlying problem is the same: friend groups accumulate ideas about things they want to do, but those ideas become separated from the social context that made them useful: who was interested, who has already done them, and which members are actually making plans now. As that context disappears, groups forget promising options or repeatedly reconstruct information they had already established.

## Corroboration

Existing products and user behavior suggest that people already find value in preserving recommendations for later.

Google Maps allows users to save places to lists, share those lists, and invite other people to collaborate on them. Applications such as Beli allow users to keep track of restaurants they have visited and restaurants they want to try. People also maintain informal versions of the same behavior through shared notes, spreadsheets, saved social-media posts, and lists such as “restaurants we want to try.”

These behaviors suggest that people are willing to preserve future possibilities rather than rediscovering them each time.

However, these examples do not by themselves establish how often friend groups lose the social context around recommendations, how costly that friction is, or how much effort people would tolerate to avoid it.

To investigate this, I plan to interview people who regularly make plans with recurring friend groups. In particular, I want to understand:

* how often they remember that their group previously discussed an activity but cannot recover it;
* how they currently preserve recommendations;
* whether they remember which members were interested in a particular activity;
* whether activities that sound like “group ideas” turn out not to fit the particular people who are free;
* how often they restart the search for things to do despite having discussed options before
* how much effort they would realistically be willing to expend to preserve recommendations and preferences.

These interviews will help determine whether the bad situations above are frequent and significant enough to justify a new application.

## Workarounds and Comparables

**Group chats:** Whenever anyone sees anything interesting, they can send a TikTok, Instagram post, Google Maps link, screenshot, or short message. This works well at the moment an activity is discovered, but becomes less useful over time. Since group chats show information chronologically, and I've personally had issues with trying to find links or things I've sent in the past, old suggestions can become buried. Peoples responses like "I'm down" or "I've already been there" may also be separated or forgotten entirely, making it difficult to know the group's preferences. 

**Shared notes doc/spreadsheet:** People could maintain lists like "Restaurants we want to try". This makes activities easier to recover, but introduces additional work. Someone must remember to transfer ideas from wherever they were originally discovered into the shared list. The list can also become stale if members do not update it after visiting an activity, changing their mind, or learning new information. More detailed spreadsheets could store interests, availability, and other constraints, but at that point casual social planning begins to resemble maintaining a project tracker. The extra structure may cost more effort than the planning problem is worth.

**Google maps** Users can save places into lists and invite friends to collaborate on them. This works well for preserving locations, but the information is centered on the place rather than the group’s relationship to it.  It does not naturally answer questions such as which members want to go, which members have already gone, or whether a saved place is relevant to the particular subset of friends currently making plans.
It is also less suited to activities that are not primarily places, such as concerts, temporary events, or other time-specific activities.

**Restaurant-tracking applications** Applications such as Beli let users keep track of restaurants they have visited and restaurants they want to visit. These applications demonstrate the usefulness of remembering past recommendations, but their primary focus is generally an individual’s relationship with a restaurant.

The problem here is preserving a group’s evolving relationship with many kinds of activities and making that information useful when some subset of the group later makes plans.

### Design Challenge: Preserving Context Without Making Hanging Out Feel Like Work

A major risk is that solving this problem could make casual social planning more burdensome.

A system could theoretically ask every member to enter their schedule, rate every activity, record their budget, update whether they have completed each activity, and formally vote whenever the group makes a plan. That system might contain plenty of information but still fail because people would not want to maintain it.

There is a tension between usefulness and effort. The application needs enough information about the group’s past interests to make old suggestions useful later, but collecting that information should require less effort than the planning friction it eliminates.

A successful design should reuse behaviors people already perform, such as sharing a link or reacting to an idea, and allow useful information to accumulate gradually rather than requiring members to maintain a complete planning system.

### Solution Sketch

A potential solution is a lightweight shared collection of activities for a friend group. The central design idea is that saving an activity should require very little effort, while useful social context can accumulate later.

When someone encounters a restaurant, event, or activity elsewhere, they could save a link or short description to the group’s collection. When possible, the application could use information from the link to reduce the amount of manual entry required.

Once an activity has been saved, group members could gradually add context by indicating whether they want to do it, have already done it, or are not interested. This can be done with reactions.

Later, when some members of the group are deciding what to do, the application could resurface activities that are relevant to those particular people rather than requiring them to search through old conversations or begin a new search.

For example, if Rebecca, Amy, and Sarah are together, the application could surface activities those three previously expressed interest in and have not yet done.

The goal would not be to algorithmically determine the single optimal activity for the group. Choosing what to do is itself part of the social interaction, and formalizing every preference could make casual plans feel mechanical.

Instead, the application would reduce the amount of forgotten context the group has to reconstruct and present a small set of promising possibilities. This leaves room for spontaneity and serendipity: the system helps the group remember what it was excited about without deciding for them.

The application would not replace TikTok, Instagram, Google Maps, or other places where people discover activities. Instead, it would act as a lightweight layer between discovering something the group might want to do and deciding to actually do it later.