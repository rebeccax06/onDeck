UI Sketches made with AI

Groups(sketch 1):
![Groups](ui-sketches/groups.png)
Users can view their existing friend groups or create a new group. Each group maintains its own OnDeck so that activities and group interest remain associated with the relevant set of friends

Inviting(sketch 2)
![Inviting](ui-sketches/members.png)
From a group’s Members page, users can see who currently belongs to the group and invite additional friends. This supports persistent group membership without requiring users to recreate the group each time they make plans.

Add an Activity(sketch 3)
![Add an Activity](ui-sketches/add.png)
Users can quickly capture an activity by pasting a link or entering a short description. Activity creation is separate from any particular group so that an activity can later be shared with one or more groups

Confirm an activity(sketch 4)
![Confirm an Activity](ui-sketches/confirm.png)
OnDeck proposes details such as the activity’s name, category, location, cost, and date when available. The user can review and correct this information before saving the activity, reducing manual entry without relying completely on automatically extracted information.

Add to OnDeck + multiple groups(sketch 5)
![Add to OnDeck](ui-sketches/add_to_group.png)
After confirming an activity, the user chooses which group or groups should have it on their OnDeck. The person adding the activity is automatically marked as wanting to do it, avoiding an additional interaction.

Group onDeck (sketch 6)
![Group onDeck](ui-sketches/grouponDeck.png)
A group’s OnDeck collects the activities its members have suggested. Members can browse previously saved ideas, see existing interest, mark activities they want to do, or open an activity for more information. Pick for Now is accessible from this page when members are ready to decide what to do.

Activity Details (sketch 7)
![Activity Details](ui-sketches/activity_details.png)
The activity page shows the saved details along with each group member’s relationship to the activity. Members can independently indicate that they want to do it or have already done it and, if they have done it, whether they would do it again.

Pick for now (sketch 8)
![Pick for now](ui-sketches/pickForNow.png)
When the group is ready to make plans, a user selects which group members are currently participating. They can optionally narrow the group’s saved activities using constraints such as category, location, cost, or time. This keeps the interaction lightweight rather than requiring everyone in the group to formally coordinate or vote. 

Pick Results (sketch 9)
![Pick Options](ui-sketches/pickOptions.png)
OnDeck resurfaces saved activities that are relevant to the selected people and constraints, showing information such as how many selected members want to do each activity and whether someone has already done it. The results provide a small set of promising options rather than automatically choosing an activity, leaving the final decision to the group.


# Visual style across the app

I used a system sans-serif font so labels and inputs stay familiar and load without a font download. Page titles, section headings, and field labels have distinct sizes and weights. Dark forest text sits on white or pale green surfaces; muted text is reserved for supporting information. Green marks primary actions, selected navigation, and positive state. Red marks destructive actions and errors, always with words explaining the meaning.

For the form, I made sure I had aligned labels, restrained borders, generous section spacing, and a clear action footer. I looked at Lattice for some UI inspiration which helped me add the light surfaces, consistent line icons, and restrained green accents. I kept the app’s headings compact so styling does not crowd out the actual task.

Keyboard focus has a visible outline. Hover-only card controls also appear on keyboard focus, and touch layouts expose the drag grip. Confirmation dialogs focus Cancel first, keep keyboard focus inside the dialog, support Escape, and return focus to the trigger. Motion is removed when the device requests reduced motion. These choices support keyboard and touch use; a full accessibility audit is still separate work.
