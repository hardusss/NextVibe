"""
Who sees an event's organizer data (analytics, attendees, taps, the graph).

The event's owner, and admins (User.is_admin) for any event. Admin access is
read-only: changing an event, its requests or broadcasting stays owner-only.
"""


def can_view_event(user, post) -> bool:
    return post.owner_id == user.user_id or user.is_admin
