from django.db import transaction
from user.models import OgAvatarMint

def grant_og_status(user):
    with transaction.atomic():
        current_mints = OgAvatarMint.objects.select_for_update().count()
        
        if current_mints >= 25:
            return {"success": False, "message": "All 25 OG avatars have been claimed."}
        
        if hasattr(user, 'og_avatar'):
             return {"success": False, "message": "User already has an OG avatar."}

        next_edition = current_mints + 1
 
        og_mint = OgAvatarMint.objects.create(
            user=user,
            edition=next_edition
        )
        
    return {"success": True, "edition": next_edition}